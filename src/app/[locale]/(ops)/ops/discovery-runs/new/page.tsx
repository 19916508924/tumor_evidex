import { NewDiscoveryRunPage } from '@/shared/components/evidence-platform/ops-discovery-workflow';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <NewDiscoveryRunPage locale={locale} />;
}
