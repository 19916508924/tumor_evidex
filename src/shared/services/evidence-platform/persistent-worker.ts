import type {
  DiscoveryRunRepository,
  PersistentPlatformJob,
} from './discovery-run';

export interface PlatformJobHandlers {
  DISCOVERY_RUN(job: PersistentPlatformJob): Promise<void>;
  CANDIDATE_RETRY(job: PersistentPlatformJob): Promise<void>;
  QUESTION_RUN(job: PersistentPlatformJob): Promise<void>;
}

export async function processNextPlatformJob(_input: {
  repository: DiscoveryRunRepository;
  handlers: PlatformJobHandlers;
  workerId: string;
  lockTimeoutMs?: number;
}) {
  await _input.repository.touchWorkerHeartbeat?.({
    workerId: _input.workerId,
    status: 'IDLE',
    currentJobId: null,
  });
  const job = await _input.repository.claimPlatformJob({
    workerId: _input.workerId,
    lockTimeoutMs: _input.lockTimeoutMs ?? 5 * 60 * 1000,
  });
  if (!job) return { status: 'IDLE' as const };
  await _input.repository.touchWorkerHeartbeat?.({
    workerId: _input.workerId,
    status: 'RUNNING',
    currentJobId: job.id,
  });
  try {
    await _input.handlers[job.jobType](job);
    await _input.repository.completePlatformJob(job.id);
    await _input.repository.touchWorkerHeartbeat?.({
      workerId: _input.workerId,
      status: 'IDLE',
      currentJobId: null,
    });
    return { status: 'SUCCEEDED' as const, jobId: job.id };
  } catch (error) {
    const failed = await _input.repository.failPlatformJob({
      jobId: job.id,
      errorCode: errorCode(error),
      errorSummary:
        error instanceof Error ? error.message : 'Unknown platform job error',
    });
    await _input.repository.touchWorkerHeartbeat?.({
      workerId: _input.workerId,
      status: 'ERROR',
      currentJobId: job.id,
    });
    return { status: failed.status, jobId: job.id };
  }
}

function errorCode(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'PLATFORM_JOB_FAILED';
}
