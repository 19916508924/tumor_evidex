import { ReviewQueuePage } from '@/shared/components/evidence-platform/ops-review-queue';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <ReviewQueuePage locale={locale} />;
}
