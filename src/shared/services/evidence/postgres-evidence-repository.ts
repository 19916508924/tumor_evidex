import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';

import {
  answerSnapshot,
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
} from '@/config/db/schema';
import type {
  AnswerSnapshotKey,
  EvidenceRepository,
  NewAnswerSnapshot,
} from '@/shared/services/evidence/answer-evidence-query';
import type {
  EvidenceClaimResult,
  EvidenceDrugResult,
  EvidenceLevel,
  EvidencePassageResult,
  EvidenceResultGroup,
  EvidenceSourceReference,
  EvidenceTherapyResult,
  KnowledgeReleaseInfo,
  NormalizedEvidenceQuery,
  RegulatoryApprovalResult,
} from '@/shared/types/evidence';

type Database = any;

interface RepositoryOptions {
  releaseVersion?: string;
}

function iso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function sourceReference(row: any): EvidenceSourceReference {
  return {
    id: row.sourceId,
    sourceType: row.sourceType,
    externalId: row.sourceExternalId,
    title: row.sourceTitle,
    url: row.sourceUrl,
    doi: row.sourceDoi,
    pmcid: row.sourcePmcid,
  };
}

function addToMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

const directLevels = new Set<EvidenceLevel>(['1', '3A', '4', 'R1', 'R2']);
const crossSourceLevels = new Set<EvidenceLevel>(['1', '2', '3A']);

function isEligibleAssociation(row: any, query: NormalizedEvidenceQuery) {
  if (row.diseaseCanonicalName === query.disease) {
    return (
      ['EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT'].includes(
        row.variantApplicability
      ) && directLevels.has(row.approvedLevel)
    );
  }

  return (
    row.diseaseLineage === 'SOLID' &&
    row.variantApplicability === 'EXACT' &&
    row.direction === 'SENSITIVITY' &&
    crossSourceLevels.has(row.approvedLevel)
  );
}

function therapySort(
  left: EvidenceTherapyResult,
  right: EvidenceTherapyResult
) {
  const direction = { SENSITIVITY: 0, EXPLORATORY: 1, RESISTANCE: 2 };
  const level = {
    '1': 0,
    '2': 1,
    '3A': 2,
    '3B': 3,
    '4': 4,
    R1: 5,
    R2: 6,
    UNRATED: 7,
  };
  return (
    direction[left.direction] - direction[right.direction] ||
    level[left.approvedLevel] - level[right.approvedLevel] ||
    (left.drugs[0]?.genericName ?? '').localeCompare(
      right.drugs[0]?.genericName ?? '',
      'en'
    ) ||
    left.associationId.localeCompare(right.associationId, 'en')
  );
}

export function createPostgresEvidenceRepository(
  database: Database,
  options: RepositoryOptions = {}
): EvidenceRepository {
  async function getPublishedRelease(): Promise<KnowledgeReleaseInfo | null> {
    const conditions: SQL[] = [eq(knowledgeRelease.status, 'PUBLISHED')];
    if (options.releaseVersion) {
      conditions.push(eq(knowledgeRelease.version, options.releaseVersion));
    }

    const rows = await database
      .select({
        id: knowledgeRelease.id,
        version: knowledgeRelease.version,
        literatureCutoffAt: knowledgeRelease.literatureCutoffAt,
        regulatoryCutoffAt: knowledgeRelease.regulatoryCutoffAt,
        gradingRuleVersion: knowledgeRelease.gradingRuleVersion,
      })
      .from(knowledgeRelease)
      .where(and(...conditions))
      .orderBy(desc(knowledgeRelease.publishedAt), desc(knowledgeRelease.id))
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row,
      literatureCutoffAt: iso(row.literatureCutoffAt),
      regulatoryCutoffAt: iso(row.regulatoryCutoffAt),
    };
  }

  async function retrieveEvidence(
    releaseId: string,
    query: NormalizedEvidenceQuery
  ): Promise<EvidenceResultGroup[]> {
    const targetDiseases = await database
      .select({ id: disease.id })
      .from(disease)
      .where(
        and(
          eq(disease.canonicalName, query.disease),
          eq(disease.status, 'ACTIVE')
        )
      )
      .limit(1);
    if (targetDiseases.length === 0) {
      return [
        { scope: 'SAME_DISEASE', therapies: [] },
        { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
      ];
    }
    const targetDiseaseId = targetDiseases[0].id;

    const candidateRows = (await database
      .select({
        associationId: therapeuticAssociation.id,
        diseaseId: disease.id,
        diseaseCanonicalName: disease.canonicalName,
        diseaseDisplayNameZh: disease.displayNameZh,
        diseaseDisplayNameEn: disease.displayNameEn,
        diseaseLineage: disease.lineage,
        variantId: variant.id,
        geneSymbol: gene.symbol,
        alterationType: variant.alterationType,
        hgvsp: variant.hgvsp,
        canonicalKey: variant.canonicalKey,
        variantApplicability: therapeuticAssociation.variantApplicability,
        direction: therapeuticAssociation.direction,
        approvedLevel: therapeuticAssociation.approvedLevel,
        gradingRationale: therapeuticAssociation.gradingRationale,
      })
      .from(knowledgeReleaseAssociation)
      .innerJoin(
        therapeuticAssociation,
        eq(
          knowledgeReleaseAssociation.therapeuticAssociationId,
          therapeuticAssociation.id
        )
      )
      .innerJoin(disease, eq(therapeuticAssociation.diseaseId, disease.id))
      .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
      .innerJoin(gene, eq(variant.geneId, gene.id))
      .where(
        and(
          eq(knowledgeReleaseAssociation.knowledgeReleaseId, releaseId),
          eq(therapeuticAssociation.reviewStatus, 'APPROVED'),
          isNotNull(therapeuticAssociation.approvedLevel),
          eq(disease.status, 'ACTIVE'),
          eq(variant.status, 'ACTIVE'),
          eq(gene.status, 'ACTIVE'),
          eq(gene.symbol, query.gene),
          eq(variant.canonicalKey, query.canonicalVariantKey)
        )
      )) as any[];

    const candidates = candidateRows.filter((row) =>
      isEligibleAssociation(row, query)
    );
    if (candidates.length === 0) {
      return [
        { scope: 'SAME_DISEASE', therapies: [] },
        { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
      ];
    }

    const associationIds = candidates.map((row) => row.associationId);
    const associationDrugRows = (await database
      .select({
        associationId: therapeuticAssociationDrug.associationId,
        id: drug.id,
        genericName: drug.genericName,
        displayNameZh: drug.displayNameZh,
        displayNameEn: drug.displayNameEn,
        role: therapeuticAssociationDrug.role,
        sortOrder: therapeuticAssociationDrug.sortOrder,
        status: drug.status,
      })
      .from(therapeuticAssociationDrug)
      .innerJoin(drug, eq(therapeuticAssociationDrug.drugId, drug.id))
      .where(
        inArray(therapeuticAssociationDrug.associationId, associationIds)
      )) as any[];
    const drugsByAssociation = new Map<string, EvidenceDrugResult[]>();
    for (const row of associationDrugRows) {
      if (row.status !== 'ACTIVE') continue;
      addToMapArray(drugsByAssociation, row.associationId, {
        id: row.id,
        genericName: row.genericName,
        displayNameZh: row.displayNameZh,
        displayNameEn: row.displayNameEn,
        role: row.role,
        sortOrder: row.sortOrder,
      });
    }
    for (const drugs of drugsByAssociation.values()) {
      drugs.sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
      );
    }

    const drugIds = [...new Set(associationDrugRows.map((row) => row.id))];
    const approvalRows = drugIds.length
      ? ((await database
          .select({
            drugId: regulatoryApprovalDrug.drugId,
            id: regulatoryApproval.id,
            authority: regulatoryApproval.authority,
            applicationNumber: regulatoryApproval.applicationNumber,
            submissionNumber: regulatoryApproval.submissionNumber,
            approvalStatus: regulatoryApproval.approvalStatus,
            approvalDate: regulatoryApproval.approvalDate,
            statusAsOf: regulatoryApproval.statusAsOf,
            indicationText: regulatoryApproval.indicationText,
            biomarkerText: regulatoryApproval.biomarkerText,
            labelEffectiveDate: regulatoryApproval.labelEffectiveDate,
            sourceId: sourceDocument.id,
            sourceType: sourceDocument.sourceType,
            sourceExternalId: sourceDocument.externalId,
            sourceTitle: sourceDocument.title,
            sourceUrl: sourceDocument.url,
            sourceDoi: sourceDocument.doi,
            sourcePmcid: sourceDocument.pmcid,
          })
          .from(knowledgeReleaseApproval)
          .innerJoin(
            regulatoryApproval,
            eq(
              knowledgeReleaseApproval.regulatoryApprovalId,
              regulatoryApproval.id
            )
          )
          .innerJoin(
            regulatoryApprovalDrug,
            eq(
              regulatoryApproval.id,
              regulatoryApprovalDrug.regulatoryApprovalId
            )
          )
          .innerJoin(
            sourceDocument,
            eq(regulatoryApproval.sourceDocumentId, sourceDocument.id)
          )
          .where(
            and(
              eq(knowledgeReleaseApproval.knowledgeReleaseId, releaseId),
              eq(regulatoryApproval.authority, 'FDA'),
              eq(regulatoryApproval.approvalStatus, 'APPROVED'),
              eq(regulatoryApproval.reviewStatus, 'APPROVED'),
              eq(sourceDocument.reviewStatus, 'APPROVED'),
              inArray(regulatoryApprovalDrug.drugId, drugIds)
            )
          )) as any[])
      : [];

    const approvalIds = [
      ...new Set(approvalRows.map((row) => row.id as string)),
    ];
    const indicationRows = approvalIds.length
      ? ((await database
          .select({ id: regulatoryApprovalPassage.regulatoryApprovalId })
          .from(regulatoryApprovalPassage)
          .innerJoin(
            sourcePassage,
            eq(regulatoryApprovalPassage.sourcePassageId, sourcePassage.id)
          )
          .innerJoin(
            sourceDocument,
            eq(sourcePassage.sourceDocumentId, sourceDocument.id)
          )
          .where(
            and(
              inArray(
                regulatoryApprovalPassage.regulatoryApprovalId,
                approvalIds
              ),
              eq(regulatoryApprovalPassage.supportRole, 'INDICATION'),
              eq(sourcePassage.reviewStatus, 'APPROVED'),
              eq(sourceDocument.reviewStatus, 'APPROVED')
            )
          )) as Array<{ id: string }>)
      : [];
    const approvalsWithIndication = new Set(
      indicationRows.map((row) => row.id)
    );
    const eligibleApprovalRows = approvalRows.filter((row) =>
      approvalsWithIndication.has(row.id)
    );

    const approvalDiseaseRows = approvalIds.length
      ? ((await database
          .select({
            approvalId: regulatoryApprovalDisease.regulatoryApprovalId,
            diseaseId: regulatoryApprovalDisease.diseaseId,
            scope: regulatoryApprovalDisease.scope,
          })
          .from(regulatoryApprovalDisease)
          .where(
            inArray(regulatoryApprovalDisease.regulatoryApprovalId, approvalIds)
          )) as any[])
      : [];
    const approvalVariantRows = approvalIds.length
      ? ((await database
          .select({
            approvalId: regulatoryApprovalVariant.regulatoryApprovalId,
            variantId: regulatoryApprovalVariant.variantId,
            scope: regulatoryApprovalVariant.scope,
          })
          .from(regulatoryApprovalVariant)
          .where(
            inArray(regulatoryApprovalVariant.regulatoryApprovalId, approvalIds)
          )) as any[])
      : [];

    const approvalsByDrug = new Map<string, RegulatoryApprovalResult[]>();
    for (const row of eligibleApprovalRows) {
      const approval: RegulatoryApprovalResult = {
        id: row.id,
        authority: row.authority,
        applicationNumber: row.applicationNumber,
        submissionNumber: row.submissionNumber,
        approvalStatus: row.approvalStatus,
        approvalDate: row.approvalDate,
        statusAsOf: row.statusAsOf,
        indicationText: row.indicationText,
        biomarkerText: row.biomarkerText,
        labelEffectiveDate: row.labelEffectiveDate,
        source: sourceReference(row),
      };
      addToMapArray(approvalsByDrug, row.drugId, approval);
    }
    for (const approvals of approvalsByDrug.values()) {
      approvals.sort((left, right) => left.id.localeCompare(right.id));
    }

    const claimRows = (await database
      .select()
      .from(evidenceClaim)
      .where(
        and(
          inArray(evidenceClaim.associationId, associationIds),
          eq(evidenceClaim.reviewStatus, 'APPROVED')
        )
      )) as any[];
    const claimIds = claimRows.map((row) => row.id as string);
    const passageRows = claimIds.length
      ? ((await database
          .select({
            claimId: evidenceClaimPassage.evidenceClaimId,
            supportRole: evidenceClaimPassage.supportRole,
            id: sourcePassage.id,
            section: sourcePassage.section,
            paragraphIndex: sourcePassage.paragraphIndex,
            locator: sourcePassage.locator,
            originalText: sourcePassage.originalText,
            publicExcerpt: sourcePassage.publicExcerpt,
            displayPolicy: sourcePassage.displayPolicy,
            modelUsePolicy: sourcePassage.modelUsePolicy,
            sourceId: sourceDocument.id,
            sourceType: sourceDocument.sourceType,
            sourceExternalId: sourceDocument.externalId,
            sourceTitle: sourceDocument.title,
            sourceUrl: sourceDocument.url,
            sourceDoi: sourceDocument.doi,
            sourcePmcid: sourceDocument.pmcid,
          })
          .from(evidenceClaimPassage)
          .innerJoin(
            sourcePassage,
            eq(evidenceClaimPassage.sourcePassageId, sourcePassage.id)
          )
          .innerJoin(
            sourceDocument,
            eq(sourcePassage.sourceDocumentId, sourceDocument.id)
          )
          .where(
            and(
              inArray(evidenceClaimPassage.evidenceClaimId, claimIds),
              eq(sourcePassage.reviewStatus, 'APPROVED'),
              eq(sourceDocument.reviewStatus, 'APPROVED'),
              eq(sourceDocument.sourceType, 'PUBMED')
            )
          )) as any[])
      : [];

    const passagesByClaim = new Map<string, EvidencePassageResult[]>();
    for (const row of passageRows) {
      addToMapArray(passagesByClaim, row.claimId, {
        id: row.id,
        source: sourceReference(row),
        section: row.section,
        paragraphIndex: row.paragraphIndex,
        locator: row.locator as Record<string, unknown>,
        originalText: row.originalText,
        publicExcerpt: row.publicExcerpt,
        displayPolicy: row.displayPolicy,
        modelUsePolicy: row.modelUsePolicy,
        supportRole: row.supportRole,
      });
    }
    for (const passages of passagesByClaim.values()) {
      passages.sort((left, right) => left.id.localeCompare(right.id));
    }

    const claimsByAssociation = new Map<string, EvidenceClaimResult[]>();
    for (const row of claimRows) {
      const passages = passagesByClaim.get(row.id) ?? [];
      const hasModelAllowedPrimary = passages.some(
        (passage) =>
          passage.supportRole === 'PRIMARY' &&
          passage.modelUsePolicy === 'ALLOWED'
      );
      if (!hasModelAllowedPrimary) continue;

      addToMapArray(claimsByAssociation, row.associationId, {
        id: row.id,
        claimType: row.claimType,
        evidenceMaturity: row.evidenceMaturity,
        studyType: row.studyType,
        studyName: row.studyName,
        populationSummary: row.populationSummary,
        sampleSize: row.sampleSize,
        diseaseStage: row.diseaseStage,
        treatmentLine: row.treatmentLine,
        priorTherapy: row.priorTherapy,
        intervention: row.intervention,
        comparator: row.comparator,
        endpoint: row.endpoint,
        effectValue: row.effectValue as Record<string, unknown> | null,
        conclusion: row.conclusion,
        limitations: row.limitations,
        passages,
      });
    }
    for (const claims of claimsByAssociation.values()) {
      claims.sort((left, right) => left.id.localeCompare(right.id));
    }

    const groups: EvidenceResultGroup[] = [
      { scope: 'SAME_DISEASE', therapies: [] },
      { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
    ];
    for (const row of candidates) {
      const drugs = drugsByAssociation.get(row.associationId) ?? [];
      const totalDrugLinks = associationDrugRows.filter(
        (link) => link.associationId === row.associationId
      ).length;
      if (drugs.length === 0 || drugs.length !== totalDrugLinks) continue;
      if (drugs.some((item) => !(approvalsByDrug.get(item.id)?.length ?? 0))) {
        continue;
      }
      const claims = claimsByAssociation.get(row.associationId) ?? [];
      if (claims.length === 0) continue;

      const approvalMap = new Map<string, RegulatoryApprovalResult>();
      for (const item of drugs) {
        for (const approval of approvalsByDrug.get(item.id) ?? []) {
          approvalMap.set(approval.id, approval);
        }
      }
      const approvals = [...approvalMap.values()].sort((left, right) =>
        left.id.localeCompare(right.id)
      );
      const isMatched = approvals.some((approval) => {
        const coversDisease = approvalDiseaseRows.some(
          (item) =>
            item.approvalId === approval.id &&
            item.diseaseId === targetDiseaseId &&
            ['EXACT', 'BROADER'].includes(item.scope)
        );
        const coversVariant = approvalVariantRows.some(
          (item) =>
            item.approvalId === approval.id &&
            item.variantId === row.variantId &&
            ['EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT'].includes(item.scope)
        );
        return coversDisease && coversVariant;
      });
      const isDirect = row.diseaseCanonicalName === query.disease;
      const sourceApprovedLevel = row.approvedLevel as EvidenceLevel;
      const therapy: EvidenceTherapyResult = {
        associationId: row.associationId,
        sourceDisease: {
          id: row.diseaseId,
          canonicalName: row.diseaseCanonicalName,
          displayNameZh: row.diseaseDisplayNameZh,
          displayNameEn: row.diseaseDisplayNameEn,
          lineage: row.diseaseLineage,
        },
        variant: {
          id: row.variantId,
          gene: row.geneSymbol,
          alterationType: row.alterationType,
          hgvsp: row.hgvsp,
          canonicalKey: row.canonicalKey,
          applicability: row.variantApplicability,
        },
        drugs,
        direction: row.direction,
        approvedLevel: isDirect ? sourceApprovedLevel : '3B',
        sourceApprovedLevel,
        gradingRationale: row.gradingRationale,
        regulatoryAlignment: isMatched
          ? 'MATCHED_INDICATION'
          : 'OTHER_INDICATION',
        regulatoryApprovals: approvals,
        evidenceClaims: claims,
      };
      groups[isDirect ? 0 : 1].therapies.push(therapy);
    }

    groups[0].therapies.sort(therapySort);
    groups[1].therapies.sort(therapySort);
    return groups;
  }

  async function findAnswerSnapshot(key: AnswerSnapshotKey) {
    const rows = await database
      .select({
        structuredOutput: answerSnapshot.structuredOutput,
        createdAt: answerSnapshot.createdAt,
      })
      .from(answerSnapshot)
      .where(
        and(
          eq(answerSnapshot.requestFingerprint, key.requestFingerprint),
          eq(answerSnapshot.knowledgeReleaseId, key.knowledgeReleaseId),
          eq(answerSnapshot.promptVersion, key.promptVersion),
          eq(answerSnapshot.provider, key.provider),
          eq(answerSnapshot.model, key.model),
          eq(answerSnapshot.locale, key.locale),
          eq(answerSnapshot.validationStatus, 'VALID')
        )
      )
      .limit(1);
    if (rows.length === 0) return null;
    return {
      structuredOutput: rows[0].structuredOutput,
      createdAt: iso(rows[0].createdAt),
    };
  }

  async function saveAnswerSnapshot(snapshot: NewAnswerSnapshot) {
    await database
      .insert(answerSnapshot)
      .values({
        id: `answer_${randomUUID()}`,
        requestFingerprint: snapshot.requestFingerprint,
        knowledgeReleaseId: snapshot.knowledgeReleaseId,
        promptVersion: snapshot.promptVersion,
        provider: snapshot.provider,
        model: snapshot.model,
        locale: snapshot.locale,
        evidenceIds: snapshot.evidenceIds,
        associationIds: snapshot.associationIds,
        regulatoryApprovalIds: snapshot.regulatoryApprovalIds,
        structuredOutput: snapshot.structuredOutput,
        validationStatus: snapshot.validationStatus,
        latencyMs: snapshot.latencyMs,
        createdAt: new Date(snapshot.createdAt),
      })
      .onConflictDoNothing({
        target: [
          answerSnapshot.requestFingerprint,
          answerSnapshot.knowledgeReleaseId,
          answerSnapshot.promptVersion,
          answerSnapshot.provider,
          answerSnapshot.model,
          answerSnapshot.locale,
        ],
      });
  }

  return {
    getPublishedRelease,
    retrieveEvidence,
    findAnswerSnapshot,
    saveAnswerSnapshot,
  };
}
