import { MetadataRoute } from 'next';

import { envConfigs } from '@/config';

export default function robots(): MetadataRoute.Robots {
  const appUrl = envConfigs.app_url;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/*?*q=',
        '/pricing',
        '/showcases',
        '/blog',
        '/updates',
        '/docs',
        '/chat',
        '/ai-image-generator',
        '/ai-music-generator',
        '/ai-video-generator',
        '/settings/*',
        '/activity/*',
        '/admin/*',
        '/api/*',
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
