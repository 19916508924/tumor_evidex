'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Clock3,
  FileSearch,
  LoaderCircle,
  MessageSquareText,
  Pause,
  RotateCcw,
  SearchCheck,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import { ProductRequestError, requestProductData } from './client';

type RunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'NEEDS_CLARIFICATION'
  | 'ANSWERED'
  | 'NO_CURATED_EVIDENCE'
  | 'OUT_OF_SCOPE'
  | 'SUMMARY_UNAVAILABLE'
  | 'FAILED'
  | 'CANCELLED';

interface SubmittedQuestion {
  questionRunId: string;
  status: RunStatus;
  pollAfterMs: number;
}

interface QuestionRun {
  id: string;
  questionRunId: string;
  status: RunStatus;
  progress: string;
  pollAfterMs: number | null;
  question: string;
  knowledgeRelease: { version: string };
  result: QuestionResult | null;
  createdAt?: string;
  completedAt?: string | null;
}

interface QuestionResult {
  status: RunStatus;
  missingFields?: string[];
  question?: string;
  reason?: string;
  message?: string;
  answer?: {
    overallSummary?: string;
    overallLimitations?: string[];
    groups?: Array<{
      scope?: string;
      therapies?: Array<{
        associationId?: string;
        overview?: string;
        statements?: Array<{
          text: string;
          evidenceIds?: string[];
        }>;
        limitations?: string[];
      }>;
    }>;
  } | null;
  resultGroups?: Array<{
    scope: string;
    therapies: Array<{
      associationId: string;
      drugs?: Array<{ displayNameZh: string; displayNameEn: string }>;
      direction?: string;
      approvedLevel?: string;
      evidenceClaims?: Array<{
        id: string;
        conclusion: string;
        limitations: string;
        passages?: Array<{
          source: { id: string; title: string };
        }>;
      }>;
    }>;
  }>;
  disclaimer?: string;
  generatedAt?: string;
}

type FeedbackCategory =
  | 'HELPFUL'
  | 'NOT_HELPFUL'
  | 'IRRELEVANT_CITATION'
  | 'MISSING_LIMITATION'
  | 'HARD_TO_UNDERSTAND'
  | 'OTHER';

const questionRunStorageKey = 'evidex.questionRunId';
const questionStallThresholdMs = 30_000;
const maximumPollIntervalMs = 10_000;

const feedbackOptions: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'HELPFUL', label: '有帮助' },
  { value: 'NOT_HELPFUL', label: '没有帮助' },
  { value: 'IRRELEVANT_CITATION', label: '引用不相关' },
  { value: 'MISSING_LIMITATION', label: '遗漏重要限制' },
  { value: 'HARD_TO_UNDERSTAND', label: '难以理解' },
  { value: 'OTHER', label: '其他' },
];

function saveRunId(id: string) {
  window.localStorage.setItem(questionRunStorageKey, id);
  const url = new URL(window.location.href);
  url.searchParams.set('run', id);
  window.history.replaceState({}, '', url);
}

const stages = [
  {
    label: '理解问题',
    description: '识别疾病、基因、变异与药物语境',
    icon: MessageSquareText,
  },
  {
    label: '检索已审核证据',
    description: '仅检索已发布且可追溯的内容',
    icon: FileSearch,
  },
  {
    label: '整理证据与限制',
    description: '区分结论、适用范围与不确定性',
    icon: BookOpenCheck,
  },
  {
    label: '校验引用',
    description: '确认每个结论都能回到来源',
    icon: SearchCheck,
  },
];

const examples = [
  'EGFR L858R 在非小细胞肺癌中有哪些已审核治疗证据？',
  'KRAS G12C 在结直肠癌中的耐药证据有哪些限制？',
  '奥希替尼与 EGFR L858R 的监管和临床证据分别是什么？',
];

export function AskWorkbench({
  locale,
  pollIntervalMs = 1000,
}: {
  locale: string;
  pollIntervalMs?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [question, setQuestion] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [context, setContext] = useState({
    disease: '',
    gene: '',
    variant: '',
    drug: '',
  });
  const [state, setState] = useState<
    'idle' | 'working' | 'stalled' | 'paused' | 'done' | 'error'
  >('idle');
  const [activeStage, setActiveStage] = useState(-1);
  const [run, setRun] = useState<QuestionRun | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackCategory, setFeedbackCategory] =
    useState<FeedbackCategory>('HELPFUL');
  const [feedbackComment, setFeedbackComment] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const parameters = new URL(window.location.href).searchParams;
    const savedId =
      parameters.get('run') ||
      window.localStorage.getItem(questionRunStorageKey);
    if (!savedId) return;
    void resumeRun(savedId);
    // The saved run is restored once when this page is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || state === 'working') return;
    const currentRequest = ++requestId.current;
    setState('working');
    setRun(null);
    setFeedbackSent(false);
    setErrorMessage('');
    setActiveStage(0);
    try {
      const structuredContext = Object.fromEntries(
        Object.entries(context).filter(([, field]) => field.trim())
      );
      const submitted = await requestProductData<SubmittedQuestion>(
        '/api/v1/evidence-questions',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `web:${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            question: value,
            locale: 'zh-CN',
            ...(Object.keys(structuredContext).length
              ? { context: structuredContext }
              : {}),
          }),
        }
      );
      if (currentRequest !== requestId.current) return;
      saveRunId(submitted.questionRunId);
      setRunId(submitted.questionRunId);
      setActiveStage(1);
      await poll(submitted.questionRunId, currentRequest, {
        delayMs: submitted.pollAfterMs,
      });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setErrorMessage(
        error instanceof Error && error.message === 'RATE_LIMITED'
          ? '请求过于频繁，请稍候再试。'
          : '这次没有完成检索，请重试。你的问题已保留。'
      );
      setState('error');
    }
  }

  async function poll(
    id: string,
    currentRequest: number,
    options: {
      attempt?: number;
      delayMs?: number;
      skipDelay?: boolean;
      startedAt?: number;
    } = {}
  ): Promise<void> {
    const attempt = options.attempt ?? 0;
    const startedAt = options.startedAt ?? Date.now();
    const delayMs = options.delayMs ?? pollIntervalMs;
    if (!options.skipDelay && delayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (currentRequest !== requestId.current) return;
    const next = await requestProductData<QuestionRun>(
      `/api/v1/evidence-questions/${encodeURIComponent(id)}`
    );
    if (currentRequest !== requestId.current) return;
    setRun(next);
    setQuestion(next.question);
    if (next.status === 'PENDING' || next.status === 'RUNNING') {
      setActiveStage(next.status === 'PENDING' ? 0 : 2);
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= questionStallThresholdMs) {
        setState('stalled');
        return;
      }
      const serverDelayMs =
        typeof next.pollAfterMs === 'number' && next.pollAfterMs >= 0
          ? next.pollAfterMs
          : pollIntervalMs;
      const backoffDelayMs = Math.min(
        Math.max(pollIntervalMs, 1) * 2 ** (attempt + 1),
        maximumPollIntervalMs
      );
      const nextDelayMs = Math.max(serverDelayMs, backoffDelayMs);
      const remainingMs = questionStallThresholdMs - elapsedMs;
      if (nextDelayMs >= remainingMs) {
        await new Promise((resolve) => setTimeout(resolve, remainingMs));
        if (currentRequest !== requestId.current) return;
        setState('stalled');
        return;
      }
      return poll(id, currentRequest, {
        attempt: attempt + 1,
        delayMs: nextDelayMs,
        startedAt,
      });
    }
    setActiveStage(3);
    setState('done');
  }

  async function resumeRun(id: string) {
    const currentRequest = ++requestId.current;
    setRunId(id);
    saveRunId(id);
    setState('working');
    setErrorMessage('');
    setActiveStage(0);
    try {
      await poll(id, currentRequest, { skipDelay: true });
    } catch {
      if (currentRequest !== requestId.current) return;
      setErrorMessage('暂时无法读取这次任务，可以使用原任务编号重试。');
      setState('error');
    }
  }

  async function retryRun(id: string) {
    if (state === 'working') return;
    const currentRequest = ++requestId.current;
    setState('working');
    setErrorMessage('');
    setActiveStage(2);
    setFeedbackSent(false);
    try {
      const submitted = await requestProductData<
        SubmittedQuestion & { idempotent: boolean }
      >(`/api/v1/evidence-questions/${encodeURIComponent(id)}/retry`, {
        method: 'POST',
      });
      if (currentRequest !== requestId.current) return;
      saveRunId(submitted.questionRunId);
      setRunId(submitted.questionRunId);
      await poll(submitted.questionRunId, currentRequest, {
        delayMs: submitted.pollAfterMs,
      });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setErrorMessage(retryErrorMessage(error));
      setState('done');
    }
  }

  function stopWaiting() {
    requestId.current += 1;
    setState('paused');
  }

  async function sendFeedback(event: FormEvent) {
    event.preventDefault();
    if (!run || feedbackSent) return;
    try {
      await requestProductData(
        `/api/v1/evidence-questions/${run.id}/feedback`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `feedback:${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            category: feedbackCategory,
            ...(feedbackComment.trim()
              ? { comment: feedbackComment.trim() }
              : {}),
          }),
        }
      );
      setFeedbackSent(true);
    } catch {
      setErrorMessage('反馈暂未送达，你可以稍后重试。');
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-52 left-1/2 h-[32rem] w-[54rem] -translate-x-1/2 rounded-[50%] bg-[#D8E8FF]/75 blur-3xl"
      />
      <section className="relative mx-auto max-w-[90rem] px-4 pt-12 pb-16 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.75rem] lg:leading-[1.05]">
            <span className="block sm:inline">把问题交给证据，</span>
            <span className="block sm:inline">而不是猜测</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[67ch] text-base leading-8 text-[#52637A] sm:text-lg">
            用自然语言描述疾病、变异或药物。Evidex
            会从已审核发布的内容中整理答案，并把每个结论带回来源。
          </p>
        </div>

        <form
          onSubmit={submit}
          className="mx-auto mt-9 max-w-5xl rounded-2xl bg-white/78 p-3 shadow-[0_24px_70px_rgba(20,70,140,0.14)] backdrop-blur-xl sm:p-4"
        >
          <label htmlFor="evidence-question" className="sr-only">
            你的证据问题
          </label>
          <textarea
            id="evidence-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="例如：EGFR L858R 在非小细胞肺癌中有哪些已审核治疗证据？"
            className="w-full resize-none border-0 bg-transparent px-2 py-2 text-lg leading-8 text-[#0B1F3A] placeholder:text-[#60748D] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-inset sm:px-3 sm:text-xl"
          />
          <div className="mt-2 flex flex-col gap-3 border-t border-[#D6E2F1] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setContextOpen((value) => !value)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#0B3975] hover:bg-[#EAF2FF]"
              aria-expanded={contextOpen}
            >
              添加已知条件{' '}
              <ChevronDown
                aria-hidden
                size={16}
                className={`transition ${contextOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-xs text-[#60748D] tabular-nums">
                {question.length} / 4000
              </span>
              <button
                type="submit"
                disabled={!question.trim() || state === 'working'}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#175CD3] px-5 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(23,92,211,0.2)] transition hover:bg-[#134EAE] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {state === 'working' ? (
                  <LoaderCircle
                    aria-hidden
                    className="animate-spin"
                    size={17}
                  />
                ) : (
                  <Send aria-hidden size={17} />
                )}
                {state === 'working' ? '正在查找' : '查找证据'}
              </button>
            </div>
          </div>
          {contextOpen ? (
            <div className="mt-3 grid gap-3 rounded-xl bg-[#EAF2FF]/75 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['disease', '疾病', '非小细胞肺癌'],
                  ['gene', '基因', 'EGFR'],
                  ['variant', '变异', 'p.L858R'],
                  ['drug', '药物', '奥希替尼'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label
                  key={key}
                  className="text-xs font-semibold text-[#334A67]"
                >
                  {label}
                  <input
                    value={context[key]}
                    onChange={(event) =>
                      setContext((value) => ({
                        ...value,
                        [key]: event.target.value,
                      }))
                    }
                    placeholder={placeholder}
                    className="mt-2 min-h-10 w-full rounded-lg border border-[#B4CAE6] bg-white px-3 text-sm font-normal text-[#0B1F3A] placeholder:text-[#60748D] focus-visible:border-[#175CD3] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
                  />
                </label>
              ))}
            </div>
          ) : null}
        </form>

        <div className="mx-auto mt-4 flex max-w-5xl flex-wrap justify-center gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuestion(example)}
              className="rounded-full bg-white/66 px-3 py-2 text-xs font-medium text-[#334A67] backdrop-blur-md transition hover:bg-white hover:text-[#175CD3]"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-9">
          <ol
            className="relative grid self-start gap-2"
            aria-label="证据整理进度"
            aria-live="polite"
          >
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const completed = state === 'done' || activeStage > index;
              const active = activeStage === index && state === 'working';
              return (
                <li
                  key={stage.label}
                  className={`relative rounded-2xl px-4 py-4 transition duration-500 ${active ? 'bg-[#175CD3] text-white shadow-[0_14px_38px_rgba(23,92,211,0.2)]' : completed ? 'bg-white/75 text-[#0B3975]' : 'text-[#60748D]'}`}
                >
                  <div className="flex gap-3">
                    <span
                      className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${active ? 'bg-white/16' : completed ? 'bg-[#DDEBFF]' : 'bg-white/55'}`}
                    >
                      {completed ? (
                        <Check aria-hidden size={16} />
                      ) : (
                        <Icon aria-hidden size={16} />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{stage.label}</p>
                      <p
                        className={`mt-1 text-xs leading-5 ${active ? 'text-[#DDEBFF]' : 'text-[#60748D]'}`}
                      >
                        {stage.description}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="min-h-[24rem]" aria-live="polite">
            {state === 'idle' ? <StartPanel locale={locale} /> : null}
            {state === 'working' ? (
              <div className="grid min-h-[24rem] place-items-center rounded-2xl bg-white/68 p-8 text-center backdrop-blur-xl">
                <div>
                  <LoaderCircle
                    aria-hidden
                    className="mx-auto animate-spin text-[#175CD3]"
                    size={30}
                  />
                  <p className="mt-5 text-xl font-semibold">
                    {stages[Math.max(0, activeStage)]?.label}
                  </p>
                  <p className="mt-2 text-sm text-[#52637A]">
                    任务已保存，离开页面后仍可继续查看。
                  </p>
                  <button
                    type="button"
                    onClick={stopWaiting}
                    className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[#0B3975] hover:bg-[#EAF2FF]"
                  >
                    <Pause aria-hidden size={16} /> 停止等待
                  </button>
                </div>
              </div>
            ) : null}
            {state === 'stalled' && runId ? (
              <div className="grid min-h-[24rem] place-items-center rounded-2xl bg-white/72 p-8 text-center backdrop-blur-xl">
                <div>
                  <Clock3
                    aria-hidden
                    className="mx-auto text-[#175CD3]"
                    size={30}
                  />
                  <h2 className="mt-5 text-xl font-semibold">
                    任务仍在排队
                  </h2>
                  <p className="mx-auto mt-2 max-w-[58ch] text-sm leading-6 text-[#52637A]">
                    等待时间比预期更长，后台处理可能暂时不可用。任务已经保存；你可以重新检查状态，或停止等待后稍后回来。
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => resumeRun(runId)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#175CD3] px-4 text-sm font-semibold text-white transition hover:bg-[#134EAE] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                      <RotateCcw aria-hidden size={16} /> 重新检查
                    </button>
                    <button
                      type="button"
                      onClick={stopWaiting}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#EAF2FF] px-4 text-sm font-semibold text-[#0B3975] transition hover:bg-[#DDEBFF] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                      <Pause aria-hidden size={16} /> 停止等待
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {state === 'paused' && runId ? (
              <div className="grid min-h-[24rem] place-items-center rounded-2xl bg-white/68 p-8 text-center backdrop-blur-xl">
                <div>
                  <Pause
                    aria-hidden
                    className="mx-auto text-[#175CD3]"
                    size={30}
                  />
                  <h2 className="mt-5 text-xl font-semibold">已暂停等待</h2>
                  <p className="mt-2 text-sm leading-6 text-[#52637A]">
                    任务仍在处理，任务编号已保存，刷新页面也可恢复。
                  </p>
                  <button
                    type="button"
                    onClick={() => resumeRun(runId)}
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#175CD3] px-4 text-sm font-semibold text-white"
                  >
                    <RotateCcw aria-hidden size={16} /> 继续等待
                  </button>
                </div>
              </div>
            ) : null}
            {state === 'error' ? (
              <ErrorPanel
                message={errorMessage}
                retry={() => (runId ? resumeRun(runId) : setState('idle'))}
              />
            ) : null}
            {state === 'done' && run ? (
              <motion.div
                initial={reduceMotion ? false : { y: 18 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              >
                <QuestionResultPanel
                  locale={locale}
                  run={run}
                  onRetry={() => retryRun(run.id)}
                />
                <form
                  onSubmit={sendFeedback}
                  className="mt-5 rounded-2xl bg-white/66 px-5 py-5 text-sm"
                >
                  <p className="font-semibold text-[#0B3975]">
                    {feedbackSent
                      ? '感谢反馈，我们已记录。'
                      : '这个回答对你有帮助吗？'}
                  </p>
                  {!feedbackSent ? (
                    <>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {feedbackOptions.map((option) => (
                          <label key={option.value}>
                            <input
                              type="radio"
                              name="feedback-category"
                              value={option.value}
                              checked={feedbackCategory === option.value}
                              onChange={() => setFeedbackCategory(option.value)}
                              className="peer sr-only"
                            />
                            <span className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[#C8D9EE] px-3 font-semibold text-[#0B3975] transition peer-checked:border-[#175CD3] peer-checked:bg-[#DDEBFF]">
                              {option.value === 'HELPFUL' ? (
                                <ThumbsUp aria-hidden size={15} />
                              ) : option.value === 'NOT_HELPFUL' ? (
                                <ThumbsDown aria-hidden size={15} />
                              ) : null}
                              {option.label}
                            </span>
                          </label>
                        ))}
                      </div>
                      <label className="mt-4 block text-xs font-semibold text-[#52637A]">
                        补充说明
                        <textarea
                          value={feedbackComment}
                          onChange={(event) =>
                            setFeedbackComment(event.target.value)
                          }
                          maxLength={2000}
                          rows={3}
                          className="mt-2 w-full resize-y rounded-xl border border-[#B4CAE6] bg-white px-3 py-2 text-sm font-normal text-[#0B1F3A] placeholder:text-[#60748D] focus-visible:border-[#175CD3] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none"
                        />
                      </label>
                      <button
                        type="submit"
                        className="mt-3 min-h-10 rounded-lg bg-[#175CD3] px-4 font-semibold text-white"
                      >
                        提交反馈
                      </button>
                    </>
                  ) : null}
                </form>
                {errorMessage ? (
                  <p role="alert" className="mt-3 text-sm text-[#B42318]">
                    {errorMessage}
                  </p>
                ) : null}
              </motion.div>
            ) : null}
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-4xl text-center text-xs leading-6 text-[#60748D]">
          请勿输入姓名、联系方式、病历号等可识别个人的信息。Evidex
          不提供诊断、处方、剂量或个体化治疗建议。
        </p>
      </section>
    </div>
  );
}

function StartPanel({ locale }: { locale: string }) {
  return (
    <div className="grid min-h-[24rem] content-between rounded-2xl bg-[#0B3975] p-6 text-white shadow-[0_20px_55px_rgba(11,57,117,0.18)] sm:p-8">
      <div>
        <ShieldCheck
          aria-hidden
          className="text-[#A8CCFF]"
          size={30}
          strokeWidth={1.6}
        />
        <h2 className="mt-7 text-2xl font-semibold tracking-[-0.025em]">
          回答从已审核内容开始
        </h2>
        <p className="mt-3 max-w-[58ch] text-sm leading-7 text-[#D6E6FB]">
          找不到证据时，我们会直接说明缺口；适用范围不清时，会先请你补充条件。
        </p>
      </div>
      <Link
        href={`/${locale}/knowledge`}
        className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white underline decoration-[#7FA7DA] underline-offset-4"
      >
        先浏览知识库 <ArrowRight aria-hidden size={16} />
      </Link>
    </div>
  );
}

function ErrorPanel({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl bg-[#FFF7ED] p-6 text-[#7C2D12]">
      <CircleAlert aria-hidden size={24} />
      <h2 className="mt-5 text-xl font-semibold">检索没有完成</h2>
      <p className="mt-2 text-sm leading-6">{message}</p>
      <button
        type="button"
        onClick={retry}
        className="mt-5 min-h-10 rounded-lg bg-[#7C2D12] px-4 text-sm font-semibold text-white"
      >
        返回问题
      </button>
    </div>
  );
}

function QuestionResultPanel({
  locale,
  run,
  onRetry,
}: {
  locale: string;
  run: QuestionRun;
  onRetry: () => void;
}) {
  if (run.status === 'FAILED')
    return (
      <SpecialState
        icon={CircleAlert}
        title="回答没有完成"
        description="这次任务已保留，可以从原问题重新整理回答。"
        actionLabel="重新整理回答"
        action={onRetry}
      />
    );
  if (run.status === 'CANCELLED')
    return (
      <SpecialState
        icon={CircleAlert}
        title="回答已取消"
        description="这次任务已终止，如需继续，请重新提交问题。"
      />
    );
  const result = run.result;
  if (!result)
    return (
      <ErrorPanel
        message="回答内容暂时不可用，请重新提交问题。"
        retry={() => window.location.reload()}
      />
    );
  if (run.status === 'NEEDS_CLARIFICATION')
    return (
      <SpecialState
        icon={CircleHelp}
        title="还需要一点信息"
        description={clarificationCopy(result.missingFields)}
      />
    );
  if (run.status === 'OUT_OF_SCOPE')
    return (
      <SpecialState
        icon={CircleAlert}
        title="这个问题超出当前范围"
        description="目前支持肿瘤治疗证据的学习与研究问题，不提供诊断、处方、剂量或个体化治疗建议。"
      />
    );
  if (run.status === 'NO_CURATED_EVIDENCE')
    return (
      <SpecialState
        icon={FileSearch}
        title="没有找到已审核证据"
        description="这不代表没有相关研究，只表示当前已发布内容中没有足够证据回答。"
      />
    );
  const answer = result.answer;
  const summaryUnavailable = run.status === 'SUMMARY_UNAVAILABLE';
  const therapies =
    answer?.groups?.flatMap((group) => group.therapies ?? []) ?? [];
  const evidenceGroups = result.resultGroups ?? [];
  return (
    <>
      {summaryUnavailable ? (
        <SpecialState
          icon={BookOpenCheck}
          title="证据已找到，摘要暂不可用"
          description="你仍可查看下方的结构化证据与来源。"
          actionLabel="重新生成摘要"
          action={onRetry}
        />
      ) : null}
      <article
        className={`${summaryUnavailable ? 'mt-5' : ''} rounded-2xl bg-white/76 p-6 shadow-[0_18px_50px_rgba(20,70,140,0.1)] backdrop-blur-xl sm:p-8`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[#175CD3]">
          <ShieldCheck aria-hidden size={18} /> 已完成引用校验
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em]">
          {summaryUnavailable ? '结构化证据' : '结论'}
        </h2>
        {!summaryUnavailable ? (
          <p className="mt-4 text-base leading-8 text-[#243B5A]">
            {answer?.overallSummary ||
              '已整理相关证据，请结合下方适用范围与来源理解。'}
          </p>
        ) : null}
        {therapies.length ? (
          <section className="mt-8">
            <h3 className="text-lg font-semibold">支持与耐药证据</h3>
            <div className="mt-4 grid gap-5">
              {therapies.map((therapy, index) => (
                <div
                  key={therapy.associationId || index}
                  className="border-t border-[#C8D9EE] pt-5"
                >
                  <p className="font-semibold text-[#0B3975]">
                    {therapy.overview || '关联证据'}
                  </p>
                  {therapy.statements?.map((statement, statementIndex) => (
                    <div
                      key={statementIndex}
                      className="mt-3 text-sm leading-7 text-[#52637A]"
                    >
                      <p>{statement.text}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {statement.evidenceIds?.map((evidenceId) => (
                          <Link
                            key={evidenceId}
                            href={`/${locale}/knowledge/evidence/${evidenceId}`}
                            className="rounded-full bg-[#DDEBFF] px-3 py-1 text-xs font-semibold text-[#0B4DA2]"
                          >
                            查看证据
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                  {therapy.limitations?.length ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#52637A]">
                      {therapy.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {evidenceGroups.length ? (
          <section className="mt-8">
            <h3 className="text-lg font-semibold">监管背景与适用范围</h3>
            <div className="mt-4 grid gap-4">
              {evidenceGroups
                .flatMap((group) => group.therapies)
                .map((therapy) => (
                  <div
                    key={therapy.associationId}
                    className="rounded-xl bg-[#EAF2FF]/75 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#0B3975]">
                        {therapy.drugs
                          ?.map(
                            (drug) => drug.displayNameZh || drug.displayNameEn
                          )
                          .join(' + ') || '治疗关联'}
                      </span>
                      {therapy.approvedLevel ? (
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold">
                          证据等级 {therapy.approvedLevel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {therapy.evidenceClaims?.map((claim, claimIndex) => (
                        <Link
                          key={claim.id}
                          href={`/${locale}/knowledge/evidence/${claim.id}`}
                          className="text-xs font-semibold text-[#175CD3] underline-offset-4 hover:underline"
                        >
                          查看已审核证据声明 {claimIndex + 1}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ) : null}
        {answer?.overallLimitations?.length ? (
          <section className="mt-8 rounded-xl bg-[#FFF7ED] p-5">
            <h3 className="font-semibold text-[#7C2D12]">不确定性与证据缺口</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[#7C2D12]">
              {answer.overallLimitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="mt-8 border-t border-[#C8D9EE] pt-5 text-xs leading-6 text-[#60748D]">
          {result.generatedAt || run.completedAt ? (
            <p>
              生成于 {formatQuestionTime(result.generatedAt || run.completedAt)}
            </p>
          ) : null}
          <p className="mt-1">
            {result.disclaimer ||
              '仅用于肿瘤知识学习与研究，不构成医疗建议、诊断或治疗决策。'}
          </p>
        </div>
      </article>
    </>
  );
}

function SpecialState({
  icon: Icon,
  title,
  description,
  actionLabel,
  action,
}: {
  icon: typeof CircleAlert;
  title: string;
  description: string;
  actionLabel?: string;
  action?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white/74 p-8 shadow-[0_18px_50px_rgba(20,70,140,0.08)]">
      <Icon aria-hidden size={28} className="text-[#175CD3]" />
      <h2 className="mt-6 text-2xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-[65ch] leading-7 text-[#52637A]">
        {description}
      </p>
      {actionLabel && action ? (
        <button
          type="button"
          onClick={action}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#175CD3] px-4 text-sm font-semibold text-white"
        >
          <RotateCcw aria-hidden size={16} /> {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function formatQuestionTime(value?: string | null) {
  if (!value) return '暂未提供';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function clarificationCopy(fields?: string[]) {
  const labels: Record<string, string> = {
    disease: '疾病',
    gene: '基因',
    variant: '变异',
    drug: '药物',
  };
  const missing = fields?.map((field) => labels[field] || field).join('、');
  return missing
    ? `请补充${missing}后重新提问。`
    : '请补充疾病、基因、变异或药物等关键条件后重新提问。';
}

function retryErrorMessage(error: unknown) {
  if (error instanceof ProductRequestError) {
    if (error.status === 429 || error.code === 'RATE_LIMITED')
      return '重试过于频繁，请稍候再试。';
    if (error.status === 404 || error.code === 'QUESTION_RUN_NOT_FOUND')
      return '没有找到这次任务，请重新提交问题。';
    if (error.status === 409 || error.code === 'QUESTION_RUN_NOT_RETRYABLE')
      return '当前任务不能重新生成，请提交一个新问题。';
  }
  return '暂时无法重新生成，原任务和问题已保留。';
}
