import { KnowledgeEntityDetail } from '@/shared/components/evidence-platform/knowledge-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <KnowledgeEntityDetail locale={locale} type="drugs" id={id} />;
}
