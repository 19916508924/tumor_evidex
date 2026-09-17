'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  IconArrowRight,
  IconDatabase,
  IconLoader2,
  IconShieldCheck,
} from '@tabler/icons-react';

import {
  evidenceQueryOptions,
  type SupportedDisease,
} from '@/shared/services/evidence/query-catalog';

export interface LandingEvidenceDemoCopy {
  eyebrow: string;
  title: string;
  description: string;
  disease_label: string;
  variant_label: string;
  submit: string;
  submitting: string;
  idle_title: string;
  idle_body: string;
  result_title: string;
  summary_unavailable: string;
  no_evidence: string;
  out_of_scope: string;
  error: string;
  therapy_count: string;
  claim_count: string;
  source_count: string;
  release_label: string;
  open_workspace: string;
  language_note: string;
  result_region: string;
}

interface DemoDrug {
  id: string;
  displayNameEn: string;
  displayNameZh: string;
}

interface DemoTherapy {
  associationId: string;
  drugs: DemoDrug[];
  evidenceClaims: Array<{ id: string }>;
  regulatoryApprovals: Array<{ id: string }>;
}

interface DemoGroup {
  scope: string;
  therapies: DemoTherapy[];
}

interface DemoSuccessData {
  status: 'ANSWERED' | 'SUMMARY_UNAVAILABLE';
  knowledge: { release: string };
  resultGroups: DemoGroup[];
}

type DemoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DemoSuccessData }
  | { status: 'no-evidence' }
  | { status: 'out-of-scope' }
  | { status: 'error' };

interface DemoEnvelope {
  code: number;
  data?:
    | DemoSuccessData
    | { status: 'NO_CURATED_EVIDENCE' }
    | { status: 'OUT_OF_SCOPE' };
}

export function LandingEvidenceDemo({
  copy,
  locale,
}: {
  copy: LandingEvidenceDemoCopy;
  locale: string;
}) {
  const [disease, setDisease] = useState<SupportedDisease>('NSCLC');
  const [variantKey, setVariantKey] = useState<string>(
    'EGFR|SNV|p.L858R'
  );
  const [state, setState] = useState<DemoState>({ status: 'idle' });

  const availableVariants = useMemo(() => {
    const keys = new Set(
      evidenceQueryOptions.queries
        .filter(([queryDisease]) => queryDisease === disease)
        .map(([, key]) => key)
    );
    return evidenceQueryOptions.variants.filter((variant) =>
      keys.has(variant.canonicalVariantKey)
    );
  }, [disease]);

  const handleDiseaseChange = (nextDisease: SupportedDisease) => {
    setDisease(nextDisease);
    const firstQuery = evidenceQueryOptions.queries.find(
      ([queryDisease]) => queryDisease === nextDisease
    );
    if (firstQuery) setVariantKey(firstQuery[1]);
    setState({ status: 'idle' });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const variant = evidenceQueryOptions.variants.find(
      (item) => item.canonicalVariantKey === variantKey
    );
    if (!variant) {
      setState({ status: 'error' });
      return;
    }

    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/v1/evidence-answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          disease,
          biomarkers: [
            {
              gene: variant.gene,
              alterationType: variant.alterationType,
              hgvsp: variant.hgvsp,
            },
          ],
          jurisdiction: 'US',
          locale: 'zh-CN',
        }),
      });
      const payload = (await response.json()) as DemoEnvelope;
      if (!response.ok || payload.code !== 0 || !payload.data) {
        setState({ status: 'error' });
        return;
      }
      if (payload.data.status === 'NO_CURATED_EVIDENCE') {
        setState({ status: 'no-evidence' });
        return;
      }
      if (payload.data.status === 'OUT_OF_SCOPE') {
        setState({ status: 'out-of-scope' });
        return;
      }
      setState({ status: 'success', data: payload.data });
    } catch {
      setState({ status: 'error' });
    }
  };

  const therapies =
    state.status === 'success'
      ? state.data.resultGroups.flatMap((group) => group.therapies)
      : [];
  const claims = therapies.reduce(
    (total, therapy) => total + therapy.evidenceClaims.length,
    0
  );
  const sources = therapies.reduce(
    (total, therapy) =>
      total + therapy.evidenceClaims.length + therapy.regulatoryApprovals.length,
    0
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#8DB6EA]/50 bg-white/75 p-5 shadow-[0_24px_70px_rgba(20,70,140,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl supports-[not_(backdrop-filter:blur(1px))]:bg-[#F8FBFF] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-[#C7D9F2] pb-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[#175CD3] uppercase">
            {copy.eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[#0B1F3A]">
            {copy.title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#52637A]">
            {copy.description}
          </p>
        </div>
        <IconShieldCheck
          aria-hidden
          className="shrink-0 text-[#175CD3]"
          size={26}
          stroke={1.6}
        />
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-[#243B5A]">
          {copy.disease_label}
          <select
            value={disease}
            onChange={(event) =>
              handleDiseaseChange(event.target.value as SupportedDisease)
            }
            className="min-h-11 w-full rounded-[10px] border border-[#A9C4EA] bg-white px-3 text-[#0B1F3A] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
          >
            {evidenceQueryOptions.diseases.map((item) => (
              <option key={item.code} value={item.code}>
                {locale === 'zh' ? item.labelZh : item.labelEn}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#243B5A]">
          {copy.variant_label}
          <select
            value={variantKey}
            onChange={(event) => {
              setVariantKey(event.target.value);
              setState({ status: 'idle' });
            }}
            className="min-h-11 w-full rounded-[10px] border border-[#A9C4EA] bg-white px-3 font-mono text-sm text-[#0B1F3A] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
          >
            {availableVariants.map((variant) => (
              <option
                key={variant.canonicalVariantKey}
                value={variant.canonicalVariantKey}
              >
                {variant.gene} {variant.hgvsp}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={state.status === 'loading'}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-[#175CD3] px-5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_8px_22px_rgba(23,92,211,0.22)] transition duration-200 hover:bg-[#134EAE] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:cursor-wait disabled:opacity-70 sm:col-span-2"
        >
          {state.status === 'loading' ? (
            <IconLoader2 aria-hidden className="animate-spin" size={18} />
          ) : (
            <IconDatabase aria-hidden size={18} stroke={1.8} />
          )}
          {state.status === 'loading' ? copy.submitting : copy.submit}
        </button>
      </form>

      <div
        aria-label={copy.result_region}
        aria-live="polite"
        className="mt-5 min-h-32 rounded-xl border border-[#C7D9F2] bg-[#F4F8FF] p-4"
      >
        {state.status === 'idle' && (
          <div className="flex h-full min-h-24 items-center gap-3 text-[#52637A]">
            <IconArrowRight aria-hidden size={21} stroke={1.6} />
            <div>
              <p className="font-semibold text-[#243B5A]">{copy.idle_title}</p>
              <p className="mt-1 text-sm">{copy.idle_body}</p>
            </div>
          </div>
        )}
        {state.status === 'loading' && (
          <div className="grid min-h-24 animate-pulse grid-cols-3 gap-3" aria-hidden>
            <div className="rounded-lg bg-[#DCE9FA]" />
            <div className="rounded-lg bg-[#DCE9FA]" />
            <div className="rounded-lg bg-[#DCE9FA]" />
          </div>
        )}
        {state.status === 'success' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#0B1F3A]">{copy.result_title}</p>
              <span className="rounded-full border border-[#8DB6EA] bg-white px-2.5 py-1 font-mono text-xs text-[#0B3975]">
                <span className="font-sans">{copy.release_label}</span>{' '}
                <span>{state.data.knowledge.release}</span>
              </span>
            </div>
            {state.data.status === 'SUMMARY_UNAVAILABLE' && (
              <p className="mt-2 text-sm leading-6 text-[#6B4A13]">
                {copy.summary_unavailable}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                [copy.therapy_count, therapies.length],
                [copy.claim_count, claims],
                [copy.source_count, sources],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-white p-3">
                  <dt className="text-xs text-[#52637A]">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-[#0B1F3A]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {therapies.flatMap((therapy) =>
                therapy.drugs.map((drug) => (
                  <span
                    key={`${therapy.associationId}-${drug.id}`}
                    className="rounded-full border border-[#A9C4EA] bg-white px-3 py-1 text-sm font-semibold text-[#0B3975]"
                  >
                    {locale === 'zh' ? drug.displayNameZh : drug.displayNameEn}
                  </span>
                ))
              )}
            </div>
          </div>
        )}
        {state.status === 'no-evidence' && (
          <p className="flex min-h-24 items-center text-sm leading-6 text-[#52637A]">
            {copy.no_evidence}
          </p>
        )}
        {state.status === 'out-of-scope' && (
          <p className="flex min-h-24 items-center text-sm leading-6 text-[#52637A]">
            {copy.out_of_scope}
          </p>
        )}
        {state.status === 'error' && (
          <p className="flex min-h-24 items-center text-sm leading-6 text-[#9B2C2C]">
            {copy.error}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#52637A]">
        <p>{copy.language_note}</p>
        <Link
          href="/zh/ask"
          className="inline-flex min-h-11 items-center gap-1.5 font-semibold whitespace-nowrap text-[#175CD3] underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
        >
          {copy.open_workspace}
          <IconArrowRight aria-hidden size={16} stroke={1.8} />
        </Link>
      </div>
    </div>
  );
}
