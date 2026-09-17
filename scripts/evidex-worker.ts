import { hostname } from 'node:os';

import { processNextPlatformJob } from '@/shared/services/evidence-platform/persistent-worker';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

const once = process.argv.includes('--once');
const pollIndex = process.argv.indexOf('--poll-ms');
const pollMs =
  pollIndex >= 0 ? Number(process.argv[pollIndex + 1]) : Number.NaN;
const idleDelayMs = Number.isFinite(pollMs)
  ? Math.min(60_000, Math.max(250, pollMs))
  : 2_000;
const workerId = `${hostname()}:${process.pid}`;
let stopping = false;

process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});

async function main() {
  const platform = getEvidencePlatformRuntime();
  do {
    const result = await processNextPlatformJob({
      repository: platform.discoveryRepository,
      handlers: platform.workerHandlers,
      workerId,
    });
    if (once) break;
    if (result.status === 'IDLE') await wait(idleDelayMs);
  } while (!stopping);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
