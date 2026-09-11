import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { EvidenceExplorer } from '@/shared/components/evidence/evidence-explorer';

export const metadata: Metadata = {
  title: 'Evidex · 治疗证据工作台',
  description:
    '输入结构化疾病与基因变异，体验可追溯的肿瘤治疗证据检索与受约束综述。',
};

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <EvidenceExplorer />;
}
