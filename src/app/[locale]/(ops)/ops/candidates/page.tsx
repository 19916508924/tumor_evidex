import { CandidateIntake } from '@/shared/components/evidence-platform/ops-candidate-intake';
import { OpsCollectionPage } from '@/shared/components/evidence-platform/ops-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <>
      <div className="mx-auto max-w-[96rem] px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <CandidateIntake locale={locale} />
      </div>
      <OpsCollectionPage locale={locale} resource="candidates" />
    </>
  );
}
