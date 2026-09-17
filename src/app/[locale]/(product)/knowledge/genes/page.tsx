import { KnowledgeList } from '@/shared/components/evidence-platform/knowledge-workspace';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, initialSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <KnowledgeList
      locale={locale}
      type="genes"
      initialSearchParams={initialSearchParams}
    />
  );
}
