import { z } from 'zod';

import { executeSkill, type SkillExecutionTrace } from './skill-runtime';
import type {
  AssociationReviewContext,
  CandidateSourceInput,
} from './upstream-workflow';

const inputSchema = z.object({
  source: z.object({
    pmid: z.string().min(1),
    title: z.string().min(1),
    abstract: z.string().min(1),
  }),
  target: z.object({
    associationId: z.string().min(1),
    diseases: z.array(z.string()),
    genes: z.array(z.string()),
    variants: z.array(z.string()),
  }),
});

const outputSchema = z.object({
  decision: z.enum(['INCLUDE', 'EXCLUDE', 'NEEDS_HUMAN']),
  code: z.string().min(1),
  reason: z.string().min(1),
  ruleVersion: z.literal('eligibility-v2'),
  matchedTerms: z.object({
    diseases: z.array(z.string()),
    genes: z.array(z.string()),
    variants: z.array(z.string()),
  }),
});

export type EvidenceEligibilityDecision = z.infer<typeof outputSchema>;

export async function screenEvidenceEligibility(input: {
  source: CandidateSourceInput;
  association: AssociationReviewContext;
}): Promise<{
  decision: EvidenceEligibilityDecision;
  trace: SkillExecutionTrace<EvidenceEligibilityDecision>;
}> {
  const target = input.association.eligibilityTerms;
  const trace = await executeSkill<
    z.infer<typeof inputSchema>,
    EvidenceEligibilityDecision
  >({
    definition: {
      skillId: 'screen_evidence_eligibility',
      name: 'Screen evidence eligibility',
      version: '2.0.0',
      kind: 'DETERMINISTIC',
      description:
        'Require source-grounded disease, gene, and exact variant mentions for variant-scoped targets before model extraction.',
      inputSchema,
      outputSchema,
      allowedTools: [],
      sideEffect: 'STAGING_WRITE',
      timeoutMs: 5_000,
      maxAttempts: 1,
      riskLevel: 'HIGH',
      evaluationSuiteId: null,
      status: 'ACTIVE',
      execute: async (value) => decide(value.source, value.target),
    },
    agent: {
      agentId: 'eligibility-agent',
      version: '2.0.0',
      allowedSkillVersions: ['screen_evidence_eligibility@2.0.0'],
    },
    value: {
      source: input.source,
      target: {
        associationId: input.association.id,
        diseases: target?.diseases ?? [],
        genes: target?.genes ?? [],
        variants: target?.variants ?? [],
      },
    },
  });
  return { decision: trace.output, trace };
}

function decide(
  source: { title: string; abstract: string },
  target: {
    diseases: string[];
    genes: string[];
    variants: string[];
  }
): EvidenceEligibilityDecision {
  if (!target.diseases.length || !target.genes.length) {
    return {
      decision: 'NEEDS_HUMAN',
      code: 'ELIGIBILITY_CONTEXT_INCOMPLETE',
      reason: 'The reviewed association lacks disease or gene screening terms.',
      ruleVersion: 'eligibility-v2',
      matchedTerms: { diseases: [], genes: [], variants: [] },
    };
  }
  const text = normalize(`${source.title} ${source.abstract}`);
  const matchedTerms = {
    diseases: matches(text, target.diseases),
    genes: matches(text, target.genes),
    variants: matches(text, target.variants),
  };
  if (!matchedTerms.diseases.length || !matchedTerms.genes.length) {
    return {
      decision: 'EXCLUDE',
      code: 'TARGET_ENTITIES_NOT_FOUND',
      reason:
        'The source does not mention both the configured disease and gene target.',
      ruleVersion: 'eligibility-v2',
      matchedTerms,
    };
  }
  if (target.variants.length > 0 && matchedTerms.variants.length === 0) {
    return {
      decision: 'NEEDS_HUMAN',
      code: 'TARGET_VARIANT_NOT_FOUND',
      reason:
        'The source mentions the configured disease and gene but not the exact reviewed variant target.',
      ruleVersion: 'eligibility-v2',
      matchedTerms,
    };
  }
  return {
    decision: 'INCLUDE',
    code:
      target.variants.length > 0
        ? 'EXACT_VARIANT_TARGET_FOUND'
        : 'GENE_LEVEL_TARGET_FOUND',
    reason:
      target.variants.length > 0
        ? 'The source mentions the configured disease, gene, and exact variant target.'
        : 'The source mentions the configured disease and gene-level target.',
    ruleVersion: 'eligibility-v2',
    matchedTerms,
  };
}

function matches(text: string, terms: string[]) {
  return terms.filter((term) => {
    const normalized = normalize(term);
    return normalized.length > 1 && text.includes(normalized);
  });
}

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}
