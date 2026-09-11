import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

import {
  disease,
  drug,
  evidenceClaim,
  evidenceClaimPassage,
  gene,
  knowledgeRelease,
  knowledgeReleaseApproval,
  knowledgeReleaseAssociation,
  regulatoryApproval,
  regulatoryApprovalDisease,
  regulatoryApprovalDrug,
  regulatoryApprovalPassage,
  regulatoryApprovalVariant,
  sourceDocument,
  sourcePassage,
  therapeuticAssociation,
  therapeuticAssociationDrug,
  variant,
} from '@/config/db/schema.evidence.postgres';

import {
  calculateKnowledgePackageHash,
  validateKnowledgePackage,
  type KnowledgePackage,
  type KnowledgePackageInput,
} from './knowledge-package';

const packageHashMarker = 'evidex-package-sha256:';

export interface KnowledgePackageCounts {
  diseases: number;
  genes: number;
  variants: number;
  drugs: number;
  publications: number;
  passages: number;
  approvals: number;
  associations: number;
  claims: number;
}

export interface KnowledgePackageImportResult {
  status: 'DRY_RUN' | 'IMPORTED' | 'UNCHANGED';
  version: string;
  packageHash: string;
  counts: KnowledgePackageCounts;
  stableRecordsInserted: number;
  stableRecordsReused: number;
}

interface ImportOptions {
  dryRun?: boolean;
}

function getCounts(value: KnowledgePackage): KnowledgePackageCounts {
  return {
    diseases: value.entities.diseases.length,
    genes: value.entities.genes.length,
    variants: value.entities.variants.length,
    drugs: value.entities.drugs.length,
    publications: value.publications.length,
    passages: value.passages.length,
    approvals: value.fdaApprovals.length,
    associations: value.associations.length,
    claims: value.evidenceClaims.length,
  };
}

function normalizeForComparison(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForComparison);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !['createdAt', 'updatedAt'].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeForComparison(nested)])
    );
  }
  return value;
}

function sameRecord(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizeForComparison(left)) ===
    JSON.stringify(normalizeForComparison(right))
  );
}

async function ensureStableRows(
  transaction: any,
  table: any,
  tableName: string,
  rows: Array<Record<string, unknown>>
) {
  if (rows.length === 0) return { inserted: 0, reused: 0 };

  const existingRows = await transaction
    .select()
    .from(table)
    .where(
      inArray(
        table.id,
        rows.map((row) => String(row.id))
      )
    );
  const existingById = new Map(
    existingRows.map((row: Record<string, unknown>) => [String(row.id), row])
  );
  const missingRows: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const existing = existingById.get(String(row.id));
    if (existing) {
      if (!sameRecord(existing, row)) {
        throw new Error(
          `Stable record conflict: ${tableName}:${String(row.id)}`
        );
      }
      continue;
    }
    missingRows.push(row);
  }

  if (missingRows.length > 0) {
    await transaction.insert(table).values(missingRows);
  }

  return {
    inserted: missingRows.length,
    reused: rows.length - missingRows.length,
  };
}

function withHashMarker(notes: string, packageHash: string) {
  return `${packageHashMarker}${packageHash}\n${notes}`;
}

function containsHashMarker(notes: string | null, packageHash: string) {
  return notes?.split('\n', 1)[0] === `${packageHashMarker}${packageHash}`;
}

function toInsertRows(value: KnowledgePackage) {
  return {
    diseases: value.entities.diseases,
    genes: value.entities.genes,
    variants: value.entities.variants,
    drugs: value.entities.drugs,
    publications: value.publications.map((record) => ({
      ...record,
      retrievedAt: new Date(record.retrievedAt),
    })),
    passages: value.passages,
    approvals: value.fdaApprovals.map(
      ({ drugIds, diseaseLinks, variantLinks, passageLinks, ...record }) => ({
        ...record,
        reviewedAt: record.reviewedAt ? new Date(record.reviewedAt) : null,
      })
    ),
    associations: value.associations.map(
      ({ drugs, gradingInput, ...record }) => ({
        ...record,
        reviewedAt: record.reviewedAt ? new Date(record.reviewedAt) : null,
      })
    ),
    claims: value.evidenceClaims.map(({ passageLinks, ...record }) => ({
      ...record,
      reviewedAt: record.reviewedAt ? new Date(record.reviewedAt) : null,
    })),
  };
}

export async function loadKnowledgePackageFromDirectory(
  dataDirectory: string
): Promise<KnowledgePackage> {
  async function readJson(fileName: string) {
    const filePath = path.resolve(dataDirectory, fileName);
    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    } catch (error) {
      throw new Error(`Unable to read knowledge package file ${filePath}`, {
        cause: error,
      });
    }
  }

  const [
    entities,
    publications,
    passages,
    fdaApprovals,
    associations,
    claims,
    release,
  ] = await Promise.all([
    readJson('entities.json'),
    readJson('publications.json'),
    readJson('passages.json'),
    readJson('fda-approvals.json'),
    readJson('associations.json'),
    readJson('evidence-claims.json'),
    readJson('release.json'),
  ]);

  return validateKnowledgePackage({
    entities,
    publications,
    passages,
    fdaApprovals,
    associations,
    evidenceClaims: claims,
    release,
  } as KnowledgePackageInput);
}

export async function importKnowledgePackage(
  client: postgres.Sql,
  input: KnowledgePackageInput,
  options: ImportOptions = {}
): Promise<KnowledgePackageImportResult> {
  const value = validateKnowledgePackage(input);
  const packageHash = calculateKnowledgePackageHash(value);
  const counts = getCounts(value);

  if (options.dryRun) {
    return {
      status: 'DRY_RUN',
      version: value.release.version,
      packageHash,
      counts,
      stableRecordsInserted: 0,
      stableRecordsReused: 0,
    };
  }

  const database = drizzle(client);
  return database.transaction(async (transaction) => {
    const [existingRelease] = await transaction
      .select({
        id: knowledgeRelease.id,
        notes: knowledgeRelease.notes,
        status: knowledgeRelease.status,
      })
      .from(knowledgeRelease)
      .where(eq(knowledgeRelease.version, value.release.version))
      .limit(1);

    if (existingRelease) {
      if (
        existingRelease.id === value.release.id &&
        existingRelease.status === 'PUBLISHED' &&
        containsHashMarker(existingRelease.notes, packageHash)
      ) {
        return {
          status: 'UNCHANGED' as const,
          version: value.release.version,
          packageHash,
          counts,
          stableRecordsInserted: 0,
          stableRecordsReused: Object.values(counts).reduce(
            (total, count) => total + count,
            0
          ),
        };
      }
      throw new Error(
        `Knowledge release conflict: version ${value.release.version} already exists with different content`
      );
    }

    const rows = toInsertRows(value);
    const stableGroups = [
      [disease, 'disease', rows.diseases],
      [gene, 'gene', rows.genes],
      [variant, 'variant', rows.variants],
      [drug, 'drug', rows.drugs],
      [sourceDocument, 'source_document', rows.publications],
      [sourcePassage, 'source_passage', rows.passages],
      [regulatoryApproval, 'regulatory_approval', rows.approvals],
      [therapeuticAssociation, 'therapeutic_association', rows.associations],
      [evidenceClaim, 'evidence_claim', rows.claims],
    ] as const;
    let stableRecordsInserted = 0;
    let stableRecordsReused = 0;
    for (const [table, tableName, records] of stableGroups) {
      const result = await ensureStableRows(
        transaction,
        table,
        tableName,
        records as Array<Record<string, unknown>>
      );
      stableRecordsInserted += result.inserted;
      stableRecordsReused += result.reused;
    }

    await transaction
      .insert(therapeuticAssociationDrug)
      .values(
        value.associations.flatMap((association) =>
          association.drugs.map((link) => ({
            associationId: association.id,
            ...link,
          }))
        )
      )
      .onConflictDoNothing();
    await transaction
      .insert(evidenceClaimPassage)
      .values(
        value.evidenceClaims.flatMap((claim) =>
          claim.passageLinks.map((link) => ({
            evidenceClaimId: claim.id,
            ...link,
          }))
        )
      )
      .onConflictDoNothing();
    await transaction
      .insert(regulatoryApprovalDrug)
      .values(
        value.fdaApprovals.flatMap((approval) =>
          approval.drugIds.map((drugId) => ({
            regulatoryApprovalId: approval.id,
            drugId,
          }))
        )
      )
      .onConflictDoNothing();
    await transaction
      .insert(regulatoryApprovalDisease)
      .values(
        value.fdaApprovals.flatMap((approval) =>
          approval.diseaseLinks.map((link) => ({
            regulatoryApprovalId: approval.id,
            ...link,
          }))
        )
      )
      .onConflictDoNothing();
    await transaction
      .insert(regulatoryApprovalVariant)
      .values(
        value.fdaApprovals.flatMap((approval) =>
          approval.variantLinks.map((link) => ({
            regulatoryApprovalId: approval.id,
            ...link,
          }))
        )
      )
      .onConflictDoNothing();
    await transaction
      .insert(regulatoryApprovalPassage)
      .values(
        value.fdaApprovals.flatMap((approval) =>
          approval.passageLinks.map((link) => ({
            regulatoryApprovalId: approval.id,
            ...link,
          }))
        )
      )
      .onConflictDoNothing();

    await transaction.insert(knowledgeRelease).values({
      id: value.release.id,
      version: value.release.version,
      status: 'DRAFT',
      literatureCutoffAt: new Date(value.release.literatureCutoffAt),
      regulatoryCutoffAt: new Date(value.release.regulatoryCutoffAt),
      gradingRuleVersion: value.release.gradingRuleVersion,
      publishedAt: null,
      publishedBy: null,
      notes: withHashMarker(value.release.notes, packageHash),
    });
    await transaction.insert(knowledgeReleaseAssociation).values(
      value.release.associationIds.map((therapeuticAssociationId) => ({
        knowledgeReleaseId: value.release.id,
        therapeuticAssociationId,
      }))
    );
    await transaction.insert(knowledgeReleaseApproval).values(
      value.release.regulatoryApprovalIds.map((regulatoryApprovalId) => ({
        knowledgeReleaseId: value.release.id,
        regulatoryApprovalId,
      }))
    );
    await transaction
      .update(knowledgeRelease)
      .set({
        status: 'PUBLISHED',
        publishedAt: new Date(value.release.publishedAt),
        publishedBy: value.release.publishedBy,
      })
      .where(eq(knowledgeRelease.id, value.release.id));

    return {
      status: 'IMPORTED' as const,
      version: value.release.version,
      packageHash,
      counts,
      stableRecordsInserted,
      stableRecordsReused,
    };
  });
}
