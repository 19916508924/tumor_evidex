import { DiscoveryRunDetailPage } from '@/shared/components/evidence-platform/ops-discovery-run-detail';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <DiscoveryRunDetailPage locale={locale} id={id} />;
}
