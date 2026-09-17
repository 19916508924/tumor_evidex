'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Bot,
  ClipboardCheck,
  DatabaseZap,
  FileCheck2,
  FileSearch,
  Gauge,
  GitBranch,
  Layers3,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

const opsNav = [
  { href: '/ops', label: '总览', icon: Gauge },
  { href: '/ops/discovery-strategies', label: '发现策略', icon: FileSearch },
  { href: '/ops/discovery-runs', label: '发现运行', icon: Activity },
  { href: '/ops/candidates', label: '候选证据', icon: DatabaseZap },
  { href: '/ops/reviews', label: '待审核证据', icon: ClipboardCheck },
  { href: '/ops/releases', label: '发布记录', icon: FileCheck2 },
  { href: '/ops/agents', label: '智能体', icon: Bot },
  { href: '/ops/skills', label: '技能', icon: Sparkles },
  { href: '/ops/workflows', label: '工作流', icon: GitBranch },
  { href: '/ops/workflow-runs', label: '工作流运行', icon: Layers3 },
  { href: '/ops/question-runs', label: '问答运行', icon: ShieldCheck },
] as const;

const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function OpsShell({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef(false);
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientHydrated,
    serverHydrated
  );

  function closeMobileNavigation(returnFocus = true) {
    if (returnFocus) returnFocusRef.current = true;
    setOpen(false);
  }

  useEffect(() => {
    if (!open && returnFocusRef.current) {
      returnFocusRef.current = false;
      menuButtonRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const aside = asideRef.current;
    const focusable = () =>
      Array.from(
        aside?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    focusable()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileNavigation();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [open]);

  return (
    <div className="min-h-dvh bg-accent/45 text-foreground selection:bg-primary/20 selection:text-foreground">
      <a
        href="#ops-content"
        className="fixed top-2 left-2 z-[90] -translate-y-24 rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background focus:translate-y-0"
      >
        跳到主要内容
      </a>
      <header className="sticky top-0 z-50 flex min-h-16 items-center border-b border-border bg-background/82 px-4 backdrop-blur-xl lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-11 place-items-center rounded-lg text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="打开运营导航"
          aria-expanded={open}
        >
          <Menu aria-hidden size={20} />
        </button>
        <Link href={`/${locale}/ops`} className="ml-3 font-semibold">
          Evidex 运营中心
        </Link>
      </header>
      <aside
        ref={asideRef}
        aria-label="运营中心侧栏"
        className={`fixed inset-y-0 left-0 z-[70] w-[17rem] border-r border-border bg-background/94 p-4 backdrop-blur-xl transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex min-h-12 items-center justify-between">
          <Link
            href={`/${locale}/ops`}
            className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck aria-hidden size={18} />
            </span>
            <span className="font-semibold tracking-[-0.02em]">
              Evidex 运营中心
            </span>
          </Link>
          <button
            type="button"
            onClick={() => closeMobileNavigation()}
            className="grid size-11 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label="关闭运营导航"
          >
            <X aria-hidden size={18} />
          </button>
        </div>
        <nav aria-label="运营导航" className="mt-7 grid gap-1 overflow-y-auto pb-24">
          {opsNav.map((item) => {
            const Icon = item.icon;
            const localizedHref = `/${locale}${item.href}`;
            const active =
              hydrated &&
              (item.href === '/ops'
                ? pathname === localizedHref || pathname === `${localizedHref}/`
                : pathname === localizedHref ||
                  pathname.startsWith(`${localizedHref}/`));
            return (
              <Link
                key={item.href}
                href={localizedHref}
                aria-current={active ? 'page' : undefined}
                onClick={() => closeMobileNavigation(false)}
                className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? 'bg-primary/12 text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <Icon
                  aria-hidden
                  size={17}
                  className={
                    active
                      ? 'text-primary'
                      : 'text-muted-foreground group-hover:text-primary'
                  }
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute right-4 bottom-4 left-4 border-t border-border pt-4">
          <Link
            href={`/${locale}/knowledge`}
            className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            查看公开知识库 <ArrowRight aria-hidden size={14} />
          </Link>
        </div>
      </aside>
      {open ? (
        <button
          type="button"
          aria-label="关闭导航遮罩"
          onClick={() => closeMobileNavigation()}
          className="fixed inset-0 z-[60] bg-foreground/30 lg:hidden"
        />
      ) : null}
      <main id="ops-content" className="min-h-dvh lg:pl-[17rem]">
        {children}
      </main>
    </div>
  );
}
