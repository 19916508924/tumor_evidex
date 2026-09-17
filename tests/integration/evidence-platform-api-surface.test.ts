import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routes: Array<[method: string, path: string]> = [
  ['GET', 'src/app/api/v1/knowledge/diseases/[id]/route.ts'],
  ['GET', 'src/app/api/v1/knowledge/genes/[id]/route.ts'],
  ['GET', 'src/app/api/v1/knowledge/variants/[id]/route.ts'],
  ['GET', 'src/app/api/v1/knowledge/drugs/[id]/route.ts'],
  ['GET', 'src/app/api/v1/knowledge/evidence/[id]/route.ts'],
  ['GET', 'src/app/api/v1/knowledge/sources/[id]/route.ts'],
  ['POST', 'src/app/api/v1/evidence-questions/route.ts'],
  ['GET', 'src/app/api/v1/evidence-questions/[id]/route.ts'],
  ['POST', 'src/app/api/v1/evidence-questions/[id]/retry/route.ts'],
  ['POST', 'src/app/api/v1/evidence-questions/[id]/feedback/route.ts'],
  ['GET', 'src/app/api/internal/v1/ops/dashboard/route.ts'],
  ['GET', 'src/app/api/internal/v1/associations/route.ts'],
  ['GET', 'src/app/api/internal/v1/discovery-strategies/route.ts'],
  [
    'POST',
    'src/app/api/internal/v1/discovery-strategies/[id]/trigger/route.ts',
  ],
  ['POST', 'src/app/api/internal/v1/discovery-strategies/[id]/pause/route.ts'],
  ['POST', 'src/app/api/internal/v1/discovery-strategies/[id]/resume/route.ts'],
  ['GET', 'src/app/api/internal/v1/discovery-runs/route.ts'],
  ['POST', 'src/app/api/internal/v1/discovery-runs/route.ts'],
  ['POST', 'src/app/api/internal/v1/discovery-runs/preview/route.ts'],
  ['GET', 'src/app/api/internal/v1/discovery-runs/[id]/route.ts'],
  ['POST', 'src/app/api/internal/v1/discovery-runs/[id]/pause/route.ts'],
  ['POST', 'src/app/api/internal/v1/discovery-runs/[id]/resume/route.ts'],
  ['POST', 'src/app/api/internal/v1/discovery-runs/[id]/cancel/route.ts'],
  ['GET', 'src/app/api/internal/v1/candidates/route.ts'],
  ['POST', 'src/app/api/internal/v1/candidates/route.ts'],
  ['GET', 'src/app/api/internal/v1/candidates/[id]/route.ts'],
  ['POST', 'src/app/api/internal/v1/candidates/[id]/retry/route.ts'],
  ['GET', 'src/app/api/internal/v1/review-tasks/route.ts'],
  ['GET', 'src/app/api/internal/v1/review-tasks/[id]/route.ts'],
  ['PATCH', 'src/app/api/internal/v1/review-tasks/[id]/draft/route.ts'],
  ['POST', 'src/app/api/internal/v1/review-tasks/[id]/decision/route.ts'],
  ['GET', 'src/app/api/internal/v1/releases/route.ts'],
  ['GET', 'src/app/api/internal/v1/releases/[id]/route.ts'],
  ['GET', 'src/app/api/internal/v1/agents/route.ts'],
  ['GET', 'src/app/api/internal/v1/skills/route.ts'],
  ['GET', 'src/app/api/internal/v1/workflows/route.ts'],
  ['GET', 'src/app/api/internal/v1/workflow-runs/route.ts'],
  ['GET', 'src/app/api/internal/v1/workflow-runs/[id]/route.ts'],
  ['GET', 'src/app/api/internal/v1/question-runs/route.ts'],
  ['GET', 'src/app/api/internal/v1/question-runs/[id]/route.ts'],
  ['GET', 'src/app/api/internal/v1/worker/health/route.ts'],
];

describe('complete frontend API surface', () => {
  for (const [method, path] of routes) {
    it(`${method} ${path.replace(/^src\/app/, '').replace(/\/route\.ts$/, '')}`, () => {
      const source = readFileSync(resolve(path), 'utf8');
      expect(source).toMatch(
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`)
      );
    });
  }
});
