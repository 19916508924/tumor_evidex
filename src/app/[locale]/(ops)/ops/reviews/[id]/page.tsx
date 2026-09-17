import { ReviewWorkspace } from '@/shared/components/evidence-platform/ops-review-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  return <ReviewWorkspace locale={locale} id={id} />;
}
