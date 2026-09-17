'use client';

import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';

import type {
  ReviewDecisionType,
  ReviewTaskSnapshot,
} from '@/shared/services/evidence-platform/review-publish';
import type { EvidenceDraftInput } from '@/shared/services/evidence-platform/upstream-workflow';

const requestedFieldOptions = [
  ['claims.conclusion', '结论'],
  ['claims.limitations', '局限性'],
  ['claims.studyType', '研究类型'],
  ['claims.populationSummary', '研究人群'],
  ['proposedLevel', '建议等级'],
  ['passages', '原文定位'],
] as const;

export function ReviewSidebar({
  task,
  draft,
  qaIssues,
  terminal,
  decision,
  comment,
  requestedFields,
  saving,
  onSelectDecision,
  onCommentChange,
  onRequestedFieldsChange,
  onConfirm,
  onCancel,
}: {
  task: ReviewTaskSnapshot;
  draft: EvidenceDraftInput;
  qaIssues: EvidenceDraftInput['qaIssues'];
  terminal: boolean;
  decision: ReviewDecisionType | null;
  comment: string;
  requestedFields: string[];
  saving: boolean;
  onSelectDecision: (decision: ReviewDecisionType) => void;
  onCommentChange: (comment: string) => void;
  onRequestedFieldsChange: (fields: string[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <aside className="self-start rounded-2xl bg-foreground p-5 text-background shadow-lg xl:sticky xl:top-6">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden size={19} className="text-primary" />
        <h2 className="text-lg font-semibold">质量检查</h2>
      </div>
      <div className="mt-6 grid gap-3">
        <QualityLine
          label="完整性"
          value={task.hasBlockingIssues ? '存在阻断' : '通过'}
          pass={!task.hasBlockingIssues}
        />
        <QualityLine
          label="阻断问题"
          value={task.hasBlockingIssues ? '存在' : '没有'}
          pass={!task.hasBlockingIssues}
        />
        <QualityLine
          label="重复与冲突"
          value={qaIssues.length ? `${qaIssues.length} 项提示` : '未发现'}
          pass={qaIssues.length === 0}
        />
      </div>
      <div className="mt-6 border-t border-background/20 pt-5 text-sm">
        <p className="font-semibold">整理记录</p>
        <dl className="mt-3 grid gap-2 text-background/75">
          <div>
            <dt className="inline">整理方式：</dt>
            <dd className="inline text-background">自动整理后人工复核</dd>
          </div>
          <div>
            <dt className="inline">质量提示：</dt>
            <dd className="inline text-background">{qaIssues.length} 项</dd>
          </div>
        </dl>
        {qaIssues.length ? (
          <ul className="mt-3 grid gap-2 text-background/75">
            {qaIssues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>· {issue.message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-7 border-t border-background/20 pt-6">
        <h3 className="text-sm font-semibold">审核决定</h3>
        <div className="mt-3 grid gap-2">
          <DecisionButton
            label="退回修改"
            disabled={terminal}
            onClick={() => onSelectDecision('REQUEST_CHANGES')}
          />
          <DecisionButton
            label="拒绝候选"
            disabled={terminal}
            onClick={() => onSelectDecision('REJECT')}
          />
          <button
            type="button"
            disabled={task.hasBlockingIssues || terminal}
            onClick={() => onSelectDecision('APPROVE_AND_PUBLISH')}
            className="min-h-11 rounded-lg bg-background px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
          >
            审核并发布
          </button>
        </div>
      </div>

      {decision ? (
        <div className="mt-5 rounded-xl bg-background/10 p-4">
          <p className="text-sm font-semibold">
            {decision === 'REQUEST_CHANGES'
              ? '选择需要修改的字段'
              : decision === 'REJECT'
                ? '说明拒绝原因'
                : '确认审核并发布'}
          </p>
          {decision === 'APPROVE_AND_PUBLISH' ? (
            <PublicationPreview task={task} draft={draft} />
          ) : null}
          {decision === 'REQUEST_CHANGES' ? (
            <fieldset className="mt-3 grid grid-cols-2 gap-2">
              <legend className="sr-only">需要修改的字段</legend>
              {requestedFieldOptions.map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-11 items-center gap-2 rounded-lg bg-background/10 px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={requestedFields.includes(value)}
                    onChange={(event) =>
                      onRequestedFieldsChange(
                        event.target.checked
                          ? [...requestedFields, value]
                          : requestedFields.filter((item) => item !== value)
                      )
                    }
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="mt-3 block text-sm font-semibold">
            {decision === 'REJECT'
              ? '拒绝原因'
              : decision === 'APPROVE_AND_PUBLISH'
                ? '批准说明（必填）'
                : '审核说明'}
            <textarea
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              required={
                decision === 'REJECT' || decision === 'APPROVE_AND_PUBLISH'
              }
              aria-invalid={
                (decision === 'REJECT' ||
                  decision === 'APPROVE_AND_PUBLISH') &&
                !comment.trim()
              }
              aria-describedby={
                decision === 'APPROVE_AND_PUBLISH' && !comment.trim()
                  ? 'approval-comment-requirement'
                  : undefined
              }
              placeholder={
                decision === 'REJECT'
                  ? '必填：说明不纳入的判断依据'
                  : decision === 'APPROVE_AND_PUBLISH'
                    ? '必填：说明批准发布的核验依据'
                    : '可选：补充审核说明'
              }
              rows={3}
              className="mt-2 w-full rounded-lg border border-background/20 bg-foreground p-3 text-sm font-normal text-background outline-none placeholder:text-background/55 focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {decision === 'APPROVE_AND_PUBLISH' && !comment.trim() ? (
            <p
              id="approval-comment-requirement"
              role="alert"
              className="mt-2 text-xs leading-5 text-amber-200"
            >
              批准发布前必须填写审核说明。
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={
                saving ||
                (decision === 'REQUEST_CHANGES' &&
                  requestedFields.length === 0) ||
                ((decision === 'REJECT' ||
                  decision === 'APPROVE_AND_PUBLISH') &&
                  !comment.trim())
              }
              className="min-h-11 flex-1 rounded-lg bg-background px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
            >
              {decision === 'REQUEST_CHANGES'
                ? '确认退回'
                : decision === 'REJECT'
                  ? '确认拒绝'
                  : '确认审核并发布'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-lg px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function PublicationPreview({
  task,
  draft,
}: {
  task: ReviewTaskSnapshot;
  draft: EvidenceDraftInput;
}) {
  const serverPreview = task.publicationPreview;
  const currentRelease = serverPreview
    ? serverPreview.currentRelease
    : task.currentRelease;
  const expectedNextRelease = serverPreview
    ? serverPreview.expectedNextRelease
    : task.expectedNextRelease;
  const currentLevel = serverPreview?.currentApprovedLevel ?? null;
  const proposedLevel =
    serverPreview?.proposedApprovedLevel ?? draft.proposedLevel;
  const proposedRationale =
    serverPreview?.proposedGradingRationale ?? draft.gradingRationale;
  const levelChanged = Boolean(serverPreview?.levelChanged && currentLevel);
  const newClaimCount = serverPreview?.newClaimCount ?? draft.claims.length;
  const modifiedClaimCount = serverPreview?.modifiedClaimCount ?? 0;
  const sourceExternalId =
    serverPreview?.source?.externalId ?? task.candidate?.externalId;
  const sourceScope =
    serverPreview?.source?.sourceScope ?? task.candidate?.sourceScope;

  return (
    <section
      aria-label="发布变更摘要"
      className="mt-3 rounded-xl border border-background/15 bg-background/8 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">本次拟发布内容</h4>
          <p className="mt-1 text-xs leading-5 text-background/65">
            以下为当前草稿内容，不代表已对正式知识做字段差异比对。
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/20 px-2 py-1 text-[0.6875rem] font-semibold text-blue-100">
          发布前核对
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SummaryMetric label="拟新增证据结论" value={`${newClaimCount} 条`} />
        <SummaryMetric
          label="修改已发布结论"
          value={`${modifiedClaimCount} 条`}
        />
        <SummaryMetric
          label="当前发布版本"
          value={currentRelease?.version ?? '暂无已发布版本'}
        />
        <SummaryMetric
          label="发布后版本"
          value={expectedNextRelease ?? '由发布结果确定'}
        />
      </dl>

      <div className="mt-3 rounded-lg bg-background/8 p-3 text-xs leading-5">
        <p className="text-background/65">证据等级</p>
        <p className="mt-1 font-semibold">
          {currentLevel
            ? levelChanged
              ? `${currentLevel} → ${proposedLevel}`
              : `${proposedLevel}（保持不变）`
            : `拟发布为 ${proposedLevel}`}
        </p>
        {serverPreview?.currentGradingRationale ? (
          <p className="mt-2 text-background/65">
            当前依据：{serverPreview.currentGradingRationale}
          </p>
        ) : null}
        <p className="mt-2 text-background/80">分级依据：{proposedRationale}</p>
      </div>

      <dl className="mt-3 grid gap-1 text-xs leading-5 text-background/75">
        <div>
          <dt className="inline">文献标识：</dt>
          <dd className="inline font-semibold text-background">
            PMID {sourceExternalId ?? '暂未提供'}
          </dd>
        </div>
        <div>
          <dt className="inline">来源范围：</dt>
          <dd className="inline font-semibold text-background">
            {formatSourceScope(sourceScope)}
          </dd>
        </div>
      </dl>

      <ol className="mt-3 grid gap-2">
        {draft.claims.map((claim, index) => (
          <li
            key={claim.id}
            className="rounded-lg border border-background/10 bg-foreground/30 p-3 text-xs leading-5"
          >
            <p className="font-semibold">证据结论 {index + 1}</p>
            <dl className="mt-2 grid gap-1 text-background/75">
              <SummaryField label="研究类型" value={claim.studyType} />
              <SummaryField label="研究人群" value={claim.populationSummary} />
              <SummaryField label="研究终点" value={claim.endpoint} />
              <SummaryField
                label="效应量"
                value={formatPreviewEffectValue(claim.effectValue)}
              />
              <SummaryField label="结论" value={claim.conclusion} />
              <SummaryField label="局限性" value={claim.limitations} />
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/8 p-2.5">
      <dt className="text-background/60">{label}</dt>
      <dd className="mt-1 font-semibold text-background">{value}</dd>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline">{label}：</dt>
      <dd className="inline text-background">{value || '暂未提供'}</dd>
    </div>
  );
}

const previewEffectLabels: Record<string, string> = {
  pValue: 'P 值',
  hazardRatio: '危险比',
  hazardRatioForDeath: '死亡危险比',
  oddsRatio: '优势比',
  riskRatio: '相对风险',
  confidenceInterval95: '95% 置信区间',
  medianMonthsComparator: '对照组中位月数',
  medianMonthsIntervention: '干预组中位月数',
  medianProgressionFreeSurvivalMonths: '中位无进展生存月数',
  objectiveResponseRatePercent: '客观缓解率',
  diseaseControlRatePercent: '疾病控制率',
};

function formatPreviewEffectValue(
  value: Record<string, unknown> | null,
  parentLabel = ''
): string {
  if (!value || Object.keys(value).length === 0) return '暂未提供';
  return Object.entries(value)
    .flatMap(([key, item]) => {
      const label =
        (previewEffectLabels[key] ?? parentLabel) || '其他效应指标';
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return formatPreviewEffectValue(
          item as Record<string, unknown>,
          label
        ).split('；');
      }
      const formatted = Array.isArray(item)
        ? item.join(' 至 ')
        : typeof item === 'number' && /Percent$/.test(key)
          ? `${item}%`
          : String(item ?? '暂未提供');
      return [`${label}：${formatted}`];
    })
    .join('；');
}

function formatSourceScope(scope?: 'ABSTRACT' | 'PMC_FULL_TEXT') {
  if (scope === 'PMC_FULL_TEXT') return 'PMC 全文';
  if (scope === 'ABSTRACT') return 'PubMed 摘要';
  return '暂未提供';
}

function DecisionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 rounded-lg bg-background/10 px-3 text-left text-sm font-semibold outline-none transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
    >
      {label}
    </button>
  );
}

function QualityLine({
  label,
  value,
  pass,
}: {
  label: string;
  value: string;
  pass: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-background/10 px-3 py-3 text-sm">
      <span className="text-background/75">{label}</span>
      <span className="inline-flex items-center gap-1.5 font-semibold">
        {pass ? (
          <Check aria-hidden size={14} className="text-emerald-300" />
        ) : (
          <AlertTriangle aria-hidden size={14} className="text-amber-300" />
        )}
        {value}
      </span>
    </div>
  );
}

export function ReviewStatusBadge({
  value,
}: {
  value: ReviewTaskSnapshot['status'];
}) {
  const labels: Record<ReviewTaskSnapshot['status'], string> = {
    PENDING: '等待开始',
    IN_REVIEW: '审核中',
    REQUESTED_CHANGES: '已退回修改',
    READY_FOR_REVIEW: '等待审核',
    REJECTED: '已拒绝',
    PUBLISHING: '正在发布',
    PUBLISHED: '已发布',
    PUBLISH_FAILED: '发布失败',
  };
  const danger = ['REJECTED', 'PUBLISH_FAILED'].includes(value);
  const pending = ['PENDING', 'IN_REVIEW', 'READY_FOR_REVIEW', 'PUBLISHING'].includes(
    value
  );
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-3 text-xs font-semibold ${
        danger
          ? 'bg-destructive/10 text-destructive'
          : pending
            ? 'bg-amber-100 text-amber-900'
            : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {labels[value]}
    </span>
  );
}
