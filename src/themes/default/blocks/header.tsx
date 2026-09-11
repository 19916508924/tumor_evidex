'use client';

import { useEffect, useRef, useState } from 'react';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { useLocale } from 'next-intl';

import { usePathname, useRouter } from '@/core/i18n/navigation';
import { cacheSet } from '@/shared/lib/cache';
import { localizedLandingHref } from '@/shared/lib/landing-href';
import type { Header as HeaderType } from '@/shared/types/blocks/landing';

export function Header({ header }: { header: HeaderType }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const openLabel = header.menu_open_label as string;
  const closeLabel = header.menu_close_label as string;
  const mobileNavLabel = header.mobile_nav_label as string;
  const desktopNavLabel = header.desktop_nav_label as string;
  const languageLabel = header.language_label as string;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = menuRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])'
    );
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const switchLanguage = () => {
    const nextLocale = locale === 'zh' ? 'en' : 'zh';
    setOpen(false);
    cacheSet('locale', nextLocale);
    const hash = typeof window === 'undefined' ? '' : window.location.hash;
    router.push(`${pathname}${hash}`, { locale: nextLocale });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#8DB6EA]/45 bg-white/72 shadow-[0_8px_32px_rgba(20,70,140,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl supports-[not_(backdrop-filter:blur(1px))]:bg-[#F8FBFF]">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">
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
          className="ml-auto hidden min-w-0 items-center gap-0.5 lg:flex"
        >
          {header.nav?.items.map((item) => (
            <a
              key={item.title}
              href={localizedLandingHref(item.url || '/', locale)}
              className="rounded-[10px] px-2.5 py-2 text-sm font-medium whitespace-nowrap text-[#334A67] transition duration-200 hover:bg-[#EAF2FF] hover:text-[#0B3975] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none xl:px-3.5"
            >
              {item.title}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
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

        <button
          ref={triggerRef}
          type="button"
          aria-label={open ? closeLabel : openLabel}
          aria-expanded={open}
          aria-controls="landing-mobile-navigation"
          onClick={() => setOpen((value) => !value)}
          className="ml-auto flex size-11 items-center justify-center rounded-[10px] border border-[#B4CAE6] bg-white text-[#0B3975] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none lg:hidden"
        >
          {open ? (
            <IconX aria-hidden size={22} stroke={1.8} />
          ) : (
            <IconMenu2 aria-hidden size={22} stroke={1.8} />
          )}
        </button>
      </div>

      {open ? (
        <div
          ref={menuRef}
          id="landing-mobile-navigation"
          className="fixed inset-x-0 top-[72px] h-[calc(100dvh-72px)] border-t border-[#B4CAE6] bg-[#F4F8FF] px-4 py-6 lg:hidden"
        >
          <nav
            aria-label={mobileNavLabel}
            className="mx-auto grid max-w-7xl gap-1"
          >
            {header.nav?.items.map((item) => (
              <a
                key={item.title}
                href={localizedLandingHref(item.url || '/', locale)}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-[10px] px-4 text-lg font-semibold text-[#0B1F3A] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
              >
                {item.title}
              </a>
            ))}
            <div className="mt-5 grid gap-3 border-t border-[#B4CAE6] pt-5">
              {header.buttons?.map((button) => (
                <a
                  key={button.title}
                  href={localizedLandingHref(button.url || '/', locale)}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-12 items-center justify-center rounded-[10px] bg-[#175CD3] px-5 text-sm font-semibold whitespace-nowrap text-white focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {button.title}
                </a>
              ))}
              {header.show_locale ? (
                <button
                  type="button"
                  aria-label={languageLabel}
                  onClick={switchLanguage}
                  className="min-h-12 rounded-[10px] border border-[#9CB9DF] bg-white px-4 text-sm font-semibold text-[#0B3975] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
                >
                  {locale === 'zh' ? 'English' : '中文'}
                </button>
              ) : null}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
