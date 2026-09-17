'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  Square,
} from 'lucide-react';

import type { DiscoveryRunDetailDto } from '@/shared/types/evidence-platform-api';

import { isAbortError, requestProductData } from './client';

export function DiscoveryRunDetailPage({
  locale,
  id,
}: {
  locale: string;
  id: string;
}) {
  const [data, setData] = useState<DiscoveryRunDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    requestProductData<DiscoveryRunDetailDto>(
      `/api/internal/v1/discovery-runs/${encodeURIComponent(id)}`,
      { signal: controller.signal }
    )
      .then((value) => {
        setData(value);
        setError('');
      })
      .catch((reason) => {
        if (!isAbortError(reason)) setError('更新进度暂时无法读取。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  async function action(value: 'pause' | 'resume' | 'cancel') {
    setActing(true);
    setNotice('');
    setError('');
    try {
      await requestProductData(
        `/api/internal/v1/discovery-runs/${encodeURIComponent(id)}/${value}`,
        { method: 'POST' }
      );
      setNotice(
        value === 'pause'
          ? '运行已暂停'
          : value === 'resume'
            ? '运行已继续'
            : '运行已取消'
      );
      setConfirmCancel(false);
      setLoading(true);
      setReloadKey((current) => current + 1);
    } catch {
      setError('操作没有完成，页面中的进度未改变，请重试。');
    } finally {
      setActing(false);
    }
  }

  const run = data?.run;
  const target = run?.documentLimit ?? run?.estimatedMatchCount ?? 0;
  const progress = target
    ? Math.min(
        100,
        Math.round(((run?.processedDocumentCount ?? 0) / target) * 100)
      )
    : 0;

  return (
    <section
      className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      aria-busy={acting}
    >
      <Link
        href={`/${locale}/ops/discovery-runs`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden size={16} />
        返回更新记录
      </Link>
      {loading ? <RunLoading /> : null}
      {error ? (
        <div role="alert" className="mt-5 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          {error}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadKey((value) => value + 1);
            }}
            className="ml-3 min-h-11 rounded-lg px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            重新读取
          </button>
        </div>
      ) : null}
      {!loading && data && run ? (
        <>
          <header className="mt-5 flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <RunStatus value={run.status} />
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                知识更新进度
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                创建于 {formatDate(run.createdAt)} · 标识 {run.id}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['PENDING', 'RUNNING'].includes(run.status) ? (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => void action('pause')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Pause aria-hidden size={16} /> 暂停运行
                </button>
              ) : null}
              {run.status === 'PAUSED' ? (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => void action('resume')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Play aria-hidden size={16} /> 继续运行
                </button>
              ) : null}
              {['PENDING', 'RUNNING', 'PAUSED'].includes(run.status) ? (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setConfirmCancel(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Square aria-hidden size={15} /> 取消运行
                </button>
              ) : null}
            </div>
          </header>
          {notice ? (
            <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {notice}
            </p>
          ) : null}
          {confirmCancel ? (
            <div className="mt-5 flex flex-col gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
              <p>取消后不会继续发现新文献，已经形成的候选与审核记录会保留。</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void action('cancel')}
                  className="min-h-11 rounded-lg bg-destructive px-4 font-semibold text-destructive-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  确认取消运行
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="min-h-11 rounded-lg px-4 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  保留运行
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
            <div className="grid gap-6">
              <section className="rounded-2xl border border-border bg-card/75 p-6 backdrop-blur-xl">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">处理进度</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      已处理 {run.processedDocumentCount} 篇，已发现{' '}
                      {run.uniqueDiscoveredCount} 篇唯一文献
                    </p>
                  </div>
                  <strong className="text-3xl tracking-[-0.03em] tabular-nums">
                    {progress}%
                  </strong>
                </div>
                <div
                  className="mt-5 h-2 overflow-hidden rounded-full bg-muted"
                  aria-label={`处理进度 ${progress}%`}
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
                  <RunMetric label="唯一发现" value={run.uniqueDiscoveredCount} />
                  <RunMetric label="等待审核" value={run.counts.readyForReview} />
                  <RunMetric label="重复" value={run.counts.duplicate} />
                  <RunMetric label="失败" value={run.counts.failed} />
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-card/75 p-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-semibold">检索计划</h2>
                  <span className="text-sm text-muted-foreground">
                    {data.queries.length} 个范围
                  </span>
                </div>
                {data.queries.length ? (
                  <ol className="mt-5 divide-y divide-border">
                    {data.queries.map((query) => (
                      <li
                        key={`${query.strategyId}-${query.associationId}`}
                        className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div>
                          <p className="font-semibold">{query.label}</p>
                          <p className="mt-1 break-words text-sm leading-6 text-muted-foreground" lang="en">
                            {query.query}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {query.exhausted
                            ? '检索完成'
                            : `已读取 ${query.fetchedPageCount ?? 0} 页`}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-5 text-sm text-muted-foreground">检索计划尚未展开。</p>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-card/75 p-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-semibold">本次候选文献</h2>
                  <Link
                    href={`/${locale}/ops/candidates`}
                    className="min-h-11 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    查看全部候选
                  </Link>
                </div>
                {data.candidates.length ? (
                  <ul className="mt-5 divide-y divide-border">
                    {data.candidates.map((candidate) => (
                      <li
                        key={candidate.id}
                        className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-semibold" lang="en">
                            {candidate.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            PMID {candidate.externalId} ·{' '}
                            {runStatusLabel(candidate.status)}
                          </p>
                        </div>
                        <Link
                          href={`/${locale}/ops/candidates/${candidate.id}`}
                          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          查看候选 <ArrowRight aria-hidden size={15} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-5 text-sm text-muted-foreground">暂时还没有形成候选文献。</p>
                )}
              </section>
            </div>

            <aside className="self-start rounded-2xl bg-foreground p-6 text-background xl:sticky xl:top-8">
              <h2 className="text-xl font-semibold">本次范围</h2>
              <dl className="mt-6 grid gap-5 text-sm">
                <RunFact
                  label="知识范围"
                  value={
                    run.scopeMode === 'ALL_KNOWLEDGE'
                      ? '全部已发布知识'
                      : '指定知识范围'
                  }
                />
                <RunFact
                  label="文献上限"
                  value={
                    run.documentLimit === null
                      ? '全部文献'
                      : `${run.documentLimit} 篇`
                  }
                />
                <RunFact label="预计匹配" value={`${run.estimatedMatchCount} 篇`} />
                <RunFact
                  label="文献时间"
                  value={`${formatDate(run.windowFrom)} 至 ${formatDate(run.windowTo)}`}
                />
                <RunFact label="整理流程" value={run.workflowVersion} />
              </dl>
              {run.errorSummary ? (
                <div className="mt-7 rounded-xl bg-background/10 p-4">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle aria-hidden size={17} /> 需要处理的问题
                  </p>
                  <p className="mt-2 text-sm leading-6 text-background/75">
                    {run.errorSummary}
                  </p>
                </div>
              ) : null}
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}

function RunLoading() {
  return (
    <div className="mt-6 grid gap-3" role="status" aria-label="正在读取更新进度">
      <span className="sr-only">正在读取更新进度</span>
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="h-72 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function RunStatus({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold ${
        /FAILED|CANCELLED/.test(value)
          ? 'bg-destructive/10 text-destructive'
          : /PENDING|RUNNING|PAUSED/.test(value)
            ? 'bg-amber-100 text-amber-900'
            : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {runStatusLabel(value)}
    </span>
  );
}

function RunMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function RunFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <dt className="text-background/65">{label}</dt>
      <dd className="break-words font-semibold text-background">{value}</dd>
    </div>
  );
}

function runStatusLabel(value: string) {
  return (
    (
      {
        PENDING: '等待开始',
        RUNNING: '执行中',
        PAUSED: '已暂停',
        SUCCEEDED: '已完成',
        PARTIAL_SUCCESS: '部分完成',
        FAILED: '失败',
        CANCELLED: '已取消',
        READY_FOR_REVIEW: '等待审核',
        DUPLICATE: '重复文献',
        EXCLUDED: '未纳入',
      } as Record<string, string>
    )[value] ?? value
  );
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
