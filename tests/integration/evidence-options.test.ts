import { GET } from '@/app/api/v1/evidence-options/route';
import { describe, expect, it } from 'vitest';

describe('GET /api/v1/evidence-options', () => {
  it('publishes the selectable V0.2 disease and variant catalog', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: {
        diseases: [
          {
            code: 'NSCLC',
            labelZh: '非小细胞肺癌',
            labelEn: 'Non-small cell lung cancer',
          },
          {
            code: 'CRC',
            labelZh: '结直肠癌',
            labelEn: 'Colorectal cancer',
          },
        ],
        variants: [
          {
            gene: 'EGFR',
            alterationType: 'SNV',
            hgvsp: 'p.L858R',
            canonicalVariantKey: 'EGFR|SNV|p.L858R',
          },
          {
            gene: 'EGFR',
            alterationType: 'DEL',
            hgvsp: 'p.E746_A750del',
            canonicalVariantKey: 'EGFR|DEL|p.E746_A750del',
          },
          {
            gene: 'EGFR',
            alterationType: 'SNV',
            hgvsp: 'p.T790M',
            canonicalVariantKey: 'EGFR|SNV|p.T790M',
          },
          {
            gene: 'KRAS',
            alterationType: 'SNV',
            hgvsp: 'p.G12C',
            canonicalVariantKey: 'KRAS|SNV|p.G12C',
          },
          {
            gene: 'KRAS',
            alterationType: 'SNV',
            hgvsp: 'p.G12D',
            canonicalVariantKey: 'KRAS|SNV|p.G12D',
          },
        ],
        queries: [
          ['NSCLC', 'EGFR|SNV|p.L858R'],
          ['NSCLC', 'EGFR|DEL|p.E746_A750del'],
          ['NSCLC', 'EGFR|SNV|p.T790M'],
          ['NSCLC', 'KRAS|SNV|p.G12C'],
          ['CRC', 'KRAS|SNV|p.G12C'],
          ['CRC', 'KRAS|SNV|p.G12D'],
        ],
      },
    });
  });
});
