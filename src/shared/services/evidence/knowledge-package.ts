import { createHash } from 'node:crypto';
import { z } from 'zod';

import { gradeAssociation } from './grade-association';

const entityStatus = z.enum(['ACTIVE', 'INACTIVE', 'DEPRECATED']);
const reviewStatus = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED']);
const evidenceLevel = z.enum([
  '1',
  '2',
  '3A',
  '3B',
  '4',
  'R1',
  'R2',
  'UNRATED',
]);
const evidenceMaturity = z.enum([
  'REGULATORY',
  'GUIDELINE',
  'MATURE_CLINICAL',
  'LIMITED_CLINICAL',
  'PRECLINICAL',
  'INSUFFICIENT',
]);
const jsonRecord = z.record(z.string(), z.unknown());
const id = z.string().trim().min(1);
const date = z.iso.date();
const dateTime = z.iso.datetime({ offset: true });

const diseaseSchema = z.object({
  id,
  canonicalName: z.string().trim().min(1),
  displayNameZh: z.string().trim().min(1),
  displayNameEn: z.string().trim().min(1),
  ontologySystem: z.string().trim().min(1).nullable(),
  ontologyCode: z.string().trim().min(1).nullable(),
  lineage: z.enum(['SOLID', 'HEMATOLOGIC', 'UNKNOWN']),
  aliases: z.array(z.string()),
  status: entityStatus,
});

const geneSchema = z.object({
  id,
  symbol: z.string().trim().min(1),
  hgncId: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(1),
  aliases: z.array(z.string()),
  status: entityStatus,
});

const variantSchema = z.object({
  id,
  geneId: id,
  alterationType: z.string().trim().min(1),
  hgvsp: z.string().trim().min(1).nullable(),
  hgvsc: z.string().trim().min(1).nullable(),
  transcript: z.string().trim().min(1).nullable(),
  canonicalKey: z.string().trim().min(1),
  aliases: z.array(z.string()),
  status: entityStatus,
});

const drugSchema = z.object({
  id,
  genericName: z.string().trim().min(1),
  displayNameZh: z.string().trim().min(1),
  displayNameEn: z.string().trim().min(1),
  brandNames: z.array(z.string()),
  aliases: z.array(z.string()),
  externalIds: jsonRecord,
  status: entityStatus,
});

const publicationSchema = z.object({
  id,
  sourceType: z.enum(['PUBMED', 'FDA']),
  externalId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  publisherOrAgency: z.string().trim().min(1).nullable(),
  journal: z.string().trim().min(1).nullable(),
  publicationDate: date.nullable(),
  doi: z.string().trim().min(1).nullable(),
  pmcid: z.string().trim().min(1).nullable(),
  url: z.url(),
  sourceScope: z.enum([
    'ABSTRACT',
    'PMC_FULL_TEXT',
    'FDA_LABEL',
    'FDA_APPROVAL_RECORD',
    'OTHER',
  ]),
  language: z.string().trim().min(1),
  license: z.string().trim().min(1).nullable(),
  retrievedAt: dateTime,
  documentHash: z.string().trim().min(1).nullable(),
  metadata: jsonRecord,
  reviewStatus,
});

const passageSchema = z.object({
  id,
  sourceDocumentId: id,
  section: z.string().trim().min(1).nullable(),
  paragraphIndex: z.number().int().nonnegative().nullable(),
  locator: jsonRecord,
  originalText: z.string().trim().min(1),
  textHash: z.string().trim().min(1),
  language: z.string().trim().min(1),
  displayPolicy: z.enum(['FULL_TEXT', 'EXCERPT', 'LINK_ONLY', 'INTERNAL_ONLY']),
  modelUsePolicy: z.enum(['ALLOWED', 'PROHIBITED']),
  publicExcerpt: z.string().trim().min(1).nullable(),
  contextBeforeId: id.nullable(),
  contextAfterId: id.nullable(),
  reviewStatus,
});

const regulatoryApprovalSchema = z.object({
  id,
  authority: z.string().trim().min(1),
  applicationNumber: z.string().trim().min(1),
  submissionNumber: z.string().trim().min(1).nullable(),
  approvalStatus: z.enum([
    'APPROVED',
    'WITHDRAWN',
    'INACTIVE',
    'NOT_APPROVED',
    'UNKNOWN',
  ]),
  approvalDate: date,
  statusAsOf: date,
  indicationText: z.string().trim().min(1),
  biomarkerText: z.string().trim().min(1).nullable(),
  labelEffectiveDate: date.nullable(),
  sourceDocumentId: id,
  reviewStatus,
  reviewedBy: z.string().trim().min(1).nullable(),
  reviewedAt: dateTime.nullable(),
  drugIds: z.array(id).min(1),
  diseaseLinks: z
    .array(
      z.object({
        diseaseId: id,
        scope: z.enum(['EXACT', 'BROADER', 'OTHER']),
      })
    )
    .min(1),
  variantLinks: z
    .array(
      z.object({
        variantId: id,
        scope: z.enum(['EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT', 'GENE_ONLY']),
      })
    )
    .min(1),
  passageLinks: z
    .array(
      z.object({
        sourcePassageId: id,
        supportRole: z.enum(['INDICATION', 'BIOMARKER', 'STATUS', 'CONTEXT']),
      })
    )
    .min(1),
});

const associationSchema = z.object({
  id,
  diseaseId: id,
  variantId: id,
  therapyKey: z.string().trim().min(1),
  direction: z.enum(['SENSITIVITY', 'RESISTANCE', 'EXPLORATORY']),
  variantApplicability: z.enum([
    'EXACT',
    'EXPLICIT_GROUP_INCLUDES_EXACT',
    'GENE_ONLY',
    'ANALOGOUS_VARIANT',
    'UNKNOWN',
  ]),
  proposedLevel: evidenceLevel,
  approvedLevel: evidenceLevel.nullable(),
  gradingRuleVersion: z.string().trim().min(1),
  gradingRationale: z.string().trim().min(1),
  gradingInput: z.object({
    diseaseApplicability: z.enum([
      'SAME_DISEASE',
      'OTHER_SOLID_TUMOR_EXACT_VARIANT',
      'OTHER_HEMATOLOGIC_EXACT_VARIANT',
      'OTHER_DISEASE_NON_EXACT',
    ]),
    regulatoryAlignment: z.enum(['MATCHED_INDICATION', 'OTHER_INDICATION']),
    guidelineSupported: z.boolean(),
    biomarkerSpecificResistance: z.boolean(),
    sourceApprovedLevel: evidenceLevel.optional(),
  }),
  reviewStatus,
  reviewedBy: z.string().trim().min(1).nullable(),
  reviewedAt: dateTime.nullable(),
  drugs: z
    .array(
      z.object({
        drugId: id,
        role: z.enum(['PRIMARY', 'COMBINATION_COMPONENT']),
        sortOrder: z.number().int().nonnegative(),
      })
    )
    .min(1),
});

const evidenceClaimSchema = z.object({
  id,
  associationId: id,
  claimType: z.enum(['EFFICACY', 'RESISTANCE', 'SAFETY_CONTEXT', 'OTHER']),
  evidenceMaturity,
  studyType: z.string().trim().min(1),
  studyName: z.string().trim().min(1).nullable(),
  populationSummary: z.string().trim().min(1),
  sampleSize: z.number().int().positive().nullable(),
  diseaseStage: z.string().trim().min(1).nullable(),
  treatmentLine: z.string().trim().min(1).nullable(),
  priorTherapy: z.string().trim().min(1).nullable(),
  intervention: z.string().trim().min(1),
  comparator: z.string().trim().min(1).nullable(),
  endpoint: z.string().trim().min(1),
  effectValue: jsonRecord.nullable(),
  conclusion: z.string().trim().min(1),
  limitations: z.string().trim().min(1),
  cohortFingerprint: z.string().trim().min(1).nullable(),
  reviewStatus,
  reviewedBy: z.string().trim().min(1).nullable(),
  reviewedAt: dateTime.nullable(),
  passageLinks: z
    .array(
      z.object({
        sourcePassageId: id,
        supportRole: z.enum(['PRIMARY', 'CONTEXT', 'LIMITATION']),
      })
    )
    .min(1),
});

const releaseSchema = z.object({
  id,
  version: z.string().trim().min(1),
  status: z.literal('PUBLISHED'),
  literatureCutoffAt: dateTime,
  regulatoryCutoffAt: dateTime,
  gradingRuleVersion: z.string().trim().min(1),
  publishedAt: dateTime,
  publishedBy: z.string().trim().min(1),
  notes: z.string().trim().min(1),
  associationIds: z.array(id).min(1),
  regulatoryApprovalIds: z.array(id).min(1),
});

export const knowledgePackageSchema = z.object({
  entities: z.object({
    diseases: z.array(diseaseSchema).min(1),
    genes: z.array(geneSchema).min(1),
    variants: z.array(variantSchema).min(1),
    drugs: z.array(drugSchema).min(1),
  }),
  publications: z.array(publicationSchema).min(1),
  passages: z.array(passageSchema).min(1),
  fdaApprovals: z.array(regulatoryApprovalSchema).min(1),
  associations: z.array(associationSchema).min(1),
  evidenceClaims: z.array(evidenceClaimSchema).min(1),
  release: releaseSchema,
});

export type KnowledgePackageInput = z.input<typeof knowledgePackageSchema>;
export type KnowledgePackage = z.output<typeof knowledgePackageSchema>;

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label} ${value}`);
    }
    seen.add(value);
  }
}

function requireMember(set: Set<string>, value: string, message: string) {
  if (!set.has(value)) {
    throw new Error(message);
  }
}

function assertApproved(
  value: { id: string; reviewStatus: string },
  label: string
) {
  if (value.reviewStatus !== 'APPROVED') {
    throw new Error(`Released ${label} ${value.id} must be APPROVED`);
  }
}

export function validateKnowledgePackage(
  input: KnowledgePackageInput
): KnowledgePackage {
  const value = knowledgePackageSchema.parse(input);
  const { entities } = value;

  const idGroups = [
    ['disease id', entities.diseases.map(({ id }) => id)],
    ['gene id', entities.genes.map(({ id }) => id)],
    ['variant id', entities.variants.map(({ id }) => id)],
    ['drug id', entities.drugs.map(({ id }) => id)],
    ['source document id', value.publications.map(({ id }) => id)],
    ['source passage id', value.passages.map(({ id }) => id)],
    ['FDA approval id', value.fdaApprovals.map(({ id }) => id)],
    ['association id', value.associations.map(({ id }) => id)],
    ['claim id', value.evidenceClaims.map(({ id }) => id)],
  ] as const;
  for (const [label, ids] of idGroups) assertUnique(ids, label);
  assertUnique(
    value.publications.map(
      ({ sourceType, externalId }) => `${sourceType}:${externalId}`
    ),
    'source identity'
  );

  const diseaseIds = new Set(entities.diseases.map(({ id }) => id));
  const geneIds = new Set(entities.genes.map(({ id }) => id));
  const variantIds = new Set(entities.variants.map(({ id }) => id));
  const drugIds = new Set(entities.drugs.map(({ id }) => id));
  const publicationById = new Map(
    value.publications.map((record) => [record.id, record])
  );
  const passageById = new Map(
    value.passages.map((record) => [record.id, record])
  );
  const approvalById = new Map(
    value.fdaApprovals.map((record) => [record.id, record])
  );
  const associationById = new Map(
    value.associations.map((record) => [record.id, record])
  );

  for (const variant of entities.variants) {
    requireMember(
      geneIds,
      variant.geneId,
      `Variant ${variant.id} references unknown gene ${variant.geneId}`
    );
  }
  for (const passage of value.passages) {
    requireMember(
      new Set(publicationById.keys()),
      passage.sourceDocumentId,
      `Passage ${passage.id} references unknown source document ${passage.sourceDocumentId}`
    );
    for (const contextId of [passage.contextBeforeId, passage.contextAfterId]) {
      if (contextId) {
        requireMember(
          new Set(passageById.keys()),
          contextId,
          `Passage ${passage.id} references unknown context passage ${contextId}`
        );
      }
    }
  }

  for (const approval of value.fdaApprovals) {
    assertApproved(approval, 'FDA approval');
    if (approval.approvalStatus !== 'APPROVED') {
      throw new Error(`Released FDA approval ${approval.id} must be APPROVED`);
    }
    const source = publicationById.get(approval.sourceDocumentId);
    if (!source || source.sourceType !== 'FDA') {
      throw new Error(
        `FDA approval ${approval.id} must reference an FDA source`
      );
    }
    approval.drugIds.forEach((drugId) =>
      requireMember(
        drugIds,
        drugId,
        `FDA approval ${approval.id} references unknown drug ${drugId}`
      )
    );
    approval.diseaseLinks.forEach(({ diseaseId }) =>
      requireMember(
        diseaseIds,
        diseaseId,
        `FDA approval ${approval.id} references unknown disease ${diseaseId}`
      )
    );
    approval.variantLinks.forEach(({ variantId }) =>
      requireMember(
        variantIds,
        variantId,
        `FDA approval ${approval.id} references unknown variant ${variantId}`
      )
    );
    const hasIndication = approval.passageLinks.some((link) => {
      const passage = passageById.get(link.sourcePassageId);
      return (
        link.supportRole === 'INDICATION' &&
        passage?.sourceDocumentId === approval.sourceDocumentId
      );
    });
    if (!hasIndication) {
      throw new Error(
        `FDA approval ${approval.id} must have an INDICATION passage from its FDA source`
      );
    }
  }

  for (const association of value.associations) {
    assertApproved(association, 'association');
    requireMember(
      diseaseIds,
      association.diseaseId,
      `Association ${association.id} references unknown disease ${association.diseaseId}`
    );
    requireMember(
      variantIds,
      association.variantId,
      `Association ${association.id} references unknown variant ${association.variantId}`
    );
    association.drugs.forEach(({ drugId }) =>
      requireMember(
        drugIds,
        drugId,
        `Association ${association.id} references unknown drug ${drugId}`
      )
    );
    assertUnique(
      association.drugs.map(({ drugId }) => drugId),
      `drug link on association ${association.id}`
    );
    assertUnique(
      association.drugs.map(({ sortOrder }) => String(sortOrder)),
      `sort order on association ${association.id}`
    );
    const expectedTherapyKey = [...association.drugs]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(({ drugId, role }) => `${drugId}:${role}`)
      .join('|');
    if (association.therapyKey !== expectedTherapyKey) {
      throw new Error(
        `Association ${association.id} therapyKey must be ${expectedTherapyKey}`
      );
    }
  }

  const claimsByAssociation = new Map<string, typeof value.evidenceClaims>();
  for (const claim of value.evidenceClaims) {
    assertApproved(claim, 'claim');
    requireMember(
      new Set(associationById.keys()),
      claim.associationId,
      `Claim ${claim.id} references unknown association ${claim.associationId}`
    );
    claimsByAssociation.set(claim.associationId, [
      ...(claimsByAssociation.get(claim.associationId) ?? []),
      claim,
    ]);
    const hasEligiblePrimary = claim.passageLinks.some((link) => {
      const passage = passageById.get(link.sourcePassageId);
      const publication = passage
        ? publicationById.get(passage.sourceDocumentId)
        : undefined;
      return (
        link.supportRole === 'PRIMARY' &&
        passage?.reviewStatus === 'APPROVED' &&
        passage.modelUsePolicy === 'ALLOWED' &&
        publication?.sourceType === 'PUBMED' &&
        publication.reviewStatus === 'APPROVED'
      );
    });
    if (!hasEligiblePrimary) {
      throw new Error(
        `Claim ${claim.id} must have a model-allowed PubMed PRIMARY passage`
      );
    }
    for (const { sourcePassageId } of claim.passageLinks) {
      requireMember(
        new Set(passageById.keys()),
        sourcePassageId,
        `Claim ${claim.id} references unknown passage ${sourcePassageId}`
      );
    }
  }

  for (const association of value.associations) {
    const claims = claimsByAssociation.get(association.id) ?? [];
    if (claims.length === 0) {
      throw new Error(
        `Association ${association.id} must have an evidence claim`
      );
    }
    if (association.gradingRuleVersion !== value.release.gradingRuleVersion) {
      throw new Error(
        `Association ${association.id} uses a different grading rule version`
      );
    }
    const recalculatedLevel = gradeAssociation({
      direction: association.direction,
      variantApplicability: association.variantApplicability,
      evidenceMaturities: [
        ...new Set(claims.map(({ evidenceMaturity }) => evidenceMaturity)),
      ],
      ...association.gradingInput,
    });
    if (association.proposedLevel !== recalculatedLevel) {
      throw new Error(
        `Association ${association.id} proposed level ${association.proposedLevel} does not match recalculated level ${recalculatedLevel}`
      );
    }
    if (association.approvedLevel !== association.proposedLevel) {
      throw new Error(
        `Association ${association.id} approved level must match its proposed level`
      );
    }

    if (recalculatedLevel === '1') {
      for (const { drugId } of association.drugs) {
        const hasMatchingApproval = value.fdaApprovals.some(
          (approval) =>
            value.release.regulatoryApprovalIds.includes(approval.id) &&
            approval.drugIds.includes(drugId) &&
            approval.diseaseLinks.some(
              (link) =>
                link.diseaseId === association.diseaseId &&
                ['EXACT', 'BROADER'].includes(link.scope)
            ) &&
            approval.variantLinks.some(
              (link) =>
                link.variantId === association.variantId &&
                ['EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT'].includes(link.scope)
            )
        );
        if (!hasMatchingApproval) {
          throw new Error(
            `Level 1 association ${association.id} has no matching FDA approval for drug ${drugId}`
          );
        }
      }
    }
  }

  assertUnique(value.release.associationIds, 'release association id');
  assertUnique(
    value.release.regulatoryApprovalIds,
    'release regulatory approval id'
  );
  for (const associationId of value.release.associationIds) {
    requireMember(
      new Set(associationById.keys()),
      associationId,
      `Release references unknown association ${associationId}`
    );
  }
  for (const approvalId of value.release.regulatoryApprovalIds) {
    requireMember(
      new Set(approvalById.keys()),
      approvalId,
      `Release references unknown FDA approval ${approvalId}`
    );
  }

  value.publications.forEach((record) =>
    assertApproved(record, 'source document')
  );
  value.passages.forEach((record) => assertApproved(record, 'passage'));

  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
    );
  }
  return value;
}

export function calculateKnowledgePackageHash(
  knowledgePackage: KnowledgePackage
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(knowledgePackage)))
    .digest('hex');
}
