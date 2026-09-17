'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  DatabaseZap,
  FileCheck2,
  FileSearch,
  GitBranch,
  History,
  Layers3,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import type { OpsDashboardDto } from '@/shared/types/evidence-platform-api';

import {
  isAbortError,
  ProductRequestError,
  requestProductData,
} from './client';

export type OpsResource =
  | 'discovery-strategies'
  | 'discovery-runs'
  | 'candidates'
  | 'releases'
  | 'agents'
  | 'skills'
  | 'workflows'
  | 'workflow-runs'
  | 'question-runs';

interface PageResult {
  items: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const resourceConfig: Record<
  OpsResource,
  {
    title: string;
    description: string;
    singular: string;
    icon: typeof Activity;
    endpoint: string;
    detail: boolean;
  }
> = {
  'discovery-strategies': {
    title: '发现策略',
    description: '管理检索范围、时间窗和运行节奏。',
    singular: '策略',
    icon: FileSearch,
    endpoint: '/api/internal/v1/discovery-strategies',
    detail: false,
  },
  'discovery-runs': {
    title: '发现运行',
    description: '追踪每次发现任务的进度、结果与异常。',
    singular: '运行',
    icon: Activity,
    endpoint: '/api/internal/v1/discovery-runs',
    detail: true,
  },
  candidates: {
    title: '候选证据',
    description: '处理等待提取、重试或进入医学审核的候选资料。',
    singular: '候选',
    icon: DatabaseZap,
    endpoint: '/api/internal/v1/candidates',
    detail: true,
  },
  releases: {
    title: '发布记录',
    description: '查看不可变发布、内容变化和审核轨迹。',
    singular: '发布',
    icon: FileCheck2,
    endpoint: '/api/internal/v1/releases',
    detail: true,
  },
  agents: {
    title: '智能体',
    description: '查看运行定义、版本、状态与质量表现。',
    singular: '智能体',
    icon: Bot,
    endpoint: '/api/internal/v1/agents',
    detail: false,
  },
  skills: {
    title: '技能',
    description: '查看结构化能力、输入输出约束与评估表现。',
    singular: '技能',
    icon: Sparkles,
    endpoint: '/api/internal/v1/skills',
    detail: false,
  },
  workflows: {
    title: '工作流',
    description: '查看流程定义、依赖版本和最近运行表现。',
    singular: '工作流',
    icon: GitBranch,
    endpoint: '/api/internal/v1/workflows',
    detail: false,
  },
  'workflow-runs': {
    title: '工作流运行',
    description: '沿步骤追踪执行、重试、人工接管和失败原因。',
    singular: '工作流运行',
    icon: Layers3,
    endpoint: '/api/internal/v1/workflow-runs',
    detail: true,
  },
  'question-runs': {
    title: '问答运行',
    description: '检查公开问答的执行状态、范围判断与引用校验。',
    singular: '问答运行',
    icon: ShieldCheck,
    endpoint: '/api/internal/v1/question-runs',
    detail: true,
  },
};

export function OpsDashboard({ locale }: { locale: string }) {
  const [range, setRange] = useState<'7d' | '30d'>('7d');
  const [data, setData] = useState<OpsDashboardDto | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    requestProductData<OpsDashboardDto>(
      `/api/internal/v1/ops/dashboard?range=${range}`,
      { signal: controller.signal }
    )
      .then(setData)
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      });
    return () => controller.abort();
  }, [range, reloadKey]);

  const metrics = data
    ? [
        {
          label: '新发现',
          value: data.counts.discovered,
          note: '进入本周期处理范围',
          tone: 'blue',
        },
        {
          label: '等待审核',
          value: data.counts.readyForReview,
          note: `${data.backlog.reviewTasks} 项待审核`,
          tone: 'amber',
        },
        {
          label: '已发布',
          value: data.counts.published,
          note: '已进入公开内容',
          tone: 'green',
        },
        {
          label: '执行失败',
          value: data.counts.failed,
          note: `共 ${data.workflow.total} 次运行`,
          tone: data.counts.failed ? 'red' : 'neutral',
        },
      ]
    : [];

  return (
    <section className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-5 border-b border-[#B4CAE6] pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            证据运营总览
          </h1>
          <p className="mt-3 max-w-[65ch] text-sm leading-7 text-[#52637A]">
            从发现到发布，快速定位积压、失败、人工接管和需要关注的质量信号。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/${locale}/ops/discovery-runs/new`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#175CD3] px-4 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(23,92,211,0.22)]"
          >
            <Send aria-hidden size={16} /> 发起知识更新
          </Link>
          <div
            className="inline-flex w-fit rounded-xl bg-white/75 p-1"
            role="group"
            aria-label="统计范围"
          >
            <button
              type="button"
              onClick={() => {
                setError(false);
                setData(null);
                setRange('7d');
              }}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${range === '7d' ? 'bg-[#175CD3] text-white' : 'text-[#52637A]'}`}
            >
              近 7 天
            </button>
            <button
              type="button"
              onClick={() => {
                setError(false);
                setData(null);
                setRange('30d');
              }}
              className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${range === '30d' ? 'bg-[#175CD3] text-white' : 'text-[#52637A]'}`}
            >
              近 30 天
            </button>
          </div>
        </div>
      </header>
      {error ? (
        <OpsError
          retry={() => {
            setError(false);
            setData(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
      {!data && !error ? <OpsLoading /> : null}
      {data ? (
        <>
          <div className="mt-8 grid border-y border-[#B4CAE6] sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric, index) => (
              <div
                key={metric.label}
                className={`min-h-40 p-5 sm:p-6 ${index % 2 === 0 ? 'sm:border-r sm:border-[#B4CAE6]' : ''} ${index < 2 ? 'border-b border-[#B4CAE6] xl:border-b-0' : ''} ${index !== 3 ? 'xl:border-r xl:border-[#B4CAE6]' : ''}`}
              >
                <p className="text-sm font-semibold text-[#52637A]">
                  {metric.label}
                </p>
                <p className="mt-6 text-4xl font-semibold tracking-[-0.03em] tabular-nums">
                  {metric.value}
                </p>
                <p className="mt-2 text-xs text-[#60748D]">{metric.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
            <section className="rounded-2xl bg-white/72 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">流程脉络</h2>
                <Link
                  href={`/${locale}/ops/workflow-runs`}
                  className="text-sm font-semibold text-[#175CD3]"
                >
                  查看全部
                </Link>
              </div>
              <div className="mt-7 grid gap-4 sm:grid-cols-4">
                {[
                  { label: '发现', value: data.counts.discovered },
                  { label: '处理中', value: data.counts.processing },
                  { label: '等待审核', value: data.counts.readyForReview },
                  { label: '已发布', value: data.counts.published },
                ].map((item, index) => (
                  <div key={item.label} className="relative">
                    <div
                      className={`h-1 rounded-full ${index <= 2 ? 'bg-[#175CD3]' : 'bg-[#59A873]'}`}
                    />
                    <p className="mt-4 text-2xl font-semibold tabular-nums">
                      {item.value} 项
                    </p>
                    <p className="mt-1 text-sm text-[#52637A]">{item.label}</p>
                  </div>
                ))}
              </div>
              <dl className="mt-8 grid gap-4 border-t border-[#C8D9EE] pt-6 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-[#60748D]">需要人工处理</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {data.workflow.needsHuman}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#60748D]">重试</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {data.workflow.retries}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#60748D]">失败率</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {Math.round(data.workflow.failureRate * 100)}%
                  </dd>
                </div>
              </dl>
            </section>
            <section className="rounded-2xl bg-[#0B3975] p-6 text-white">
              <div className="flex items-center gap-2 text-[#A8CCFF]">
                <AlertTriangle aria-hidden size={18} />
                <h2 className="font-semibold text-white">需要关注</h2>
              </div>
              {data.alerts.length ? (
                <ul className="mt-5 grid gap-3">
                  {data.alerts.map((alert) => (
                    <li
                      key={`${alert.code}-${alert.resourceId ?? ''}`}
                      className="rounded-xl bg-white/10 p-4 text-sm leading-6"
                    >
                      <span className="font-semibold">
                        {alertSeverity(alert.severity)}
                      </span>
                      <p className="mt-1 text-[#D6E6FB]">{alert.message}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-12 text-center">
                  <CheckCircle2
                    aria-hidden
                    className="mx-auto text-[#9DD6AD]"
                    size={30}
                  />
                  <p className="mt-4 font-semibold">
                    当前没有需要立即处理的告警
                  </p>
                  <p className="mt-2 text-sm text-[#C4DCF8]">
                    新的异常会在这里出现。
                  </p>
                </div>
              )}
            </section>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SummaryPanel
              title="最近一次发现运行"
              empty="还没有发现运行"
              data={
                data.latestDiscoveryRun as unknown as Record<
                  string,
                  unknown
                > | null
              }
              href={
                data.latestDiscoveryRun
                  ? `/${locale}/ops/discovery-runs/${data.latestDiscoveryRun.id}`
                  : undefined
              }
            />
            <SummaryPanel
              title="最近一次发布"
              empty="还没有发布记录"
              data={
                data.latestRelease as unknown as Record<string, unknown> | null
              }
              href={
                data.latestRelease
                  ? `/${locale}/ops/releases/${data.latestRelease.id}`
                  : undefined
              }
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

export function OpsCollectionPage({
  locale,
  resource,
}: {
  locale: string;
  resource: OpsResource;
}) {
  const config = resourceConfig[resource];
  const [data, setData] = useState<PageResult | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const Icon = config.icon;

  const load = useMemo(() => {
    const parameters = new URLSearchParams({
      page: String(page),
      pageSize: '20',
    });
    if (submittedQuery) parameters.set('q', submittedQuery);
    if (status) parameters.set('status', status);
    return `${config.endpoint}?${parameters.toString()}`;
  }, [config.endpoint, page, status, submittedQuery]);

  useEffect(() => {
    const controller = new AbortController();
    requestProductData<PageResult>(load, { signal: controller.signal })
      .then(setData)
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [load, reloadKey]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(false);
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  async function strategyAction(
    item: Record<string, unknown>,
    action: 'pause' | 'resume'
  ) {
    setNotice('');
    try {
      await requestProductData(`${config.endpoint}/${item.id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      setNotice(
        action === 'pause'
          ? '策略已暂停'
          : '策略已恢复'
      );
      setReloadKey((value) => value + 1);
    } catch {
      setNotice('操作没有完成，请重试。');
    }
  }

  return (
    <section className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="grid gap-5 border-b border-[#B4CAE6] pb-7 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <Icon
            aria-hidden
            className="text-[#175CD3]"
            size={28}
            strokeWidth={1.6}
          />
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            {config.title}
          </h1>
          <p className="mt-3 max-w-[65ch] text-sm leading-7 text-[#52637A]">
            {config.description}
          </p>
        </div>
        <p className="text-sm font-semibold text-[#52637A]">
          {data ? `共 ${data.pagination.total} 项` : '正在统计'}
        </p>
      </header>
      <form
        onSubmit={submit}
        className="mt-6 flex flex-col gap-3 rounded-2xl bg-white/68 p-3 backdrop-blur-xl sm:flex-row"
      >
        <label className="relative flex-1">
          <span className="sr-only">搜索{config.title}</span>
          <Search
            aria-hidden
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[#60748D]"
            size={17}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜索${config.singular}名称或标识`}
            className="min-h-11 w-full rounded-xl border border-[#B4CAE6] bg-white pr-3 pl-10 text-sm"
          />
        </label>
        <label>
          <span className="sr-only">状态</span>
          <select
            value={status}
            onChange={(event) => {
              setLoading(true);
              setError(false);
              setStatus(event.target.value);
              setPage(1);
            }}
            className="min-h-11 min-w-36 rounded-xl border border-[#B4CAE6] bg-white px-3 text-sm"
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">运行中</option>
            <option value="PAUSED">已暂停</option>
            <option value="READY_FOR_REVIEW">需审核</option>
            <option value="FAILED">失败</option>
            <option value="SUCCEEDED">已完成</option>
            <option value="PUBLISHED">已发布</option>
          </select>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-[#175CD3] px-5 text-sm font-semibold text-white"
        >
          筛选
        </button>
      </form>
      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-xl bg-[#DDEBFF] px-4 py-3 text-sm font-semibold text-[#0B3975]"
        >
          {notice}
        </p>
      ) : null}
      {loading ? <OpsLoading /> : null}
      {error ? (
        <OpsError
          retry={() => {
            setLoading(true);
            setError(false);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
      {!loading && !error && data?.items.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white/60 px-6 py-16 text-center">
          <Search aria-hidden className="mx-auto text-[#7FA7DA]" size={28} />
          <p className="mt-4 text-lg font-semibold">
            没有找到匹配的{config.singular}
          </p>
          <p className="mt-2 text-sm text-[#52637A]">
            调整关键词或状态后再试。
          </p>
        </div>
      ) : null}
      {!loading && !error && data?.items.length ? (
        <div className="mt-6 overflow-hidden rounded-2xl bg-white/72 backdrop-blur-xl">
          <div className="divide-y divide-[#D6E2F1]">
            {data.items.map((item) => (
              <article
                key={String(item.id)}
                className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={String(item.status ?? 'UNKNOWN')} />
                    {item.version ? (
                      <span className="text-xs font-semibold text-[#60748D]">
                        {String(item.version)}
                      </span>
                    ) : null}
                  </div>
                  <h2
                    className="mt-3 truncate text-lg font-semibold"
                    lang={resource === 'candidates' ? 'en' : 'zh-CN'}
                  >
                    {itemTitle(item, config.singular)}
                  </h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#52637A]">
                    {itemSummary(item)}
                  </p>
                  <p className="mt-3 text-xs text-[#60748D]">
                    {itemTime(item)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {resource === 'discovery-strategies' ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          strategyAction(
                            item,
                            item.status === 'PAUSED' ? 'resume' : 'pause'
                          )
                        }
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#EAF2FF] px-3 text-sm font-semibold text-[#0B3975]"
                      >
                        {item.status === 'PAUSED' ? (
                          <Play aria-hidden size={15} />
                        ) : (
                          <Pause aria-hidden size={15} />
                        )}
                        {item.status === 'PAUSED' ? '恢复' : '暂停'}
                      </button>
                    </>
                  ) : null}
                  {config.detail ? (
                    <Link
                      href={`/${locale}/ops/${resource}/${String(item.id)}`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#175CD3] hover:bg-[#EAF2FF]"
                    >
                      查看详情 <ArrowRight aria-hidden size={15} />
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {data && data.pagination.totalPages > 1 ? (
        <div className="mt-5 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => {
              setLoading(true);
              setError(false);
              setPage((value) => value - 1);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold text-[#0B3975] disabled:opacity-40"
          >
            <ChevronLeft aria-hidden size={16} />
            上一页
          </button>
          <span className="text-[#52637A]">
            第 {page} / {data.pagination.totalPages} 页
          </span>
          <button
            type="button"
            disabled={page >= data.pagination.totalPages}
            onClick={() => {
              setLoading(true);
              setError(false);
              setPage((value) => value + 1);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold text-[#0B3975] disabled:opacity-40"
          >
            下一页
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function OpsDetailPage({
  locale,
  resource,
  id,
}: {
  locale: string;
  resource: Extract<
    OpsResource,
    | 'discovery-runs'
    | 'candidates'
    | 'releases'
    | 'workflow-runs'
    | 'question-runs'
  >;
  id: string;
}) {
  const config = resourceConfig[resource];
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    requestProductData<Record<string, unknown>>(
      `${config.endpoint}/${encodeURIComponent(id)}`,
      { signal: controller.signal }
    )
      .then(setData)
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      });
    return () => controller.abort();
  }, [config.endpoint, id, reloadKey]);
  async function retryCandidate() {
    try {
      await requestProductData(
        `/api/internal/v1/candidates/${encodeURIComponent(id)}/retry`,
        { method: 'POST' }
      );
      setNotice('已提交重试');
      setReloadKey((value) => value + 1);
    } catch {
      setNotice('重试没有提交成功');
    }
  }
  return (
    <section className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link
        href={`/${locale}/ops/${resource}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#175CD3]"
      >
        <ArrowLeft aria-hidden size={16} />
        返回{config.title}
      </Link>
      {error ? (
        <OpsError
          retry={() => {
            setError(false);
            setData(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
      {!data && !error ? <OpsLoading /> : null}
      {data ? (
        <>
          <header className="mt-7 flex flex-col gap-5 border-b border-[#B4CAE6] pb-7 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <StatusBadge
                value={String(
                  (data.run as Record<string, unknown> | undefined)?.status ??
                    data.status ??
                    'UNKNOWN'
                )}
              />
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
                {itemTitle(
                  (data.run as Record<string, unknown>) ?? data,
                  config.singular
                )}
              </h1>
              <p className="mt-3 text-sm text-[#52637A]">标识：{id}</p>
            </div>
            {resource === 'candidates' ? (
              <button
                type="button"
                onClick={retryCandidate}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#175CD3] px-4 text-sm font-semibold text-white"
              >
                <RotateCcw aria-hidden size={16} />
                重新处理
              </button>
            ) : null}
          </header>
          {notice ? (
            <p
              role="status"
              className="mt-5 rounded-xl bg-[#DDEBFF] px-4 py-3 text-sm font-semibold text-[#0B3975]"
            >
              {notice}
            </p>
          ) : null}
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <section className="rounded-2xl bg-white/72 p-6">
              <h2 className="text-xl font-semibold">详细信息</h2>
              <DetailInspector value={data} />
            </section>
            <aside className="rounded-2xl bg-[#0B3975] p-6 text-white">
              <History aria-hidden size={24} className="text-[#A8CCFF]" />
              <h2 className="mt-5 text-lg font-semibold">审计提示</h2>
              <p className="mt-3 text-sm leading-7 text-[#D6E6FB]">
                状态、版本、时间与错误信息来自当前记录。发布记录一经创建不可修改。
              </p>
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}

function OpsLoading() {
  return (
    <div className="mt-6 flex min-h-44 items-center justify-center rounded-2xl bg-white/60 text-sm font-medium text-[#52637A]">
      <LoaderCircle aria-hidden className="mr-2 animate-spin" size={18} />
      正在读取运营数据
    </div>
  );
}
function OpsError({ retry }: { retry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-2xl bg-[#FFF7ED] p-5 text-[#7C2D12]"
    >
      <div className="flex gap-3">
        <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={20} />
        <div>
          <p className="font-semibold">数据暂时无法加载</p>
          <p className="mt-1 text-sm">请刷新页面或稍后重试。</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#7C2D12] px-3 text-sm font-semibold text-white"
          >
            <RefreshCw aria-hidden size={15} />
            重新加载
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({
  title,
  empty,
  data,
  href,
}: {
  title: string;
  empty: string;
  data: Record<string, unknown> | null;
  href?: string;
}) {
  return (
    <section className="rounded-2xl bg-white/68 p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {data ? (
        <div className="mt-5">
          <StatusBadge value={String(data.status ?? 'PUBLISHED')} />
          <p className="mt-3 font-semibold">{itemTitle(data, title)}</p>
          <p className="mt-2 text-sm text-[#52637A]">{itemTime(data)}</p>
          {href ? (
            <Link
              href={href}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#175CD3]"
            >
              查看详情 <ArrowRight aria-hidden size={15} />
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="mt-8 text-sm text-[#60748D]">{empty}</p>
      )}
    </section>
  );
}
function StatusBadge({ value }: { value: string }) {
  const label = statusLabel(value);
  const danger = /FAILED|REJECTED|BLOCKED/.test(value);
  const warning = /PENDING|RUNNING|READY|PAUSED|NEEDS/.test(value);
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-3 text-xs font-semibold ${danger ? 'bg-[#FEE4E2] text-[#B42318]' : warning ? 'bg-[#FEF0C7] text-[#8A4B08]' : 'bg-[#DCFCE7] text-[#166534]'}`}
    >
      {label}
    </span>
  );
}
function alertSeverity(value: string) {
  return { INFO: '提示', WARNING: '警告', CRITICAL: '紧急' }[value] ?? value;
}
function statusLabel(value: string) {
  return (
    (
      {
        ACTIVE: '运行中',
        PAUSED: '已暂停',
        PENDING: '等待开始',
        RUNNING: '执行中',
        SUCCEEDED: '已完成',
        PARTIAL_SUCCESS: '部分完成',
        FAILED: '失败',
        CANCELLED: '已取消',
        READY_FOR_REVIEW: '等待审核',
        PUBLISHED: '已发布',
        APPROVED: '已通过',
        REJECTED: '已拒绝',
        NEEDS_HUMAN: '需要人工处理',
        ANSWERED: '已回答',
        NO_CURATED_EVIDENCE: '没有已审核证据',
        OUT_OF_SCOPE: '超出范围',
        SUMMARY_UNAVAILABLE: '摘要不可用',
        UNKNOWN: '状态未知',
      } as Record<string, string>
    )[value] ?? value
  );
}
function itemTitle(item: Record<string, unknown>, fallback: string) {
  return String(
    item.title ??
      item.name ??
      item.displayName ??
      item.version ??
      item.question ??
      item.externalId ??
      item.id ??
      fallback
  );
}
function itemSummary(item: Record<string, unknown>) {
  return String(
    item.description ??
      item.errorSummary ??
      item.query ??
      item.summary ??
      item.redactedQuestion ??
      item.workflowVersion ??
      '查看详情了解此记录的完整状态与审计信息。'
  );
}
function itemTime(item: Record<string, unknown>) {
  const value =
    item.updatedAt ??
    item.createdAt ??
    item.publishedAt ??
    item.completedAt ??
    item.startedAt;
  if (!value) return '时间暂未提供';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

const keyLabels: Record<string, string> = {
  id: '标识',
  status: '状态',
  version: '版本',
  createdAt: '创建时间',
  updatedAt: '更新时间',
  startedAt: '开始时间',
  completedAt: '完成时间',
  publishedAt: '发布时间',
  triggeredBy: '触发人',
  triggerType: '触发方式',
  workflowVersion: '工作流版本',
  agentVersion: '智能体版本',
  errorCode: '错误代码',
  errorSummary: '错误说明',
  counts: '处理计数',
  run: '运行',
  strategy: '策略',
  steps: '步骤',
  candidate: '候选资料',
  draft: '结构化草稿',
  changeSummary: '变更摘要',
  literatureCutoffAt: '文献收录截至',
  regulatoryCutoffAt: '监管记录截至',
  query: '检索式',
  name: '名称',
  description: '说明',
  title: '标题',
};
function fieldLabel(key: string) {
  return keyLabels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2');
}
function DetailInspector({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}): ReactNode {
  if (value === null || value === undefined || value === '')
    return <span className="text-[#7A8BA1]">未提供</span>;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string' || typeof value === 'number')
    return <span className="break-words">{String(value)}</span>;
  if (Array.isArray(value))
    return value.length ? (
      <div className="grid gap-3">
        {value.map((item, index) => (
          <div
            key={index}
            className={depth < 2 ? 'rounded-xl bg-[#F4F8FF] p-4' : ''}
          >
            <DetailInspector value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    ) : (
      <span className="text-[#7A8BA1]">暂无</span>
    );
  return (
    <dl className={`grid gap-4 ${depth === 0 ? 'mt-6' : ''}`}>
      {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
        <div
          key={key}
          className={
            depth === 0
              ? 'border-t border-[#D6E2F1] pt-4 first:border-0 first:pt-0'
              : ''
          }
        >
          <dt className="text-xs font-semibold text-[#60748D]">
            {fieldLabel(key)}
          </dt>
          <dd className="mt-2 text-sm leading-6 text-[#243B5A]">
            {key === 'status' ? (
              <StatusBadge value={String(item)} />
            ) : (
              <DetailInspector value={item} depth={depth + 1} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
