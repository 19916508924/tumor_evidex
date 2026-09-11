import { describe, expect, it } from 'vitest';

import { normalizeEvidenceQuery } from '@/shared/services/evidence/normalize-query';

const standardInput = {
  disease: 'NSCLC',
  biomarkers: [
    {
      gene: 'EGFR',
      alterationType: 'SNV',
      hgvsp: 'p.L858R',
    },
  ],
  jurisdiction: 'US',
  locale: 'zh-CN',
};

describe('normalizeEvidenceQuery', () => {
  it.each([
    ['NSCLC', 'EGFR', 'SNV', 'p.L858R', 'EGFR|SNV|p.L858R'],
    ['NSCLC', 'EGFR', 'DEL', 'p.E746_A750del', 'EGFR|DEL|p.E746_A750del'],
    ['NSCLC', 'EGFR', 'SNV', 'p.T790M', 'EGFR|SNV|p.T790M'],
    ['NSCLC', 'KRAS', 'SNV', 'p.G12C', 'KRAS|SNV|p.G12C'],
    ['CRC', 'KRAS', 'SNV', 'p.G12C', 'KRAS|SNV|p.G12C'],
    ['CRC', 'KRAS', 'SNV', 'p.G12D', 'KRAS|SNV|p.G12D'],
  ] as const)(
    'accepts supported query %s + %s %s',
    (disease, gene, alterationType, hgvsp, canonicalVariantKey) => {
      expect(
        normalizeEvidenceQuery({
          ...standardInput,
          disease,
          biomarkers: [{ gene, alterationType, hgvsp }],
        })
      ).toEqual({
        status: 'VALID',
        value: {
          disease,
          gene,
          alterationType,
          hgvsp,
          canonicalVariantKey,
          jurisdiction: 'US',
          locale: 'zh-CN',
        },
      });
    }
  );

  it.each([
    ['nsclc', 'egfr', 'L858R'],
    ['NsClC', 'EgFr', 'p.l858r'],
    ['NSCLC', 'EGFR', 'P.L858R'],
  ])(
    'normalizes the allowed aliases deterministically',
    (disease, gene, hgvsp) => {
      expect(
        normalizeEvidenceQuery({
          ...standardInput,
          disease,
          biomarkers: [{ ...standardInput.biomarkers[0], gene, hgvsp }],
        })
      ).toMatchObject({
        status: 'VALID',
        value: {
          disease: 'NSCLC',
          gene: 'EGFR',
          hgvsp: 'p.L858R',
        },
      });
    }
  );

  it.each([
    ['colorectal cancer', 'kras', 'SNV', 'g12c', 'CRC', 'KRAS', 'p.G12C'],
    ['crc', 'KRAS', 'SNV', 'P.G12D', 'CRC', 'KRAS', 'p.G12D'],
    ['nsclc', 'egfr', 'DEL', 'exon19del', 'NSCLC', 'EGFR', 'p.E746_A750del'],
  ] as const)(
    'normalizes supported disease and variant aliases',
    (
      disease,
      gene,
      alterationType,
      hgvsp,
      expectedDisease,
      expectedGene,
      expectedHgvsp
    ) => {
      expect(
        normalizeEvidenceQuery({
          ...standardInput,
          disease,
          biomarkers: [{ gene, alterationType, hgvsp }],
        })
      ).toMatchObject({
        status: 'VALID',
        value: {
          disease: expectedDisease,
          gene: expectedGene,
          hgvsp: expectedHgvsp,
        },
      });
    }
  );

  it.each([
    [{ ...standardInput, disease: 'melanoma' }, 'disease'],
    [
      {
        ...standardInput,
        biomarkers: [{ ...standardInput.biomarkers[0], gene: 'BRAF' }],
      },
      'gene',
    ],
    [
      {
        ...standardInput,
        biomarkers: [{ ...standardInput.biomarkers[0], hgvsp: 'p.L861Q' }],
      },
      'hgvsp',
    ],
    [
      {
        ...standardInput,
        biomarkers: [{ gene: 'KRAS', alterationType: 'SNV', hgvsp: 'p.T790M' }],
      },
      'hgvsp',
    ],
    [{ ...standardInput, jurisdiction: 'CN' }, 'jurisdiction'],
    [{ ...standardInput, locale: 'en-US' }, 'locale'],
  ])(
    'classifies a valid but unsupported %s query as OUT_OF_SCOPE',
    (input, field) => {
      expect(normalizeEvidenceQuery(input)).toEqual({
        status: 'OUT_OF_SCOPE',
        field,
      });
    }
  );

  it.each([
    null,
    {},
    { ...standardInput, biomarkers: [] },
    {
      ...standardInput,
      biomarkers: [standardInput.biomarkers[0], standardInput.biomarkers[0]],
    },
    {
      ...standardInput,
      biomarkers: [{ ...standardInput.biomarkers[0], hgvsp: 'L858' }],
    },
    {
      ...standardInput,
      biomarkers: [
        { ...standardInput.biomarkers[0], alterationType: 'FUSION' },
      ],
    },
    { ...standardInput, notes: 'patient history' },
  ])('classifies malformed input as INVALID_INPUT', (input) => {
    expect(normalizeEvidenceQuery(input)).toMatchObject({
      status: 'INVALID_INPUT',
    });
  });
});
