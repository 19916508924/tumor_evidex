'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

import type { PageResult } from '@/shared/types/evidence-platform-api';

import { isAbortError, requestProductData } from './client';

interface ReviewQueueItem {
  id: string;
  status: string;
  title: string;
  pmid: string;
  proposedLevel: string;
  hasBlockingIssues: boolean;
  risk?: 'LOW' | 'MEDIUM' | 'HIGH';
  waitingHours?: number;
  disease?: { id: string; name: string };
  gene?: { id: string; symbol: string };
  variant?: { id: string; hgvsp: string };
  assignedTo?: string | null;
  createdAt: string;
}

interface ReviewFilters {
  q: string;
  status: string;
  waitingAge: string;
  diseaseId: string;
  geneId: string;
  variantId: string;
  risk: string;
  blocking: string;
}

const defaultFilters: ReviewFilters = {
  q: '',
  status: 'READY_FOR_REVIEW',
  waitingAge: '',
  diseaseId: '',
  geneId: '',
  variantId: '',
  risk: '',
  blocking: '',
};

const emptyFilters: ReviewFilters = {
  q: '',
  status: '',
  waitingAge: '',
  diseaseId: '',
  geneId: '',
  variantId: '',
  risk: '',
  blocking: '',
};

const subscribeLocation = () => () => {};
const clientLocation = () => window.location.search;
const serverLocation = () => '';
const clientHydrated = () => true;
const serverHydrated = () => false;

export function ReviewQueuePage({ locale }: { locale: string }) {
  const [data, setData] = useState<PageResult<ReviewQueueItem> | null>(null);
  const locationSearch = useSyncExternalStore(
    subscribeLocation,
    clientLocation,
    serverLocation
  );
  const hydrated = useSyncExternalStore(
    subscribeLocation,
    clientHydrated,
    serverHydrated
  );
  const urlState = useMemo(
    () => readReviewUrlState(locationSearch),
    [locationSearch]
  );
  const [filtersOverride, setFiltersOverride] =
    useState<ReviewFilters | null>(null);
  const [appliedOverride, setAppliedOverride] =
    useState<ReviewFilters | null>(null);
  const [pageOverride, setPageOverride] = useState<number | null>(null);
  const filters = filtersOverride ?? urlState.filters;
  const appliedFilters = appliedOverride ?? urlState.filters;
  const page = pageOverride ?? urlState.page;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const endpoint = useMemo(() => {
    const parameters = reviewSearchParameters(appliedFilters, page);
    return `/api/internal/v1/review-tasks?${parameters.toString()}`;
  }, [appliedFilters, page]);

  useEffect(() => {
    if (!hydrated || (!appliedOverride && pageOverride === null)) return;
    const parameters = reviewSearchParameters(appliedFilters, page, false);
    const query = parameters.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [appliedFilters, appliedOverride, hydrated, page, pageOverride]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    requestProductData<PageResult<ReviewQueueItem>>(endpoint, {
      signal: controller.signal,
    })
      .then((value) => {
        setData(value);
        setError(false);
      })
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, hydrated, reloadKey]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setPageOverride(1);
    setAppliedOverride(normalizeFilters(filters));
  }

  function clearFilters() {
    setLoading(true);
    setFiltersOverride(emptyFilters);
    setAppliedOverride(emptyFilters);
    setPageOverride(1);
  }

  return (
    <section className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="grid gap-5 border-b border-border pb-7 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <ClipboardCheck
            aria-hidden
            className="text-primary"
            size={28}
            strokeWidth={1.7}
          />
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            待审核证据
          </h1>
          <p className="mt-3 max-w-[70ch] text-sm leading-7 text-muted-foreground">
            从候选原文、结构化草稿和质量检查中完成医学判断。只有审核并发布后的证据才会进入公开知识。
          </p>
        </div>
        <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
          {data ? `共 ${data.pagination.total} 项` : '正在统计'}
        </p>
      </header>

      <form
        onSubmit={submit}
        className="mt-6 rounded-2xl border border-border bg-card/75 p-4 backdrop-blur-xl"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="md:col-span-2 xl:col-span-2">
            <span className="text-xs font-semibold text-muted-foreground">
              搜索审核任务
            </span>
            <span className="relative mt-2 block">
              <Search
                aria-hidden
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                size={17}
              />
              <input
                type="search"
                value={filters.q}
                onChange={(event) =>
                  setFiltersOverride((current) => ({
                    ...(current ?? filters),
                    q: event.target.value,
                  }))
                }
                placeholder="文献标题、PMID 或任务标识"
                className="min-h-11 w-full rounded-xl border border-input bg-background pr-3 pl-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </span>
          </label>
          <FilterSelect
            label="审核状态"
            value={filters.status}
            onChange={(status) =>
              setFiltersOverride((current) => ({
                ...(current ?? filters),
                status,
              }))
            }
            options={[
              ['', '全部状态'],
              ['READY_FOR_REVIEW', '等待审核'],
              ['IN_REVIEW', '审核中'],
              ['REQUESTED_CHANGES', '已退回修改'],
              ['PUBLISH_FAILED', '发布失败'],
              ['PUBLISHED', '已发布'],
              ['REJECTED', '已拒绝'],
            ]}
          />
          <FilterSelect
            label="等待时长"
            value={filters.waitingAge}
            onChange={(waitingAge) =>
              setFiltersOverride((current) => ({
                ...(current ?? filters),
                waitingAge,
              }))
            }
            options={[
              ['', '不限'],
              ['24h', '超过 24 小时'],
              ['72h', '超过 72 小时'],
              ['7d', '超过 7 天'],
            ]}
          />
          <FilterInput
            label="疾病"
            value={filters.diseaseId}
            placeholder="疾病标识"
            onChange={(diseaseId) =>
              setFiltersOverride((current) => ({
                ...(current ?? filters),
                diseaseId,
              }))
            }
          />
          <FilterInput
            label="基因"
            value={filters.geneId}
            placeholder="基因标识"
            onChange={(geneId) =>
              setFiltersOverride((current) => ({
                ...(current ?? filters),
                geneId,
              }))
            }
          />
          <FilterInput
            label="变异"
            value={filters.variantId}
            placeholder="变异标识"
            onChange={(variantId) =>
              setFiltersOverride((current) => ({
                ...(current ?? filters),
                variantId,
              }))
            }
          />
          <FilterSelect
            label="风险等级"
            value={filters.risk}
            onChange={(risk) =>
              setFiltersOverride((current) => ({
                ...(current ?? filters),
                risk,
              }))
            }
            options={[
              ['', '不限'],
              ['HIGH', '高风险'],
              ['MEDIUM', '中风险'],
              ['LOW', '低风险'],
            ]}
          />
          <FilterSelect
            label="阻断问题"
            value={filters.blocking}
            onChange={(blocking) =>
              setFiltersOverride((current) => ({
                ...(current ?? filters),
                blocking,
              }))
            }
            options={[
              ['', '不限'],
              ['true', '仅看有阻断问题'],
              ['false', '仅看无阻断问题'],
            ]}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden size={16} /> 清空筛选
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            应用筛选
          </button>
        </div>
      </form>

      {loading || !hydrated ? <ReviewQueueSkeleton /> : null}
      {error && !loading ? (
        <div role="alert" className="mt-6 rounded-2xl bg-destructive/10 p-5 text-destructive">
          <p className="font-semibold">审核队列暂时无法读取</p>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw aria-hidden size={16} /> 重新加载
          </button>
        </div>
      ) : null}
      {!loading && !error && data?.items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-card/70 px-6 py-16 text-center">
          <CheckCircle2 aria-hidden className="mx-auto text-emerald-600" size={30} />
          <p className="mt-4 text-lg font-semibold">当前筛选下没有审核任务</p>
          <p className="mt-2 text-sm text-muted-foreground">
            可以调整筛选条件，也可以稍后再回来。
          </p>
        </div>
      ) : null}
      {!loading && !error && data?.items.length ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card/75 backdrop-blur-xl">
          <div className="divide-y divide-border">
            {data.items.map((item) => (
              <article
                key={item.id}
                className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ReviewStatus value={item.status} />
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      建议等级 {item.proposedLevel}
                    </span>
                    {item.risk ? <RiskBadge value={item.risk} /> : null}
                    {item.hasBlockingIssues ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                        <AlertTriangle aria-hidden size={13} /> 有阻断问题
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 line-clamp-2 text-lg leading-7 font-semibold" lang="en">
                    {item.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    PMID {item.pmid} · 进入队列 {formatDate(item.createdAt)}
                    {typeof item.waitingHours === 'number'
                      ? ` · 已等待 ${formatWaitingTime(item.waitingHours)}`
                      : ''}
                  </p>
                  {item.disease || item.gene || item.variant ? (
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {[
                        item.disease?.name,
                        item.gene?.symbol,
                        item.variant?.hgvsp,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/${locale}/ops/reviews/${item.id}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  开始审核 <ArrowRight aria-hidden size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {data && data.pagination.totalPages > 1 ? (
        <nav className="mt-5 flex items-center justify-between text-sm" aria-label="审核队列分页">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => {
              setLoading(true);
              setPageOverride(page - 1);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft aria-hidden size={16} /> 上一页
          </button>
          <span className="text-muted-foreground">
            第 {page} / {data.pagination.totalPages} 页
          </span>
          <button
            type="button"
            disabled={page >= data.pagination.totalPages}
            onClick={() => {
              setLoading(true);
              setPageOverride(page + 1);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一页 <ChevronRight aria-hidden size={16} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

function readReviewUrlState(search: string) {
  const parameters = new URLSearchParams(search);
  const requestedPage = Number(parameters.get('page') ?? '1');
  return {
    filters: {
      q: parameters.get('q') ?? '',
      status: parameters.has('status')
        ? (parameters.get('status') ?? '')
        : defaultFilters.status,
      waitingAge: parameters.get('waitingAge') ?? '',
      diseaseId: parameters.get('diseaseId') ?? '',
      geneId: parameters.get('geneId') ?? '',
      variantId: parameters.get('variantId') ?? '',
      risk: parameters.get('risk') ?? '',
      blocking: parameters.get('blocking') ?? '',
    } satisfies ReviewFilters,
    page:
      Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

function reviewSearchParameters(
  filters: ReviewFilters,
  page: number,
  includeDefaults = true
) {
  const parameters = new URLSearchParams();
  if (includeDefaults || page > 1) parameters.set('page', String(page));
  if (includeDefaults) parameters.set('pageSize', '20');
  for (const key of Object.keys(filters) as Array<keyof ReviewFilters>) {
    if (filters[key]) parameters.set(key, filters[key]);
  }
  return parameters;
}

function normalizeFilters(filters: ReviewFilters) {
  return Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [key, value.trim()])
  ) as unknown as ReviewFilters;
}

function FilterInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || 'all'} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReviewQueueSkeleton() {
  return (
    <div className="mt-6 grid gap-3" role="status" aria-label="正在读取审核队列">
      <span className="sr-only">正在读取审核队列</span>
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-32 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}

function RiskBadge({ value }: { value: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const label = { LOW: '低风险', MEDIUM: '中风险', HIGH: '高风险' }[value];
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        value === 'HIGH'
          ? 'bg-destructive/10 text-destructive'
          : value === 'MEDIUM'
            ? 'bg-amber-100 text-amber-900'
            : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {label}
    </span>
  );
}

function ReviewStatus({ value }: { value: string }) {
  const label =
    (
      {
        READY_FOR_REVIEW: '等待审核',
        IN_REVIEW: '审核中',
        REQUESTED_CHANGES: '已退回修改',
        PUBLISH_FAILED: '发布失败',
        PUBLISHED: '已发布',
        REJECTED: '已拒绝',
      } as Record<string, string>
    )[value] ?? value;
  const danger = /FAILED|REJECTED/.test(value);
  const success = value === 'PUBLISHED';
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        danger
          ? 'bg-destructive/10 text-destructive'
          : success
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-amber-100 text-amber-900'
      }`}
    >
      {label}
    </span>
  );
}

function formatWaitingTime(hours: number) {
  return hours >= 24 ? `${Math.floor(hours / 24)} 天` : `${hours} 小时`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
