import { OpsDashboard } from '@/shared/components/evidence-platform/ops-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <OpsDashboard locale={locale} />;
}
