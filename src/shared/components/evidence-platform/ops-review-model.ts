import type { EvidenceDraftInput } from '@/shared/services/evidence-platform/upstream-workflow';

export type EvidenceClaim = EvidenceDraftInput['claims'][number];
export type EvidencePassage = EvidenceDraftInput['passages'][number];
export type PassageRole = EvidencePassage['supportRole'];

export const roleLabels: Record<PassageRole, string> = {
  PRIMARY: '主要依据',
  CONTEXT: '上下文',
  LIMITATION: '局限依据',
};

export const claimFieldLabels: Record<string, string> = {
  claimType: '结论类型',
  evidenceMaturity: '证据成熟度',
  studyType: '研究类型',
  studyName: '研究名称',
  populationSummary: '研究人群',
  sampleSize: '样本量',
  diseaseStage: '疾病阶段',
  treatmentLine: '治疗线次',
  priorTherapy: '既往治疗',
  intervention: '干预措施',
  comparator: '对照措施',
  endpoint: '研究终点',
  effectValue: '效应量',
  conclusion: '结论',
  limitations: '局限性',
};

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function formatPassageLocator(passage: EvidencePassage) {
  const locator = passage.locator ?? {};
  const sentenceIndex = nonNegativeInteger(locator.sentenceIndex);
  if (sentenceIndex !== null) {
    return `${passage.section} · 第 ${sentenceIndex + 1} 句`;
  }
  const paragraphIndex = nonNegativeInteger(locator.paragraphIndex);
  if (paragraphIndex !== null) {
    return `${passage.section} · 第 ${paragraphIndex + 1} 段`;
  }
  const sectionLabel =
    typeof locator.section === 'string' && locator.section.trim()
      ? locator.section.trim()
      : passage.section;
  const fallbackIndex = nonNegativeInteger(passage.paragraphIndex) ?? 0;
  return `${sectionLabel} · 第 ${fallbackIndex + 1} 段`;
}

export function formatFieldPath(fieldPath: string) {
  const match = fieldPath.match(/^claims\.(\d+)\.([A-Za-z][A-Za-z0-9]*)$/);
  if (!match) return '当前字段';
  const claimNumber = Number(match[1]) + 1;
  return `证据结论 ${claimNumber} · ${claimFieldLabels[match[2]] ?? '结构化字段'}`;
}
