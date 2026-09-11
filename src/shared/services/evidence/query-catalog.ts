export const evidenceQueryOptions = {
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
} as const;

export type SupportedDisease =
  (typeof evidenceQueryOptions.diseases)[number]['code'];
export type SupportedVariant = (typeof evidenceQueryOptions.variants)[number];
export type SupportedGene = SupportedVariant['gene'];
export type SupportedAlterationType = SupportedVariant['alterationType'];
export type SupportedHgvsp = SupportedVariant['hgvsp'];

export const diseaseAliases: Readonly<Record<string, SupportedDisease>> = {
  NSCLC: 'NSCLC',
  'NON-SMALL CELL LUNG CANCER': 'NSCLC',
  'NON-SMALL-CELL LUNG CANCER': 'NSCLC',
  CRC: 'CRC',
  'COLORECTAL CANCER': 'CRC',
  'COLORECTAL CARCINOMA': 'CRC',
};

export const variantAliases: Readonly<Record<string, SupportedHgvsp>> = {
  L858R: 'p.L858R',
  'P.L858R': 'p.L858R',
  T790M: 'p.T790M',
  'P.T790M': 'p.T790M',
  G12C: 'p.G12C',
  'P.G12C': 'p.G12C',
  G12D: 'p.G12D',
  'P.G12D': 'p.G12D',
  EXON19DEL: 'p.E746_A750del',
  'EXON 19 DEL': 'p.E746_A750del',
  E746_A750DEL: 'p.E746_A750del',
  'P.E746_A750DEL': 'p.E746_A750del',
};
