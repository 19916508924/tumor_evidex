import { OpsCollectionPage } from '@/shared/components/evidence-platform/ops-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <OpsCollectionPage locale={locale} resource="releases" />;
}
