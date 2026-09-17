import type { ReactNode } from 'react';

import { requireAdminAccess } from '@/core/rbac/permission';
import { OpsShell } from '@/shared/components/evidence-platform/ops-shell';
import { isEvidexDemoMode } from '@/shared/lib/evidex-demo-mode';

export default async function OpsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isEvidexDemoMode()) {
    await requireAdminAccess({ redirectUrl: '/no-permission', locale });
  }
  return <OpsShell locale={locale}>{children}</OpsShell>;
}
