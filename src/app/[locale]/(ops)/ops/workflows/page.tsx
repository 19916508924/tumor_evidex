import { DefinitionManagementPage } from '@/shared/components/evidence-platform/ops-definition-management';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <DefinitionManagementPage locale={locale} kind="workflows" />;
}
