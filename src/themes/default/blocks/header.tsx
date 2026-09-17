'use client';

import { useLocale } from 'next-intl';

import { usePathname, useRouter } from '@/core/i18n/navigation';
import { cacheSet } from '@/shared/lib/cache';
import { localizedLandingHref } from '@/shared/lib/landing-href';
import type { Header as HeaderType } from '@/shared/types/blocks/landing';

export function Header({ header }: { header: HeaderType }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const desktopNavLabel = header.desktop_nav_label as string;
  const languageLabel = header.language_label as string;

  const switchLanguage = () => {
    const nextLocale = locale === 'zh' ? 'en' : 'zh';
    cacheSet('locale', nextLocale);
    const hash = typeof window === 'undefined' ? '' : window.location.hash;
    router.push(`${pathname}${hash}`, { locale: nextLocale });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 min-w-[64rem] border-b border-[#8DB6EA]/45 bg-white/72 shadow-[0_8px_32px_rgba(20,70,140,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl supports-[not_(backdrop-filter:blur(1px))]:bg-[#F8FBFF]">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-5 px-8">
        <a
          href={localizedLandingHref(header.brand?.url || '/', locale)}
          className="flex shrink-0 items-center gap-3 rounded-[10px] font-semibold text-[#0B1F3A] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
        >
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-[10px] bg-[#175CD3] text-sm font-bold text-white shadow-[0_7px_18px_rgba(23,92,211,0.2)]"
          >
            E
          </span>
          <span className="text-lg tracking-[-0.02em]">
            {header.brand?.title}
          </span>
        </a>

        <nav
          aria-label={desktopNavLabel}
          className="ml-auto flex min-w-0 items-center gap-0.5"
        >
          {header.nav?.items.map((item) => (
            <a
              key={item.title}
              href={localizedLandingHref(item.url || '/', locale)}
              className="rounded-[10px] px-2.5 py-2 text-sm font-medium whitespace-nowrap text-[#334A67] transition duration-200 hover:bg-[#EAF2FF] hover:text-[#0B3975] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
            >
              {item.title}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {header.show_locale ? (
            <button
              type="button"
              aria-label={languageLabel}
              onClick={switchLanguage}
              className="min-h-10 rounded-[10px] border border-[#B4CAE6] bg-white px-3 text-xs font-semibold text-[#0B3975] transition hover:border-[#175CD3] hover:bg-[#F4F8FF] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
            >
              {locale === 'zh' ? 'EN' : '中文'}
            </button>
          ) : null}
          {header.buttons?.map((button) => (
            <a
              key={button.title}
              href={localizedLandingHref(button.url || '/', locale)}
              className="inline-flex min-h-10 items-center justify-center rounded-[10px] bg-[#175CD3] px-4 text-sm font-semibold whitespace-nowrap text-white transition duration-200 hover:bg-[#134EAE] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px"
            >
              {button.title}
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}
