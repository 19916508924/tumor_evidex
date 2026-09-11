import type { MetadataRoute } from 'next';

import { envConfigs } from '@/config';

const publicRoutes = [
  '',
  '/zh',
  '/zh/evidence',
  '/privacy-policy',
  '/zh/privacy-policy',
  '/terms-of-service',
  '/zh/terms-of-service',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = envConfigs.app_url.replace(/\/$/, '');

  return publicRoutes.map((path, index) => ({
    url: `${origin}${path || '/'}`,
    changeFrequency: index < 3 ? 'weekly' : 'monthly',
    priority: index === 0 ? 1 : index < 3 ? 0.8 : 0.3,
  }));
}
