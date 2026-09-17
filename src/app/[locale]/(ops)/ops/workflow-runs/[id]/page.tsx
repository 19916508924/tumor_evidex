import { OpsDetailPage } from '@/shared/components/evidence-platform/ops-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <OpsDetailPage locale={locale} resource="workflow-runs" id={id} />;
}
