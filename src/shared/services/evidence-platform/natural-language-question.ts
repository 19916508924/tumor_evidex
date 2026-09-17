import type {
  EvidenceQueryInput,
  NormalizedEvidenceQuery,
} from '@/shared/types/evidence';

export interface NaturalLanguageQuestionInput {
  question: string;
  locale: 'zh-CN';
  context?: {
    disease?: string;
    gene?: string;
    variant?: string;
    drug?: string;
  };
}

export interface QuestionEntityCatalog {
  diseases: Array<{
    canonicalName: string;
    displayNameZh: string;
    displayNameEn: string;
    aliases: string[];
  }>;
  genes: Array<{
    id: string;
    symbol: string;
    name: string;
    aliases: string[];
  }>;
  variants: Array<{
    geneId: string;
    alterationType: string;
    hgvsp: string | null;
    canonicalKey: string;
    aliases: string[];
  }>;
  drugs: Array<{
    genericName: string;
    displayNameZh: string;
    displayNameEn: string;
    brandNames: string[];
    aliases: string[];
  }>;
}

export type InterpretedEvidenceQuestion =
  | {
      status: 'RESOLVED';
      intent: 'EVIDENCE_QA' | 'THERAPY_COMPARISON' | 'REGULATORY_STATUS';
      redactedQuestion: string;
      query: EvidenceQueryInput;
      normalizedQuery: NormalizedEvidenceQuery;
      drugs: string[];
    }
  | {
      status: 'NEEDS_CLARIFICATION';
      redactedQuestion: string;
      missingFields: Array<'disease' | 'gene' | 'variant'>;
      question: string;
    }
  | {
      status: 'OUT_OF_SCOPE';
      redactedQuestion: string;
      reason: 'DOSAGE_OR_REGIMEN' | 'PERSONAL_TREATMENT_RECOMMENDATION';
    };

export function interpretEvidenceQuestion(
  input: NaturalLanguageQuestionInput,
  catalog: QuestionEntityCatalog
): InterpretedEvidenceQuestion {
  const redactedQuestion = redactIdentifiers(input.question.trim());
  if (
    /(剂量|用量|多少\s*(?:mg|毫克)|疗程|给药|dose|dosage|regimen)/i.test(
      input.question
    )
  ) {
    return {
      status: 'OUT_OF_SCOPE',
      redactedQuestion,
      reason: 'DOSAGE_OR_REGIMEN',
    };
  }
  if (
    /(最好|最佳|最适合|应该选|推荐.*(?:治疗|药)|best treatment|recommend.*treatment)/i.test(
      input.question
    )
  ) {
    return {
      status: 'OUT_OF_SCOPE',
      redactedQuestion,
      reason: 'PERSONAL_TREATMENT_RECOMMENDATION',
    };
  }

  const searchable = `${input.question} ${Object.values(input.context ?? {}).join(' ')}`;
  const disease = resolveDisease(
    input.context?.disease ?? input.question,
    catalog
  );
  const gene = resolveGene(input.context?.gene ?? searchable, catalog);
  const variant = resolveVariant(
    input.context?.variant ?? searchable,
    gene?.id ?? null,
    catalog
  );
  const missingFields: Array<'disease' | 'gene' | 'variant'> = [];
  if (!disease) missingFields.push('disease');
  if (!gene) missingFields.push('gene');
  if (!variant) missingFields.push('variant');
  if (missingFields.length > 0) {
    return {
      status: 'NEEDS_CLARIFICATION',
      redactedQuestion,
      missingFields,
      question: clarificationQuestion(missingFields),
    };
  }
  if (!disease || !gene || !variant) {
    throw new Error('Question entity resolution invariant failed');
  }

  const intent = /(比较|对比|区别|差异|compare|versus|\bvs\.?\b)/i.test(
    input.question
  )
    ? 'THERAPY_COMPARISON'
    : /(FDA|获批|批准|监管|regulatory|approved)/i.test(input.question)
      ? 'REGULATORY_STATUS'
      : 'EVIDENCE_QA';

  return {
    status: 'RESOLVED',
    intent,
    redactedQuestion,
    query: {
      disease: disease.canonicalName,
      biomarkers: [
        {
          gene: gene.symbol,
          alterationType: variant.alterationType,
          hgvsp: variant.hgvsp ?? variant.canonicalKey,
        },
      ],
      jurisdiction: 'US',
      locale: 'zh-CN',
    },
    normalizedQuery: {
      disease: disease.canonicalName,
      gene: gene.symbol,
      alterationType: variant.alterationType,
      hgvsp: variant.hgvsp ?? variant.canonicalKey,
      canonicalVariantKey: variant.canonicalKey,
      jurisdiction: 'US',
      locale: 'zh-CN',
    },
    drugs: resolveDrugs(
      `${input.question} ${input.context?.drug ?? ''}`.trim(),
      catalog
    ),
  };
}

function redactIdentifiers(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[已脱敏邮箱]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[已脱敏手机号]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[已脱敏证件号]');
}

function resolveDisease(value: string, catalog: QuestionEntityCatalog) {
  return uniqueMatch(catalog.diseases, (candidate) =>
    matchesAny(value, [
      candidate.canonicalName,
      candidate.displayNameZh,
      candidate.displayNameEn,
      ...candidate.aliases,
    ])
  );
}

function resolveGene(value: string, catalog: QuestionEntityCatalog) {
  return uniqueMatch(catalog.genes, (candidate) =>
    matchesAny(value, [candidate.symbol, candidate.name, ...candidate.aliases])
  );
}

function resolveVariant(
  value: string,
  geneId: string | null,
  catalog: QuestionEntityCatalog
) {
  return uniqueMatch(
    catalog.variants,
    (candidate) =>
      (!geneId || candidate.geneId === geneId) &&
      matchesAny(value, [
        candidate.hgvsp ?? '',
        proteinShorthand(candidate.hgvsp),
        candidate.canonicalKey,
        ...candidate.aliases,
      ])
  );
}

function proteinShorthand(hgvsp: string | null) {
  return hgvsp?.replace(/^p\./i, '') ?? '';
}

function resolveDrugs(value: string, catalog: QuestionEntityCatalog) {
  return catalog.drugs
    .filter((candidate) =>
      matchesAny(value, [
        candidate.genericName,
        candidate.displayNameZh,
        candidate.displayNameEn,
        ...candidate.brandNames,
        ...candidate.aliases,
      ])
    )
    .map((candidate) => candidate.genericName.toLowerCase());
}

function uniqueMatch<T>(items: T[], matches: (item: T) => boolean) {
  const candidates = items.filter(matches);
  return candidates.length === 1 ? candidates[0] : null;
}

function matchesAny(value: string, aliases: string[]) {
  const normalized = value.normalize('NFKC').toUpperCase().replace(/\s+/g, ' ');
  return aliases.some((alias) => {
    const normalizedAlias = alias
      .normalize('NFKC')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');
    if (!normalizedAlias) return false;
    if (/^[\p{Script=Han}]+$/u.test(normalizedAlias)) {
      return normalized.includes(normalizedAlias);
    }
    return new RegExp(
      `(?:^|[^A-Z0-9])${escapeRegExp(normalizedAlias)}(?:$|[^A-Z0-9])`
    ).test(normalized);
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clarificationQuestion(
  missingFields: Array<'disease' | 'gene' | 'variant'>
) {
  const labels = { disease: '疾病', gene: '基因', variant: '变异' };
  return `请补充${missingFields.map((field) => labels[field]).join('、')}。`;
}
