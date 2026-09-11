import { getTranslations, setRequestLocale } from 'next-intl/server';

import { EvidexLanding } from '@/shared/components/landing/evidex-landing';
import { getMetadata } from '@/shared/lib/seo';
import type { EvidexLandingContent } from '@/shared/types/evidex-landing';

export const revalidate = 3600;

export const generateMetadata = getMetadata({
  metadataKey: 'pages.index.metadata',
  canonicalUrl: '/',
});

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('pages.index');

  const content = t.raw('page') as EvidexLandingContent;

  return <EvidexLanding locale={locale} content={content} />;
}
