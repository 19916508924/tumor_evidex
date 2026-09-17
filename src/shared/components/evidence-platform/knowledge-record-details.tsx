'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
} from 'lucide-react';

import type {
  PublicEvidenceDetail,
  PublicSourceDetail,
} from '@/shared/types/evidence-platform-api';

import { isAbortError, requestProductData } from './client';

export function KnowledgeEvidenceDetail({
  locale,
  id,
}: {
  locale: string;
  id: string;
}) {
  const [data, setData] = useState<PublicEvidenceDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    requestProductData<PublicEvidenceDetail>(
      `/api/v1/knowledge/evidence/${encodeURIComponent(id)}`,
      { signal: controller.signal }
    )
      .then(setData)
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      });
    return () => controller.abort();
  }, [id]);
  if (error) return <RecordError />;
  if (!data) return <RecordLoading />;
  return (
    <article className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <BackToKnowledge locale={locale} />
      <header className="mt-8">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-primary/12 px-3 py-1 text-xs font-semibold text-primary">
            {maturityLabel(data.claim.evidenceMaturity)}
          </span>
          <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold">
            {claimTypeLabel(data.claim.claimType)}
          </span>
          <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold">
            证据等级 {data.association.approvedLevel}
          </span>
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          {data.claim.studyName || '证据声明'}
        </h1>
        <p className="mt-5 text-lg leading-8 text-foreground">
          {data.claim.conclusion}
        </p>
      </header>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-8">
          <DetailSection title="研究概况">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="研究设计" value={data.claim.studyType} />
              <Fact label="样本量" value={data.claim.sampleSize} />
              <Fact label="疾病阶段" value={data.claim.diseaseStage} />
              <Fact label="治疗线次" value={data.claim.treatmentLine} />
              <Fact
                label="既往治疗"
                value={data.claim.priorTherapy}
                className="sm:col-span-2"
              />
            </dl>
          </DetailSection>
          <DetailSection title="研究人群">
            <p>{data.claim.populationSummary}</p>
          </DetailSection>
          <DetailSection title="干预与终点">
            <p>
              {data.claim.intervention}
              {data.claim.comparator ? `；对照：${data.claim.comparator}` : ''}
            </p>
            <p className="mt-2">终点：{data.claim.endpoint}</p>
            {data.claim.effectValue ? (
              <dl className="mt-4 grid gap-2 rounded-xl bg-accent/55 p-4 sm:grid-cols-2">
                {formatEffectValue(data.claim.effectValue).map((metric) => (
                  <div key={`${metric.label}-${metric.value}`}>
                    <dt className="text-xs text-muted-foreground">
                      {metric.label}
                    </dt>
                    <dd className="mt-1 font-semibold text-foreground">
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </DetailSection>
          <DetailSection title="局限性">
            <p>{data.claim.limitations}</p>
          </DetailSection>
          <section>
            <h2 className="text-2xl font-semibold">支持来源</h2>
            <div className="mt-5 grid gap-4">
              {data.passages.map((passage) => (
                <div
                  key={passage.id}
                  className="rounded-2xl border border-border bg-card/75 p-5"
                >
                  <p className="font-semibold" lang="en">
                    {passage.source.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {passage.source.sourceType === 'PUBMED' ? (
                      <span>PMID：{passage.source.externalId}</span>
                    ) : (
                      <span>来源编号：{passage.source.externalId}</span>
                    )}
                    {passage.source.doi ? (
                      <span>DOI：{passage.source.doi}</span>
                    ) : null}
                  </div>
                  {passage.text ? (
                    <blockquote
                      className="mt-4 border-l border-primary/50 pl-4 text-sm leading-7 text-muted-foreground"
                      lang="en"
                    >
                      {passage.text}
                    </blockquote>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      根据来源许可，本页面仅提供原文链接。
                    </p>
                  )}
                  <Link
                    href={`/${locale}/knowledge/sources/${passage.source.id}`}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    查看来源 <ArrowRight aria-hidden size={15} />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="h-fit rounded-2xl bg-foreground p-6 text-background">
          <CheckCircle2 aria-hidden className="text-primary" />
          <p className="mt-5 font-semibold">所属治疗关联</p>
          <p className="mt-3 text-sm leading-6 font-semibold">
            {data.association.disease.displayNameZh} ·{' '}
            {data.association.gene.symbol} ·{' '}
            {data.association.variant.hgvsp ||
              data.association.variant.canonicalKey}
          </p>
          <p className="mt-3 text-sm leading-6 text-background/75">
            {data.association.drugs
              .map((drug) => drug.displayNameZh || drug.displayNameEn)
              .join(' + ')}
          </p>
          <dl className="mt-5 grid gap-3 border-t border-background/20 pt-5 text-xs">
            <SidebarFact
              label="证据方向"
              value={directionLabel(data.association.direction)}
            />
            <SidebarFact
              label="证据等级"
              value={data.association.approvedLevel}
            />
            <SidebarFact
              label="资料发布日期"
              value={formatDate(data.release.publishedAt)}
            />
          </dl>
        </aside>
      </div>
    </article>
  );
}

export function KnowledgeSourceDetail({
  locale,
  id,
}: {
  locale: string;
  id: string;
}) {
  const [data, setData] = useState<PublicSourceDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    requestProductData<PublicSourceDetail>(
      `/api/v1/knowledge/sources/${encodeURIComponent(id)}`,
      { signal: controller.signal }
    )
      .then(setData)
      .catch((reason) => {
        if (!isAbortError(reason)) setError(true);
      });
    return () => controller.abort();
  }, [id]);
  if (error) return <RecordError />;
  if (!data) return <RecordLoading />;
  return (
    <article className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <BackToKnowledge locale={locale} />
      <header className="mt-8 border-b border-border pb-8">
        <p className="text-sm font-semibold text-primary">
          {data.source.sourceType === 'PUBMED' ? '医学文献' : '监管来源'}
        </p>
        <h1
          className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance"
          lang={data.source.language === 'zh' ? 'zh-CN' : 'en'}
        >
          {data.source.title}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {[
            data.source.journal,
            data.source.publisherOrAgency,
            formatDate(data.source.publicationDate),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <a
          href={data.source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          查看来源原页 <ArrowRight aria-hidden size={15} />
        </a>
      </header>
      <section className="mt-8">
        <h2 className="text-2xl font-semibold">可展示原文</h2>
        {data.passages.length ? (
          <div className="mt-5 grid gap-4">
            {data.passages.map((passage) => (
              <div
                key={passage.id}
                className="rounded-2xl border border-border bg-card/75 p-6"
              >
                {passage.text ? (
                  <p
                    className="leading-8 text-foreground"
                    lang={data.source.language === 'zh' ? 'zh-CN' : 'en'}
                  >
                    {passage.text}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    根据来源许可，本段仅用于定位，不展示原文。
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-border bg-card/70 p-6 text-muted-foreground">
            此来源没有可公开展示的原文段落，请前往来源原页查看。
          </p>
        )}
      </section>
    </article>
  );
}

function RecordError() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div role="alert" className="rounded-2xl bg-destructive/10 p-5 text-destructive">
        <div className="flex gap-3">
          <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-semibold">暂时无法读取已发布内容</p>
            <p className="mt-1 text-sm leading-6">请稍后重试。</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw aria-hidden size={15} /> 重新加载
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16" role="status" aria-label="正在读取已发布内容">
      <span className="sr-only">正在读取已发布内容</span>
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="mt-5 h-80 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function BackToKnowledge({ locale }: { locale: string }) {
  return (
    <Link
      href={`/${locale}/knowledge`}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft aria-hidden size={16} /> 返回知识库
    </Link>
  );
}

function Fact({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">
        {value ?? '暂未提供'}
      </dd>
    </div>
  );
}

function SidebarFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-background/65">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function directionLabel(value: string) {
  return (
    { SENSITIVITY: '敏感性', RESISTANCE: '耐药性', EXPLORATORY: '探索性' }[
      value
    ] ?? value
  );
}

function maturityLabel(value: string) {
  return (
    {
      REGULATORY: '监管证据',
      GUIDELINE: '指南证据',
      MATURE_CLINICAL: '成熟临床证据',
      LIMITED_CLINICAL: '有限临床证据',
      PRECLINICAL: '临床前证据',
      INSUFFICIENT: '证据不足',
    }[value] ?? value
  );
}

function claimTypeLabel(value: PublicEvidenceDetail['claim']['claimType']) {
  return (
    {
      EFFICACY: '疗效结论',
      RESISTANCE: '耐药结论',
      SAFETY_CONTEXT: '安全性背景',
      OTHER: '其他证据',
    }[value] ?? '证据结论'
  );
}

const effectMetricLabels: Record<string, string> = {
  pValue: 'P 值',
  hazardRatio: '危险比',
  hazardRatioForDeath: '死亡危险比',
  confidenceInterval95: '95% 置信区间',
  medianMonthsComparator: '对照组中位月数',
  medianMonthsIntervention: '干预组中位月数',
  objectiveResponseRatePercent: '客观缓解率',
  diseaseControlRatePercent: '疾病控制率',
  medianProgressionFreeSurvivalMonths: '中位无进展生存月数',
  threeYearOverallSurvivalPercent: '3 年总生存率',
  grade3OrHigherAdverseEventPercent: '3 级及以上不良事件率',
  comparator: '对照组',
  intervention: '干预组',
};

function formatEffectValue(
  value: Record<string, unknown>,
  prefix = ''
): Array<{ label: string; value: string }> {
  return Object.entries(value).flatMap(([key, item]) => {
    const label = effectMetricLabels[key] || prefix || '其他效应指标';
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return formatEffectValue(item as Record<string, unknown>, label);
    }
    const text = Array.isArray(item)
      ? item.join(' 至 ')
      : typeof item === 'number' && /Percent$/.test(key)
        ? `${item}%`
        : String(item ?? '暂未提供');
    return [{ label, value: text }];
  });
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/70 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

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
