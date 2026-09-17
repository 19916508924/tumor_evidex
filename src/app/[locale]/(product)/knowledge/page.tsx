import type { Metadata } from 'next';

import { KnowledgeHome } from '@/shared/components/evidence-platform/knowledge-workspace';

export const metadata: Metadata = {
  title: 'Evidex · 知识库',
  description: '浏览可追溯的肿瘤疾病、基因、变异、药物与已审核证据。',
};

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <KnowledgeHome locale={locale} />;
}
