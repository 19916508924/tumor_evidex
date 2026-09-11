import { z } from 'zod';

import type {
  EvidenceQueryNormalizationResult,
  NormalizedEvidenceQuery,
} from '@/shared/types/evidence';

import {
  diseaseAliases,
  evidenceQueryOptions,
  variantAliases,
  type SupportedAlterationType,
  type SupportedDisease,
  type SupportedGene,
} from './query-catalog';

const proteinVariantPattern =
  /^(?:(?:p\.)?[A-Za-z*][1-9][0-9]*[A-Za-z*=]|(?:p\.)?[A-Za-z][1-9][0-9]*_[A-Za-z][1-9][0-9]*del|exon\s?19del)$/i;

const evidenceQuerySchema = z
  .object({
    disease: z.string().trim().min(1).max(100),
    biomarkers: z
      .array(
        z
          .object({
            gene: z
              .string()
              .trim()
              .min(1)
              .max(30)
              .regex(/^[A-Za-z0-9-]+$/),
            alterationType: z.enum(['SNV', 'DEL']),
            hgvsp: z
              .string()
              .trim()
              .min(1)
              .max(50)
              .regex(proteinVariantPattern),
          })
          .strict()
      )
      .length(1),
    jurisdiction: z.string().trim().min(1).max(10),
    locale: z.string().trim().min(1).max(20),
  })
  .strict();

export function normalizeEvidenceQuery(
  input: unknown
): EvidenceQueryNormalizationResult {
  const parsed = evidenceQuerySchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: 'INVALID_INPUT',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const biomarker = parsed.data.biomarkers[0];
  const disease =
    diseaseAliases[parsed.data.disease.trim().toUpperCase()] ?? null;
  const gene = biomarker.gene.toUpperCase();
  const hgvsp = variantAliases[biomarker.hgvsp.trim().toUpperCase()] ?? null;

  if (!disease) {
    return { status: 'OUT_OF_SCOPE', field: 'disease' };
  }
  if (!evidenceQueryOptions.variants.some((variant) => variant.gene === gene)) {
    return { status: 'OUT_OF_SCOPE', field: 'gene' };
  }
  const variant = evidenceQueryOptions.variants.find(
    (candidate) =>
      candidate.gene === gene &&
      candidate.alterationType === biomarker.alterationType &&
      candidate.hgvsp === hgvsp
  );
  if (!variant) {
    return { status: 'OUT_OF_SCOPE', field: 'hgvsp' };
  }
  if (parsed.data.jurisdiction.toUpperCase() !== 'US') {
    return { status: 'OUT_OF_SCOPE', field: 'jurisdiction' };
  }
  if (parsed.data.locale.toLowerCase() !== 'zh-cn') {
    return { status: 'OUT_OF_SCOPE', field: 'locale' };
  }

  return {
    status: 'VALID',
    value: {
      disease: disease as SupportedDisease,
      gene: gene as SupportedGene,
      alterationType: biomarker.alterationType as SupportedAlterationType,
      hgvsp: variant.hgvsp,
      canonicalVariantKey: variant.canonicalVariantKey,
      jurisdiction: 'US',
      locale: 'zh-CN',
    },
  };
}
