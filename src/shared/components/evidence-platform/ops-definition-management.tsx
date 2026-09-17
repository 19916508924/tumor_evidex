'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  GitBranch,
  History,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';

import type { PageResult } from '@/shared/types/evidence-platform-api';

import {
  isAbortError,
  ProductRequestError,
  requestProductData,
} from './client';

export type DefinitionKind = 'agents' | 'skills' | 'workflows';

type DefinitionStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
type DefinitionRecord = Record<string, unknown> & {
  id: string;
  version: string;
  name: string;
  status: DefinitionStatus;
  createdAt: string;
  agentId?: string;
  skillId?: string;
  workflowId?: string;
};

interface EvaluationResult {
  versionId: string;
  suiteId: string;
  status: 'PASSED' | 'FAILED';
  checks: Array<{ id: string; status: 'PASSED' | 'FAILED' }>;
  evaluatedAt: string;
}

interface AuditItem {
  id: string;
  action: string;
  actorId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface DefinitionForm {
  name: string;
  text: Record<string, string>;
  arrays: Record<string, string>;
  json: Record<string, string>;
  numbers: Record<string, string>;
  select: Record<string, string>;
}

const kindConfig = {
  agents: {
    title: '智能体配置',
    description: '管理智能体目标、允许能力、模型约束与运行预算。',
    singular: '智能体',
    icon: Bot,
  },
  skills: {
    title: '技能配置',
    description: '管理结构化能力、输入输出约束、工具权限与重试边界。',
    singular: '技能',
    icon: Sparkles,
  },
  workflows: {
    title: '工作流配置',
    description: '管理节点顺序、条件分支、重试与人工接管规则。',
    singular: '工作流',
    icon: GitBranch,
  },
} satisfies Record<
  DefinitionKind,
  { title: string; description: string; singular: string; icon: typeof Bot }
>;

export function DefinitionManagementPage({
  kind,
}: {
  locale: string;
  kind: DefinitionKind;
}) {
  const config = kindConfig[kind];
  const Icon = config.icon;
  const [items, setItems] = useState<DefinitionRecord[]>([]);
  const [selectedLogicalId, setSelectedLogicalId] = useState('');
  const [editing, setEditing] = useState<DefinitionRecord | null>(null);
  const [form, setForm] = useState<DefinitionForm | null>(null);
  const [cloneSource, setCloneSource] = useState<DefinitionRecord | null>(null);
  const [newVersion, setNewVersion] = useState('');
  const [rollbackTarget, setRollbackTarget] =
    useState<DefinitionRecord | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [evaluations, setEvaluations] = useState<
    Record<string, EvaluationResult>
  >({});
  const [auditItems, setAuditItems] = useState<AuditItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    requestProductData<PageResult<DefinitionRecord>>(
      `/api/internal/v1/${kind}?page=1&pageSize=100`,
      { signal: controller.signal }
    )
      .then((value) => {
        setItems(value.items);
        setSelectedLogicalId((current) =>
          current || logicalId(kind, value.items[0])
        );
        setError('');
      })
      .catch((reason) => {
        if (!isAbortError(reason)) setError('配置目录暂时无法读取。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, reloadKey]);

  const logicalGroups = useMemo(() => {
    const groups = new Map<string, DefinitionRecord[]>();
    for (const item of items) {
      const id = logicalId(kind, item);
      groups.set(id, [...(groups.get(id) ?? []), item]);
    }
    return [...groups.entries()];
  }, [items, kind]);
  const visibleVersions =
    logicalGroups.find(([id]) => id === selectedLogicalId)?.[1] ?? [];

  function startEditing(item: DefinitionRecord) {
    setEditing(item);
    setForm(definitionForm(kind, item));
    setNotice('');
    setError('');
  }

  async function cloneVersion() {
    if (!cloneSource || !newVersion.trim()) return;
    setBusy(true);
    setError('');
    try {
      const definitionId = logicalId(kind, cloneSource);
      const created = await requestProductData<DefinitionRecord>(
        `/api/internal/v1/${kind}/${encodeURIComponent(definitionId)}/versions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceVersionId: cloneSource.id,
            version: newVersion.trim(),
          }),
        }
      );
      setItems((current) => [created, ...current]);
      setSelectedLogicalId(definitionId);
      startEditing(created);
      setCloneSource(null);
      setNewVersion('');
      setNotice('草稿版本已创建');
    } catch (requestError) {
      setError(errorMessage(requestError, '草稿版本没有创建成功。'));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!editing || !form) return;
    let patch: Record<string, unknown>;
    try {
      patch = formPatch(kind, form);
    } catch {
      setError('结构化配置不是有效的 JSON，请修正后再保存。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const definitionId = logicalId(kind, editing);
      const updated = await requestProductData<DefinitionRecord>(
        versionEndpoint(kind, definitionId, editing.id),
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ patch }),
        }
      );
      replaceItem(updated);
      startEditing(updated);
      setNotice('草稿已保存');
    } catch (requestError) {
      setError(errorMessage(requestError, '草稿没有保存成功。'));
    } finally {
      setBusy(false);
    }
  }

  async function evaluateDraft() {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const definitionId = logicalId(kind, editing);
      const result = await requestProductData<EvaluationResult>(
        `${versionEndpoint(kind, definitionId, editing.id)}/evaluate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      setEvaluations((current) => ({ ...current, [editing.id]: result }));
      setNotice('评估已完成');
    } catch (requestError) {
      setError(errorMessage(requestError, '评估没有通过，请检查失败项。'));
    } finally {
      setBusy(false);
    }
  }

  async function activateVersion() {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const definitionId = logicalId(kind, editing);
      const activated = await requestProductData<DefinitionRecord>(
        `${versionEndpoint(kind, definitionId, editing.id)}/activate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      setItems((current) =>
        current.map((item) =>
          logicalId(kind, item) !== definitionId
            ? item
            : item.id === activated.id
              ? activated
              : item.status === 'ACTIVE'
                ? { ...item, status: 'DEPRECATED' }
                : item
        )
      );
      setEditing(null);
      setForm(null);
      setNotice('版本已激活');
    } catch (requestError) {
      setError(errorMessage(requestError, '版本没有激活成功。'));
    } finally {
      setBusy(false);
    }
  }

  async function loadAudit() {
    if (!selectedLogicalId) return;
    setBusy(true);
    setError('');
    try {
      const result = await requestProductData<PageResult<AuditItem>>(
        `/api/internal/v1/${kind}/${encodeURIComponent(selectedLogicalId)}/audit?page=1&pageSize=20`
      );
      setAuditItems(result.items);
    } catch (requestError) {
      setError(errorMessage(requestError, '审计记录暂时无法读取。'));
    } finally {
      setBusy(false);
    }
  }

  async function rollbackVersion() {
    if (!rollbackTarget || rollbackReason.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      const definitionId = logicalId(kind, rollbackTarget);
      const activated = await requestProductData<DefinitionRecord>(
        `${versionEndpoint(kind, definitionId, rollbackTarget.id)}/rollback`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: rollbackReason.trim() }),
        }
      );
      setItems((current) =>
        current.map((item) =>
          logicalId(kind, item) !== definitionId
            ? item
            : item.id === activated.id
              ? activated
              : item.status === 'ACTIVE'
                ? { ...item, status: 'DEPRECATED' }
                : item
        )
      );
      setRollbackTarget(null);
      setRollbackReason('');
      setNotice('版本已回滚');
    } catch (requestError) {
      setError(errorMessage(requestError, '版本没有回滚成功。'));
    } finally {
      setBusy(false);
    }
  }

  function replaceItem(updated: DefinitionRecord) {
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    );
  }

  return (
    <section
      className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      aria-busy={busy}
    >
      <header className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Icon aria-hidden className="text-primary" size={28} strokeWidth={1.7} />
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            {config.title}
          </h1>
          <p className="mt-3 max-w-[70ch] text-sm leading-7 text-muted-foreground">
            {config.description}
          </p>
        </div>
        {selectedLogicalId ? (
          <button
            type="button"
            onClick={() => void loadAudit()}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
          >
            <History aria-hidden size={16} /> 查看审计记录
          </button>
        ) : null}
      </header>

      {notice ? (
        <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? <DefinitionSkeleton /> : null}
      {!loading && items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-card/70 px-6 py-16 text-center">
          <ClipboardList aria-hidden className="mx-auto text-muted-foreground" size={30} />
          <p className="mt-4 text-lg font-semibold">还没有{config.singular}定义</p>
          <p className="mt-2 text-sm text-muted-foreground">
            定义由受控配置创建；当前没有可复制的版本。
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadKey((value) => value + 1);
            }}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw aria-hidden size={16} /> 重新读取
          </button>
        </div>
      ) : null}

      {!loading && items.length ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label={`${config.singular}目录`} className="self-start rounded-2xl border border-border bg-card/75 p-3 lg:sticky lg:top-6">
            {logicalGroups.map(([id, versions]) => {
              const active = id === selectedLogicalId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSelectedLogicalId(id);
                    setEditing(null);
                    setForm(null);
                  }}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? 'bg-primary/12 text-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className="truncate font-semibold">
                    {versions.find((item) => item.status === 'ACTIVE')?.name ||
                      versions[0]?.name ||
                      id}
                  </span>
                  <ChevronRight aria-hidden size={15} />
                </button>
              );
            })}
          </nav>

          <div className="grid gap-5">
            {visibleVersions.map((item) => (
              <VersionCard
                key={item.id}
                item={item}
                kind={kind}
                onClone={() => {
                  setCloneSource(item);
                  setNewVersion('');
                }}
                onEdit={() => startEditing(item)}
                onRollback={() => {
                  setRollbackTarget(item);
                  setRollbackReason('');
                }}
              />
            ))}
            {editing && form ? (
              <DefinitionEditor
                kind={kind}
                item={editing}
                form={form}
                evaluation={evaluations[editing.id]}
                busy={busy}
                onChange={setForm}
                onSave={() => void saveDraft()}
                onEvaluate={() => void evaluateDraft()}
                onActivate={() => void activateVersion()}
                onClose={() => {
                  setEditing(null);
                  setForm(null);
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {cloneSource ? (
        <DialogPanel title="复制为新的草稿版本" onClose={() => setCloneSource(null)}>
          <p className="text-sm text-muted-foreground">
            将从 {cloneSource.version} 复制全部受控配置，原版本保持不变。
          </p>
          <label className="mt-4 block text-sm font-semibold">
            新版本号
            <input
              value={newVersion}
              onChange={(event) => setNewVersion(event.target.value)}
              placeholder="例如 1.1.0"
              className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <button
            type="button"
            onClick={() => void cloneVersion()}
            disabled={busy || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(newVersion.trim())}
            className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
          >
            创建草稿版本
          </button>
        </DialogPanel>
      ) : null}

      {rollbackTarget ? (
        <DialogPanel title="回滚到已有版本" onClose={() => setRollbackTarget(null)}>
          <p className="text-sm text-muted-foreground">
            回滚会停用当前版本，并重新激活 {rollbackTarget.version}。
          </p>
          <label className="mt-4 block text-sm font-semibold">
            回滚原因
            <textarea
              value={rollbackReason}
              onChange={(event) => setRollbackReason(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-input bg-background p-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <button
            type="button"
            onClick={() => void rollbackVersion()}
            disabled={busy || rollbackReason.trim().length < 3}
            className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
          >
            确认回滚
          </button>
        </DialogPanel>
      ) : null}

      {auditItems ? (
        <DialogPanel title="审计记录" onClose={() => setAuditItems(null)} closeLabel="关闭审计记录">
          {auditItems.length ? (
            <ol className="grid gap-3">
              {auditItems.map((item) => (
                <li key={item.id} className="rounded-xl bg-muted/60 p-4 text-sm">
                  <p className="font-semibold">{auditActionLabel(item.action)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(item.createdAt)} · 操作人 {item.actorId}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">还没有审计记录。</p>
          )}
        </DialogPanel>
      ) : null}
    </section>
  );
}

function VersionCard({
  item,
  kind,
  onClone,
  onEdit,
  onRollback,
}: {
  item: DefinitionRecord;
  kind: DefinitionKind;
  onClone: () => void;
  onEdit: () => void;
  onRollback: () => void;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card/75 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <DefinitionStatus value={item.status} />
            <span className="text-xs font-semibold text-muted-foreground">
              {item.version}
            </span>
          </div>
          <h2 className="mt-3 text-lg font-semibold">{item.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {definitionSummary(kind, item)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.status === 'ACTIVE' ? (
            <button type="button" onClick={onClone} className="definition-action">
              <Copy aria-hidden size={15} /> 复制为草稿
            </button>
          ) : null}
          {item.status === 'DRAFT' ? (
            <button type="button" onClick={onEdit} className="definition-action">
              <Save aria-hidden size={15} /> 编辑草稿
            </button>
          ) : null}
          {item.status === 'DEPRECATED' ? (
            <button type="button" onClick={onRollback} className="definition-action">
              <RotateCcw aria-hidden size={15} /> 回滚到此版本
            </button>
          ) : null}
        </div>
      </div>
      {kind === 'workflows' ? <WorkflowPreview definition={item.definition} /> : null}
    </article>
  );
}

function DefinitionEditor({
  kind,
  item,
  form,
  evaluation,
  busy,
  onChange,
  onSave,
  onEvaluate,
  onActivate,
  onClose,
}: {
  kind: DefinitionKind;
  item: DefinitionRecord;
  form: DefinitionForm;
  evaluation?: EvaluationResult;
  busy: boolean;
  onChange: (form: DefinitionForm) => void;
  onSave: () => void;
  onEvaluate: () => void;
  onActivate: () => void;
  onClose: () => void;
}) {
  return (
    <section className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-primary">草稿 {item.version}</p>
          <h2 className="mt-1 text-xl font-semibold">结构化配置</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭编辑器" className="grid size-11 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X aria-hidden size={17} />
        </button>
      </div>
      <div className="mt-5 grid gap-4">
        <TextField label="名称" value={form.name} onChange={(name) => onChange({ ...form, name })} />
        {kind === 'agents' ? (
          <AgentFields form={form} onChange={onChange} />
        ) : kind === 'skills' ? (
          <SkillFields form={form} onChange={onChange} />
        ) : (
          <WorkflowFields form={form} onChange={onChange} />
        )}
      </div>
      {evaluation ? (
        <div className={`mt-5 rounded-xl p-4 text-sm ${evaluation.status === 'PASSED' ? 'bg-emerald-50 text-emerald-800' : 'bg-destructive/10 text-destructive'}`}>
          <p className="flex items-center gap-2 font-semibold">
            {evaluation.status === 'PASSED' ? <CheckCircle2 aria-hidden size={17} /> : <Activity aria-hidden size={17} />}
            {evaluation.status === 'PASSED' ? '评估通过' : '评估未通过'}
          </p>
          <p className="mt-1 text-xs">评估套件：{evaluation.suiteId}</p>
        </div>
      ) : null}
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={onSave} disabled={busy} className="definition-primary-action">
          <Save aria-hidden size={16} /> 保存草稿
        </button>
        <button type="button" onClick={onEvaluate} disabled={busy} className="definition-action justify-center">
          <Activity aria-hidden size={16} /> 运行评估
        </button>
        <button
          type="button"
          onClick={onActivate}
          disabled={busy || evaluation?.status !== 'PASSED'}
          className="definition-primary-action disabled:cursor-not-allowed disabled:opacity-45"
        >
          <CheckCircle2 aria-hidden size={16} /> 激活版本
        </button>
      </div>
    </section>
  );
}

function AgentFields({ form, onChange }: FormFieldsProps) {
  return (
    <>
      <TextField label="智能体目标" value={form.text.goal ?? ''} multiline onChange={(goal) => setText(form, onChange, 'goal', goal)} />
      <TextField label="指令版本" value={form.text.instructionsVersion ?? ''} onChange={(value) => setText(form, onChange, 'instructionsVersion', value)} />
      <ArrayField label="允许的技能版本" value={form.arrays.allowedSkillVersions ?? ''} onChange={(value) => setArray(form, onChange, 'allowedSkillVersions', value)} />
      <ArrayField label="允许的工具" value={form.arrays.allowedTools ?? ''} onChange={(value) => setArray(form, onChange, 'allowedTools', value)} />
      <JsonField label="模型配置" value={form.json.modelConfiguration ?? ''} onChange={(value) => setJson(form, onChange, 'modelConfiguration', value)} />
      <JsonField label="Token 与成本预算" value={form.json.tokenAndCostBudget ?? ''} onChange={(value) => setJson(form, onChange, 'tokenAndCostBudget', value)} />
      <ArrayField label="停止条件" value={form.arrays.stopConditions ?? ''} onChange={(value) => setArray(form, onChange, 'stopConditions', value)} />
      <ArrayField label="人工接管条件" value={form.arrays.handoffConditions ?? ''} onChange={(value) => setArray(form, onChange, 'handoffConditions', value)} />
      <JsonField label="失败策略" value={form.json.failurePolicy ?? ''} onChange={(value) => setJson(form, onChange, 'failurePolicy', value)} />
    </>
  );
}

function SkillFields({ form, onChange }: FormFieldsProps) {
  return (
    <>
      <TextField label="能力说明" value={form.text.description ?? ''} multiline onChange={(value) => setText(form, onChange, 'description', value)} />
      <JsonField label="输入 Schema" value={form.json.inputSchema ?? ''} onChange={(value) => setJson(form, onChange, 'inputSchema', value)} />
      <JsonField label="输出 Schema" value={form.json.outputSchema ?? ''} onChange={(value) => setJson(form, onChange, 'outputSchema', value)} />
      <ArrayField label="允许的工具" value={form.arrays.allowedTools ?? ''} onChange={(value) => setArray(form, onChange, 'allowedTools', value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="超时时间（毫秒）" value={form.numbers.timeoutMs ?? ''} onChange={(value) => setNumber(form, onChange, 'timeoutMs', value)} />
        <NumberField label="最大尝试次数" value={form.numbers.maxAttempts ?? ''} onChange={(value) => setNumber(form, onChange, 'maxAttempts', value)} />
      </div>
      <SelectField label="风险等级" value={form.select.riskLevel ?? 'LOW'} options={[['LOW', '低'], ['MEDIUM', '中'], ['HIGH', '高']]} onChange={(value) => setSelect(form, onChange, 'riskLevel', value)} />
      <TextField label="评估套件" value={form.text.evaluationSuiteId ?? ''} onChange={(value) => setText(form, onChange, 'evaluationSuiteId', value)} />
    </>
  );
}

function WorkflowFields({ form, onChange }: FormFieldsProps) {
  return <JsonField label="工作流定义" value={form.json.definition ?? ''} onChange={(value) => setJson(form, onChange, 'definition', value)} />;
}

type FormFieldsProps = {
  form: DefinitionForm;
  onChange: (form: DefinitionForm) => void;
};

function TextField({ label, value, multiline = false, onChange }: { label: string; value: string; multiline?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="definition-input p-3 leading-6" />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className="definition-input min-h-11 px-3" />
      )}
    </label>
  );
}

function ArrayField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField {...props} multiline />;
}

function JsonField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextField {...props} multiline />;
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input type="number" min="1" value={value} onChange={(event) => onChange(event.target.value)} className="definition-input min-h-11 px-3" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="definition-input min-h-11 px-3">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function DialogPanel({ title, children, onClose, closeLabel = '关闭弹窗' }: { title: string; children: React.ReactNode; onClose: () => void; closeLabel?: string }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-foreground/35 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="grid size-11 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden size={17} /></button>
        </div>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}

function DefinitionSkeleton() {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]" role="status" aria-label="正在读取配置目录">
      <span className="sr-only">正在读取配置目录</span>
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <div className="h-80 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

function DefinitionStatus({ value }: { value: DefinitionStatus }) {
  const labels = { DRAFT: '草稿', ACTIVE: '已启用', DEPRECATED: '历史版本' };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${value === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : value === 'DRAFT' ? 'bg-amber-100 text-amber-900' : 'bg-muted text-muted-foreground'}`}>{labels[value]}</span>;
}

function WorkflowPreview({ definition }: { definition: unknown }) {
  if (!isRecord(definition) || !Array.isArray(definition.nodes)) return null;
  const nodes = definition.nodes;
  return (
    <ol className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-5" aria-label="工作流节点">
      {nodes.map((node, index) => {
        const value = isRecord(node) ? String(node.name ?? node.id ?? `节点 ${index + 1}`) : String(node);
        return <li key={`${value}-${index}`} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><span className="rounded-lg bg-muted px-3 py-2">{value}</span>{index < nodes.length - 1 ? <ChevronRight aria-hidden size={14} /> : null}</li>;
      })}
    </ol>
  );
}

function definitionForm(kind: DefinitionKind, item: DefinitionRecord): DefinitionForm {
  const form: DefinitionForm = { name: item.name, text: {}, arrays: {}, json: {}, numbers: {}, select: {} };
  if (kind === 'agents') {
    for (const key of ['goal', 'instructionsVersion'] as const) form.text[key] = String(item[key] ?? '');
    for (const key of ['allowedSkillVersions', 'allowedTools', 'stopConditions', 'handoffConditions'] as const) form.arrays[key] = stringArray(item[key]).join('\n');
    for (const key of ['modelConfiguration', 'tokenAndCostBudget', 'failurePolicy'] as const) form.json[key] = jsonText(item[key]);
  } else if (kind === 'skills') {
    form.text.description = String(item.description ?? '');
    form.text.evaluationSuiteId = String(item.evaluationSuiteId ?? '');
    for (const key of ['inputSchema', 'outputSchema'] as const) form.json[key] = jsonText(item[key]);
    form.arrays.allowedTools = stringArray(item.allowedTools).join('\n');
    form.numbers.timeoutMs = String(item.timeoutMs ?? '');
    form.numbers.maxAttempts = String(item.maxAttempts ?? '');
    form.select.riskLevel = String(item.riskLevel ?? 'LOW');
  } else form.json.definition = jsonText(item.definition);
  return form;
}

function formPatch(kind: DefinitionKind, form: DefinitionForm) {
  if (kind === 'agents') return {
    name: form.name.trim(),
    goal: form.text.goal.trim(),
    instructionsVersion: form.text.instructionsVersion.trim(),
    allowedSkillVersions: parseLines(form.arrays.allowedSkillVersions),
    allowedTools: parseLines(form.arrays.allowedTools),
    modelConfiguration: JSON.parse(form.json.modelConfiguration),
    tokenAndCostBudget: JSON.parse(form.json.tokenAndCostBudget),
    stopConditions: parseLines(form.arrays.stopConditions),
    handoffConditions: parseLines(form.arrays.handoffConditions),
    failurePolicy: JSON.parse(form.json.failurePolicy),
  };
  if (kind === 'skills') return {
    name: form.name.trim(),
    description: form.text.description.trim(),
    inputSchema: JSON.parse(form.json.inputSchema),
    outputSchema: JSON.parse(form.json.outputSchema),
    allowedTools: parseLines(form.arrays.allowedTools),
    timeoutMs: Number(form.numbers.timeoutMs),
    maxAttempts: Number(form.numbers.maxAttempts),
    riskLevel: form.select.riskLevel,
    evaluationSuiteId: form.text.evaluationSuiteId.trim() || null,
  };
  return { name: form.name.trim(), definition: JSON.parse(form.json.definition) };
}

function logicalId(kind: DefinitionKind, item?: DefinitionRecord | null) {
  if (!item) return '';
  return String(item[kind === 'agents' ? 'agentId' : kind === 'skills' ? 'skillId' : 'workflowId'] ?? '');
}

function versionEndpoint(kind: DefinitionKind, definitionId: string, versionId: string) {
  return `/api/internal/v1/${kind}/${encodeURIComponent(definitionId)}/versions/${encodeURIComponent(versionId)}`;
}

function setText(form: DefinitionForm, onChange: (form: DefinitionForm) => void, key: string, value: string) { onChange({ ...form, text: { ...form.text, [key]: value } }); }
function setArray(form: DefinitionForm, onChange: (form: DefinitionForm) => void, key: string, value: string) { onChange({ ...form, arrays: { ...form.arrays, [key]: value } }); }
function setJson(form: DefinitionForm, onChange: (form: DefinitionForm) => void, key: string, value: string) { onChange({ ...form, json: { ...form.json, [key]: value } }); }
function setNumber(form: DefinitionForm, onChange: (form: DefinitionForm) => void, key: string, value: string) { onChange({ ...form, numbers: { ...form.numbers, [key]: value } }); }
function setSelect(form: DefinitionForm, onChange: (form: DefinitionForm) => void, key: string, value: string) { onChange({ ...form, select: { ...form.select, [key]: value } }); }

function parseLines(value: string) { return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
function jsonText(value: unknown) { return JSON.stringify(isRecord(value) ? value : {}, null, 2); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

function definitionSummary(kind: DefinitionKind, item: DefinitionRecord) {
  if (kind === 'agents') return String(item.goal ?? '尚未填写目标');
  if (kind === 'skills') return String(item.description ?? '尚未填写说明');
  return item.kind === 'UPSTREAM' ? '知识整理工作流' : '循证问答工作流';
}

function auditActionLabel(value: string) {
  return ({ DEFINITION_DRAFT_CREATED: '创建了草稿版本', DEFINITION_DRAFT_UPDATED: '更新了草稿配置', DEFINITION_EVALUATION_PASSED: '评估通过', DEFINITION_EVALUATION_FAILED: '评估未通过', DEFINITION_VERSION_ACTIVATED: '激活了版本', DEFINITION_VERSION_ROLLED_BACK: '回滚了版本' } as Record<string, string>)[value] ?? '更新了配置';
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ProductRequestError)) return fallback;
  return ({ DEFINITION_VERSION_CONFLICT: '这个版本号已经存在。', ACTIVE_DEFINITION_IMMUTABLE: '已启用版本不可直接修改，请先复制为草稿。', DEFINITION_EVALUATION_REQUIRED: '激活前必须完成并通过评估。', DEFINITION_EVALUATION_FAILED: '评估没有通过，请检查失败项。' } as Record<string, string>)[error.code] ?? fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
