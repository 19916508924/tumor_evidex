'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Braces,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Dna,
  FileCheck2,
  FlaskConical,
  LoaderCircle,
  Pill,
  RefreshCw,
  Search,
} from 'lucide-react';

import type {
  KnowledgeEntityDetail as KnowledgeEntityDetailData,
  KnowledgeEntityListItem,
  PublicReleaseReference,
} from '@/shared/types/evidence-platform-api';

import { isAbortError, requestProductData } from './client';

type EntityRoute = 'diseases' | 'genes' | 'variants' | 'drugs';
type EntityType = 'disease' | 'gene' | 'variant' | 'drug';

interface KnowledgeSummaryData {
  release: PublicReleaseReference;
  counts: {
    diseases: number;
    genes: number;
    variants: number;
    drugs: number;
    associations: number;
    claims: number;
    sources: number;
  };
  recentReleases: PublicReleaseReference[];
}

interface KnowledgeListData {
  release: PublicReleaseReference;
  items: KnowledgeEntityListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const entityConfig = {
  diseases: {
    singular: '疾病',
    title: '疾病目录',
    description: '从疾病出发，查看相关基因、变异、药物与已审核证据。',
    type: 'disease' as const,
    icon: FlaskConical,
  },
  genes: {
    singular: '基因',
    title: '基因目录',
    description: '按基因浏览已发布的变异关联与治疗证据。',
    type: 'gene' as const,
    icon: Braces,
  },
  variants: {
    singular: '变异',
    title: '变异目录',
    description: '定位具体变异，继续核验适用疾病、药物与证据声明。',
    type: 'variant' as const,
    icon: Dna,
  },
  drugs: {
    singular: '药物',
    title: '药物目录',
    description: '从药物进入已审核的适应证、证据方向与研究来源。',
    type: 'drug' as const,
    icon: Pill,
  },
};

function formatDate(value?: string | null) {
  if (!value) return '暂未提供';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function directionLabel(value: string) {
  const labels: Record<string, string> = {
    SENSITIVITY: '敏感',
    RESISTANCE: '耐药',
    NEUTRAL: '中性',
  };
  return labels[value] ?? value;
}

function SurfaceError({ retry }: { retry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl bg-[#FFF7ED] p-5 text-[#7C2D12] shadow-[0_12px_35px_rgba(124,45,18,0.08)]"
    >
      <div className="flex gap-3">
        <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={20} />
        <div>
          <p className="font-semibold">暂时无法读取已发布内容</p>
          <p className="mt-1 text-sm leading-6">
            请稍后重试，已输入的内容不会丢失。
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#7C2D12] px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-[#7C2D12] focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <RefreshCw aria-hidden size={15} /> 重新加载
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingPanel({ label = '正在读取已发布内容' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl bg-white/70 text-sm font-medium text-[#52637A]">
      <LoaderCircle aria-hidden className="mr-2 animate-spin" size={18} />
      {label}
    </div>
  );
}

export function KnowledgeHome({ locale }: { locale: string }) {
  const [data, setData] = useState<KnowledgeSummaryData | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KnowledgeEntityListItem[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    requestProductData<KnowledgeSummaryData>('/api/v1/knowledge/summary', {
      signal: controller.signal,
    })
      .then(setData)
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      });
    return () => controller.abort();
  }, [reloadKey]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const response = await requestProductData<KnowledgeListData>(
        `/api/v1/knowledge/search?q=${encodeURIComponent(query.trim())}&page=1&pageSize=8`
      );
      setResults(response.items);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  const entries = (Object.keys(entityConfig) as EntityRoute[]).map((key) => ({
    key,
    ...entityConfig[key],
    count: data?.counts[key] ?? null,
  }));

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-40 right-[-12rem] size-[34rem] rounded-full bg-[#D8E8FF]/80 blur-3xl"
      />
      <section className="relative mx-auto max-w-[90rem] px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.18fr)_minmax(18rem,0.82fr)] lg:gap-16">
          <div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.7rem] lg:leading-[1.05]">
              从一个问题，抵达可核验的证据
            </h1>
            <p className="mt-6 max-w-[68ch] text-base leading-8 text-[#52637A] sm:text-lg">
              搜索疾病、基因、变异或药物，沿关联关系查看已审核结论、适用范围和原始来源。
            </p>
            <form onSubmit={search} className="mt-8 max-w-3xl">
              <label htmlFor="knowledge-search" className="sr-only">
                搜索知识库
              </label>
              <div className="flex items-center gap-2 rounded-2xl bg-white/78 p-2 shadow-[0_18px_50px_rgba(20,70,140,0.11)] backdrop-blur-xl">
                <Search
                  aria-hidden
                  className="ml-3 shrink-0 text-[#175CD3]"
                  size={20}
                />
                <input
                  id="knowledge-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="例如：EGFR L858R、非小细胞肺癌、奥希替尼"
                  className="min-h-12 min-w-0 flex-1 border-0 bg-transparent px-2 text-base text-[#0B1F3A] placeholder:text-[#60748D] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-inset"
                />
                <button
                  type="submit"
                  disabled={!query.trim() || searching}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#175CD3] px-5 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(23,92,211,0.2)] transition hover:bg-[#134EAE] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {searching ? (
                    <LoaderCircle
                      aria-hidden
                      className="animate-spin"
                      size={17}
                    />
                  ) : null}
                  搜索
                </button>
              </div>
            </form>
            {results.length > 0 ? (
              <div className="mt-4 grid max-w-3xl gap-2 rounded-2xl bg-white/88 p-3 shadow-[0_16px_45px_rgba(20,70,140,0.1)] backdrop-blur-xl">
                {results.map((item) => {
                  const route = `${item.type}s` as EntityRoute;
                  return (
                    <Link
                      key={item.id}
                      href={`/${locale}/knowledge/${route}/${item.id}`}
                      className="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-[#EAF2FF]"
                    >
                      <span>
                        <span className="font-semibold">
                          {item.displayNameZh}
                        </span>
                        <span className="ml-2 text-sm text-[#52637A]">
                          {item.displayNameEn}
                        </span>
                      </span>
                      <ArrowRight
                        aria-hidden
                        size={17}
                        className="text-[#175CD3]"
                      />
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl bg-[#0B3975] p-6 text-white shadow-[0_22px_60px_rgba(11,57,117,0.2)] sm:p-7">
            <FileCheck2
              aria-hidden
              size={30}
              className="text-[#A8CCFF]"
              strokeWidth={1.6}
            />
            <p className="mt-8 text-2xl font-semibold tracking-[-0.025em]">
              只展示已审核发布的内容
            </p>
            <p className="mt-3 text-sm leading-7 text-[#D6E6FB]">
              每条结论都保留证据等级、适用范围、局限性与来源路径。原文展示遵循来源许可。
            </p>
            {data ? (
              <div className="mt-8 border-t border-white/20 pt-6">
                <p className="text-2xl font-semibold tabular-nums">
                  {data.counts.claims} 条已审核证据声明
                </p>
                <p className="mt-5 flex items-center gap-2 text-xs text-[#C4DCF8]">
                  <CalendarDays aria-hidden size={15} /> 文献收录截至{' '}
                  {formatDate(data.release.literatureCutoffAt)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        {error ? (
          <SurfaceError
            retry={() => {
              setError(false);
              setData(null);
              setReloadKey((value) => value + 1);
            }}
          />
        ) : null}
        {!data && !error ? <LoadingPanel /> : null}
        {data ? (
          <>
            <div className="grid border-y border-[#BFD1E7] sm:grid-cols-2 xl:grid-cols-4">
              {entries.map((entry, index) => {
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.key}
                    href={`/${locale}/knowledge/${entry.key}`}
                    aria-label={`${entry.singular}目录`}
                    className={`group min-h-48 p-6 transition hover:bg-white/72 focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none focus-visible:ring-inset sm:p-7 ${index % 2 === 0 ? 'sm:border-r sm:border-[#BFD1E7]' : ''} ${index < 2 ? 'border-b border-[#BFD1E7] xl:border-b-0' : ''} ${index !== 3 ? 'xl:border-r xl:border-[#BFD1E7]' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <Icon
                        aria-hidden
                        size={27}
                        strokeWidth={1.6}
                        className="text-[#175CD3]"
                      />
                      <span className="text-sm font-semibold text-[#52637A] tabular-nums">
                        {entry.count}
                      </span>
                    </div>
                    <h2 className="mt-10 text-2xl font-semibold tracking-[-0.025em]">
                      {entry.singular}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#52637A]">
                      {entry.description}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#175CD3]">
                      浏览目录{' '}
                      <ArrowRight
                        aria-hidden
                        size={16}
                        className="transition group-hover:translate-x-1"
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl bg-white/70 p-6 backdrop-blur-xl sm:p-7">
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                  当前收录范围
                </h2>
                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
                  <div>
                    <dt className="text-[#52637A]">关联关系</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {data.counts.associations}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52637A]">来源</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {data.counts.sources}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52637A]">文献收录截至</dt>
                    <dd className="mt-1 font-semibold">
                      {formatDate(data.release.literatureCutoffAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52637A]">监管记录截至</dt>
                    <dd className="mt-1 font-semibold">
                      {formatDate(data.release.regulatoryCutoffAt)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-2xl bg-[#EAF2FF] p-6 sm:p-7">
                <BookOpenText
                  aria-hidden
                  size={26}
                  className="text-[#175CD3]"
                />
                <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">
                  如何理解这些内容
                </h2>
                <p className="mt-3 max-w-[65ch] text-sm leading-7 text-[#52637A]">
                  证据等级用于表达资料成熟度和匹配程度，不替代临床判断。点击任一结论，可继续查看支持段落与原始来源。
                </p>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

export function KnowledgeList({
  locale,
  type,
  initialSearchParams,
}: {
  locale: string;
  type: EntityRoute;
  initialSearchParams?: Record<string, string | string[] | undefined>;
}) {
  const config = entityConfig[type];
  const initialState = readKnowledgeListState(initialSearchParams);
  const [query, setQuery] = useState(initialState.query);
  const [submittedQuery, setSubmittedQuery] = useState(initialState.query);
  const [page, setPage] = useState(initialState.page);
  const [filters, setFilters] = useState(initialState.filters);
  const [filterOptions, setFilterOptions] = useState<{
    diseases: KnowledgeEntityListItem[];
    genes: KnowledgeEntityListItem[];
  }>({ diseases: [], genes: [] });
  const [data, setData] = useState<KnowledgeListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      requestProductData<KnowledgeListData>(
        '/api/v1/knowledge/diseases?q=&page=1&pageSize=100',
        { signal: controller.signal }
      ),
      requestProductData<KnowledgeListData>(
        '/api/v1/knowledge/genes?q=&page=1&pageSize=100',
        { signal: controller.signal }
      ),
    ])
      .then(([diseases, genes]) =>
        setFilterOptions({ diseases: diseases.items, genes: genes.items })
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = knowledgeListParameters(submittedQuery, filters, page);
    const url = `/api/v1/knowledge/${type}?${parameters.toString()}`;
    requestProductData<KnowledgeListData>(url, { signal: controller.signal })
      .then(setData)
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [filters, page, reloadKey, submittedQuery, type]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(false);
    setPage(1);
    const nextQuery = query.trim();
    setSubmittedQuery(nextQuery);
    syncKnowledgeListUrl(nextQuery, filters, 1);
  }

  function updateFilter(key: keyof typeof filters, value: string) {
    const next = { ...filters, [key]: value };
    setLoading(true);
    setError(false);
    setFilters(next);
    setPage(1);
    syncKnowledgeListUrl(submittedQuery, next, 1);
  }

  function changePage(nextPage: number) {
    setLoading(true);
    setError(false);
    setPage(nextPage);
    syncKnowledgeListUrl(submittedQuery, filters, nextPage);
  }

  const Icon = config.icon;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <section className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <Link
        href={`/${locale}/knowledge`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#175CD3] hover:underline hover:underline-offset-4"
      >
        <ArrowLeft aria-hidden size={16} /> 返回知识库
      </Link>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-14">
        <div>
          <Icon
            aria-hidden
            size={32}
            strokeWidth={1.6}
            className="text-[#175CD3]"
          />
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
            {config.title}
          </h1>
          <p className="mt-4 max-w-[54ch] leading-7 text-[#52637A]">
            {config.description}
          </p>
        </div>
        <div>
          <form
            onSubmit={submit}
            className="rounded-2xl bg-white/75 p-2 shadow-[0_16px_45px_rgba(20,70,140,0.09)] backdrop-blur-xl"
          >
            <div className="flex gap-2">
              <label htmlFor={`${type}-search`} className="sr-only">
                搜索{config.singular}
              </label>
              <input
                id={`${type}-search`}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`按名称或别名搜索${config.singular}`}
                className="min-h-12 min-w-0 flex-1 border-0 bg-transparent px-4 text-base text-[#0B1F3A] placeholder:text-[#60748D] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-inset"
              />
              <button
                type="submit"
                className="min-h-12 rounded-xl bg-[#175CD3] px-5 text-sm font-semibold text-white hover:bg-[#134EAE]"
              >
                搜索
              </button>
            </div>
          </form>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              label="按疾病筛选"
              value={filters.diseaseId}
              onChange={(value) => updateFilter('diseaseId', value)}
              options={filterOptions.diseases.map((item) => ({
                value: item.id,
                label: item.displayNameZh || item.canonicalName,
              }))}
              emptyLabel="全部疾病"
            />
            <FilterSelect
              label="按基因筛选"
              value={filters.geneId}
              onChange={(value) => updateFilter('geneId', value)}
              options={filterOptions.genes.map((item) => ({
                value: item.id,
                label: item.displayNameZh || item.canonicalName,
              }))}
              emptyLabel="全部基因"
            />
            <FilterSelect
              label="按证据方向筛选"
              value={filters.direction}
              onChange={(value) => updateFilter('direction', value)}
              options={[
                { value: 'SENSITIVITY', label: '敏感性' },
                { value: 'RESISTANCE', label: '耐药性' },
                { value: 'EXPLORATORY', label: '探索性' },
              ]}
              emptyLabel="全部方向"
            />
            <FilterSelect
              label="按证据等级筛选"
              value={filters.level}
              onChange={(value) => updateFilter('level', value)}
              options={['1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED'].map(
                (value) => ({
                  value,
                  label: value === 'UNRATED' ? '暂未评级' : `等级 ${value}`,
                })
              )}
              emptyLabel="全部等级"
            />
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                const cleared = {
                  diseaseId: '',
                  geneId: '',
                  direction: '',
                  level: '',
                };
                setLoading(true);
                setError(false);
                setFilters(cleared);
                setPage(1);
                syncKnowledgeListUrl(submittedQuery, cleared, 1);
              }}
              className="mt-3 text-xs font-semibold text-[#175CD3] hover:underline"
            >
              清除筛选
            </button>
          ) : null}
          <div className="mt-6" aria-live="polite">
            {loading ? (
              <LoadingPanel label={`正在读取${config.singular}目录`} />
            ) : null}
            {error ? (
              <SurfaceError
                retry={() => {
                  setLoading(true);
                  setError(false);
                  setReloadKey((value) => value + 1);
                }}
              />
            ) : null}
            {!loading && !error && data?.items.length === 0 ? (
              <div className="rounded-2xl bg-white/65 px-6 py-14 text-center">
                <Search
                  aria-hidden
                  className="mx-auto text-[#7FA7DA]"
                  size={28}
                />
                <p className="mt-4 text-lg font-semibold">
                  {hasFilters && !submittedQuery
                    ? `当前收录范围内暂无${config.singular}`
                    : `没有找到匹配的${config.singular}`}
                </p>
                <p className="mt-2 text-sm text-[#52637A]">
                  可以尝试英文名称、常用缩写或更短的关键词。
                </p>
              </div>
            ) : null}
            {!loading && !error && data?.items.length ? (
              <div className="divide-y divide-[#C8D9EE] border-y border-[#BFD1E7]">
                {data.items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/${locale}/knowledge/${type}/${item.id}`}
                    className="group flex items-center justify-between gap-5 px-2 py-6 transition hover:bg-white/60 sm:px-4"
                  >
                    <span>
                      <span className="block text-xl font-semibold tracking-[-0.02em]">
                        {item.displayNameZh}
                      </span>
                      <span className="mt-1 block text-sm text-[#52637A]">
                        {item.displayNameEn || item.canonicalName}
                      </span>
                      {item.aliases.length ? (
                        <span className="mt-2 block text-xs text-[#60748D]">
                          别名：{item.aliases.join('、')}
                        </span>
                      ) : null}
                    </span>
                    <ArrowRight
                      aria-hidden
                      className="shrink-0 text-[#175CD3] transition group-hover:translate-x-1"
                      size={18}
                    />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          {data && data.pagination.totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => changePage(page - 1)}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold text-[#0B3975] disabled:opacity-40"
              >
                <ChevronLeft aria-hidden size={16} /> 上一页
              </button>
              <span className="text-[#52637A]">
                第 {page} / {data.pagination.totalPages} 页
              </span>
              <button
                type="button"
                disabled={page >= data.pagination.totalPages}
                onClick={() => changePage(page + 1)}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold text-[#0B3975] disabled:opacity-40"
              >
                下一页 <ChevronRight aria-hidden size={16} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function readKnowledgeListState(
  parameters?: Record<string, string | string[] | undefined>
) {
  const value = (key: string) => {
    const entry = parameters?.[key];
    return (Array.isArray(entry) ? entry[0] : entry)?.trim() || '';
  };
  const requestedPage = Number(value('page') || '1');
  return {
    query: value('q'),
    page:
      Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    filters: {
      diseaseId: value('diseaseId'),
      geneId: value('geneId'),
      direction: value('direction'),
      level: value('level'),
    },
  };
}

function knowledgeListParameters(
  query: string,
  filters: {
    diseaseId: string;
    geneId: string;
    direction: string;
    level: string;
  },
  page: number
) {
  const parameters = new URLSearchParams();
  parameters.set('q', query);
  if (filters.diseaseId) parameters.set('diseaseId', filters.diseaseId);
  if (filters.geneId) parameters.set('geneId', filters.geneId);
  if (filters.direction) parameters.set('direction', filters.direction);
  if (filters.level) parameters.set('level', filters.level);
  parameters.set('page', String(page));
  parameters.set('pageSize', '20');
  return parameters;
}

function syncKnowledgeListUrl(
  query: string,
  filters: {
    diseaseId: string;
    geneId: string;
    direction: string;
    level: string;
  },
  page: number
) {
  const url = new URL(window.location.href);
  for (const key of [
    'q',
    'diseaseId',
    'geneId',
    'direction',
    'level',
    'page',
  ]) {
    url.searchParams.delete(key);
  }
  const parameters = knowledgeListParameters(query, filters, page);
  parameters.delete('pageSize');
  for (const [key, value] of parameters) {
    if (value) url.searchParams.set(key, value);
  }
  window.history.replaceState({}, '', url);
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  emptyLabel: string;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-[#B4CAE6] bg-white/76 px-3 text-sm font-semibold text-[#334A67] focus-visible:border-[#175CD3] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
      >
        <option value="">{emptyLabel}</option>
        {value && !options.some((option) => option.value === value) ? (
          <option value={value}>已选择，正在读取名称</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function KnowledgeEntityDetail({
  locale,
  type,
  id,
}: {
  locale: string;
  type: EntityRoute;
  id: string;
}) {
  const [data, setData] = useState<KnowledgeEntityDetailData | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const config = entityConfig[type];

  useEffect(() => {
    const controller = new AbortController();
    requestProductData<KnowledgeEntityDetailData>(
      `/api/v1/knowledge/${type}/${encodeURIComponent(id)}`,
      { signal: controller.signal }
    )
      .then(setData)
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      });
    return () => controller.abort();
  }, [id, reloadKey, type]);

  if (error)
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <SurfaceError
          retry={() => {
            setError(false);
            setReloadKey((value) => value + 1);
          }}
        />
      </div>
    );
  if (!data)
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <LoadingPanel />
      </div>
    );

  const title = data.entity.displayNameZh || data.entity.canonicalName;
  return (
    <article className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Link
        href={`/${locale}/knowledge/${type}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#175CD3] hover:underline hover:underline-offset-4"
      >
        <ArrowLeft aria-hidden size={16} /> 返回{config.title}
      </Link>
      <header className="mt-8 border-b border-[#BFD1E7] pb-10">
        <h1 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
          {title}
        </h1>
        {data.entity.displayNameEn ? (
          <p className="mt-3 text-lg text-[#52637A]">
            {data.entity.displayNameEn}
          </p>
        ) : null}
        {data.entity.aliases.length ? (
          <p className="mt-4 text-sm text-[#60748D]">
            别名：{data.entity.aliases.join('、')}
          </p>
        ) : null}
      </header>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">
            关联证据
          </h2>
          {data.associations.length ? (
            <div className="mt-5 divide-y divide-[#C8D9EE] border-y border-[#BFD1E7]">
              {data.associations.map((association) => (
                <div key={association.id} className="py-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#DDEBFF] px-3 py-1 text-xs font-semibold text-[#0B4DA2]">
                      证据等级 {association.approvedLevel}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#334A67]">
                      {directionLabel(association.direction)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">
                    {association.disease.displayNameZh} ·{' '}
                    {association.gene.symbol} ·{' '}
                    {association.variant.hgvsp ??
                      association.variant.canonicalKey}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[#52637A]">
                    该关联已通过人工审核，证据方向为
                    {directionLabel(association.direction)}，等级为
                    {association.approvedLevel}，共收录 {association.claimCount}{' '}
                    条证据声明。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm font-medium text-[#0B3975]">
                    {association.drugs.map((drug) => (
                      <span
                        key={drug.id}
                        className="rounded-lg bg-[#EAF2FF] px-3 py-2"
                      >
                        {drug.displayNameZh || drug.displayNameEn}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-white/65 p-6 text-[#52637A]">
              当前已发布内容中暂无关联证据。
            </p>
          )}
        </section>
        <aside className="rounded-2xl bg-white/68 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-semibold">相关知识</h2>
          <div className="mt-5 grid gap-5">
            {(
              Object.entries(data.related) as [
                EntityRoute,
                KnowledgeEntityListItem[],
              ][]
            ).map(([route, items]) =>
              items.length ? (
                <div key={route}>
                  <p className="text-xs font-semibold text-[#60748D]">
                    {entityConfig[route].title}
                  </p>
                  <div className="mt-2 grid gap-1">
                    {items.slice(0, 6).map((item) => (
                      <Link
                        key={item.id}
                        href={`/${locale}/knowledge/${route}/${item.id}`}
                        className="rounded-lg py-2 text-sm font-semibold text-[#0B3975] hover:text-[#175CD3]"
                      >
                        {item.displayNameZh || item.canonicalName}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
          <p className="mt-7 border-t border-[#C8D9EE] pt-5 text-xs leading-6 text-[#60748D]">
            发布于 {formatDate(data.release.publishedAt)}
            。内容范围以页面所示时间为准。
          </p>
        </aside>
      </div>
    </article>
  );
}
