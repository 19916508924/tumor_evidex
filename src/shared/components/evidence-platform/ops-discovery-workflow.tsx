'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  FileSearch,
  LoaderCircle,
  RotateCcw,
  Search,
  Send,
  X,
} from 'lucide-react';

import type {
  DiscoveryPreviewDto,
  KnowledgeEntityListItem,
  PageResult,
} from '@/shared/types/evidence-platform-api';

import {
  isAbortError,
  ProductRequestError,
  requestProductData,
} from './client';

type EntityKind = 'diseases' | 'genes' | 'variants';
type ScopeMode = 'SCOPED' | 'ALL_KNOWLEDGE';
type DocumentLimit = 50 | 100 | 'ALL';
type DiscoverySource = 'PUBMED' | 'CIVIC';

export function NewDiscoveryRunPage({
  locale,
  navigate,
}: {
  locale: string;
  navigate?: (href: string) => void;
}) {
  const [scopeMode, setScopeMode] = useState<ScopeMode>('SCOPED');
  const [source, setSource] = useState<DiscoverySource>('PUBMED');
  const [selected, setSelected] = useState<
    Record<EntityKind, KnowledgeEntityListItem[]>
  >({ diseases: [], genes: [], variants: [] });
  const [documentLimit, setDocumentLimit] =
    useState<DocumentLimit>(50);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [preview, setPreview] = useState<DiscoveryPreviewDto | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const idempotencyKey = useRef('');

  const selectedCount = Object.values(selected).reduce(
    (total, values) => total + values.length,
    0
  );
  const canPreview = scopeMode === 'ALL_KNOWLEDGE' || selectedCount > 0;

  useEffect(() => {
    if (!preview) return;
    const update = () =>
      setExpired(new Date(preview.expiresAt).getTime() <= Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [preview]);

  function invalidatePreview() {
    setPreview(null);
    setExpired(false);
    setConfirmAll(false);
    setError('');
    idempotencyKey.current = '';
  }

  function updateScope(mode: ScopeMode) {
    setScopeMode(mode);
    invalidatePreview();
  }

  function updateSource(value: DiscoverySource) {
    setSource(value);
    if (value === 'CIVIC') {
      setFrom('');
      setTo('');
      setAdvancedOpen(false);
    }
    invalidatePreview();
  }

  async function submitPreview(event: FormEvent) {
    event.preventDefault();
    if (!canPreview) return;
    setPreviewing(true);
    setError('');
    setPreview(null);
    setConfirmAll(false);
    try {
      const windowValue = dateWindow(from, to);
      const data = await requestProductData<DiscoveryPreviewDto>(
        '/api/internal/v1/discovery-runs/preview',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...(source === 'CIVIC' ? { source } : {}),
            scope:
              scopeMode === 'ALL_KNOWLEDGE'
                ? { mode: 'ALL_KNOWLEDGE' }
                : {
                    mode: 'SCOPED',
                    diseaseIds: selected.diseases.map((item) => item.id),
                    geneIds: selected.genes.map((item) => item.id),
                    variantIds: selected.variants.map((item) => item.id),
                  },
            documentLimit,
            ...(windowValue ? { window: windowValue } : {}),
          }),
        }
      );
      setPreview(data);
      setExpired(new Date(data.expiresAt).getTime() <= Date.now());
      idempotencyKey.current = createIdempotencyKey(data.previewHash);
    } catch (reason) {
      setError(previewError(reason));
    } finally {
      setPreviewing(false);
    }
  }

  async function createRun() {
    if (!preview || expired) return;
    if (preview.documentLimit === 'ALL' && !confirmAll) {
      setConfirmAll(true);
      return;
    }
    setCreating(true);
    setError('');
    try {
      const data = await requestProductData<{
        run: { id: string };
        idempotent: boolean;
      }>('/api/internal/v1/discovery-runs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey.current,
        },
        body: JSON.stringify({
          previewToken: preview.previewToken,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const href = `/${locale}/ops/discovery-runs/${data.run.id}`;
      if (navigate) navigate(href);
      else window.location.assign(href);
    } catch (reason) {
      if (
        reason instanceof ProductRequestError &&
        reason.code === 'PREVIEW_TOKEN_EXPIRED'
      ) {
        setExpired(true);
        setError('预览已失效，请重新预览后再发起。');
      } else {
        setError('更新任务没有创建成功，当前范围已保留，请重试。');
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="mx-auto max-w-[94rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link
        href={`/${locale}/ops/discovery-runs`}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#175CD3] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
      >
        <ArrowLeft aria-hidden size={16} />
        返回更新记录
      </Link>
      <header className="mt-5 border-b border-[#B4CAE6] pb-7">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          发起知识更新
        </h1>
        <p className="mt-3 max-w-[70ch] text-sm leading-7 text-[#52637A]">
          先选择知识范围和文献数量，再预览实际检索计划。任务开始后会持续运行，合格文献进入审核队列，不会自动公开。
        </p>
      </header>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
        <form
          onSubmit={submitPreview}
          className="rounded-2xl bg-white/76 p-5 shadow-[0_20px_55px_rgba(20,70,140,0.08)] backdrop-blur-xl sm:p-7"
        >
          <fieldset>
            <legend className="text-lg font-semibold">选择证据来源</legend>
            <p className="mt-2 text-sm leading-6 text-[#52637A]">
              PubMed 用于常规文献发现；CIViC 试点仅导入候选 PMID，正文仍从 PubMed 获取并进入人工审核。
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                name="discovery-source"
                checked={source === 'PUBMED'}
                label="PubMed 文献"
                description="按检索式发现近期原始文献"
                onChange={() => updateSource('PUBMED')}
              />
              <ChoiceCard
                name="discovery-source"
                checked={source === 'CIVIC'}
                label="CIViC 公开知识库（试点）"
                description="限定当前 2 个癌种、5 个变异"
                onChange={() => updateSource('CIVIC')}
              />
            </div>
          </fieldset>

          <fieldset className="mt-7 border-t border-[#D6E2F1] pt-6">
            <legend className="text-lg font-semibold">选择更新范围</legend>
            <p className="mt-2 text-sm leading-6 text-[#52637A]">
              指定范围适合日常补充；全库适合需要统一检查的集中更新。
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                name="scope-mode"
                checked={scopeMode === 'SCOPED'}
                label="指定知识范围"
                description="按疾病、基因或变异组合检索"
                onChange={() => updateScope('SCOPED')}
              />
              <ChoiceCard
                name="scope-mode"
                checked={scopeMode === 'ALL_KNOWLEDGE'}
                label="全部已发布知识"
                description="覆盖当前目录中的全部关联"
                onChange={() => updateScope('ALL_KNOWLEDGE')}
              />
            </div>
          </fieldset>

          {scopeMode === 'SCOPED' ? (
            <div className="mt-6 grid gap-4 border-t border-[#D6E2F1] pt-6">
              <EntityTagPicker
                kind="diseases"
                label="疾病"
                selected={selected.diseases}
                onChange={(items) => {
                  setSelected((current) => ({ ...current, diseases: items }));
                  invalidatePreview();
                }}
              />
              <EntityTagPicker
                kind="genes"
                label="基因"
                selected={selected.genes}
                onChange={(items) => {
                  setSelected((current) => ({ ...current, genes: items }));
                  invalidatePreview();
                }}
              />
              <EntityTagPicker
                kind="variants"
                label="变异"
                selected={selected.variants}
                onChange={(items) => {
                  setSelected((current) => ({ ...current, variants: items }));
                  invalidatePreview();
                }}
              />
              {selectedCount === 0 ? (
                <p className="text-sm text-[#8A4B08]">
                  至少添加一个疾病、基因或变异，才能预览。
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 rounded-xl bg-[#EAF2FF] px-4 py-4 text-sm leading-6 text-[#264B78]">
              将根据当前已发布目录展开全部检索范围。正式处理前仍会先显示预计数量与警告。
            </div>
          )}

          <fieldset className="mt-7 border-t border-[#D6E2F1] pt-6">
            <legend className="text-lg font-semibold">文献数量</legend>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {([50, 100, 'ALL'] as const).map((limit) => (
                <label
                  key={limit}
                  className={`flex min-h-14 cursor-pointer items-center justify-center rounded-xl px-3 text-sm font-semibold transition ${documentLimit === limit ? 'bg-[#175CD3] text-white shadow-[0_9px_24px_rgba(23,92,211,0.2)]' : 'bg-[#EDF4FD] text-[#334A67] hover:bg-[#DDEBFF]'}`}
                >
                  <input
                    type="radio"
                    name="document-limit"
                    value={String(limit)}
                    checked={documentLimit === limit}
                    onChange={() => {
                      setDocumentLimit(limit);
                      invalidatePreview();
                    }}
                    className="sr-only"
                  />
                  {limit === 'ALL' ? '全部文献' : `${limit} 篇`}
                </label>
              ))}
            </div>
          </fieldset>

          {source === 'PUBMED' ? (
          <div className="mt-6 border-t border-[#D6E2F1] pt-6">
            <button
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((value) => !value)}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0B3975]"
            >
              <CalendarDays aria-hidden size={17} />
              限定文献时间
              <ChevronDown
                aria-hidden
                size={16}
                className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {advancedOpen ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-[#334A67]">
                  开始日期
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => {
                      setFrom(event.target.value);
                      invalidatePreview();
                    }}
                    className="mt-2 min-h-11 w-full rounded-xl border border-[#B4CAE6] bg-white px-3"
                  />
                </label>
                <label className="text-sm font-semibold text-[#334A67]">
                  结束日期
                  <input
                    type="date"
                    value={to}
                    onChange={(event) => {
                      setTo(event.target.value);
                      invalidatePreview();
                    }}
                    className="mt-2 min-h-11 w-full rounded-xl border border-[#B4CAE6] bg-white px-3"
                  />
                </label>
              </div>
            ) : null}
          </div>
          ) : (
            <div className="mt-6 rounded-xl bg-[#FFF7E8] px-4 py-4 text-sm leading-6 text-[#7A4A00]">
              CIViC 试点按当前公开库快照检索，不使用文献时间窗；预览数量是证据条目数，处理时会按 PMID 去重。
            </div>
          )}

          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-[#FFF1F0] px-4 py-3 text-sm font-semibold text-[#A23025]"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canPreview || previewing}
            className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#175CD3] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(23,92,211,0.24)] transition hover:bg-[#0F4EB7] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
          >
            {previewing ? (
              <LoaderCircle aria-hidden className="animate-spin" size={18} />
            ) : (
              <Search aria-hidden size={18} />
            )}
            {previewing ? '正在生成预览' : '预览更新范围'}
          </button>
        </form>

        <aside className="self-start xl:sticky xl:top-8">
          {preview ? (
            <PreviewPanel
              preview={preview}
              expired={expired}
              creating={creating}
              confirmAll={confirmAll}
              onCreate={createRun}
              onCancelAll={() => setConfirmAll(false)}
            />
          ) : (
            <div className="rounded-2xl bg-[#0B3975] p-6 text-white sm:p-7">
              <FileSearch aria-hidden size={26} className="text-[#A8CCFF]" />
              <h2 className="mt-6 text-xl font-semibold">预览后再开始</h2>
              <p className="mt-3 text-sm leading-7 text-[#D6E6FB]">
                预览不会创建任务或整理文献。你可以先确认覆盖范围、预计数量与时间窗，再决定是否发起。
              </p>
              <ol className="mt-7 grid gap-4 text-sm text-[#D6E6FB]">
                {['选择范围', '检查检索计划', '确认后持续运行'].map(
                  (item, index) => (
                    <li key={item} className="flex items-center gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/12 font-semibold text-white">
                        {index + 1}
                      </span>
                      {item}
                    </li>
                  )
                )}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function EntityTagPicker({
  kind,
  label,
  selected,
  onChange,
}: {
  kind: EntityKind;
  label: string;
  selected: KnowledgeEntityListItem[];
  onChange: (items: KnowledgeEntityListItem[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<KnowledgeEntityListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const value = query.trim();
    if (!value) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setFailed(false);
      requestProductData<
        PageResult<KnowledgeEntityListItem> & { release?: unknown }
      >(
        `/api/v1/knowledge/${kind}?q=${encodeURIComponent(value)}&page=1&pageSize=8`,
        { signal: controller.signal }
      )
        .then((data) =>
          setItems(
            data.items.filter(
              (item) => !selected.some((current) => current.id === item.id)
            )
          )
        )
        .catch((reason) => {
          if (!isAbortError(reason)) setFailed(true);
        })
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kind, query, selected]);

  return (
    <div>
      <label className="text-sm font-semibold text-[#334A67]">
        搜索{label}
        <span className="relative mt-2 block">
          <Search aria-hidden size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#60748D]" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (!value.trim()) {
                setItems([]);
                setFailed(false);
              }
            }}
            placeholder={`输入${label}名称或别名`}
            className="min-h-11 w-full rounded-xl border border-[#B4CAE6] bg-white pr-3 pl-9 text-sm font-normal outline-none focus:border-[#175CD3] focus:ring-2 focus:ring-[#A8CCFF]"
          />
        </span>
      </label>
      {selected.length ? (
        <div className="mt-2 flex flex-wrap gap-2" aria-label={`已选${label}`}>
          {selected.map((item) => (
            <span key={item.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#DDEBFF] py-1 pr-1 pl-3 text-sm font-semibold text-[#0B3975]">
              {entityName(item)}
              <button
                type="button"
                onClick={() => onChange(selected.filter((current) => current.id !== item.id))}
                className="grid size-8 place-items-center rounded-full hover:bg-white/65"
                aria-label={`移除 ${entityName(item)}`}
              >
                <X aria-hidden size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {query.trim() ? (
        <div className="mt-2 overflow-hidden rounded-xl bg-[#F3F7FD]">
          {loading ? <p className="px-3 py-3 text-sm text-[#60748D]">正在查找{label}</p> : null}
          {failed ? <p className="px-3 py-3 text-sm text-[#A23025]">暂时无法查找，请重试。</p> : null}
          {!loading && !failed && items.length === 0 ? <p className="px-3 py-3 text-sm text-[#60748D]">没有找到可添加的{label}</p> : null}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange([...selected, item]);
                setQuery('');
                setItems([]);
                setFailed(false);
              }}
              className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-[#D6E2F1] px-3 text-left text-sm last:border-0 hover:bg-[#DDEBFF]"
              aria-label={`添加 ${entityName(item)}`}
            >
              <span className="font-semibold">{entityName(item)}</span>
              <Check aria-hidden size={15} className="text-[#175CD3]" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChoiceCard({
  name,
  checked,
  label,
  description,
  onChange,
}: {
  name: string;
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label className={`cursor-pointer rounded-xl p-4 transition ${checked ? 'bg-[#DDEBFF] shadow-[inset_0_0_0_1px_#8FB9F0]' : 'bg-[#F3F7FD] hover:bg-[#EAF2FF]'}`}>
      <span className="flex items-center gap-2 font-semibold">
        <input
          type="radio"
          name={name}
          aria-label={label}
          checked={checked}
          onChange={onChange}
          className="size-4 accent-[#175CD3]"
        />
        {label}
      </span>
      <span className="mt-2 block pl-6 text-sm leading-6 text-[#52637A]">{description}</span>
    </label>
  );
}

function PreviewPanel({
  preview,
  expired,
  creating,
  confirmAll,
  onCreate,
  onCancelAll,
}: {
  preview: DiscoveryPreviewDto;
  expired: boolean;
  creating: boolean;
  confirmAll: boolean;
  onCreate: () => void;
  onCancelAll: () => void;
}) {
  return (
    <section className="rounded-2xl bg-[#0B3975] p-6 text-white shadow-[0_22px_60px_rgba(9,50,104,0.18)] sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">更新预览</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${expired ? 'bg-[#FEE4E2] text-[#B42318]' : 'bg-white/12 text-[#D6E6FB]'}`}>
          {expired ? '预览已失效' : `有效至 ${formatTime(preview.expiresAt)}`}
        </span>
      </div>
      <p className="mt-7 text-3xl font-semibold tracking-[-0.03em] tabular-nums">
        预计匹配 {preview.estimatedMatchCount} 篇文献
      </p>
      <p className="mt-2 text-sm text-[#C4DCF8]">
        {preview.documentLimit === 'ALL' ? '将处理去重后的全部文献' : `去重后最多处理 ${preview.documentLimit} 篇`}
      </p>
      <dl className="mt-7 grid gap-4 border-y border-white/15 py-6 text-sm">
        <RunFact
          label="证据来源"
          value={
            preview.snapshot.source === 'CIVIC'
              ? 'CIViC 候选 · PubMed 原文复核'
              : 'PubMed'
          }
        />
        <RunFact label="知识范围" value={preview.snapshot.mode === 'ALL_KNOWLEDGE' ? '全部已发布知识' : `${preview.snapshot.diseaseIds.length} 个疾病 · ${preview.snapshot.geneIds.length} 个基因 · ${preview.snapshot.variantIds.length} 个变异`} />
        <RunFact label="检索范围" value={`${preview.queries.length} 个子范围`} />
        <RunFact
          label="文献时间"
          value={
            preview.snapshot.source === 'CIVIC'
              ? '不适用（当前 CIViC 快照）'
              : `${formatDate(preview.window.from)} 至 ${formatDate(preview.window.to)}`
          }
        />
      </dl>
      {preview.warnings.length ? (
        <div className="mt-6 rounded-xl bg-white/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle aria-hidden size={17} className="text-[#FEC84B]" /> 开始前请注意</p>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#D6E6FB]">
            {preview.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
          </ul>
        </div>
      ) : null}
      {preview.estimatedMatchCount === 0 ? (
        <p className="mt-5 rounded-xl bg-white/10 p-4 text-sm leading-6 text-[#D6E6FB]">
          当前预览没有匹配文献。仍可创建任务以保存本次范围，但不会形成新候选。
        </p>
      ) : null}
      {expired ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#FFD4D0]"><CircleAlert aria-hidden size={17} /> 请回到左侧重新预览。</p>
      ) : null}
      {confirmAll ? (
        <div className="mt-6 rounded-xl bg-[#082E61] p-4">
          <p className="font-semibold">确认处理当前时间窗内的全部文献？</p>
          <p className="mt-2 text-sm leading-6 text-[#C4DCF8]">任务可能持续较长时间，但可以在运行详情中暂停或取消。</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <button type="button" disabled={creating} onClick={onCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#0B3975] disabled:opacity-45">
              {creating ? <LoaderCircle aria-hidden className="animate-spin" size={17} /> : <Send aria-hidden size={17} />}
              确认并处理全部文献
            </button>
            <button type="button" onClick={onCancelAll} className="min-h-11 rounded-lg px-4 text-sm font-semibold">返回检查</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={expired || creating}
          onClick={onCreate}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#0B3975] transition hover:bg-[#EAF2FF] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {creating ? <LoaderCircle aria-hidden className="animate-spin" size={18} /> : <Send aria-hidden size={18} />}
          {preview.documentLimit === 'ALL' ? '发起更新' : '确认并发起更新'}
        </button>
      )}
    </section>
  );
}

function RunFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <dt className="text-[#A8C5EA]">{label}</dt>
      <dd className="break-words font-semibold text-white">{value}</dd>
    </div>
  );
}

function entityName(item: KnowledgeEntityListItem) {
  return item.displayNameZh || item.canonicalName || item.displayNameEn;
}

function createIdempotencyKey(hash: string) {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `knowledge-update:${hash}:${suffix}`;
}

function dateWindow(from: string, to: string) {
  if (!from && !to) return null;
  return {
    ...(from ? { from: new Date(`${from}T00:00:00.000Z`).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59.999Z`).toISOString() } : {}),
  };
}

function previewError(reason: unknown) {
  if (reason instanceof ProductRequestError) {
    if (reason.code === 'DISCOVERY_SCOPE_CONFLICT') return '所选实体之间没有可用的知识关联，请调整范围后重试。';
    if (reason.code === 'INVALID_DISCOVERY_WINDOW') return '开始日期不能晚于结束日期。';
  }
  return '暂时无法生成预览，当前选择已保留，请重试。';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
}
