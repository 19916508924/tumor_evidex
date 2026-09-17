import type { Metadata } from 'next';

import { AskWorkbench } from '@/shared/components/evidence-platform/ask-workbench';

export const metadata: Metadata = {
  title: 'Evidex · 问证据',
  description: '用自然语言检索已审核、可追溯的肿瘤证据。',
};
export default async function AskPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AskWorkbench locale={locale} />;
}
