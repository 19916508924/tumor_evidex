'use client';

import { ArrowUpRight, FileSearch } from 'lucide-react';

import type { ReviewTaskSnapshot } from '@/shared/services/evidence-platform/review-publish';
import type { EvidenceDraftInput } from '@/shared/services/evidence-platform/upstream-workflow';

import {
  formatFieldPath,
  formatPassageLocator,
  roleLabels,
  type PassageRole,
} from './ops-review-model';

export function ReviewSourcePanel({
  candidate,
  passages,
  activeFieldPath,
  activePassageIds,
  abstractExpanded,
  disabled,
  onToggleAbstract,
  onToggleMapping,
  onRoleChange,
}: {
  candidate: ReviewTaskSnapshot['candidate'];
  passages: EvidenceDraftInput['passages'];
  activeFieldPath: string;
  activePassageIds: Set<string>;
  abstractExpanded: boolean;
  disabled: boolean;
  onToggleAbstract: () => void;
  onToggleMapping: (passageId: string, selected: boolean) => void;
  onRoleChange: (passageId: string, role: PassageRole) => void;
}) {
  const hasMapping = activePassageIds.size > 0;
  return (
    <section className="self-start rounded-2xl border border-border bg-card/80 p-5 text-card-foreground shadow-sm backdrop-blur-xl xl:sticky xl:top-6">
      <div className="flex items-center gap-2">
        <FileSearch aria-hidden size={19} className="text-primary" />
        <h2 className="text-lg font-semibold">来源原文</h2>
      </div>
      <h3 className="mt-5 leading-6 font-semibold" lang="en">
        {candidate?.title || '未提供文献标题'}
      </h3>
      <p className="mt-2 text-xs text-muted-foreground">
        {[candidate?.journal, candidate?.publicationDate]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {candidate?.abstract ? (
        <div className="mt-5 rounded-xl bg-muted/60 p-4">
          <blockquote
            className={`text-sm leading-7 text-muted-foreground ${abstractExpanded ? '' : 'line-clamp-5'}`}
            lang="en"
          >
            {candidate.abstract}
          </blockquote>
          <button
            type="button"
            onClick={onToggleAbstract}
            className="mt-2 min-h-11 rounded-lg text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {abstractExpanded ? '收起完整摘要' : '展开完整摘要'}
          </button>
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">
          当前来源没有可展示原文，请使用来源链接核验。
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">当前字段依据</h3>
        <span className="max-w-[13rem] truncate text-xs font-semibold text-muted-foreground">
          {formatFieldPath(activeFieldPath)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        勾选支撑当前字段的原文，并确认每段原文承担的依据角色。
      </p>
      {!hasMapping ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900"
        >
          这个字段没有可定位的原文依据
        </p>
      ) : null}
      <div className="mt-3 grid gap-3">
        {passages.map((passage) => {
          const highlighted = activePassageIds.has(passage.id);
          const locator = formatPassageLocator(passage);
          return (
            <article
              key={passage.id}
              data-highlighted={String(highlighted)}
              className={`rounded-xl border p-4 transition-colors ${
                highlighted
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-background/70'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{locator}</span>
                <label className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={highlighted}
                    disabled={disabled}
                    onChange={(event) =>
                      onToggleMapping(passage.id, event.target.checked)
                    }
                    aria-label={`关联 ${locator}到当前字段`}
                    className="size-4 accent-primary"
                  />
                  关联字段
                </label>
              </div>
              <p
                className="mt-2 text-sm leading-6 text-foreground"
                lang="en"
                data-highlighted={String(highlighted)}
              >
                {passage.text}
              </p>
              <label className="mt-3 block text-xs font-semibold text-muted-foreground">
                依据角色
                <select
                  value={passage.supportRole}
                  disabled={disabled}
                  onChange={(event) =>
                    onRoleChange(passage.id, event.target.value as PassageRole)
                  }
                  aria-label={`${locator}的依据角色`}
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted"
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          );
        })}
      </div>
      {candidate?.sourceUrl ? (
        <a
          href={candidate.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          打开来源原页 <ArrowUpRight aria-hidden size={15} />
        </a>
      ) : null}
    </section>
  );
}
