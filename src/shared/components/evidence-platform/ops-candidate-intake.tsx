'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookPlus,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react';

import type {
  OperationsAssociationDto,
  PageResult,
} from '@/shared/types/evidence-platform-api';

import {
  isAbortError,
  ProductRequestError,
  requestProductData,
} from './client';

interface CandidateSubmission {
  candidateId: string;
  reviewTaskId: string;
  duplicate?: boolean;
}

export function CandidateIntake({ locale }: { locale: string }) {
  const [associations, setAssociations] = useState<OperationsAssociationDto[]>(
    []
  );
  const [pmid, setPmid] = useState('');
  const [associationId, setAssociationId] = useState('');
  const [query, setQuery] = useState('');
  const [loadingAssociations, setLoadingAssociations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CandidateSubmission | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestProductData<PageResult<OperationsAssociationDto>>(
      '/api/internal/v1/associations?page=1&pageSize=100',
      { signal: controller.signal }
    )
      .then((data) => setAssociations(data.items))
      .catch((reason) => {
        if (!isAbortError(reason)) {
          setError('治疗关联暂时无法读取，请刷新后重试。');
        }
      })
      .finally(() => setLoadingAssociations(false));
    return () => controller.abort();
  }, []);

  const visibleAssociations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    if (!normalized) return associations;
    return associations.filter((item) =>
      associationLabel(item).toLocaleLowerCase('zh-CN').includes(normalized)
    );
  }, [associations, query]);

  const validPmid = /^[1-9][0-9]{0,9}$/.test(pmid.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validPmid || !associationId) {
      setError(
        !validPmid
          ? '请输入 1 至 10 位、且不以 0 开头的 PMID。'
          : '请选择这篇文献对应的治疗关联。'
      );
      return;
    }
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const data = await requestProductData<CandidateSubmission>(
        '/api/internal/v1/candidates',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            pmid: pmid.trim(),
            associationId,
          }),
        }
      );
      setResult(data);
    } catch (reason) {
      setError(candidateError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white/72 p-5 shadow-[0_18px_48px_rgba(20,70,140,0.08)] backdrop-blur-xl sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#DDEBFF] text-[#175CD3]">
          <BookPlus aria-hidden size={21} />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">
            按 PMID 添加单篇文献
          </h2>
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[#52637A]">
            系统会读取 PubMed 记录、整理结构化证据并送入医学审核，不会绕过审核直接发布。
          </p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mt-6 grid gap-4 lg:grid-cols-[minmax(12rem,0.55fr)_minmax(22rem,1.45fr)_auto] lg:items-end"
      >
        <label className="text-sm font-semibold text-[#334A67]">
          PubMed PMID
          <input
            inputMode="numeric"
            value={pmid}
            onChange={(event) => {
              setPmid(event.target.value.replace(/\D/g, '').slice(0, 10));
              setError('');
              setResult(null);
            }}
            placeholder="例如 29151359"
            className="mt-2 min-h-11 w-full rounded-xl border border-[#B4CAE6] bg-white px-3 text-sm outline-none transition focus:border-[#175CD3] focus:ring-2 focus:ring-[#A8CCFF]"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-[minmax(10rem,0.65fr)_minmax(14rem,1.35fr)]">
          <label className="text-sm font-semibold text-[#334A67]">
            搜索关联
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="疾病、基因或药物"
              className="mt-2 min-h-11 w-full rounded-xl border border-[#B4CAE6] bg-white px-3 text-sm outline-none transition focus:border-[#175CD3] focus:ring-2 focus:ring-[#A8CCFF]"
            />
          </label>
          <label className="text-sm font-semibold text-[#334A67]">
            对应治疗关联
            <select
              value={associationId}
              onChange={(event) => {
                setAssociationId(event.target.value);
                setError('');
                setResult(null);
              }}
              disabled={loadingAssociations}
              className="mt-2 min-h-11 w-full rounded-xl border border-[#B4CAE6] bg-white px-3 text-sm outline-none transition focus:border-[#175CD3] focus:ring-2 focus:ring-[#A8CCFF] disabled:opacity-55"
            >
              <option value="">
                {loadingAssociations ? '正在读取可选关联' : '请选择关联'}
              </option>
              {visibleAssociations.map((item) => (
                <option key={item.id} value={item.id}>
                  {associationLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting || loadingAssociations}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#175CD3] px-5 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(23,92,211,0.22)] transition hover:bg-[#0F4EB7] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? (
            <LoaderCircle aria-hidden className="animate-spin" size={17} />
          ) : (
            <BookPlus aria-hidden size={17} />
          )}
          {submitting ? '正在整理文献' : '添加并开始整理'}
        </button>
      </form>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[#FFF1F0] px-4 py-3 text-sm font-semibold text-[#A23025]"
        >
          {error}
        </p>
      ) : null}
      {result ? (
        <div
          role="status"
          className="mt-4 flex flex-col gap-3 rounded-xl bg-[#E8F7ED] px-4 py-3 text-sm text-[#145C32] sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <CheckCircle2 aria-hidden size={18} />
            {result.duplicate
              ? '这篇文献已在整理流程中'
              : '文献已进入整理流程'}
          </span>
          <div className="flex flex-wrap gap-4">
            <Link
              href={`/${locale}/ops/candidates/${result.candidateId}`}
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[#0B3975]"
            >
              查看候选 <ArrowRight aria-hidden size={15} />
            </Link>
            {result.reviewTaskId ? (
              <Link
                href={`/${locale}/ops/reviews/${result.reviewTaskId}`}
                className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[#0B3975]"
              >
                进入审核 <ArrowRight aria-hidden size={15} />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function associationLabel(item: OperationsAssociationDto) {
  const drugNames = item.drugs
    .map((drug) => drug.displayNameZh || drug.genericName)
    .filter(Boolean)
    .join(' + ');
  return [
    item.diseaseDisplayNameZh,
    item.geneSymbol,
    item.canonicalKey,
    drugNames,
  ]
    .filter(Boolean)
    .join(' · ');
}

function candidateError(reason: unknown) {
  if (reason instanceof ProductRequestError) {
    if (reason.code === 'ASSOCIATION_NOT_FOUND') {
      return '所选治疗关联已不可用，请重新选择。';
    }
    if (reason.code === 'CANDIDATE_PROCESSING_FAILED') {
      return '暂时无法整理这篇文献，请核对 PMID 或稍后重试。';
    }
  }
  return '文献没有添加成功，请保留当前内容并重试。';
}
