'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenText,
  Check,
  CircleAlert,
  Clock3,
  Database,
  Dna,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  evidenceQueryOptions,
  type SupportedDisease,
} from '@/shared/services/evidence/query-catalog';
import type {
  EvidenceAnswerDraft,
  NormalizedEvidenceQuery,
  PublicEvidenceResultGroup,
  PublicEvidenceTherapy,
} from '@/shared/types/evidence';

type EvidencePageStatus =
  | 'ANSWERED'
  | 'SUMMARY_UNAVAILABLE'
  | 'NO_CURATED_EVIDENCE';

interface EvidencePageData {
  status: EvidencePageStatus;
  normalizedInput: NormalizedEvidenceQuery;
  knowledge: {
    release: string;
    literatureCutoffAt: string;
    regulatoryCutoffAt: string;
    gradingRuleVersion: string;
    promptVersion: string;
  };
  resultGroups: PublicEvidenceResultGroup[];
  answer: EvidenceAnswerDraft | null;
  generatedAt: string;
  cached: boolean;
  disclaimer: string;
  disclaimerEn: string;
}

type OutOfScopeData = {
  status: 'OUT_OF_SCOPE';
  field: 'disease' | 'gene' | 'hgvsp' | 'jurisdiction' | 'locale';
};

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: EvidencePageData }
  | { status: 'out-of-scope'; field: OutOfScopeData['field'] }
  | { status: 'error'; message: string };

const workflowSteps = [
  {
    icon: FileCheck2,
    title: '规范化输入',
    description: '严格校验癌种与变异',
  },
  {
    icon: Database,
    title: '检索知识版本',
    description: '只读取已审核、已发布证据',
  },
  {
    icon: Sparkles,
    title: '受约束归纳',
    description: '模型只使用证据包',
  },
  {
    icon: ShieldCheck,
    title: '校验引用',
    description: '拒绝越界证据 ID',
  },
];

const scopeLabels = {
  SAME_DISEASE: '同疾病证据',
  CROSS_INDICATION_EXACT_VARIANT: '跨适应证 · 精确变异',
} as const;

const directionLabels = {
  SENSITIVITY: '敏感性证据',
  RESISTANCE: '耐药证据',
  EXPLORATORY: '探索性证据',
} as const;

const regulatoryLabels = {
  MATCHED_INDICATION: '美国药监局适应证匹配',
  OTHER_INDICATION: '美国药监局其他适应证获批',
} as const;

const evidenceMaturityLabels = {
  REGULATORY: '监管证据',
  GUIDELINE: '指南证据',
  MATURE_CLINICAL: '成熟临床证据',
  LIMITED_CLINICAL: '有限临床证据',
  PRECLINICAL: '临床前证据',
  INSUFFICIENT: '证据不足',
} as const;

const approvalStatusLabels = {
  APPROVED: '有效批准',
  WITHDRAWN: '已撤回',
  INACTIVE: '已失效',
  NOT_APPROVED: '未批准',
  UNKNOWN: '状态未知',
} as const;

type ClaimTranslation = Pick<
  PublicEvidenceTherapy['evidenceClaims'][number],
  | 'studyType'
  | 'studyName'
  | 'populationSummary'
  | 'diseaseStage'
  | 'treatmentLine'
  | 'priorTherapy'
  | 'intervention'
  | 'comparator'
  | 'endpoint'
  | 'conclusion'
  | 'limitations'
>;

const claimTranslations: Record<string, ClaimTranslation> = {
  claim_flaura_29151359_pfs: {
    studyType: '随机、双盲、Ⅲ期临床试验',
    studyName: 'FLAURA',
    populationSummary:
      '556 名既往未接受治疗、携带 EGFR 外显子 19 缺失或 L858R 变异的晚期非小细胞肺癌患者。',
    diseaseStage: '局部晚期或转移性',
    treatmentLine: '一线',
    priorTherapy: '既往未接受晚期疾病的系统治疗',
    intervention: '奥希替尼 80 毫克，每日一次',
    comparator:
      '吉非替尼 250 毫克，每日一次；或厄洛替尼 150 毫克，每日一次',
    endpoint: '研究者评估的无进展生存期',
    conclusion:
      '在合并分析的外显子 19 缺失/L858R 人群中，奥希替尼较第一代 EGFR 酪氨酸激酶抑制剂延长了无进展生存期。',
    limitations:
      '摘要报告的主要结果来自外显子 19 缺失/L858R 合并人群，并非 L858R 独立效应估计。',
  },
  claim_luxlung3_23816960_pfs: {
    studyType: '开放标签、随机、Ⅲ期临床试验',
    studyName: 'LUX-Lung 3',
    populationSummary:
      '345 名既往未接受治疗的 IIIB/IV 期 EGFR 变异肺腺癌患者；常见变异无进展生存期分析纳入其中 308 名外显子 19 缺失或 L858R 患者。',
    diseaseStage: 'IIIB 期或 IV 期',
    treatmentLine: '一线',
    priorTherapy: '既往未接受晚期疾病的系统治疗',
    intervention: '阿法替尼 40 毫克，每日一次',
    comparator: '顺铂联合培美曲塞，最多 6 个周期',
    endpoint: '独立评审的无进展生存期',
    conclusion:
      '在合并分析的外显子 19 缺失/L858R 人群中，阿法替尼较顺铂-培美曲塞延长了无进展生存期。',
    limitations:
      '所引无进展生存期估计合并了外显子 19 缺失与 L858R，不能解读为 L858R 单独获益。',
  },
  claim_luxlung3_6_25589191_l858r_os: {
    studyType: '两项随机Ⅲ期试验的预设总生存期分析',
    studyName: 'LUX-Lung 3 / LUX-Lung 6 总生存期分析',
    populationSummary:
      '既往未接受治疗的 IIIB/IV 期 EGFR 变异肺腺癌患者；本证据针对两项试验中预先设定的 L858R 亚组。',
    diseaseStage: 'IIIB 期或 IV 期',
    treatmentLine: '一线',
    priorTherapy: '既往未接受晚期疾病的系统治疗',
    intervention: '阿法替尼',
    comparator: '含顺铂化疗',
    endpoint: 'L858R 亚组的总生存期',
    conclusion:
      '两项试验均未显示阿法替尼较化疗在 L858R 亚组中具有统计学显著的总生存期优势。',
    limitations:
      '亚组分析并非主要终点；该中性总生存期结果不否定其美国药监局适应证或合并人群的无进展生存期证据。',
  },
  claim_ifum_24263064_response_pfs: {
    studyType: '前瞻性、多中心、开放标签、单臂Ⅳ期研究',
    studyName: 'IFUM',
    populationSummary:
      '106 名已接受治疗的白种 IIIB/IV 期非小细胞肺癌患者，均携带 EGFR 敏感变异；变异阳性肿瘤中 31.1% 为 L858R。',
    diseaseStage: '不适合根治性治疗的 IIIA/B 期或 IV 期',
    treatmentLine: '一线',
    priorTherapy: '既往未接受晚期疾病的系统治疗',
    intervention: '吉非替尼 250 毫克，每日一次',
    comparator: null,
    endpoint: '客观缓解率；次要终点为无进展生存期',
    conclusion:
      '一线吉非替尼在明确包含 L858R 的 EGFR 敏感变异非小细胞肺癌队列中显示抗肿瘤活性。',
    limitations:
      '单臂研究；疗效终点针对合并的 EGFR 敏感变异队列报告，未单独报告 L858R 结果。',
  },
  claim_mariposa_38924756_pfs: {
    studyType: '国际多中心、随机、Ⅲ期临床试验',
    studyName: 'MARIPOSA',
    populationSummary:
      '1074 名既往未接受治疗、携带 EGFR 外显子 19 缺失或 L858R 变异的局部晚期或转移性非小细胞肺癌患者。',
    diseaseStage: '局部晚期或转移性',
    treatmentLine: '一线',
    priorTherapy: '既往未接受晚期疾病的系统治疗',
    intervention: '埃万妥单抗联合拉泽替尼',
    comparator: '奥希替尼',
    endpoint: '无进展生存期',
    conclusion:
      '在合并分析的外显子 19 缺失/L858R 人群中，埃万妥单抗-拉泽替尼较奥希替尼延长了无进展生存期。',
    limitations:
      '主要结果合并了外显子 19 缺失与 L858R。联合治疗的治疗相关停药更常见。',
  },
  claim_mariposa_40923797_os_safety: {
    studyType: '随机Ⅲ期试验按方案规定的最终总生存期分析',
    studyName: 'MARIPOSA 最终总生存期分析',
    populationSummary:
      'MARIPOSA 中埃万妥单抗-拉泽替尼组和奥希替尼组的 858 名参与者；肿瘤携带 EGFR 外显子 19 缺失或 L858R 变异。',
    diseaseStage: '局部晚期或转移性',
    treatmentLine: '一线',
    priorTherapy: '既往未接受晚期疾病的系统治疗',
    intervention: '埃万妥单抗联合拉泽替尼',
    comparator: '奥希替尼',
    endpoint: '总生存期；3 级或以上不良事件',
    conclusion:
      'MARIPOSA 最终分析显示，在合并分析的外显子 19 缺失/L858R 人群中，埃万妥单抗-拉泽替尼较奥希替尼延长了总生存期。',
    limitations:
      '该结果并非 L858R 特异性结果，且联合治疗的 3 级或以上不良事件明显更常见。',
  },
};

const associationRationaleTranslations: Record<string, string> = {
  assoc_nsclc_egfr_l858r_osimertinib:
    '美国药监局适应证明确覆盖携带外显子 21 L858R 变异的转移性非小细胞肺癌；FLAURA 为外显子 19 缺失/L858R 合并人群提供了成熟的一线随机证据。',
  assoc_nsclc_egfr_l858r_afatinib:
    '当前有效的美国药监局适应证覆盖包含 L858R 在内的非耐药性 EGFR 变异转移性非小细胞肺癌，LUX-Lung 3 提供了成熟的随机证据。另一条已审核证据保留了 L858R 亚组较化疗未显示总生存期获益的结果。',
  assoc_nsclc_egfr_l858r_gefitinib:
    '美国药监局标签明确覆盖携带外显子 21 L858R 变异的转移性非小细胞肺癌一线治疗；IFUM 在包含 L858R 的 EGFR 敏感变异人群中提供了前瞻性Ⅳ期证据，但未报告 L858R 独立疗效估计。',
  assoc_nsclc_egfr_l858r_amivantamab_lazertinib:
    '两个有效的美国药监局申请均覆盖埃万妥单抗-拉泽替尼用于携带外显子 21 L858R 变异的局部晚期或转移性非小细胞肺癌一线治疗；MARIPOSA 为外显子 19 缺失/L858R 合并人群提供了成熟的随机无进展生存期和最终总生存期证据。',
};

type ApprovalTranslation = Pick<
  PublicEvidenceTherapy['regulatoryApprovals'][number],
  'indicationText' | 'biomarkerText'
>;

const approvalTranslations: Record<string, ApprovalTranslation> = {
  approval_fda_nda208065_orig1_osimertinib: {
    indicationText:
      '用于一线治疗经美国药监局批准检测确认为 EGFR 外显子 19 缺失或外显子 21 L858R 变异的成人转移性非小细胞肺癌患者。',
    biomarkerText: 'EGFR 外显子 19 缺失或外显子 21 L858R 变异',
  },
  approval_fda_nda201292_orig1_afatinib: {
    indicationText:
      '用于一线治疗经美国药监局批准检测确认为非耐药性 EGFR 变异的转移性非小细胞肺癌患者。',
    biomarkerText:
      '非耐药性 EGFR 变异；标签临床与诊断范围包含 L858R。',
  },
  approval_fda_nda206995_orig1_gefitinib: {
    indicationText:
      '用于一线治疗经美国药监局批准检测确认为 EGFR 外显子 19 缺失或外显子 21 L858R 替代变异的转移性非小细胞肺癌患者。',
    biomarkerText:
      'EGFR 外显子 19 缺失或外显子 21 L858R 替代变异',
  },
  approval_fda_bla761210_s005_amivantamab_lazertinib: {
    indicationText:
      '埃万妥单抗联合拉泽替尼，用于一线治疗携带 EGFR 外显子 19 缺失或外显子 21 L858R 替代变异的成人局部晚期或转移性非小细胞肺癌患者。',
    biomarkerText:
      'EGFR 外显子 19 缺失或外显子 21 L858R 替代变异',
  },
  approval_fda_nda219008_orig1_lazertinib_amivantamab: {
    indicationText:
      '拉泽替尼联合埃万妥单抗，用于一线治疗携带 EGFR 外显子 19 缺失或外显子 21 L858R 替代变异的成人局部晚期或转移性非小细胞肺癌患者。',
    biomarkerText:
      'EGFR 外显子 19 缺失或外显子 21 L858R 替代变异',
  },
};

const effectLabels: Record<string, string> = {
  medianMonths: '中位数（月）',
  medianMonthsIntervention: '干预组中位数（月）',
  medianMonthsComparator: '对照组中位数（月）',
  commonMutationSampleSize: '常见变异分析样本数',
  hazardRatio: '风险比',
  hazardRatioForDeath: '死亡风险比',
  confidenceInterval95: '95% 置信区间',
  pValue: 'P 值',
  luxLung3: 'LUX-Lung 3',
  luxLung6: 'LUX-Lung 6',
  objectiveResponseRatePercent: '客观缓解率（%）',
  objectiveResponseRateConfidenceInterval95: '客观缓解率 95% 置信区间',
  diseaseControlRatePercent: '疾病控制率（%）',
  medianProgressionFreeSurvivalMonths: '中位无进展生存期（月）',
  l858rPopulationPercent: 'L858R 人群占比（%）',
  primaryComparisonSampleSizePerArm: '主要对比每组样本数',
  treatmentRelatedDiscontinuationPercent: '治疗相关停药率（%）',
  threeYearOverallSurvivalPercent: '3 年总生存率（%）',
  grade3OrHigherAdverseEventPercent: '3 级或以上不良事件率（%）',
  intervention: '干预组',
  comparator: '对照组',
};

const passageSectionLabels: Record<string, string> = {
  Abstract: '摘要',
  'Abstract - Results': '摘要 · 结果',
  'Abstract - Findings': '摘要 · 研究发现',
};

const fieldLabels = {
  disease: '当前 V0.2 支持非小细胞肺癌（NSCLC）和结直肠癌（CRC）。',
  gene: '当前 V0.2 支持 EGFR 和 KRAS 基因。',
  hgvsp: '当前 V0.2 尚未收录这个基因与变异类型组合。',
  jurisdiction: '当前 V0.2 仅支持美国药品监督管理局监管范围。',
  locale: '当前 V0.2 仅支持中文结果。',
};

function containsChinese(value: string | null | undefined) {
  return Boolean(value && /[\u3400-\u9fff]/u.test(value));
}

function keepChineseOrFallback(
  value: string | null | undefined,
  fallback: string
) {
  return containsChinese(value) ? value! : fallback;
}

function getClaimTranslation(
  claim: PublicEvidenceTherapy['evidenceClaims'][number]
): ClaimTranslation {
  const translation = claimTranslations[claim.id];

  if (translation) return translation;

  return {
    studyType: keepChineseOrFallback(claim.studyType, '研究类型暂缺中文释义'),
    studyName: claim.studyName,
    populationSummary: keepChineseOrFallback(
      claim.populationSummary,
      '研究人群暂缺中文释义。'
    ),
    diseaseStage: claim.diseaseStage
      ? keepChineseOrFallback(claim.diseaseStage, '暂缺中文释义')
      : null,
    treatmentLine: claim.treatmentLine
      ? keepChineseOrFallback(claim.treatmentLine, '暂缺中文释义')
      : null,
    priorTherapy: claim.priorTherapy
      ? keepChineseOrFallback(claim.priorTherapy, '暂缺中文释义')
      : null,
    intervention: keepChineseOrFallback(claim.intervention, '干预方案暂缺中文释义'),
    comparator: claim.comparator
      ? keepChineseOrFallback(claim.comparator, '对照方案暂缺中文释义')
      : null,
    endpoint: keepChineseOrFallback(claim.endpoint, '临床终点暂缺中文释义'),
    conclusion: keepChineseOrFallback(claim.conclusion, '研究结论暂缺中文释义。'),
    limitations: keepChineseOrFallback(
      claim.limitations,
      '研究局限暂缺中文释义。'
    ),
  };
}

function formatEffectValue(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, item]) => {
      const label = effectLabels[key] ?? '结果指标';
      if (Array.isArray(item)) {
        return `${label}：${item.join('–')}`;
      }
      if (item && typeof item === 'object') {
        return `${label}（${formatEffectValue(item as Record<string, unknown>)}）`;
      }
      return `${label}：${String(item)}`;
    })
    .join('；');
}

function getApprovalTranslation(
  approval: PublicEvidenceTherapy['regulatoryApprovals'][number]
) {
  const translation = approvalTranslations[approval.id];
  return {
    indicationText:
      translation?.indicationText ??
      keepChineseOrFallback(
        approval.indicationText,
        '该监管适应证暂缺中文释义。'
      ),
    biomarkerText: approval.biomarkerText
      ? (translation?.biomarkerText ??
        keepChineseOrFallback(
          approval.biomarkerText,
          '该生物标志物范围暂缺中文释义。'
        ))
      : null,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function countEvidence(groups: PublicEvidenceResultGroup[]) {
  return groups.reduce(
    (totals, group) => {
      totals.therapies += group.therapies.length;
      for (const therapy of group.therapies) {
        totals.claims += therapy.evidenceClaims.length;
        totals.approvals += therapy.regulatoryApprovals.length;
      }
      return totals;
    },
    { therapies: 0, claims: 0, approvals: 0 }
  );
}

function getRequestError(message: string) {
  if (message === 'INVALID_INPUT') {
    return '输入格式未通过校验，请检查后重试。';
  }
  if (message === 'PAYLOAD_TOO_LARGE') {
    return '请求内容超过接口限制，请缩减后重试。';
  }
  return '知识服务暂时不可用，请稍后重试。';
}

function getAnswerTherapy(
  answer: EvidenceAnswerDraft | null,
  associationId: string
) {
  return answer?.groups
    .flatMap((group) => group.therapies)
    .find((therapy) => therapy.associationId === associationId);
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.75rem] font-medium tracking-[0.08em] text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function SourceLink({
  url,
  sourceType,
  externalId,
}: {
  url: string;
  sourceType: 'PUBMED' | 'FDA';
  externalId: string;
}) {
  const label =
    sourceType === 'PUBMED' ? '查看文献原文' : '查看美国药监局记录';
  const identifier = sourceType === 'PUBMED' ? `PMID ${externalId}` : externalId;

  return (
    <a
      aria-label={label}
      className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[#087f8c] underline-offset-4 hover:underline"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      <span>{identifier}</span>
      <ExternalLink className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  );
}

function EvidenceClaim({
  claim,
}: {
  claim: PublicEvidenceTherapy['evidenceClaims'][number];
}) {
  const localizedClaim = getClaimTranslation(claim);
  const studyFacts = [
    localizedClaim.studyType,
    localizedClaim.studyName,
    claim.sampleSize ? `n=${claim.sampleSize}` : null,
  ].filter(Boolean);
  const clinicalContext = [
    localizedClaim.diseaseStage && `分期：${localizedClaim.diseaseStage}`,
    localizedClaim.treatmentLine && `线次：${localizedClaim.treatmentLine}`,
    localizedClaim.priorTherapy &&
      `既往治疗：${localizedClaim.priorTherapy}`,
  ].filter(Boolean);

  return (
    <article className="border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-[#9ecfd1] bg-[#edfafa] text-[#086b75]"
        >
          {evidenceMaturityLabels[claim.evidenceMaturity]}
        </Badge>
        <span className="font-mono text-xs text-slate-500">{claim.id}</span>
      </div>

      <h4 className="mt-3 text-base font-semibold text-slate-950">
        {studyFacts.join(' · ')}
      </h4>
      <p className="mt-2 text-[0.9375rem] leading-7 text-slate-600">
        {localizedClaim.populationSummary}
      </p>

      <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">干预与对照</dt>
          <dd className="mt-1 font-medium text-slate-900">
            {localizedClaim.intervention}
            {localizedClaim.comparator
              ? ` 对比 ${localizedClaim.comparator}`
              : '（单臂）'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">主要终点</dt>
          <dd className="mt-1 font-medium text-slate-900">
            {localizedClaim.endpoint}
            {claim.effectValue
              ? ` · ${formatEffectValue(claim.effectValue)}`
              : ''}
          </dd>
        </div>
      </dl>

      {clinicalContext.length > 0 && (
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {clinicalContext.join(' · ')}
        </p>
      )}

      <p className="mt-4 text-[0.9375rem] leading-7 text-slate-800">
        {localizedClaim.conclusion}
      </p>
      <div className="mt-3 rounded-lg border-l-2 border-amber-400 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-950">
        <span className="font-semibold">局限：</span>
        {localizedClaim.limitations}
      </div>

      <div className="mt-4 space-y-3">
        {claim.passages.map((passage) => (
          <div
            key={passage.id}
            className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-start"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                {passage.source.title}
              </p>
              {passage.text && (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  “{passage.text}”
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                {passage.section
                  ? (passageSectionLabels[passage.section] ?? '文献定位')
                  : '来源页面'}
                {passage.paragraphIndex === null
                  ? ''
                  : ` · 第 ${passage.paragraphIndex} 段`}
              </p>
            </div>
            <SourceLink
              url={passage.source.url}
              sourceType={passage.source.sourceType}
              externalId={passage.source.externalId}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function TherapyCard({
  therapy,
  answer,
}: {
  therapy: PublicEvidenceTherapy;
  answer: EvidenceAnswerDraft | null;
}) {
  const answerTherapy = getAnswerTherapy(answer, therapy.associationId);
  const drugNames = therapy.drugs
    .map((drug) => drug.displayNameZh || '药物中文名待补充')
    .join(' + ');
  const localizedRationale =
    associationRationaleTranslations[therapy.associationId] ??
    keepChineseOrFallback(
      therapy.gradingRationale,
      '该治疗关联的证据分级依据暂缺中文释义。'
    );
  const overview = answerTherapy
    ? keepChineseOrFallback(answerTherapy.overview, localizedRationale)
    : localizedRationale;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_55px_-36px_rgba(15,23,42,0.45)]">
      <div className="grid gap-6 border-b border-slate-200 px-5 py-6 md:grid-cols-[1fr_auto] md:px-7">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border-0 bg-[#0b2638] px-3 py-1 text-white">
              证据等级 {therapy.approvedLevel}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-[#b6dfe0] bg-[#eefafa] px-3 py-1 text-[#086b75]"
            >
              {directionLabels[therapy.direction]}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600"
            >
              {regulatoryLabels[therapy.regulatoryAlignment]}
            </Badge>
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-slate-950">
            {drugNames}
          </h3>
          <p className="mt-2 max-w-3xl text-[0.9375rem] leading-7 text-slate-600">
            {overview}
          </p>
        </div>
        <div className="flex h-fit items-center gap-6 rounded-xl bg-slate-50 px-5 py-4 text-center">
          <div>
            <div className="text-xl font-semibold text-slate-950">
              {therapy.evidenceClaims.length}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">临床证据</div>
          </div>
          <div className="h-9 w-px bg-slate-200" />
          <div>
            <div className="text-xl font-semibold text-slate-950">
              {therapy.regulatoryApprovals.length}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">美国药监局记录</div>
          </div>
        </div>
      </div>

      {answerTherapy && answerTherapy.statements.length > 0 && (
        <div className="border-b border-slate-200 bg-[#f0f8f7] px-5 py-5 md:px-7">
          <p className="text-xs font-semibold tracking-[0.12em] text-[#087f8c] uppercase">
            证据约束归纳
          </p>
          <div className="mt-3 space-y-3">
            {answerTherapy.statements.map((statement, index) => (
              <div
                key={`${therapy.associationId}-statement-${index}`}
                className="flex gap-3 text-[0.9375rem] leading-7 text-slate-800"
              >
                <Check className="mt-1.5 size-4 shrink-0 text-[#087f8c]" />
                <div>
                  <p>
                    {keepChineseOrFallback(
                      statement.text,
                      '该条受约束归纳暂缺中文内容。'
                    )}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {[...statement.evidenceIds, ...statement.regulatoryApprovalIds]
                      .map((id) => `[${id}]`)
                      .join(' ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.55fr)] md:px-7">
        <div>
          <div className="mb-5 flex items-center gap-2">
            <BookOpenText className="size-4 text-[#087f8c]" />
            <h4 className="text-sm font-semibold tracking-[0.04em] text-slate-900">
              临床证据
            </h4>
          </div>
          <div className="space-y-5">
            {therapy.evidenceClaims.map((claim) => (
              <EvidenceClaim key={claim.id} claim={claim} />
            ))}
          </div>
        </div>

        <aside className="border-t border-slate-200 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#087f8c]" />
            <h4 className="text-sm font-semibold tracking-[0.04em] text-slate-900">
              监管记录
            </h4>
          </div>
          <div className="mt-5 space-y-4">
            {therapy.regulatoryApprovals.map((approval) => {
              const translation = getApprovalTranslation(approval);
              return (
                <div
                  key={approval.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-slate-500">
                      {approval.applicationNumber}
                    </span>
                    <span className="text-xs font-semibold text-emerald-700">
                      {approvalStatusLabels[approval.approvalStatus]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {translation.indicationText}
                  </p>
                  {translation.biomarkerText && (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      生物标志物：{translation.biomarkerText}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      批准于 {formatDate(approval.approvalDate)}
                    </span>
                    <SourceLink
                      url={approval.source.url}
                      sourceType={approval.source.sourceType}
                      externalId={approval.source.externalId}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </article>
  );
}

function LoadingResult() {
  return (
    <section
      className="mx-auto mt-10 max-w-6xl px-4 pb-16 sm:px-6 lg:px-8"
      aria-label="正在生成结果"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex items-center gap-3 text-sm font-medium text-[#087f8c]">
          <LoaderCircle className="size-4 animate-spin" />
          后端正在检索已发布知识并生成受约束综述
        </div>
        <Skeleton className="mt-7 h-7 w-2/3" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    </section>
  );
}

function ResultView({ data }: { data: EvidencePageData }) {
  const totals = useMemo(() => countEvidence(data.resultGroups), [data]);
  const nonEmptyGroups = data.resultGroups.filter(
    (group) => group.therapies.length > 0
  );
  const fallbackSummary =
    data.status === 'SUMMARY_UNAVAILABLE'
      ? '证据检索已经完成，但本次模型生成或引用校验未通过。你仍可继续查看下方结构化证据。'
      : '输入有效，但当前 Evidex 知识版本尚未收录符合条件的证据；这不代表不存在公开医学证据。';
  const summary = data.answer
    ? keepChineseOrFallback(data.answer.overallSummary, fallbackSummary)
    : fallbackSummary;

  return (
    <section
      id="evidence-results"
      className="mx-auto mt-10 max-w-6xl scroll-mt-8 px-4 pb-20 sm:px-6 lg:px-8"
      aria-labelledby="result-title"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
        <dl className="grid gap-5 border-b border-slate-200 bg-slate-50/80 px-5 py-5 sm:grid-cols-2 md:grid-cols-4 md:px-7">
          <MetaItem
            label="查询"
            value={`${data.normalizedInput.disease} · ${data.normalizedInput.gene} ${data.normalizedInput.hgvsp}`}
          />
          <MetaItem label="知识版本" value={`知识版本 ${data.knowledge.release}`} />
          <MetaItem
            label="文献检索截止"
            value={formatDate(data.knowledge.literatureCutoffAt)}
          />
          <MetaItem label="生成时间" value={formatDate(data.generatedAt)} />
        </dl>

        <div className="grid gap-8 px-5 py-7 md:grid-cols-[minmax(0,1fr)_auto] md:px-7 md:py-9">
          <div>
            <div className="flex items-center gap-2 text-[#087f8c]">
              <FlaskConical className="size-4" />
              <span className="text-xs font-semibold tracking-[0.14em] uppercase">
                治疗证据摘要
              </span>
            </div>
            <h2
              id="result-title"
              className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-slate-950 md:text-3xl"
            >
              {data.status === 'SUMMARY_UNAVAILABLE'
                ? '综述暂不可用'
                : data.status === 'NO_CURATED_EVIDENCE'
                  ? '当前知识版本暂无已收录证据'
                  : '循证综述'}
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-8 text-slate-700">
              {summary}
            </p>
            {data.answer && data.answer.overallLimitations.length > 0 && (
              <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p>
                  {data.answer.overallLimitations
                    .map((limitation) =>
                      keepChineseOrFallback(
                        limitation,
                        '该条整体局限暂缺中文内容。'
                      )
                    )
                    .join('；')}
                </p>
              </div>
            )}
          </div>

          <div className="flex h-fit gap-7 rounded-xl border border-slate-200 px-5 py-4">
            <div>
              <div className="text-2xl font-semibold text-slate-950">
                {totals.therapies}
              </div>
              <div className="mt-1 text-xs text-slate-500">治疗关联</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-slate-950">
                {totals.claims}
              </div>
              <div className="mt-1 text-xs text-slate-500">临床证据</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-slate-950">
                {totals.approvals}
              </div>
              <div className="mt-1 text-xs text-slate-500">美国药监局记录</div>
            </div>
          </div>
        </div>
      </div>

      {nonEmptyGroups.map((group) => (
        <section key={group.scope} className="mt-10" aria-label={scopeLabels[group.scope]}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-[#087f8c] uppercase">
                证据分组
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                {scopeLabels[group.scope]}
              </h2>
            </div>
            <span className="text-sm text-slate-500">
              {group.therapies.length} 个治疗关联
            </span>
          </div>
          <div className="space-y-6">
            {group.therapies.map((therapy) => (
              <TherapyCard
                key={therapy.associationId}
                therapy={therapy}
                answer={data.answer}
              />
            ))}
          </div>
        </section>
      ))}

      <footer className="mt-10 rounded-2xl bg-[#0b2638] px-5 py-6 text-slate-200 md:px-7">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#69d0d1]" />
          <div>
            <p className="font-semibold text-white">使用边界</p>
            <p className="mt-2 text-sm leading-6">
              {keepChineseOrFallback(
                data.disclaimer,
                '仅用于肿瘤知识学习与研究，不构成医疗建议、诊断或治疗决策。'
              )}
            </p>
          </div>
        </div>
      </footer>
    </section>
  );
}

export function EvidenceExplorer() {
  const [selectedDisease, setSelectedDisease] =
    useState<SupportedDisease>('NSCLC');
  const [selectedVariantKey, setSelectedVariantKey] = useState(
    'EGFR|SNV|p.L858R'
  );
  const [requestState, setRequestState] = useState<RequestState>({
    status: 'idle',
  });
  const isLoading = requestState.status === 'loading';
  const availableVariantKeys = evidenceQueryOptions.queries
    .filter(([disease]) => disease === selectedDisease)
    .map(([, canonicalVariantKey]) => canonicalVariantKey);
  const availableVariants = evidenceQueryOptions.variants.filter((variant) =>
    availableVariantKeys.includes(variant.canonicalVariantKey)
  );
  const selectedVariant =
    availableVariants.find(
      (variant) => variant.canonicalVariantKey === selectedVariantKey
    ) ?? availableVariants[0];

  async function runQuery() {
    if (isLoading) return;
    setRequestState({ status: 'loading' });

    const query = {
      disease: selectedDisease,
      biomarkers: [
        {
          gene: selectedVariant.gene,
          alterationType: selectedVariant.alterationType,
          hgvsp: selectedVariant.hgvsp,
        },
      ],
      jurisdiction: 'US',
      locale: 'zh-CN',
    };

    try {
      const response = await fetch('/api/v1/evidence-answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(query),
      });
      const payload = (await response.json()) as {
        code: number;
        message: string;
        data?: EvidencePageData | OutOfScopeData;
      };

      if (!response.ok || !payload.data) {
        setRequestState({
          status: 'error',
          message: getRequestError(payload.message),
        });
        return;
      }

      if (payload.data.status === 'OUT_OF_SCOPE') {
        setRequestState({
          status: 'out-of-scope',
          field: payload.data.field,
        });
        return;
      }

      setRequestState({ status: 'success', data: payload.data });
      window.setTimeout(() => {
        const result = document.getElementById('evidence-results');
        if (typeof result?.scrollIntoView === 'function') {
          result.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    } catch {
      setRequestState({
        status: 'error',
        message: '知识服务暂时不可用，请稍后重试。',
      });
    }
  }

  return (
    <main
      aria-label="Evidex 循证检索体验"
      className="min-h-screen bg-[#f4f7f6] text-slate-950"
    >
      <header className="border-b border-slate-200/80 bg-[#f4f7f6]/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-[#0b2638] text-[#6ed4d3]">
              <Dna className="size-5" />
            </span>
            <div>
              <div className="text-base font-semibold tracking-[-0.02em]">
                Evidex
              </div>
              <div className="text-xs text-slate-500">治疗证据工作台</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="size-2 rounded-full bg-emerald-500" />
            V0.2 体验版
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #3b6670 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(28rem,1.15fr)] lg:items-center lg:gap-16 lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#b6dfe0] bg-[#e9f8f7] px-3 py-1.5 text-xs font-semibold text-[#086b75]">
              <FlaskConical className="size-3.5" />
              V0.2 可选查询链路
            </div>
            <h1 className="mt-6 max-w-xl font-serif text-4xl leading-[1.12] font-bold tracking-[-0.035em] text-[#0b2638] sm:text-5xl">
              体验一次完整的循证检索
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
              提交结构化疾病与变异，查看后端如何从已审核知识中检索证据、生成受约束综述，并把每个结论追溯到 PubMed 文献库与美国药监局来源。
            </p>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#087f8c]" /> 非自然语言猜测
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#087f8c]" /> 非个体化治疗建议
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_-42px_rgba(11,38,56,0.5)]">
            <div className="border-b border-slate-200 bg-[#0b2638] px-5 py-4 text-white sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.12em] text-[#69d0d1] uppercase">
                    结构化查询
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">结构化病例输入</h2>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-slate-200">
                  仅 1 个生物标志物
                </span>
              </div>
            </div>

            <form
              className="p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void runQuery();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">
                  癌种
                  <select
                    className="mt-2 h-11 w-full rounded-lg border-slate-200 bg-white px-3 text-base font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    value={selectedDisease}
                    disabled={isLoading}
                    onChange={(event) => {
                      const disease = event.target.value as SupportedDisease;
                      const firstVariantKey = evidenceQueryOptions.queries.find(
                        ([candidate]) => candidate === disease
                      )?.[1];
                      setSelectedDisease(disease);
                      if (firstVariantKey) setSelectedVariantKey(firstVariantKey);
                    }}
                  >
                    {evidenceQueryOptions.diseases.map((disease) => (
                      <option key={disease.code} value={disease.code}>
                        {disease.code} · {disease.labelZh}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  基因
                  <input
                    className="mt-2 h-11 w-full rounded-lg border-slate-200 bg-slate-50 px-3 text-base font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-100"
                    value={selectedVariant.gene}
                    disabled
                    readOnly
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  蛋白变异
                  <select
                    className="mt-2 h-11 w-full rounded-lg border-[#9ecfd1] bg-[#effafa] px-3 font-mono text-base font-semibold text-[#075f68] disabled:cursor-not-allowed disabled:opacity-60"
                    value={selectedVariant.canonicalVariantKey}
                    disabled={isLoading}
                    onChange={(event) => setSelectedVariantKey(event.target.value)}
                  >
                    {availableVariants.map((variant) => (
                      <option
                        key={variant.canonicalVariantKey}
                        value={variant.canonicalVariantKey}
                      >
                        {variant.gene} {variant.hgvsp}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
                <span>监管地区：美国 · 语言：简体中文</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" /> 首次生成可能需要片刻
                </span>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="mt-5 h-12 w-full rounded-lg bg-[#087f8c] text-base font-semibold text-white shadow-[0_10px_25px_-12px_rgba(8,127,140,0.8)] hover:bg-[#076d78]"
              >
                {isLoading ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    正在检索与生成综述…
                  </>
                ) : requestState.status === 'error' ? (
                  <>
                    <RefreshCw />
                    重新尝试
                  </>
                ) : (
                  <>
                    生成循证综述
                    <ArrowRight />
                  </>
                )}
              </Button>

              <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                页面不会收集姓名、病历号或其他个人身份信息
              </p>

              {(requestState.status === 'error' ||
                requestState.status === 'out-of-scope') && (
                <div
                  role="alert"
                  className="mt-4 flex gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900"
                >
                  <CircleAlert className="mt-1 size-4 shrink-0" />
                  <p>
                    {requestState.status === 'error'
                      ? requestState.message
                      : fieldLabels[requestState.field]}
                  </p>
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-6xl px-4 py-9 sm:px-6 lg:px-8"
        aria-labelledby="workflow-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="workflow-title" className="text-sm font-semibold text-slate-900">
            一次请求在后端经过什么
          </h2>
          <span className="font-mono text-xs text-slate-500">
            接口：/api/v1/evidence-answer
          </span>
        </div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="flex min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e9f8f7] text-[#087f8c]">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase">
                    0{index + 1}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div aria-live="polite">
        {requestState.status === 'loading' && <LoadingResult />}
        {requestState.status === 'success' && (
          <ResultView data={requestState.data} />
        )}
      </div>
    </main>
  );
}
