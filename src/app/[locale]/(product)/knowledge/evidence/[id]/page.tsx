import { KnowledgeEvidenceDetail } from '@/shared/components/evidence-platform/knowledge-record-details';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <KnowledgeEvidenceDetail locale={locale} id={id} />;
}
