'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  CircleAlert,
  Clock3,
  Dna,
  ExternalLink,
  FlaskConical,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

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
  disease: '目前支持非小细胞肺癌（NSCLC）和结直肠癌（CRC）。',
  gene: '目前支持 EGFR 和 KRAS 基因。',
  hgvsp: '暂未收录这个基因与变异类型组合。',
  jurisdiction: '目前仅覆盖美国药品监督管理局监管范围。',
  locale: '目前仅提供中文结果。',
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

function toPublicFacingCopy(value: string) {
  return value
    .replaceAll('当前已发布知识中', '当前收录资料中')
    .replaceAll('当前 Evidex 知识版本', 'Evidex 当前收录范围')
    .replaceAll('当前知识版本', '当前收录范围')
    .replaceAll('知识版本', '收录范围')
    .replace(/\s*\bFDA\b\s*/g, '美国药监局')
    .replace(/\s*\bNSCLC\b\s*/g, '非小细胞肺癌')
    .replace(/\s*\bCRC\b\s*/g, '结直肠癌')
    .replace(/\bexon\b/gi, '外显子')
    .replace(/\s*\bPFS\b\s*/g, '无进展生存期')
    .replace(/\s*\bOS\b\s*/g, '总生存期')
    .replace(/\s*\bORR\b\s*/g, '客观缓解率')
    .replace(/\s*\bHR\b\s*/g, '风险比')
    .replace(/\s*\bCI\b\s*/g, '置信区间');
}

function joinPublicCopy(values: string[]) {
  return values
    .map((value) => toPublicFacingCopy(value))
    .map((value) => (/[。！？]$/u.test(value) ? value : `${value}。`))
    .join('');
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
    return '提交内容过长，请精简后重试。';
  }
  return '暂时无法获取证据，请稍后重试。';
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
      <dt className="text-sm font-medium text-[#64748B]">
        {label}
      </dt>
      <dd className="mt-1 truncate text-base font-semibold text-[#0B1F3A]">
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
      className="group inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-semibold text-[#175CD3] underline-offset-4 transition-colors hover:bg-[#EAF2FF] hover:text-[#134EAE] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
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
    <article className="border-t border-[#C7D9F2] pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-[#A9C4EA] bg-[#EDF5FF] text-[#0B4DA2]"
        >
          {evidenceMaturityLabels[claim.evidenceMaturity]}
        </Badge>
      </div>

      <h4 className="mt-3 text-lg font-semibold tracking-[-0.015em] text-[#0B1F3A]">
        {studyFacts.join(' · ')}
      </h4>
      <p className="mt-2 text-base leading-7 text-[#52637A]">
        {localizedClaim.populationSummary}
      </p>

      <dl className="mt-5 grid gap-5 border-y border-[#D9E5F5] bg-[#F7FAFF]/80 px-4 py-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[#64748B]">干预与对照</dt>
          <dd className="mt-1.5 font-medium leading-6 text-[#0B1F3A]">
            {localizedClaim.intervention}
            {localizedClaim.comparator
              ? ` 对比 ${localizedClaim.comparator}`
              : '（单臂）'}
          </dd>
        </div>
        <div>
          <dt className="text-[#64748B]">主要终点</dt>
          <dd className="mt-1.5 font-medium leading-6 text-[#0B1F3A]">
            {localizedClaim.endpoint}
            {claim.effectValue
              ? ` · ${formatEffectValue(claim.effectValue)}`
              : ''}
          </dd>
        </div>
      </dl>

      {clinicalContext.length > 0 && (
        <p className="mt-4 text-sm leading-6 text-[#64748B]">
          {clinicalContext.join(' · ')}
        </p>
      )}

      <p className="mt-5 text-base leading-7 text-[#243B5A]">
        {localizedClaim.conclusion}
      </p>
      <div className="mt-4 border-l-2 border-[#E3A008] bg-[#FFF9E8]/80 px-4 py-3 text-sm leading-6 text-[#62420A]">
        <span className="font-semibold">局限：</span>
        {localizedClaim.limitations}
      </div>

      <div className="mt-4 space-y-3">
        {claim.passages.map((passage) => (
          <div
            key={passage.id}
            className="flex flex-col justify-between gap-3 rounded-xl border border-[#D9E5F5] bg-white/70 p-4 sm:flex-row sm:items-start"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#0B1F3A]">
                {passage.source.title}
              </p>
              {passage.text && (
                <p className="mt-2 text-sm leading-6 text-[#52637A]">
                  “{passage.text}”
                </p>
              )}
              <p className="mt-2 text-sm text-[#64748B]">
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
    <article className="overflow-hidden rounded-2xl border border-white/90 bg-white/78 shadow-[0_24px_70px_-42px_rgba(23,92,211,0.34)] backdrop-blur-xl">
      <div className="grid gap-6 border-b border-[#D9E5F5] px-5 py-6 md:grid-cols-[1fr_auto] md:px-7">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border-0 bg-[#0B3975] px-3 py-1 text-white">
              证据等级 {therapy.approvedLevel}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-[#A9C4EA] bg-[#EDF5FF] px-3 py-1 text-[#0B4DA2]"
            >
              {directionLabels[therapy.direction]}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-[#C7D9F2] bg-white/70 px-3 py-1 text-[#52637A]"
            >
              {regulatoryLabels[therapy.regulatoryAlignment]}
            </Badge>
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-[#0B1F3A]">
            {drugNames}
          </h3>
          <p className="mt-2 max-w-3xl text-base leading-7 text-[#52637A]">
            {toPublicFacingCopy(overview)}
          </p>
        </div>
        <div className="flex h-fit items-center gap-6 border-l-2 border-[#8DB6EA] bg-[#EDF5FF]/70 px-5 py-3 text-center">
          <div>
            <div className="text-xl font-semibold text-[#0B1F3A]">
              {therapy.evidenceClaims.length}
            </div>
            <div className="mt-0.5 text-sm text-[#64748B]">临床证据</div>
          </div>
          <div className="h-9 w-px bg-[#C7D9F2]" />
          <div>
            <div className="text-xl font-semibold text-[#0B1F3A]">
              {therapy.regulatoryApprovals.length}
            </div>
            <div className="mt-0.5 text-sm text-[#64748B]">监管记录</div>
          </div>
        </div>
      </div>

      {answerTherapy && answerTherapy.statements.length > 0 && (
        <div className="border-b border-[#D9E5F5] bg-[#EDF5FF]/65 px-5 py-5 md:px-7">
          <p className="text-sm font-semibold text-[#0B4DA2]">
            证据要点
          </p>
          <div className="mt-3 space-y-3">
            {answerTherapy.statements.map((statement, index) => (
              <div
                key={`${therapy.associationId}-statement-${index}`}
                className="flex gap-3 text-base leading-7 text-[#243B5A]"
              >
                <Check className="mt-1.5 size-4 shrink-0 text-[#175CD3]" />
                <div>
                  <p>
                    {toPublicFacingCopy(
                      keepChineseOrFallback(
                        statement.text,
                        '该条归纳暂缺中文内容。'
                      )
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-8 px-5 py-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.55fr)] md:px-7">
        <div>
          <div className="mb-5 flex items-center gap-2">
            <BookOpenText className="size-4 text-[#175CD3]" />
            <h4 className="text-sm font-semibold text-[#0B1F3A]">
              临床证据
            </h4>
          </div>
          <div className="space-y-5">
            {therapy.evidenceClaims.map((claim) => (
              <EvidenceClaim key={claim.id} claim={claim} />
            ))}
          </div>
        </div>

        <aside className="border-t border-[#D9E5F5] pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#175CD3]" />
            <h4 className="text-sm font-semibold text-[#0B1F3A]">
              监管记录
            </h4>
          </div>
          <div className="mt-5 space-y-4">
            {therapy.regulatoryApprovals.map((approval) => {
              const translation = getApprovalTranslation(approval);
              return (
                <div
                  key={approval.id}
                  className="rounded-xl border border-[#D9E5F5] bg-white/60 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-[#52637A]">
                      {approval.applicationNumber}
                    </span>
                    <span className="text-xs font-semibold text-emerald-700">
                      {approvalStatusLabels[approval.approvalStatus]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#334A67]">
                    {translation.indicationText}
                  </p>
                  {translation.biomarkerText && (
                    <p className="mt-2 text-sm leading-6 text-[#64748B]">
                      生物标志物：{translation.biomarkerText}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-[#64748B]">
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
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      key="loading"
      className="mx-auto mt-10 max-w-6xl px-4 pb-16 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500 sm:px-6 lg:px-8"
      aria-label="正在生成结果"
      exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
      transition={{
        duration: reduceMotion ? 0 : 0.45,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className="rounded-2xl border border-white/90 bg-white/72 p-6 shadow-[0_24px_70px_-42px_rgba(23,92,211,0.34)] backdrop-blur-2xl md:p-8">
        <div className="flex items-center gap-3 text-sm font-medium text-[#175CD3]">
          <LoaderCircle className="size-4 animate-spin" />
          正在整理相关证据，请稍候
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
    </motion.section>
  );
}

function ResultView({ data }: { data: EvidencePageData }) {
  const totals = useMemo(() => countEvidence(data.resultGroups), [data]);
  const reduceMotion = useReducedMotion();
  const nonEmptyGroups = data.resultGroups.filter(
    (group) => group.therapies.length > 0
  );
  const fallbackSummary =
    data.status === 'SUMMARY_UNAVAILABLE'
      ? '相关资料已经找到，但本次综述暂时无法完整呈现。你仍可查看下方证据与来源。'
      : '当前收录范围内暂未找到符合条件的证据；这不代表不存在公开医学资料。';
  const summary = data.answer
    ? keepChineseOrFallback(data.answer.overallSummary, fallbackSummary)
    : fallbackSummary;

  return (
    <motion.section
      key="results"
      id="evidence-results"
      className="mx-auto mt-10 max-w-7xl scroll-mt-24 px-4 pb-20 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-500 sm:px-6 lg:px-8"
      aria-labelledby="result-title"
      transition={{
        duration: reduceMotion ? 0 : 0.55,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className="overflow-hidden rounded-2xl border border-white/90 bg-white/75 shadow-[0_28px_90px_-50px_rgba(23,92,211,0.4)] backdrop-blur-2xl">
        <dl className="grid gap-5 border-b border-[#D9E5F5] bg-[#F7FAFF]/72 px-5 py-5 sm:grid-cols-2 md:px-7">
          <MetaItem
            label="查询"
            value={`${data.normalizedInput.disease} · ${data.normalizedInput.gene} ${data.normalizedInput.hgvsp}`}
          />
          <MetaItem
            label="资料更新至"
            value={formatDate(data.knowledge.literatureCutoffAt)}
          />
        </dl>

        <div className="grid gap-8 px-5 py-7 md:grid-cols-[minmax(0,1fr)_auto] md:px-7 md:py-9">
          <div>
            <h2
              id="result-title"
              className="flex items-center gap-3 text-2xl font-semibold tracking-[-0.03em] text-[#0B1F3A] md:text-3xl"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#EAF2FF] text-[#175CD3]">
                <FlaskConical className="size-4" />
              </span>
              {data.status === 'SUMMARY_UNAVAILABLE'
                ? '综述暂时无法呈现'
                : data.status === 'NO_CURATED_EVIDENCE'
                  ? '暂未找到相关证据'
                  : '治疗证据综述'}
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-8 text-[#334A67]">
              {toPublicFacingCopy(summary)}
            </p>
            {data.answer && data.answer.overallLimitations.length > 0 && (
              <div className="mt-5 flex gap-3 border-l-2 border-[#E3A008] bg-[#FFF9E8]/80 px-4 py-3 text-sm leading-6 text-[#62420A]">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p>
                  {joinPublicCopy(
                    data.answer.overallLimitations.map((limitation) =>
                      keepChineseOrFallback(
                        limitation,
                        '该条整体局限暂缺中文内容。'
                      )
                    )
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="flex h-fit gap-7 border-l-2 border-[#8DB6EA] bg-[#EDF5FF]/75 px-5 py-4">
            <div>
              <div className="text-2xl font-semibold text-[#0B1F3A]">
                {totals.therapies}
              </div>
              <div className="mt-1 text-sm text-[#64748B]">治疗方案</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-[#0B1F3A]">
                {totals.claims}
              </div>
              <div className="mt-1 text-sm text-[#64748B]">临床证据</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-[#0B1F3A]">
                {totals.approvals}
              </div>
              <div className="mt-1 text-sm text-[#64748B]">监管记录</div>
            </div>
          </div>
        </div>
      </div>

      {nonEmptyGroups.map((group) => (
        <section
          key={group.scope}
          className="mt-10"
          aria-label={scopeLabels[group.scope]}
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0B1F3A]">
              {scopeLabels[group.scope]}
            </h2>
            <span className="text-sm text-[#64748B]">
              {group.therapies.length} 个治疗方案
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

      <footer className="mt-10 rounded-2xl bg-[#0B1F3A] px-5 py-6 text-[#D8E8FF] md:px-7">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#8DB6EA]" />
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
    </motion.section>
  );
}

export function EvidenceExplorer() {
  const reduceMotion = useReducedMotion();
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
        message: '暂时无法获取证据，请稍后重试。',
      });
    }
  }

  return (
    <main
      aria-label="Evidex 治疗证据"
      className="min-h-screen overflow-x-clip bg-[#F4F8FF] text-[#0B1F3A] [color-scheme:light] selection:bg-[#CFE2FF] selection:text-[#0B3975]"
    >
      <header className="sticky top-0 z-50 border-b border-white/80 bg-white/65 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/zh"
            className="flex items-center gap-3 rounded-[10px] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span className="grid size-9 place-items-center rounded-[10px] bg-[#175CD3] text-white shadow-[0_8px_22px_rgba(23,92,211,0.2)]">
              <Dna className="size-5" />
            </span>
            <span className="text-base font-semibold tracking-[-0.025em]">
              Evidex
            </span>
          </Link>
          <Link
            href="/zh"
            className="inline-flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-[#334A67] transition-colors hover:bg-white/85 hover:text-[#175CD3] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" />
            返回首页
          </Link>
        </div>
      </header>

      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-36 -z-10 size-[34rem] rounded-full bg-[#D8E8FF]/90 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-52 -left-48 -z-10 size-[30rem] rounded-full bg-[#E8F2FF]/80 blur-3xl"
        />

        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.88fr)_minmax(30rem,1.12fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-20">
          <motion.div
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500"
            transition={{
              duration: reduceMotion ? 0 : 0.55,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <h1 className="max-w-2xl text-4xl leading-[1.08] font-semibold tracking-[-0.045em] text-balance text-[#0B1F3A] sm:text-5xl">
              探索与基因变异相关的治疗证据
            </h1>
            <p className="mt-6 max-w-[62ch] text-base leading-8 text-[#52637A] sm:text-lg">
              选择癌种与基因变异，查看经过整理的临床研究、监管信息与原始来源，快速建立清晰、可追溯的证据全景。
            </p>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#334A67]">
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#175CD3]" /> 结论可回到原始来源
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-[#175CD3]" /> 不提供个体化治疗建议
              </span>
            </div>
            <div className="mt-8 flex max-w-xl items-start gap-3 border-l-2 border-[#175CD3] pl-4 text-sm leading-6 text-[#52637A]">
              <BookOpenText className="mt-0.5 size-4 shrink-0 text-[#175CD3]" />
              <span>资料来源覆盖 PubMed 文献与美国药监局公开记录</span>
            </div>
          </motion.div>

          <motion.div
            layout
            transition={{
              duration: reduceMotion ? 0 : 0.6,
              delay: reduceMotion ? 0 : 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="overflow-hidden rounded-2xl border border-white/90 bg-white/72 shadow-[0_30px_90px_-42px_rgba(23,92,211,0.36)] backdrop-blur-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-700"
          >
            <div className="border-b border-[#D9E5F5] px-5 py-5 sm:px-6">
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#0B1F3A]">
                选择查询条件
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#64748B]">
                选择一个癌种和蛋白变异，我们会整理与之相关的治疗证据。
              </p>
            </div>

            <form
              className="p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void runQuery();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm font-semibold text-[#334A67]">
                  癌种
                  <select
                    className="mt-2 h-12 w-full rounded-[10px] border-[#BFD1E7] !bg-white px-3 text-base font-semibold !text-[#0B1F3A] transition focus:border-[#175CD3] focus:ring-2 focus:ring-[#175CD3]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                <label className="text-sm font-semibold text-[#334A67]">
                  基因
                  <input
                    className="mt-2 h-12 w-full rounded-[10px] border-[#D9E5F5] !bg-[#F7FAFF] px-3 text-base font-semibold !text-[#0B1F3A] disabled:cursor-not-allowed disabled:opacity-100"
                    value={selectedVariant.gene}
                    disabled
                    readOnly
                  />
                </label>
                <label className="text-sm font-semibold text-[#334A67]">
                  蛋白变异
                  <select
                    className="mt-2 h-12 w-full rounded-[10px] border-[#8DB6EA] !bg-[#EDF5FF] px-3 font-mono text-base font-semibold !text-[#0B4DA2] transition focus:border-[#175CD3] focus:ring-2 focus:ring-[#175CD3]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#D9E5F5] pt-4 text-sm text-[#64748B]">
                <span>当前资料范围：美国</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" /> 首次生成可能需要片刻
                </span>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="mt-5 h-12 w-full rounded-[10px] bg-[#175CD3] text-base font-semibold text-white shadow-[0_12px_28px_rgba(23,92,211,0.24)] transition duration-200 hover:bg-[#134EAE] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 active:translate-y-px"
              >
                {isLoading ? (
                  <>
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                    正在整理相关证据…
                  </>
                ) : requestState.status === 'error' ? (
                  <>
                    <RefreshCw />
                    重新尝试
                  </>
                ) : (
                  <>
                    查看治疗证据
                    <ArrowRight />
                  </>
                )}
              </Button>

              <p className="mt-3 text-center text-sm leading-6 text-[#64748B]">
                页面不会收集姓名、病历号或其他个人身份信息
              </p>

              {(requestState.status === 'error' ||
                requestState.status === 'out-of-scope') && (
                <div
                  role="alert"
                  className="mt-4 flex gap-3 rounded-[10px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm leading-6 text-rose-900"
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
          </motion.div>
        </div>
      </section>

      <div aria-live="polite">
        <AnimatePresence mode="wait">
          {requestState.status === 'loading' && <LoadingResult />}
          {requestState.status === 'success' && (
            <ResultView data={requestState.data} />
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
