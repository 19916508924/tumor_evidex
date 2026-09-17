'use client';

import { useId, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

type EffectRecord = Record<string, unknown>;

const effectDefinitions = {
  hazardRatio: { label: '风险比（HR）', initial: 1 },
  oddsRatio: { label: '优势比（OR）', initial: 1 },
  riskRatio: { label: '相对风险（RR）', initial: 1 },
  confidenceInterval95: { label: '95% 置信区间', initial: [0, 1] },
  pValue: { label: 'P 值', initial: '0.05' },
  medianMonthsIntervention: { label: '干预组中位时间（月）', initial: 0 },
  medianMonthsComparator: { label: '对照组中位时间（月）', initial: 0 },
  medianProgressionFreeSurvivalMonths: {
    label: '中位无进展生存期（月）',
    initial: 0,
  },
  objectiveResponseRatePercent: { label: '客观缓解率（%）', initial: 0 },
  diseaseControlRatePercent: { label: '疾病控制率（%）', initial: 0 },
  commonMutationSampleSize: { label: '常见突变样本量', initial: 1 },
} satisfies Record<string, { label: string; initial: unknown }>;

const effectLabels: Record<string, string> = Object.fromEntries(
  Object.entries(effectDefinitions).map(([key, definition]) => [
    key,
    definition.label,
  ])
);

function readableKey(key: string) {
  return (
    effectLabels[key] ??
    key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
  );
}

function isRecord(value: unknown): value is EffectRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function updateAtPath(
  root: EffectRecord,
  path: string[],
  value: unknown
): EffectRecord {
  const [head, ...tail] = path;
  if (!head) return root;
  if (tail.length === 0) return { ...root, [head]: value };
  const child = isRecord(root[head]) ? root[head] : {};
  return { ...root, [head]: updateAtPath(child, tail, value) };
}

function removeAtPath(root: EffectRecord, path: string[]): EffectRecord {
  const [head, ...tail] = path;
  if (!head) return root;
  const next = { ...root };
  if (tail.length === 0) {
    delete next[head];
    return next;
  }
  const child = next[head];
  if (!isRecord(child)) return next;
  const updatedChild = removeAtPath(child, tail);
  if (Object.keys(updatedChild).length === 0) delete next[head];
  else next[head] = updatedChild;
  return next;
}

function numericError(key: string, value: number) {
  if (!Number.isFinite(value)) return '请输入有效数值';
  if (/Ratio$/i.test(key) && value <= 0) {
    return `${readableKey(key)}必须大于 0`;
  }
  if (/Percent$/i.test(key) && (value < 0 || value > 100)) {
    return `${readableKey(key)}必须在 0 到 100 之间`;
  }
  if (/SampleSize$/i.test(key) && (!Number.isInteger(value) || value < 1)) {
    return `${readableKey(key)}必须是大于 0 的整数`;
  }
  if (/Months$/i.test(key) && value < 0) {
    return `${readableKey(key)}不能小于 0`;
  }
  return '';
}

function pValueError(value: string) {
  const normalized = value.trim().replace(/[≤]/g, '<=').replace(/[≥]/g, '>=');
  const match = normalized.match(/^(?:<|>|<=|>=)?\s*(\d+(?:\.\d+)?)$/);
  if (!match) return 'P 值需填写 0 到 1 之间的数值，可带比较符号';
  const numeric = Number(match[1]);
  return numeric >= 0 && numeric <= 1
    ? ''
    : 'P 值需填写 0 到 1 之间的数值，可带比较符号';
}

export function getEffectValueErrors(
  value: EffectRecord | null,
  prefix = ''
): Record<string, string> {
  if (!value) return {};
  const errors: Record<string, string> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof fieldValue === 'number') {
      const error = numericError(key, fieldValue);
      if (error) errors[path] = error;
      continue;
    }
    if (typeof fieldValue === 'string') {
      const error =
        key === 'pValue'
          ? pValueError(fieldValue)
          : fieldValue.trim()
            ? ''
            : `${readableKey(key)}不能为空`;
      if (error) errors[path] = error;
      continue;
    }
    if (Array.isArray(fieldValue)) {
      const validNumbers = fieldValue.every(
        (item) => typeof item === 'number' && Number.isFinite(item)
      );
      if (!validNumbers || fieldValue.length < 2) {
        errors[path] = `${readableKey(key)}需包含有效的下限和上限`;
      } else if (
        /confidenceInterval/i.test(key) &&
        Number(fieldValue[0]) > Number(fieldValue[1])
      ) {
        errors[path] = `${readableKey(key)}的下限不能大于上限`;
      }
      continue;
    }
    if (isRecord(fieldValue)) {
      if (Object.keys(fieldValue).length === 0) {
        errors[path] = `${readableKey(key)}至少需要一个指标`;
      } else {
        Object.assign(errors, getEffectValueErrors(fieldValue, path));
      }
      continue;
    }
    if (typeof fieldValue !== 'boolean') {
      errors[path] = `${readableKey(key)}暂不支持这种数据格式`;
    }
  }
  return errors;
}

export function EffectValueEditor({
  claimLabel,
  value,
  disabled,
  onActivate,
  onChange,
}: {
  claimLabel: string;
  value: EffectRecord | null;
  disabled: boolean;
  onActivate: () => void;
  onChange: (value: EffectRecord | null) => void;
}) {
  const [metricToAdd, setMetricToAdd] = useState<keyof typeof effectDefinitions>(
    'hazardRatio'
  );
  const errors = useMemo(() => getEffectValueErrors(value), [value]);
  const availableMetrics = Object.keys(effectDefinitions).filter(
    (key) => !value || !(key in value)
  ) as Array<keyof typeof effectDefinitions>;
  const selectedMetric = availableMetrics.includes(metricToAdd)
    ? metricToAdd
    : availableMetrics[0];
  const addId = useId();

  function changeAtPath(path: string[], nextValue: unknown) {
    onActivate();
    onChange(updateAtPath(value ?? {}, path, nextValue));
  }

  function removeAt(path: string[]) {
    onActivate();
    const next = removeAtPath(value ?? {}, path);
    onChange(Object.keys(next).length ? next : null);
  }

  function addMetric() {
    if (!selectedMetric) return;
    const definition = effectDefinitions[selectedMetric];
    onActivate();
    onChange({ ...(value ?? {}), [selectedMetric]: definition.initial });
    const remaining = availableMetrics.filter((key) => key !== selectedMetric);
    if (remaining[0]) setMetricToAdd(remaining[0]);
  }

  return (
    <fieldset
      className="grid gap-3 rounded-xl border border-border bg-muted/35 p-4"
      onFocus={onActivate}
      onClick={onActivate}
    >
      <legend className="px-2 text-sm font-semibold">{claimLabel}·效应量</legend>
      {value && Object.keys(value).length ? (
        <div className="grid gap-3">
          {Object.entries(value).map(([key, fieldValue]) => (
            <EffectField
              key={key}
              claimLabel={claimLabel}
              fieldKey={key}
              path={[key]}
              value={fieldValue}
              errors={errors}
              disabled={disabled}
              onChange={changeAtPath}
              onRemove={removeAt}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">尚未填写效应量。</p>
      )}

      {availableMetrics.length ? (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label htmlFor={addId} className="text-xs font-semibold text-muted-foreground">
            添加效应指标
            <select
              id={addId}
              value={selectedMetric}
              onChange={(event) =>
                setMetricToAdd(
                  event.target.value as keyof typeof effectDefinitions
                )
              }
              disabled={disabled}
              className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {availableMetrics.map((key) => (
                <option key={key} value={key}>
                  {effectDefinitions[key].label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={addMetric}
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-primary outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
          >
            <Plus aria-hidden size={15} />
            添加
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

function EffectField({
  claimLabel,
  fieldKey,
  path,
  value,
  errors,
  disabled,
  onChange,
  onRemove,
}: {
  claimLabel: string;
  fieldKey: string;
  path: string[];
  value: unknown;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (path: string[], value: unknown) => void;
  onRemove: (path: string[]) => void;
}) {
  const label = readableKey(fieldKey);
  const pathKey = path.join('.');
  const error = errors[pathKey];
  const inputClass =
    'mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted';

  if (isRecord(value)) {
    return (
      <fieldset className="grid gap-3 rounded-xl border border-border bg-background/70 p-3">
        <legend className="px-2 text-sm font-semibold">{label}</legend>
        {Object.entries(value).map(([childKey, childValue]) => (
          <EffectField
            key={childKey}
            claimLabel={claimLabel}
            fieldKey={childKey}
            path={[...path, childKey]}
            value={childValue}
            errors={errors}
            disabled={disabled}
            onChange={onChange}
            onRemove={onRemove}
          />
        ))}
        <RemoveEffectButton
          label={`删除${label}`}
          disabled={disabled}
          onClick={() => onRemove(path)}
        />
        {error ? <FieldError message={error} /> : null}
      </fieldset>
    );
  }

  if (Array.isArray(value)) {
    return (
      <fieldset className="grid gap-2 rounded-xl border border-border bg-background/70 p-3 sm:grid-cols-2">
        <legend className="px-2 text-sm font-semibold">
          {claimLabel}·{label}
        </legend>
        {value.map((item, index) => (
          <label key={index} className="text-xs font-semibold text-muted-foreground">
            {index === 0 ? '下限' : index === 1 ? '上限' : `第 ${index + 1} 项`}
            <input
              type="number"
              step="any"
              value={typeof item === 'number' ? item : ''}
              aria-label={`${claimLabel}·${label}${index === 0 ? '下限' : index === 1 ? '上限' : `第 ${index + 1} 项`}`}
              aria-invalid={Boolean(error)}
              disabled={disabled}
              onChange={(event) => {
                const next = [...value];
                next[index] = event.target.value
                  ? Number(event.target.value)
                  : Number.NaN;
                onChange(path, next);
              }}
              className={inputClass}
            />
          </label>
        ))}
        <div className="sm:col-span-2">
          <RemoveEffectButton
            label={`删除${label}`}
            disabled={disabled}
            onClick={() => onRemove(path)}
          />
          {error ? <FieldError message={error} /> : null}
        </div>
      </fieldset>
    );
  }

  const isNumber = typeof value === 'number';
  const isBoolean = typeof value === 'boolean';
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="text-xs font-semibold text-muted-foreground">
          {claimLabel}·{label}
          {isBoolean ? (
            <select
              value={String(value)}
              aria-label={`${claimLabel}·${label}`}
              disabled={disabled}
              onChange={(event) => onChange(path, event.target.value === 'true')}
              className={inputClass}
            >
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          ) : (
            <input
              type={isNumber ? 'number' : 'text'}
              step={isNumber ? 'any' : undefined}
              value={
                typeof value === 'number'
                  ? Number.isNaN(value)
                    ? ''
                    : value
                  : typeof value === 'string'
                    ? value
                    : ''
              }
              aria-label={`${claimLabel}·${label}`}
              aria-invalid={Boolean(error)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  path,
                  isNumber
                    ? event.target.value
                      ? Number(event.target.value)
                      : Number.NaN
                    : event.target.value
                )
              }
              className={inputClass}
            />
          )}
        </label>
        <RemoveEffectButton
          label={`删除${label}`}
          disabled={disabled}
          onClick={() => onRemove(path)}
        />
      </div>
      {error ? <FieldError message={error} /> : null}
    </div>
  );
}

function RemoveEffectButton({
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
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
    >
      <Trash2 aria-hidden size={14} />
      删除
    </button>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
      {message}
    </p>
  );
}
