import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';

export type SkillSideEffect = 'NONE' | 'STAGING_WRITE';

export interface SkillDefinition<Input, Output> {
  skillId: string;
  name: string;
  version: string;
  kind: 'DETERMINISTIC' | 'MODEL' | 'HYBRID';
  description: string;
  inputSchema: ZodType<Input>;
  outputSchema: ZodType<Output>;
  allowedTools: string[];
  sideEffect: SkillSideEffect;
  timeoutMs: number;
  maxAttempts: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  evaluationSuiteId: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED';
  execute(input: Input): Promise<Output>;
}

export interface AgentExecutionPolicy {
  agentId: string;
  version: string;
  allowedSkillVersions: string[];
}

export interface SkillExecutionTrace<Output> {
  status: 'SUCCEEDED';
  agentId: string;
  agentVersion: string;
  skillId: string;
  skillVersion: string;
  inputHash: string;
  outputHash: string;
  output: Output;
  durationMs: number;
  attempt: number;
}

export class SkillExecutionError extends Error {
  constructor(
    public readonly code:
      | 'SKILL_NOT_ACTIVE'
      | 'SKILL_NOT_ALLOWED'
      | 'INVALID_SKILL_INPUT'
      | 'INVALID_SKILL_OUTPUT'
      | 'SKILL_TIMEOUT'
      | 'SKILL_EXECUTION_FAILED',
    message: string,
    public readonly attempts = 0,
    context: {
      skillId?: string;
      skillVersionId?: string;
      agentVersionId?: string;
      inputHash?: string;
    } = {}
  ) {
    super(message);
    this.name = 'SkillExecutionError';
    this.skillId = context.skillId;
    this.skillVersionId = context.skillVersionId;
    this.agentVersionId = context.agentVersionId;
    this.inputHash = context.inputHash;
  }

  readonly skillId?: string;
  readonly skillVersionId?: string;
  readonly agentVersionId?: string;
  readonly inputHash?: string;
}

export async function executeSkill<Input, Output>(_input: {
  definition: SkillDefinition<Input, Output>;
  agent: AgentExecutionPolicy;
  value: unknown;
  now?: () => number;
}): Promise<SkillExecutionTrace<Output>> {
  const { definition, agent, value } = _input;
  const key = `${definition.skillId}@${definition.version}`;
  const context = {
    skillId: definition.skillId,
    skillVersionId: key,
    agentVersionId: `${agent.agentId}@${agent.version}`,
    inputHash: hashArtifact(value),
  };
  if (definition.status !== 'ACTIVE') {
    throw new SkillExecutionError(
      'SKILL_NOT_ACTIVE',
      `Skill ${key} is not active`,
      0,
      context
    );
  }
  if (
    !agent.allowedSkillVersions.includes(key) ||
    (definition.sideEffect as string) === 'PUBLISH'
  ) {
    throw new SkillExecutionError(
      'SKILL_NOT_ALLOWED',
      `Agent ${agent.agentId}@${agent.version} cannot execute ${key}`,
      0,
      context
    );
  }

  const parsedInput = definition.inputSchema.safeParse(value);
  if (!parsedInput.success) {
    throw new SkillExecutionError(
      'INVALID_SKILL_INPUT',
      `Input does not match ${key}`,
      0,
      context
    );
  }

  const now = _input.now ?? Date.now;
  const startedAt = now();
  let terminalError: SkillExecutionError | undefined;
  for (let attempt = 1; attempt <= definition.maxAttempts; attempt += 1) {
    try {
      const rawOutput = await withTimeout(
        Promise.resolve().then(() => definition.execute(parsedInput.data)),
        definition.timeoutMs
      );
      const parsedOutput = definition.outputSchema.safeParse(rawOutput);
      if (!parsedOutput.success) {
        throw new SkillExecutionError(
          'INVALID_SKILL_OUTPUT',
          `Output does not match ${key}`,
          attempt,
          context
        );
      }
      const completedAt = now();
      return {
        status: 'SUCCEEDED',
        agentId: agent.agentId,
        agentVersion: agent.version,
        skillId: definition.skillId,
        skillVersion: definition.version,
        inputHash: hashArtifact(parsedInput.data),
        outputHash: hashArtifact(parsedOutput.data),
        output: parsedOutput.data,
        durationMs: Math.max(0, completedAt - startedAt),
        attempt,
      };
    } catch (error) {
      terminalError =
        error instanceof SkillTimeoutError
          ? new SkillExecutionError(
              'SKILL_TIMEOUT',
              `${key} timed out after ${definition.timeoutMs}ms`,
              attempt,
              context
            )
          : error instanceof SkillExecutionError
            ? new SkillExecutionError(
                error.code,
                error.message,
                attempt,
                context
              )
            : new SkillExecutionError(
                'SKILL_EXECUTION_FAILED',
                error instanceof Error ? error.message : `${key} failed`,
                attempt,
                context
              );
    }
  }
  throw terminalError!;
}

class SkillTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new SkillTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function hashArtifact(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}
