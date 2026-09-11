'use client';

import { useLocale } from 'next-intl';

import { localizedLandingHref } from '@/shared/lib/landing-href';
import type { Footer as FooterType } from '@/shared/types/blocks/landing';

export function Footer({ footer }: { footer: FooterType }) {
  const locale = useLocale();

  return (
    <footer
      id={footer.id}
      className="overflow-x-hidden border-t border-[#B4CAE6] bg-[#EAF2FF] px-4 py-10 text-[#0B1F3A] sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr] lg:grid-cols-[1.5fr_1fr]">
          <div className="max-w-xl">
            <a
              href={localizedLandingHref(footer.brand?.url || '/', locale)}
              className="inline-flex items-center gap-3 rounded-[10px] font-semibold focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
            >
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-[10px] bg-[#175CD3] text-sm font-bold text-white"
              >
                E
              </span>
              <span className="text-lg">{footer.brand?.title}</span>
            </a>
            <p className="mt-4 text-sm leading-7 text-[#52637A]">
              {footer.brand?.description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            {footer.nav?.items.map((item) => (
              <nav key={item.title} aria-label={item.title}>
                <p className="text-sm font-semibold">{item.title}</p>
                <div className="mt-4 grid gap-3">
                  {item.children?.map((subItem) => (
                    <a
                      key={subItem.title}
                      href={localizedLandingHref(subItem.url || '/', locale)}
                      className="text-sm text-[#52637A] underline-offset-4 hover:text-[#175CD3] hover:underline focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
                    >
                      {subItem.title}
                    </a>
                  ))}
                </div>
              </nav>
            ))}
          </div>
        </div>

        {footer.notice ? (
          <p className="mt-10 max-w-5xl rounded-xl border border-[#B4CAE6] bg-[#F4F8FF] px-4 py-3 text-xs leading-6 text-[#52637A]">
            {footer.notice as string}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-4 border-t border-[#B4CAE6] pt-6 text-xs text-[#52637A] sm:flex-row sm:items-center sm:justify-between">
          <p>{footer.copyright}</p>
          <div className="flex flex-wrap gap-5">
            {footer.agreement?.items.map((item) => (
              <a
                key={item.title}
                href={localizedLandingHref(item.url || '/', locale)}
                className="underline-offset-4 hover:text-[#175CD3] hover:underline focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
              >
                {item.title}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
