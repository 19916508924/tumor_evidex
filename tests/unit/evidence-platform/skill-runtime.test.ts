import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  executeSkill,
  type SkillDefinition,
} from '@/shared/services/evidence-platform/skill-runtime';

function definition(
  execute = vi.fn(async ({ value }: { value: string }) => ({
    normalized: value.trim().toUpperCase(),
  }))
): SkillDefinition<{ value: string }, { normalized: string }> {
  return {
    skillId: 'normalize_gene',
    name: 'Normalize gene',
    version: '1.0.0',
    kind: 'DETERMINISTIC',
    description: 'Normalizes an HGNC gene symbol.',
    inputSchema: z.object({ value: z.string().min(1) }),
    outputSchema: z.object({ normalized: z.string().min(1) }),
    allowedTools: [],
    sideEffect: 'NONE',
    timeoutMs: 1_000,
    maxAttempts: 1,
    riskLevel: 'LOW',
    evaluationSuiteId: 'eval-normalization-v1',
    status: 'ACTIVE',
    execute,
  };
}

const agent = {
  agentId: 'normalization-agent',
  version: '1.0.0',
  allowedSkillVersions: ['normalize_gene@1.0.0'],
};

describe('versioned Skill runtime', () => {
  it('validates both schemas and emits reproducible hashes and version trace', async () => {
    const ticks = [100, 108];
    const result = await executeSkill({
      definition: definition(),
      agent,
      value: { value: ' egfr ' },
      now: () => ticks.shift()!,
    });

    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      agentId: 'normalization-agent',
      agentVersion: '1.0.0',
      skillId: 'normalize_gene',
      skillVersion: '1.0.0',
      output: { normalized: 'EGFR' },
      durationMs: 8,
    });
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.outputHash).toMatch(/^[a-f0-9]{64}$/);

    const repeated = await executeSkill({
      definition: definition(),
      agent,
      value: { value: ' egfr ' },
    });
    expect(repeated.inputHash).toBe(result.inputHash);
    expect(repeated.outputHash).toBe(result.outputHash);
  });

  it('rejects a Skill version outside the Agent allowlist before execution', async () => {
    const execute = vi.fn(async () => ({ normalized: 'EGFR' }));

    await expect(
      executeSkill({
        definition: definition(execute),
        agent: { ...agent, allowedSkillVersions: [] },
        value: { value: 'EGFR' },
      })
    ).rejects.toMatchObject({
      code: 'SKILL_NOT_ALLOWED',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects invalid input and invalid model output with distinct codes', async () => {
    await expect(
      executeSkill({
        definition: definition(),
        agent,
        value: { value: '' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_SKILL_INPUT' });

    await expect(
      executeSkill({
        definition: definition(vi.fn(async () => ({ normalized: '' }))),
        agent,
        value: { value: 'EGFR' },
      })
    ).rejects.toMatchObject({ code: 'INVALID_SKILL_OUTPUT' });
  });

  it('rejects inactive Skills and the forbidden PUBLISH side effect', async () => {
    await expect(
      executeSkill({
        definition: { ...definition(), status: 'DRAFT' },
        agent,
        value: { value: 'EGFR' },
      })
    ).rejects.toMatchObject({ code: 'SKILL_NOT_ACTIVE' });

    const invalid = {
      ...definition(),
      sideEffect: 'PUBLISH',
    } as unknown as SkillDefinition<{ value: string }, { normalized: string }>;

    await expect(
      executeSkill({
        definition: invalid,
        agent,
        value: { value: 'EGFR' },
      })
    ).rejects.toMatchObject({ code: 'SKILL_NOT_ALLOWED' });
  });

  it('enforces maxAttempts and reports the successful retry in the trace', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary provider failure'))
      .mockResolvedValueOnce({ normalized: 'EGFR' });
    const result = await executeSkill({
      definition: { ...definition(execute), maxAttempts: 2 },
      agent,
      value: { value: 'EGFR' },
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: 'SUCCEEDED', attempt: 2 });
  });

  it('enforces timeoutMs on every attempt and returns a typed terminal error', async () => {
    const execute = vi.fn(
      () => new Promise<{ normalized: string }>(() => undefined)
    );
    await expect(
      executeSkill({
        definition: {
          ...definition(execute),
          timeoutMs: 5,
          maxAttempts: 2,
        },
        agent,
        value: { value: 'EGFR' },
      })
    ).rejects.toMatchObject({
      code: 'SKILL_TIMEOUT',
      attempts: 2,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
