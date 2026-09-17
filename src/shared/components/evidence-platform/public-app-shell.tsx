'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpenText,
  Dna,
  MessageSquareText,
} from 'lucide-react';

export function PublicAppShell({
  children,
  locale = 'zh',
}: {
  children: ReactNode;
  locale?: string;
}) {
  return (
    <div className="evidex-product min-h-dvh bg-[#F4F8FF] text-[#0B1F3A] selection:bg-[#B9D5FF] selection:text-[#07182D]">
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-[80] -translate-y-24 rounded-xl bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-white transition focus:translate-y-0"
      >
        跳到主要内容
      </a>
      <header className="sticky top-0 z-50 border-b border-[#BFD1E7]/80 bg-[#F4F8FF]/78 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[90rem] items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link
            href={`/${locale}`}
            className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
          >
            <span className="grid size-8 place-items-center rounded-[10px] bg-[#175CD3] text-white shadow-[0_8px_22px_rgba(23,92,211,0.22)]">
              <Dna aria-hidden size={18} strokeWidth={1.9} />
            </span>
            <span className="text-[1.05rem] font-semibold tracking-[-0.025em]">
              Evidex
            </span>
          </Link>
          <nav
            aria-label="主要导航"
            className="ml-auto flex items-center gap-1 overflow-x-auto text-sm font-medium whitespace-nowrap"
          >
            <Link
              href={`/${locale}/ask`}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[#0B3975] transition hover:bg-white/75 focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
            >
              <MessageSquareText aria-hidden size={16} />
              问证据
            </Link>
            <Link
              href={`/${locale}/knowledge`}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[#0B3975] transition hover:bg-white/75 focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
            >
              <BookOpenText aria-hidden size={16} />
              知识库
            </Link>
            <Link
              href={`/${locale}/evidence`}
              className="hidden min-h-10 items-center rounded-lg px-3 text-[#52637A] transition hover:bg-white/75 hover:text-[#0B3975] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none sm:inline-flex"
            >
              治疗证据
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="border-t border-[#C8D9EE] bg-white/45">
        <div className="mx-auto grid max-w-[90rem] gap-5 px-4 py-8 text-sm text-[#52637A] sm:px-6 md:grid-cols-[1fr_auto] md:items-end lg:px-8">
          <div>
            <p className="font-semibold text-[#0B3975]">Evidex</p>
            <p className="mt-2 max-w-[68ch] leading-6">
              面向肿瘤知识学习与研究的可追溯证据服务，不构成医疗建议、诊断或治疗决策。
            </p>
          </div>
          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-1.5 font-semibold text-[#175CD3] underline-offset-4 hover:underline"
          >
            返回首页 <ArrowUpRight aria-hidden size={15} />
          </Link>
        </div>
      </footer>
    </div>
  );
}
