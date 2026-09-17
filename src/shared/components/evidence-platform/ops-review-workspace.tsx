'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Settings2 } from 'lucide-react';

import type {
  ReviewDecisionType,
  ReviewDecisionResult,
  ReviewTaskSnapshot,
} from '@/shared/services/evidence-platform/review-publish';
import type { EvidenceDraftInput } from '@/shared/services/evidence-platform/upstream-workflow';

import {
  isAbortError,
  ProductRequestError,
  requestProductData,
} from './client';
import {
  ClaimEditor,
  DraftOverview,
  getDraftEditorErrors,
} from './ops-review-draft-editor';
import type { EvidenceClaim, PassageRole } from './ops-review-model';
import {
  ReviewSidebar,
  ReviewStatusBadge,
} from './ops-review-sidebar';
import { ReviewSourcePanel } from './ops-review-source-panel';

export function ReviewWorkspace({
  locale,
  id,
}: {
  locale: string;
  id: string;
}) {
  const [task, setTask] = useState<ReviewTaskSnapshot | null>(null);
  const [draft, setDraft] = useState<EvidenceDraftInput | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflicted, setConflicted] = useState(false);
  const [decision, setDecision] = useState<ReviewDecisionType | null>(null);
  const [comment, setComment] = useState('');
  const [requestedFields, setRequestedFields] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeFieldPath, setActiveFieldPath] = useState('claims.0.conclusion');
  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const initialDraftRef = useRef('');

  const loadTask = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const nextTask = await requestProductData<ReviewTaskSnapshot>(
          `/api/internal/v1/review-tasks/${encodeURIComponent(id)}`,
          { signal }
        );
        if (!nextTask.draft) {
          setTask(null);
          setDraft(null);
          setError('审核任务缺少可编辑草稿。');
          return;
        }
        setTask(nextTask);
        setDraft(nextTask.draft);
        initialDraftRef.current = JSON.stringify(nextTask.draft);
        setConflicted(false);
      } catch (requestError) {
        if (!isAbortError(requestError)) {
          setTask(null);
          setDraft(null);
          setError('审核任务暂时无法加载。');
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadTask(controller.signal);
    return () => controller.abort();
  }, [loadTask]);

  const dirty = Boolean(draft) && JSON.stringify(draft) !== initialDraftRef.current;
  const terminal = task
    ? !['PENDING', 'IN_REVIEW', 'READY_FOR_REVIEW'].includes(task.status)
    : false;
  const draftErrors = useMemo(
    () => (draft ? getDraftEditorErrors(draft) : []),
    [draft]
  );

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function beforeLink(event: MouseEvent) {
      const target = event.target;
      const link =
        target instanceof Element
          ? target.closest<HTMLAnchorElement>('a[href]')
          : null;
      if (!link || link.target === '_blank') return;
      if (!window.confirm('当前修改尚未保存，确定离开审核页面吗？')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', beforeLink, true);
    };
  }, [dirty]);

  const provenance = useMemo(
    () => draft?.fieldProvenance ?? task?.draftMetadata?.fieldProvenance ?? {},
    [draft, task]
  );
  const activePassageIds = useMemo(() => {
    const ids = provenance[activeFieldPath];
    return new Set(Array.isArray(ids) ? ids : []);
  }, [activeFieldPath, provenance]);

  function updateClaim(index: number, nextClaim: EvidenceClaim) {
    setDraft((current) => {
      if (!current) return current;
      const claims = [...current.claims];
      claims[index] = nextClaim;
      return { ...current, claims };
    });
  }

  function updateFieldMapping(passageId: string, selected: boolean) {
    setDraft((current) => {
      if (!current) return current;
      const fieldProvenance = { ...current.fieldProvenance };
      const previousIds = fieldProvenance[activeFieldPath] ?? [];
      const nextIds = selected
        ? [...new Set([...previousIds, passageId])]
        : previousIds.filter((item) => item !== passageId);
      if (nextIds.length) fieldProvenance[activeFieldPath] = nextIds;
      else delete fieldProvenance[activeFieldPath];

      const match = activeFieldPath.match(/^claims\.(\d+)\./);
      if (!match) return { ...current, fieldProvenance };
      const claimIndex = Number(match[1]);
      const claims = [...current.claims];
      const claim = claims[claimIndex];
      if (!claim) return { ...current, fieldProvenance };
      const mappedElsewhere = Object.entries(fieldProvenance).some(
        ([path, ids]) =>
          path.startsWith(`claims.${claimIndex}.`) && ids.includes(passageId)
      );
      const passageIds = selected
        ? [...new Set([...claim.passageIds, passageId])]
        : mappedElsewhere
          ? claim.passageIds
          : claim.passageIds.filter((item) => item !== passageId);
      claims[claimIndex] = { ...claim, passageIds };
      return { ...current, fieldProvenance, claims };
    });
  }

  function updatePassageRole(passageId: string, supportRole: PassageRole) {
    setDraft((current) =>
      current
        ? {
            ...current,
            passages: current.passages.map((passage) =>
              passage.id === passageId ? { ...passage, supportRole } : passage
            ),
          }
        : current
    );
  }

  async function saveDraft() {
    if (!draft || !task) return;
    if (draftErrors.length) {
      setError('请先修正草稿中的字段错误。');
      return;
    }
    if (!reason.trim()) {
      setError('请填写修改原因。');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    setConflicted(false);
    try {
      await requestProductData(
        `/api/internal/v1/review-tasks/${encodeURIComponent(id)}/draft`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedDraftVersion: task.draftVersion,
            draft,
            reason: reason.trim(),
          }),
        }
      );
      await loadTask();
      setReason('');
      setNotice('草稿已保存');
    } catch (requestError) {
      if (
        requestError instanceof ProductRequestError &&
        requestError.status === 409
      ) {
        setError('草稿已被其他审核者更新');
        setConflicted(true);
      } else {
        setError('草稿没有保存，请检查内容后重试。');
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDecision() {
    if (!decision || !task) return;
    if (decision === 'REQUEST_CHANGES' && requestedFields.length === 0) {
      setError('请选择至少一个需要修改的字段。');
      return;
    }
    if (decision === 'REJECT' && !comment.trim()) {
      setError('请填写拒绝原因。');
      return;
    }
    if (decision === 'APPROVE_AND_PUBLISH' && !comment.trim()) {
      setError('请填写批准说明。');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await requestProductData<ReviewDecisionResult>(
        `/api/internal/v1/review-tasks/${encodeURIComponent(id)}/decision`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            decision,
            expectedDraftVersion: task.draftVersion,
            comment: comment.trim(),
            ...(decision === 'REQUEST_CHANGES' ? { requestedFields } : {}),
            idempotencyKey: `review:${id}:${decision}:${crypto.randomUUID()}`,
          }),
        }
      );
      setNotice(
        decision === 'APPROVE_AND_PUBLISH'
          ? result.releaseVersion
            ? `已发布到知识版本 ${result.releaseVersion}`
            : '发布已完成，正在同步知识版本。'
          : decision === 'REJECT'
            ? '已拒绝此候选'
            : '已退回修改'
      );
      setDecision(null);
      setComment('');
      setRequestedFields([]);
      await loadTask();
    } catch (requestError) {
      if (
        requestError instanceof ProductRequestError &&
        requestError.status === 409
      ) {
        setError('草稿版本发生冲突，请重新读取后再决定。');
        setConflicted(true);
      } else {
        setError('审核决定没有提交成功。');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ReviewWorkspaceSkeleton />;
  if (!task || !draft) {
    return (
      <div className="mx-auto max-w-[96rem] px-4 py-10">
        <div
          role="alert"
          className="rounded-2xl bg-destructive/10 p-6 text-destructive"
        >
          {error || '没有找到审核任务。'}
        </div>
      </div>
    );
  }

  return (
    <section
      className="mx-auto max-w-[112rem] px-4 py-6 sm:px-6 lg:px-8"
      aria-busy={saving}
    >
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={`/${locale}/ops/reviews`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden size={16} />
            返回审核队列
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">
            医学审核工作台
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStatusBadge value={task.status} />
          <span className="text-xs font-semibold text-muted-foreground">
            草稿第 {task.draftVersion} 版
          </span>
        </div>
      </header>

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          <p role="alert">{error}</p>
          {conflicted ? (
            <button
              type="button"
              onClick={() => void loadTask()}
              className="mt-3 min-h-11 rounded-lg border border-destructive/30 bg-background px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              重新读取最新草稿
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(18rem,0.82fr)_minmax(26rem,1.25fr)_minmax(18rem,0.78fr)]">
        <ReviewSourcePanel
          candidate={task.candidate}
          passages={draft.passages}
          activeFieldPath={activeFieldPath}
          activePassageIds={activePassageIds}
          abstractExpanded={abstractExpanded}
          disabled={terminal}
          onToggleAbstract={() => setAbstractExpanded((current) => !current)}
          onToggleMapping={updateFieldMapping}
          onRoleChange={updatePassageRole}
        />

        <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Settings2 aria-hidden size={19} className="text-primary" />
              <h2 className="text-lg font-semibold">结构化草稿</h2>
            </div>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {dirty ? '有未保存修改' : '所有修改已保存'}
            </span>
          </div>

          <div className="mt-6 grid gap-5">
            <DraftOverview draft={draft} disabled={terminal} onChange={setDraft} />
            {draft.claims.map((claim, index) => (
              <ClaimEditor
                key={claim.id}
                index={index}
                claim={claim}
                disabled={terminal}
                onActivate={setActiveFieldPath}
                onChange={(nextClaim) => updateClaim(index, nextClaim)}
              />
            ))}
            {draftErrors.length ? (
              <div
                role="alert"
                className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
              >
                <p className="font-semibold">请先修正以下内容</p>
                <ul className="mt-2 grid gap-1">
                  {draftErrors.map((message) => (
                    <li key={message}>· {message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="text-sm font-semibold text-foreground">
              修改原因
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                disabled={terminal}
                aria-invalid={error === '请填写修改原因。'}
                className="mt-2 w-full rounded-xl border border-input bg-background p-3 leading-6 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || terminal || !dirty || draftErrors.length > 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save aria-hidden size={16} />
              {saving ? '正在保存' : '保存草稿'}
            </button>
          </div>
        </section>

        <ReviewSidebar
          task={task}
          draft={draft}
          qaIssues={draft.qaIssues}
          terminal={terminal}
          decision={decision}
          comment={comment}
          requestedFields={requestedFields}
          saving={saving}
          onSelectDecision={(nextDecision) => {
            setDecision(nextDecision);
            setComment('');
            setRequestedFields([]);
          }}
          onCommentChange={setComment}
          onRequestedFieldsChange={setRequestedFields}
          onConfirm={() => void confirmDecision()}
          onCancel={() => {
            setDecision(null);
            setComment('');
            setRequestedFields([]);
          }}
        />
      </div>
    </section>
  );
}

function ReviewWorkspaceSkeleton() {
  return (
    <div
      className="mx-auto max-w-[112rem] px-4 py-8 sm:px-6 lg:px-8"
      aria-label="正在读取审核任务"
      role="status"
    >
      <span className="sr-only">正在读取审核任务</span>
      <div className="h-16 animate-pulse rounded-2xl bg-muted" />
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-[32rem] animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
