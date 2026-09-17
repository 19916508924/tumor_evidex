import { describe, expect, it, vi } from 'vitest';

import type { DiscoveryRunRepository } from '@/shared/services/evidence-platform/discovery-run';
import { processNextPlatformJob } from '@/shared/services/evidence-platform/persistent-worker';

function repository(overrides: Partial<DiscoveryRunRepository> = {}) {
  return {
    resolveDiscoveryScope: vi.fn(),
    createManualDiscoveryRun: vi.fn(),
    transitionDiscoveryRun: vi.fn(),
    claimPlatformJob: vi.fn().mockResolvedValue({
      id: 'job-1',
      jobType: 'DISCOVERY_RUN',
      resourceId: 'run-1',
      payload: { runId: 'run-1' },
      attempts: 1,
      maxAttempts: 5,
    }),
    completePlatformJob: vi.fn(),
    failPlatformJob: vi.fn().mockResolvedValue({ status: 'RETRY_WAIT' }),
    beginDiscoveryRun: vi.fn(),
    getDiscoveryRunStatus: vi.fn(),
    claimDiscoveryDocument: vi.fn(),
    recordDiscoveryDocumentOutcome: vi.fn(),
    attachCandidateToDiscoveryStrategy: vi.fn(),
    saveDiscoveryQueryProgress: vi.fn(),
    finishDiscoveryRun: vi.fn(),
    touchWorkerHeartbeat: vi.fn(),
    ...overrides,
  } as DiscoveryRunRepository;
}

describe('persistent platform worker', () => {
  it('claims and completes one durable job', async () => {
    const store = repository();
    const processDiscovery = vi.fn().mockResolvedValue(undefined);
    const result = await processNextPlatformJob({
      repository: store,
      workerId: 'worker-1',
      handlers: {
        DISCOVERY_RUN: processDiscovery,
        CANDIDATE_RETRY: vi.fn(),
        QUESTION_RUN: vi.fn(),
      },
    });

    expect(store.claimPlatformJob).toHaveBeenCalledWith({
      workerId: 'worker-1',
      lockTimeoutMs: 300_000,
    });
    expect(processDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'run-1' })
    );
    expect(store.completePlatformJob).toHaveBeenCalledWith('job-1');
    expect(store.touchWorkerHeartbeat).toHaveBeenNthCalledWith(1, {
      workerId: 'worker-1',
      status: 'IDLE',
      currentJobId: null,
    });
    expect(store.touchWorkerHeartbeat).toHaveBeenNthCalledWith(2, {
      workerId: 'worker-1',
      status: 'RUNNING',
      currentJobId: 'job-1',
    });
    expect(store.touchWorkerHeartbeat).toHaveBeenLastCalledWith({
      workerId: 'worker-1',
      status: 'IDLE',
      currentJobId: null,
    });
    expect(result).toEqual({ status: 'SUCCEEDED', jobId: 'job-1' });
  });

  it('does nothing when the queue is empty', async () => {
    const store = repository({
      claimPlatformJob: vi.fn().mockResolvedValue(null),
    });
    await expect(
      processNextPlatformJob({
        repository: store,
        workerId: 'worker-1',
        handlers: {
          DISCOVERY_RUN: vi.fn(),
          CANDIDATE_RETRY: vi.fn(),
          QUESTION_RUN: vi.fn(),
        },
      })
    ).resolves.toEqual({ status: 'IDLE' });
    expect(store.touchWorkerHeartbeat).toHaveBeenCalledWith({
      workerId: 'worker-1',
      status: 'IDLE',
      currentJobId: null,
    });
    expect(store.completePlatformJob).not.toHaveBeenCalled();
  });

  it('persists retry or dead-letter state instead of losing a failed job', async () => {
    const store = repository();
    const result = await processNextPlatformJob({
      repository: store,
      workerId: 'worker-1',
      handlers: {
        DISCOVERY_RUN: vi.fn().mockRejectedValue(new Error('NCBI timeout')),
        CANDIDATE_RETRY: vi.fn(),
        QUESTION_RUN: vi.fn(),
      },
    });
    expect(store.failPlatformJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      errorCode: 'PLATFORM_JOB_FAILED',
      errorSummary: 'NCBI timeout',
    });
    expect(result).toEqual({ status: 'RETRY_WAIT', jobId: 'job-1' });
  });

  it('preserves typed error codes and safely summarizes non-Error failures', async () => {
    const store = repository({
      failPlatformJob: vi.fn().mockResolvedValue({ status: 'DEAD_LETTER' }),
    });
    const typedFailure = { code: 'PUBMED_RATE_LIMITED' };
    const result = await processNextPlatformJob({
      repository: store,
      workerId: 'worker-1',
      lockTimeoutMs: 10_000,
      handlers: {
        DISCOVERY_RUN: vi.fn().mockRejectedValue(typedFailure),
        CANDIDATE_RETRY: vi.fn(),
        QUESTION_RUN: vi.fn(),
      },
    });
    expect(store.claimPlatformJob).toHaveBeenCalledWith({
      workerId: 'worker-1',
      lockTimeoutMs: 10_000,
    });
    expect(store.failPlatformJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      errorCode: 'PUBMED_RATE_LIMITED',
      errorSummary: 'Unknown platform job error',
    });
    expect(result).toEqual({ status: 'DEAD_LETTER', jobId: 'job-1' });
  });

  it('dispatches a durable question run job', async () => {
    const store = repository({
      claimPlatformJob: vi.fn().mockResolvedValue({
        id: 'job-question-1',
        jobType: 'QUESTION_RUN',
        resourceId: 'question-1',
        payload: {},
        attempts: 1,
        maxAttempts: 3,
      }),
    });
    const processQuestion = vi.fn().mockResolvedValue(undefined);
    await expect(
      processNextPlatformJob({
        repository: store,
        workerId: 'worker-1',
        handlers: {
          DISCOVERY_RUN: vi.fn(),
          CANDIDATE_RETRY: vi.fn(),
          QUESTION_RUN: processQuestion,
        },
      })
    ).resolves.toEqual({ status: 'SUCCEEDED', jobId: 'job-question-1' });
    expect(processQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'question-1' })
    );
  });
});
