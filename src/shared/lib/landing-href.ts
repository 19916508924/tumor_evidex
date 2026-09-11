export function localizedLandingHref(href: string, locale: string) {
  if (
    locale !== 'zh' ||
    /^(?:https?:|mailto:|tel:|#)/.test(href) ||
    href === '/zh' ||
    href.startsWith('/zh/') ||
    href.startsWith('/zh#')
  ) {
    return href;
  }

  if (href === '/') return '/zh';
  if (href.startsWith('/#')) return `/zh${href.slice(1)}`;
  if (href.startsWith('/')) return `/zh${href}`;
  return href;
}
