import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  executeSkill,
  hashArtifact,
  type SkillExecutionTrace,
} from './skill-runtime';
import {
  evidenceDraftSchema,
  parseEvidenceDraftInput,
  type AssociationReviewContext,
  type CandidateSourceInput,
  type EvidenceDraftInput,
} from './upstream-workflow';
import { equivalentProteinVariantTerms } from './variant-term-matching';

const extractedClaimSchema = z.object({
  claimType: z.enum(['EFFICACY', 'RESISTANCE', 'SAFETY_CONTEXT', 'OTHER']),
  evidenceMaturity: z.enum([
    'MATURE_CLINICAL',
    'LIMITED_CLINICAL',
    'PRECLINICAL',
    'INSUFFICIENT',
  ]),
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
  effectValue: z.record(z.string(), z.unknown()).nullable(),
  conclusion: z.string().trim().min(1),
  limitations: z.string().trim().min(1),
});

export const evidenceExtractionOutputSchema = z.object({
  claims: z.array(extractedClaimSchema).min(1),
  qaIssues: z.array(
    z.object({
      code: z.string().trim().min(1),
      severity: z.enum(['INFO', 'WARNING', 'BLOCKING']),
      message: z.string().trim().min(1),
    })
  ),
});

export interface EvidenceExtractionGenerator {
  generate(input: {
    source: CandidateSourceInput;
    association: AssociationReviewContext;
  }): Promise<unknown>;
}

export async function extractEvidenceDraft(_input: {
  source: CandidateSourceInput;
  association: AssociationReviewContext;
  generator: EvidenceExtractionGenerator;
  createId?: () => string;
}): Promise<EvidenceDraftInput> {
  return (await extractEvidenceDraftWithTrace(_input)).draft;
}

const extractionInputSchema = z.object({
  source: z.object({
    pmid: z.string().regex(/^[1-9][0-9]{0,9}$/),
    title: z.string().trim().min(1),
    abstract: z.string().trim().min(1),
    doi: z.string().nullable().optional(),
    documentHash: z.string().trim().min(1),
    publicationDate: z.string().nullable().optional(),
    journal: z.string().nullable().optional(),
    pmcid: z.string().nullable().optional(),
    sourceScope: z.enum(['ABSTRACT', 'PMC_FULL_TEXT']).optional(),
    license: z.string().nullable().optional(),
    licensePolicy: z
      .object({
        decision: z.enum(['ALLOWED', 'REJECTED', 'UNKNOWN']),
        licenseType: z.string().nullable(),
        licenseText: z.string().nullable(),
        reason: z.string().min(1),
      })
      .optional(),
    fullText: z.string().nullable().optional(),
    url: z.url(),
  }),
  association: z.object({
    id: z.string().trim().min(1),
    approvedLevel: z.string().trim().min(1),
    gradingRationale: z.string().trim().min(1),
    direction: z.enum(['SENSITIVITY', 'RESISTANCE', 'EXPLORATORY']).optional(),
    variantApplicability: z
      .enum([
        'EXACT',
        'EXPLICIT_GROUP_INCLUDES_EXACT',
        'GENE_ONLY',
        'ANALOGOUS_VARIANT',
        'UNKNOWN',
      ])
      .optional(),
    therapyNames: z.array(z.string().trim().min(1)).optional(),
  }),
});

const gradingOutputSchema = z.object({
  proposedLevel: z.enum(['1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED']),
  gradingRationale: z.string().trim().min(1),
});

const recognizedEntitiesSchema = z.object({
  populations: z.array(z.string()),
  interventions: z.array(z.string()),
  comparators: z.array(z.string()),
  endpoints: z.array(z.string()),
  targetMentions: z.object({
    diseases: z.array(z.string()),
    genes: z.array(z.string()),
    variants: z.array(z.string()),
  }),
});

const normalizedCandidateSchema = z.object({
  catalogId: z.string().trim().min(1).nullable(),
  matchedTerm: z.string().trim().min(1),
  basis: z.literal('SOURCE_LITERAL'),
});

const normalizedEntitiesSchema = recognizedEntitiesSchema.extend({
  entityCandidates: z.object({
    diseases: z.array(normalizedCandidateSchema),
    genes: z.array(normalizedCandidateSchema),
    variants: z.array(normalizedCandidateSchema),
  }),
  proposedAssociationId: z.string().trim().min(1).nullable(),
  unresolved: z.array(z.string()),
});

const relationshipOutputSchema = z.object({
  proposedAssociationId: z.string().trim().min(1),
  claimCount: z.number().int().positive(),
  claimTypes: z.array(
    z.enum(['EFFICACY', 'RESISTANCE', 'SAFETY_CONTEXT', 'OTHER'])
  ),
});

export async function extractEvidenceDraftWithTrace(_input: {
  source: CandidateSourceInput;
  association: AssociationReviewContext;
  generator: EvidenceExtractionGenerator;
  createId?: () => string;
}): Promise<{
  draft: EvidenceDraftInput;
  traces: SkillExecutionTrace<unknown>[];
}> {
  const extractionAgent = {
    agentId: 'extraction-agent',
    version: '1.0.0',
    allowedSkillVersions: ['extract_evidence_claims@1.0.0'],
  };
  const extraction = await executeSkill<
    z.infer<typeof extractionInputSchema>,
    z.infer<typeof evidenceExtractionOutputSchema>
  >({
    definition: {
      skillId: 'extract_evidence_claims',
      name: 'Extract evidence claims',
      version: '1.0.0',
      kind: 'MODEL',
      description: 'Extract review-only evidence claims from one source.',
      inputSchema: extractionInputSchema,
      outputSchema: evidenceExtractionOutputSchema,
      allowedTools: [],
      sideEffect: 'STAGING_WRITE',
      timeoutMs: 120_000,
      maxAttempts: 2,
      riskLevel: 'HIGH',
      evaluationSuiteId: null,
      status: 'ACTIVE',
      execute: async (value) =>
        (await _input.generator.generate(value)) as z.infer<
          typeof evidenceExtractionOutputSchema
        >,
    },
    agent: extractionAgent,
    value: { source: _input.source, association: _input.association },
  });
  const output = extraction.output;
  const targetTerms = _input.association.eligibilityTerms ?? {
    diseases: [],
    genes: [],
    variants: [],
  };
  const sourceText = [
    _input.source.title,
    _input.source.abstract,
    _input.source.fullText ?? '',
  ].join(' ');
  const recognition = await executeSkill<
    z.infer<typeof evidenceExtractionOutputSchema>,
    z.infer<typeof recognizedEntitiesSchema>
  >({
    definition: {
      skillId: 'recognize_evidence_entities',
      name: 'Recognize evidence entities',
      version: '2.0.0',
      kind: 'DETERMINISTIC',
      description:
        'Collect source-grounded entity mentions from extracted claims.',
      inputSchema: evidenceExtractionOutputSchema,
      outputSchema: recognizedEntitiesSchema,
      allowedTools: [],
      sideEffect: 'NONE',
      timeoutMs: 5_000,
      maxAttempts: 1,
      riskLevel: 'HIGH',
      evaluationSuiteId: null,
      status: 'ACTIVE',
      execute: async (value) => ({
        populations: unique(
          value.claims.map((claim) => claim.populationSummary)
        ),
        interventions: unique(value.claims.map((claim) => claim.intervention)),
        comparators: unique(
          value.claims.flatMap((claim) =>
            claim.comparator ? [claim.comparator] : []
          )
        ),
        endpoints: unique(value.claims.map((claim) => claim.endpoint)),
        targetMentions: {
          diseases: literalMatches(sourceText, targetTerms.diseases),
          genes: literalMatches(sourceText, targetTerms.genes),
          variants: literalVariantMatches(sourceText, targetTerms.variants),
        },
      }),
    },
    agent: agent(
      'entity-recognition-agent',
      'recognize_evidence_entities',
      '2.0.0'
    ),
    value: output,
  });
  const normalization = await executeSkill<
    z.infer<typeof recognizedEntitiesSchema>,
    z.infer<typeof normalizedEntitiesSchema>
  >({
    definition: {
      skillId: 'normalize_evidence_entities',
      name: 'Normalize evidence entities',
      version: '2.0.0',
      kind: 'DETERMINISTIC',
      description:
        'Propose catalog entity candidates and association binding only from literal target matches.',
      inputSchema: recognizedEntitiesSchema,
      outputSchema: normalizedEntitiesSchema,
      allowedTools: [],
      sideEffect: 'NONE',
      timeoutMs: 5_000,
      maxAttempts: 1,
      riskLevel: 'HIGH',
      evaluationSuiteId: null,
      status: 'ACTIVE',
      execute: async (value) =>
        normalizeTargetCandidates(value, _input.association),
    },
    agent: agent('normalization-agent', 'normalize_evidence_entities', '2.0.0'),
    value: recognition.output,
  });
  if (!normalization.output.proposedAssociationId) {
    throw new Error(
      `Evidence source cannot be attributed to the reviewed association: ${normalization.output.unresolved.join(', ')}`
    );
  }
  const relationship = await executeSkill<
    z.infer<typeof normalizedEntitiesSchema>,
    z.infer<typeof relationshipOutputSchema>
  >({
    definition: {
      skillId: 'extract_treatment_relationship',
      name: 'Extract treatment relationship',
      version: '2.0.0',
      kind: 'DETERMINISTIC',
      description: 'Create an explicit review-only relationship proposal.',
      inputSchema: normalizedEntitiesSchema,
      outputSchema: relationshipOutputSchema,
      allowedTools: [],
      sideEffect: 'NONE',
      timeoutMs: 5_000,
      maxAttempts: 1,
      riskLevel: 'HIGH',
      evaluationSuiteId: null,
      status: 'ACTIVE',
      execute: async (value) => ({
        proposedAssociationId: value.proposedAssociationId!,
        claimCount: output.claims.length,
        claimTypes: unique(output.claims.map((claim) => claim.claimType)),
      }),
    },
    agent: agent(
      'relationship-agent',
      'extract_treatment_relationship',
      '2.0.0'
    ),
    value: normalization.output,
  });
  const grading = await executeSkill<
    z.infer<typeof evidenceExtractionOutputSchema>,
    z.infer<typeof gradingOutputSchema>
  >({
    definition: {
      skillId: 'propose_evidence_level',
      name: 'Propose evidence level',
      version: '1.0.0',
      kind: 'DETERMINISTIC',
      description:
        'Propose a review-only grade from the new document, independent of historical association grade.',
      inputSchema: evidenceExtractionOutputSchema,
      outputSchema: gradingOutputSchema,
      allowedTools: [],
      sideEffect: 'NONE',
      timeoutMs: 5_000,
      maxAttempts: 1,
      riskLevel: 'HIGH',
      evaluationSuiteId: null,
      status: 'ACTIVE',
      execute: async (value) => proposeEvidenceLevel(value),
    },
    agent: agent('grading-agent', 'propose_evidence_level'),
    value: output,
  });

  const passages = splitSourcePassages(_input.source);
  const createId = _input.createId ?? randomUUID;
  const fieldProvenance: Record<string, string[]> = {};
  const missingProvenance: string[] = [];
  const claims = output.claims.map((claim, index) => {
    const passageIds = new Set<string>();
    for (const field of traceableClaimFields) {
      const value = claim[field];
      if (value === null || value === '') continue;
      const matches = supportingPassages(field, value, passages);
      if (matches.length) {
        fieldProvenance[`claims.${index}.${field}`] = matches;
        matches.forEach((id) => passageIds.add(id));
      } else {
        missingProvenance.push(`claims.${index}.${field}`);
      }
    }
    return {
      id: createId(),
      ...claim,
      passageIds:
        passageIds.size > 0
          ? [...passageIds]
          : passages.map((passage) => passage.id),
    };
  });

  const unvalidated = {
    associationId: _input.association.id,
    proposedLevel: grading.output.proposedLevel,
    gradingRationale: grading.output.gradingRationale,
    passages,
    claims,
    fieldProvenance,
    qaIssues: [
      ...output.qaIssues,
      ...associationDirectionIssues(_input.association.direction, output),
      ...(missingProvenance.length
        ? [
            {
              code: 'MISSING_FIELD_PROVENANCE',
              severity: 'WARNING' as const,
              message: `No literal sentence-level support was found for: ${missingProvenance.join(', ')}`,
            },
          ]
        : []),
    ],
  };
  const validation = await executeSkill<EvidenceDraftInput, EvidenceDraftInput>(
    {
      definition: {
        skillId: 'validate_draft_completeness',
        name: 'Validate draft completeness',
        version: '1.0.0',
        kind: 'DETERMINISTIC',
        description: 'Validate traceability, source policy, and QA readiness.',
        inputSchema: evidenceDraftSchema,
        outputSchema: evidenceDraftSchema,
        allowedTools: [],
        sideEffect: 'STAGING_WRITE',
        timeoutMs: 10_000,
        maxAttempts: 1,
        riskLevel: 'HIGH',
        evaluationSuiteId: null,
        status: 'ACTIVE',
        execute: async (value) => parseEvidenceDraftInput(value),
      },
      agent: agent('ingestion-qa-agent', 'validate_draft_completeness'),
      value: unvalidated,
    }
  );
  return {
    draft: validation.output,
    traces: [
      extraction,
      recognition,
      normalization,
      relationship,
      grading,
      validation,
    ],
  };
}

const traceableClaimFields = [
  'studyType',
  'studyName',
  'populationSummary',
  'sampleSize',
  'diseaseStage',
  'treatmentLine',
  'priorTherapy',
  'intervention',
  'comparator',
  'endpoint',
  'effectValue',
  'conclusion',
  'limitations',
] as const;

function agent(agentId: string, skillId: string, version = '1.0.0') {
  return {
    agentId,
    version,
    allowedSkillVersions: [`${skillId}@${version}`],
  };
}

function literalMatches(text: string, terms: string[]) {
  const normalizedText = normalizeEvidenceText(text);
  return unique(
    terms.filter((term) => {
      const normalizedTerm = normalizeEvidenceText(term);
      return (
        normalizedTerm.length > 1 && normalizedText.includes(normalizedTerm)
      );
    })
  );
}

function literalVariantMatches(text: string, terms: string[]) {
  const normalizedText = normalizeEvidenceText(text);
  return unique(
    terms.filter((term) =>
      equivalentProteinVariantTerms(normalizeEvidenceText(term)).some(
        (candidate) =>
          candidate.length > 1 && normalizedText.includes(candidate)
      )
    )
  );
}

function normalizeTargetCandidates(
  value: z.infer<typeof recognizedEntitiesSchema>,
  association: AssociationReviewContext
): z.infer<typeof normalizedEntitiesSchema> {
  const ids = association.entityIds;
  const candidates = {
    diseases: value.targetMentions.diseases.map((matchedTerm) => ({
      catalogId: ids?.diseaseId ?? null,
      matchedTerm,
      basis: 'SOURCE_LITERAL' as const,
    })),
    genes: value.targetMentions.genes.map((matchedTerm) => ({
      catalogId: ids?.geneId ?? null,
      matchedTerm,
      basis: 'SOURCE_LITERAL' as const,
    })),
    variants: value.targetMentions.variants.map((matchedTerm) => ({
      catalogId: ids?.variantId ?? null,
      matchedTerm,
      basis: 'SOURCE_LITERAL' as const,
    })),
  };
  const target = association.eligibilityTerms;
  const unresolved: string[] = [];
  if (!target?.diseases.length || !candidates.diseases.length) {
    unresolved.push('disease');
  }
  if (!target?.genes.length || !candidates.genes.length) {
    unresolved.push('gene');
  }
  if (target?.variants.length && !candidates.variants.length) {
    unresolved.push('variant');
  }
  return {
    ...value,
    entityCandidates: candidates,
    proposedAssociationId: unresolved.length ? null : association.id,
    unresolved,
  };
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function splitSourcePassages(source: CandidateSourceInput) {
  const sourceText = source.fullText ?? source.abstract;
  const section = source.fullText ? 'Full text' : 'Abstract';
  const locatorScope = source.fullText ? 'full-text' : 'abstract';
  const sentences = sourceText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.map((text, sentenceIndex) => ({
    id: `passage-pubmed-${source.pmid}-${locatorScope}-${sentenceIndex + 1}`,
    text,
    textHash: hashArtifact(text),
    section,
    paragraphIndex: sentenceIndex,
    locator: { sentenceIndex },
    displayPolicy: 'LINK_ONLY' as const,
    modelUsePolicy: 'ALLOWED' as const,
    supportRole: 'PRIMARY' as const,
  }));
}

function supportingPassages(
  field: (typeof traceableClaimFields)[number],
  value: unknown,
  passages: ReturnType<typeof splitSourcePassages>
) {
  const valueText =
    typeof value === 'string' ? value : JSON.stringify(value ?? null);
  const normalizedValue = normalizeEvidenceText(valueText);
  const valueTokens = tokens(normalizedValue);
  const valueNumbers = normalizedValue.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  return passages
    .map((passage) => {
      const normalizedPassage = normalizeEvidenceText(passage.text);
      const passageTokens = new Set(tokens(normalizedPassage));
      const overlap = valueTokens.filter((token) => passageTokens.has(token));
      const exact =
        normalizedValue.length >= 4 &&
        normalizedPassage.includes(normalizedValue);
      const numeric =
        field === 'effectValue' &&
        valueNumbers.length > 0 &&
        valueNumbers.every((number) => normalizedPassage.includes(number));
      return {
        id: passage.id,
        supported:
          exact ||
          numeric ||
          (overlap.length >= 1 &&
            overlap.length / Math.max(1, valueTokens.length) >= 0.4),
      };
    })
    .filter((match) => match.supported)
    .map((match) => match.id);
}

function normalizeEvidenceText(value: string) {
  const numberWords: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    ten: '10',
  };
  return value
    .toLocaleLowerCase('en')
    .replace(/[a-z]+/g, (word) => numberWords[word] ?? word)
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

function tokens(value: string) {
  const stop = new Set(['a', 'an', 'and', 'the', 'was', 'were', 'with', 'of']);
  return value
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stop.has(token));
}

function proposeEvidenceLevel(
  output: z.infer<typeof evidenceExtractionOutputSchema>
) {
  const resistance = output.claims.some(
    (claim) => claim.claimType === 'RESISTANCE'
  );
  if (resistance) {
    return {
      proposedLevel: 'R2' as const,
      gradingRationale:
        'R2 proposed from a new resistance claim; final level requires human review.',
    };
  }
  const maturityOrder = [
    'MATURE_CLINICAL',
    'LIMITED_CLINICAL',
    'PRECLINICAL',
    'INSUFFICIENT',
  ] as const;
  const maturity = maturityOrder.find((value) =>
    output.claims.some((claim) => claim.evidenceMaturity === value)
  )!;
  const level = {
    MATURE_CLINICAL: '3A',
    LIMITED_CLINICAL: '3B',
    PRECLINICAL: '4',
    INSUFFICIENT: 'UNRATED',
  } as const;
  return {
    proposedLevel: level[maturity],
    gradingRationale: `${level[maturity]} proposed from the new document's ${maturity} evidence maturity; final level requires human review.`,
  };
}

function associationDirectionIssues(
  direction: AssociationReviewContext['direction'],
  output: z.infer<typeof evidenceExtractionOutputSchema>
) {
  if (!direction || direction === 'EXPLORATORY') return [];
  const requiredClaimType =
    direction === 'SENSITIVITY' ? 'EFFICACY' : 'RESISTANCE';
  if (output.claims.some((claim) => claim.claimType === requiredClaimType)) {
    return [];
  }
  return [
    {
      code: 'ASSOCIATION_DIRECTION_MISMATCH',
      severity: 'BLOCKING' as const,
      message: `The extracted claims do not confirm the ${direction.toLowerCase()} direction of the reviewed association.`,
    },
  ];
}
