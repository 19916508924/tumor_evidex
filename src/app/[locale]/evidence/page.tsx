import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { EvidenceExplorer } from '@/shared/components/evidence/evidence-explorer';

export const metadata: Metadata = {
  title: 'Evidex · 治疗证据',
  description:
    '选择癌种与基因变异，查看可追溯的肿瘤治疗证据、临床研究与监管来源。',
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
