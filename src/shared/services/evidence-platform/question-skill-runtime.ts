import { z } from 'zod';

import {
  interpretEvidenceQuestion,
  type InterpretedEvidenceQuestion,
  type NaturalLanguageQuestionInput,
  type QuestionEntityCatalog,
} from './natural-language-question';
import {
  executeSkill,
  type AgentExecutionPolicy,
  type SkillDefinition,
} from './skill-runtime';

const inputSchema = z
  .object({
    question: z.string().trim().min(1).max(4_000),
    locale: z.literal('zh-CN'),
    context: z
      .object({
        disease: z.string().optional(),
        gene: z.string().optional(),
        variant: z.string().optional(),
        drug: z.string().optional(),
      })
      .optional(),
  })
  .strict();

const outputSchema = z.custom<InterpretedEvidenceQuestion>(
  (value) =>
    Boolean(
      value &&
        typeof value === 'object' &&
        'status' in value &&
        ['RESOLVED', 'NEEDS_CLARIFICATION', 'OUT_OF_SCOPE'].includes(
          String(value.status)
        )
    ),
  'Invalid interpreted evidence question'
);

const questionUnderstandingAgent: AgentExecutionPolicy = {
  agentId: 'question-understanding-agent',
  version: '1.0.0',
  allowedSkillVersions: ['understand_question@1.0.0'],
};

export function executeQuestionUnderstanding(input: {
  value: NaturalLanguageQuestionInput;
  catalog: QuestionEntityCatalog;
}) {
  const definition: SkillDefinition<
    NaturalLanguageQuestionInput,
    InterpretedEvidenceQuestion
  > = {
    skillId: 'understand_question',
    name: 'Understand evidence question',
    version: '1.0.0',
    kind: 'DETERMINISTIC',
    description:
      'Resolve intent and clinical entities against one locked published catalog.',
    inputSchema,
    outputSchema,
    allowedTools: ['knowledge.read'],
    sideEffect: 'NONE',
    timeoutMs: 5_000,
    maxAttempts: 1,
    riskLevel: 'HIGH',
    evaluationSuiteId: null,
    status: 'ACTIVE',
    execute: async (value) => interpretEvidenceQuestion(value, input.catalog),
  };
  return executeSkill({
    definition,
    agent: questionUnderstandingAgent,
    value: input.value,
  });
}
