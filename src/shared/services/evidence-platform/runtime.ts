import { dbPostgres } from '@/core/db';
import { createEvolinkEvidenceAnswerGenerator } from '@/extensions/ai/evidence-answer';
import { createEvolinkEvidenceExtractionGenerator } from '@/extensions/ai/evidence-extraction';
import { createPostgresMinIntervalStore } from '@/shared/lib/rate-limit';

import type { EvidenceAnswerDependencies } from '../evidence/answer-evidence-query';
import { createPostgresEvidenceRepository } from '../evidence/postgres-evidence-repository';
import { processCandidateRetry } from './candidate-retry';
import { createCivicSourceAdapter } from './civic-source-adapter';
import { createPostgresDiscoveryRunRepository } from './postgres-discovery-repository';
import { createPostgresOperationsRepository } from './postgres-operations-repository';
import {
  createPostgresKnowledgeCatalogRepository,
  createPostgresQuestionRunRepository,
  createPostgresReviewPublishRepository,
  createPostgresUpstreamWorkflowRepository,
} from './postgres-platform-repository';
import { processPersistentDiscoveryRun } from './process-discovery-run';
import { createPubmedSourceAdapter } from './pubmed-source-adapter';
import {
  processEvidenceQuestionRun,
  type QuestionWorkflowDependencies,
} from './question-workflow';

let runtime: ReturnType<typeof createRuntime> | undefined;

function createRuntime() {
  const database = dbPostgres();
  const provider = process.env.EVIDEX_AI_PROVIDER || 'evolink';
  if (provider !== 'evolink') {
    throw new Error(
      'The Agent platform currently requires EVIDEX_AI_PROVIDER=evolink'
    );
  }
  const model = process.env.EVIDEX_AI_MODEL || 'gpt-5.6-terra';
  const generator = createEvolinkEvidenceAnswerGenerator({
    apiKey: process.env.EVIDEX_EVOLINK_API_KEY || '',
    model,
    baseUrl: process.env.EVIDEX_EVOLINK_BASE_URL,
  });
  const extractionGenerator = createEvolinkEvidenceExtractionGenerator({
    apiKey: process.env.EVIDEX_EVOLINK_API_KEY || '',
    model: process.env.EVIDEX_EXTRACTION_MODEL || model,
    baseUrl: process.env.EVIDEX_EVOLINK_BASE_URL,
  });
  const questionDependencies: QuestionWorkflowDependencies = {
    repository: createPostgresQuestionRunRepository(database),
    getAnswerDependencies(
      releaseVersion,
      interpretation
    ): EvidenceAnswerDependencies {
      const repository = createPostgresEvidenceRepository(database, {
        releaseVersion,
      });
      const drugs =
        interpretation?.status === 'RESOLVED' ? interpretation.drugs : [];
      return {
        repository:
          drugs.length === 0
            ? repository
            : {
                ...repository,
                async retrieveEvidence(releaseId, query) {
                  const groups = await repository.retrieveEvidence(
                    releaseId,
                    query
                  );
                  return groups.map((group) => ({
                    ...group,
                    therapies: group.therapies.filter((therapy) =>
                      therapy.drugs.some((drug) =>
                        drugs.includes(drug.genericName.toLowerCase())
                      )
                    ),
                  }));
                },
              },
        generator,
        promptVersion: process.env.EVIDEX_PROMPT_VERSION || 'evidex-answer-v1',
        provider,
        model,
        normalizedQuery:
          interpretation?.status === 'RESOLVED'
            ? interpretation.normalizedQuery
            : undefined,
        requestContext:
          interpretation?.status === 'RESOLVED'
            ? { intent: interpretation.intent, drugs }
            : undefined,
      };
    },
  };
  const upstreamRepository = createPostgresUpstreamWorkflowRepository(database);
  const discoveryRepository = createPostgresDiscoveryRunRepository(database);
  const operationsRepository = createPostgresOperationsRepository(database);
  const pubmedRateLimitStore = createPostgresMinIntervalStore(() => database);
  const civicRateLimitStore = createPostgresMinIntervalStore(() => database);
  const createPubmed = () =>
    createPubmedSourceAdapter({
      apiKey: process.env.EVIDEX_NCBI_API_KEY,
      tool: 'evidex',
      email: process.env.EVIDEX_NCBI_EMAIL,
      rateLimitStore: pubmedRateLimitStore,
    });
  const createCivic = () =>
    createCivicSourceAdapter({
      apiKey: process.env.EVIDEX_CIVIC_API_KEY,
      baseUrl: process.env.EVIDEX_CIVIC_BASE_URL,
      rateLimitStore: civicRateLimitStore,
    });
  return {
    catalogRepository: createPostgresKnowledgeCatalogRepository(database),
    upstreamRepository,
    reviewRepository: createPostgresReviewPublishRepository(database),
    questionDependencies,
    extractionGenerator,
    pubmed: createPubmed(),
    civic: createCivic(),
    operationsRepository,
    discoveryRepository,
    previewSigningSecret:
      process.env.EVIDEX_PREVIEW_SECRET || process.env.AUTH_SECRET || '',
    workerHandlers: {
      async DISCOVERY_RUN(job: { resourceId: string }) {
        await processPersistentDiscoveryRun({
          runId: job.resourceId,
          repository: discoveryRepository,
          upstreamRepository,
          pubmed: createPubmed(),
          civic: createCivic(),
          extractionGenerator,
          workflowVersion:
            process.env.EVIDEX_INGESTION_WORKFLOW_VERSION || 'single-pubmed-v3',
          agentVersion:
            process.env.EVIDEX_EXTRACTION_AGENT_VERSION ||
            'extraction-agent@1.0.0',
        });
      },
      async CANDIDATE_RETRY(job: { resourceId: string }) {
        await processCandidateRetry({
          candidateId: job.resourceId,
          repository: upstreamRepository,
          generator: extractionGenerator,
          pubmed: createPubmed(),
          agentVersion:
            process.env.EVIDEX_EXTRACTION_AGENT_VERSION ||
            'extraction-agent@1.0.0',
        });
      },
      async QUESTION_RUN(job: { resourceId: string }) {
        await processEvidenceQuestionRun({
          questionRunId: job.resourceId,
          resumeExisting: true,
          dependencies: questionDependencies,
        });
      },
    },
  };
}

export function getEvidencePlatformRuntime() {
  runtime ??= createRuntime();
  return runtime;
}
