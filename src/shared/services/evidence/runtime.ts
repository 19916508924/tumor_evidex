import { dbPostgres } from '@/core/db';
import {
  createEvolinkEvidenceAnswerGenerator,
  createOpenRouterEvidenceAnswerGenerator,
} from '@/extensions/ai/evidence-answer';

import type { EvidenceAnswerDependencies } from './answer-evidence-query';
import { createPostgresEvidenceRepository } from './postgres-evidence-repository';

let dependencies: EvidenceAnswerDependencies | undefined;

export function getEvidenceAnswerDependencies(): EvidenceAnswerDependencies {
  if (dependencies) return dependencies;

  const provider = process.env.EVIDEX_AI_PROVIDER || 'evolink';
  if (provider !== 'evolink' && provider !== 'openrouter') {
    throw new Error(`Unsupported EVIDEX_AI_PROVIDER: ${provider}`);
  }

  const model =
    process.env.EVIDEX_AI_MODEL ||
    (provider === 'evolink' ? 'gpt-5.6-terra' : '');
  const generator =
    provider === 'evolink'
      ? createEvolinkEvidenceAnswerGenerator({
          apiKey: process.env.EVIDEX_EVOLINK_API_KEY || '',
          model,
          baseUrl: process.env.EVIDEX_EVOLINK_BASE_URL,
        })
      : createOpenRouterEvidenceAnswerGenerator({
          apiKey: process.env.EVIDEX_OPENROUTER_API_KEY || '',
          model,
          baseUrl: process.env.EVIDEX_OPENROUTER_BASE_URL,
        });
  dependencies = {
    repository: createPostgresEvidenceRepository(dbPostgres(), {
      releaseVersion: process.env.EVIDEX_KNOWLEDGE_RELEASE || undefined,
    }),
    generator,
    promptVersion: process.env.EVIDEX_PROMPT_VERSION || 'evidex-answer-v1',
    provider,
    model,
  };

  return dependencies;
}
