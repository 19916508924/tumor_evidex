'use client';

import type { EvidenceDraftInput } from '@/shared/services/evidence-platform/upstream-workflow';

import {
  EffectValueEditor,
  getEffectValueErrors,
} from './ops-review-effect-editor';
import type { EvidenceClaim } from './ops-review-model';

type ClaimTextField = Exclude<
  keyof EvidenceClaim,
  | 'id'
  | 'claimType'
  | 'evidenceMaturity'
  | 'sampleSize'
  | 'effectValue'
  | 'passageIds'
>;

const claimTextFields: Array<{
  key: ClaimTextField;
  label: string;
  multiline?: boolean;
  nullable?: boolean;
}> = [
  { key: 'studyType', label: '研究类型' },
  { key: 'studyName', label: '研究名称', nullable: true },
  { key: 'populationSummary', label: '研究人群', multiline: true },
  { key: 'diseaseStage', label: '疾病阶段', nullable: true },
  { key: 'treatmentLine', label: '治疗线次', nullable: true },
  { key: 'priorTherapy', label: '既往治疗', multiline: true, nullable: true },
  { key: 'intervention', label: '干预措施' },
  { key: 'comparator', label: '对照措施', nullable: true },
  { key: 'endpoint', label: '研究终点' },
  { key: 'conclusion', label: '结论', multiline: true },
  { key: 'limitations', label: '局限性', multiline: true },
];

export function getDraftEditorErrors(draft: EvidenceDraftInput) {
  const messages: string[] = [];
  const passages = new Map(draft.passages.map((passage) => [passage.id, passage]));
  draft.claims.forEach((claim, index) => {
    const effectErrors = Object.values(getEffectValueErrors(claim.effectValue));
    effectErrors.forEach((message) =>
      messages.push(`证据结论 ${index + 1}：${message}`)
    );
    if (
      !claim.passageIds.some((passageId) => {
        const passage = passages.get(passageId);
        return (
          passage?.supportRole === 'PRIMARY' &&
          passage.modelUsePolicy === 'ALLOWED'
        );
      })
    ) {
      messages.push(`证据结论 ${index + 1}至少需要一条可使用的主要依据`);
    }
  });
  return [...new Set(messages)];
}

export function DraftOverview({
  draft,
  disabled,
  onChange,
}: {
  draft: EvidenceDraftInput;
  disabled: boolean;
  onChange: (draft: EvidenceDraftInput) => void;
}) {
  return (
    <fieldset className="grid gap-4 rounded-xl border border-border bg-muted/35 p-4">
      <legend className="px-2 text-sm font-semibold">草稿概况</legend>
      <label className="text-sm font-semibold">
        建议等级
        <select
          value={draft.proposedLevel}
          onChange={(event) =>
            onChange({ ...draft, proposedLevel: event.target.value })
          }
          disabled={disabled}
          className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {['1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold">
        分级依据
        <textarea
          value={draft.gradingRationale}
          onChange={(event) =>
            onChange({ ...draft, gradingRationale: event.target.value })
          }
          disabled={disabled}
          rows={3}
          className="mt-2 w-full rounded-xl border border-input bg-background p-3 leading-6 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
    </fieldset>
  );
}

export function ClaimEditor({
  index,
  claim,
  disabled,
  onActivate,
  onChange,
}: {
  index: number;
  claim: EvidenceClaim;
  disabled: boolean;
  onActivate: (path: string) => void;
  onChange: (claim: EvidenceClaim) => void;
}) {
  const claimLabel = `证据结论 ${index + 1}`;
  const activate = (field: keyof EvidenceClaim) =>
    onActivate(`claims.${index}.${String(field)}`);
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-border p-4 sm:p-5">
      <legend className="px-2">
        <h3 className="text-base font-semibold">{claimLabel}</h3>
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          {claimLabel}·结论类型
          <select
            value={claim.claimType}
            onFocus={() => activate('claimType')}
            onClick={() => activate('claimType')}
            onChange={(event) =>
              onChange({
                ...claim,
                claimType: event.target.value as EvidenceClaim['claimType'],
              })
            }
            disabled={disabled}
            className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="EFFICACY">疗效</option>
            <option value="RESISTANCE">耐药</option>
            <option value="SAFETY_CONTEXT">安全性背景</option>
            <option value="OTHER">其他</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          {claimLabel}·证据成熟度
          <select
            value={claim.evidenceMaturity}
            onFocus={() => activate('evidenceMaturity')}
            onClick={() => activate('evidenceMaturity')}
            onChange={(event) =>
              onChange({
                ...claim,
                evidenceMaturity: event.target
                  .value as EvidenceClaim['evidenceMaturity'],
              })
            }
            disabled={disabled}
            className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="MATURE_CLINICAL">成熟临床证据</option>
            <option value="LIMITED_CLINICAL">有限临床证据</option>
            <option value="PRECLINICAL">临床前证据</option>
            <option value="INSUFFICIENT">证据不足</option>
          </select>
        </label>
      </div>

      {claimTextFields.map((field) => (
        <ClaimTextInput
          key={field.key}
          label={`${claimLabel}·${field.label}`}
          value={claim[field.key] ?? ''}
          multiline={field.multiline}
          disabled={disabled}
          onActivate={() => activate(field.key)}
          onChange={(value) =>
            onChange({
              ...claim,
              [field.key]: field.nullable && !value ? null : value,
            })
          }
        />
      ))}

      <label className="text-sm font-semibold">
        {claimLabel}·样本量
        <input
          type="number"
          min="1"
          value={claim.sampleSize ?? ''}
          onFocus={() => activate('sampleSize')}
          onClick={() => activate('sampleSize')}
          onChange={(event) =>
            onChange({
              ...claim,
              sampleSize: event.target.value ? Number(event.target.value) : null,
            })
          }
          disabled={disabled}
          className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <EffectValueEditor
        claimLabel={claimLabel}
        value={claim.effectValue}
        disabled={disabled}
        onActivate={() => activate('effectValue')}
        onChange={(effectValue) => onChange({ ...claim, effectValue })}
      />
    </fieldset>
  );
}

function ClaimTextInput({
  label,
  value,
  multiline,
  disabled,
  onActivate,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  disabled: boolean;
  onActivate: () => void;
  onChange: (value: string) => void;
}) {
  const shared =
    'mt-2 w-full rounded-xl border border-input bg-background font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted';
  return (
    <label className="text-sm font-semibold">
      {label}
      {multiline ? (
        <textarea
          value={value}
          rows={4}
          onFocus={onActivate}
          onClick={onActivate}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={`${shared} p-3 leading-6`}
        />
      ) : (
        <input
          value={value}
          onFocus={onActivate}
          onClick={onActivate}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={`${shared} min-h-11 px-3`}
        />
      )}
    </label>
  );
}
