import type { ReactNode } from 'react';

import { PublicAppShell } from '@/shared/components/evidence-platform/public-app-shell';

export default async function ProductLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PublicAppShell locale={locale}>{children}</PublicAppShell>;
}
