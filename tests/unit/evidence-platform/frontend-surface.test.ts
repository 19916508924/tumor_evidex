import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const routes = [
  'src/app/[locale]/(product)/knowledge/page.tsx',
  'src/app/[locale]/(product)/knowledge/diseases/page.tsx',
  'src/app/[locale]/(product)/knowledge/diseases/[id]/page.tsx',
  'src/app/[locale]/(product)/knowledge/genes/page.tsx',
  'src/app/[locale]/(product)/knowledge/genes/[id]/page.tsx',
  'src/app/[locale]/(product)/knowledge/variants/page.tsx',
  'src/app/[locale]/(product)/knowledge/variants/[id]/page.tsx',
  'src/app/[locale]/(product)/knowledge/drugs/page.tsx',
  'src/app/[locale]/(product)/knowledge/drugs/[id]/page.tsx',
  'src/app/[locale]/(product)/knowledge/evidence/[id]/page.tsx',
  'src/app/[locale]/(product)/knowledge/sources/[id]/page.tsx',
  'src/app/[locale]/(product)/ask/page.tsx',
  'src/app/[locale]/(ops)/ops/page.tsx',
  'src/app/[locale]/(ops)/ops/discovery-strategies/page.tsx',
  'src/app/[locale]/(ops)/ops/discovery-runs/page.tsx',
  'src/app/[locale]/(ops)/ops/discovery-runs/new/page.tsx',
  'src/app/[locale]/(ops)/ops/discovery-runs/[id]/page.tsx',
  'src/app/[locale]/(ops)/ops/candidates/page.tsx',
  'src/app/[locale]/(ops)/ops/candidates/[id]/page.tsx',
  'src/app/[locale]/(ops)/ops/reviews/page.tsx',
  'src/app/[locale]/(ops)/ops/reviews/[id]/page.tsx',
  'src/app/[locale]/(ops)/ops/releases/page.tsx',
  'src/app/[locale]/(ops)/ops/releases/[id]/page.tsx',
  'src/app/[locale]/(ops)/ops/agents/page.tsx',
  'src/app/[locale]/(ops)/ops/skills/page.tsx',
  'src/app/[locale]/(ops)/ops/workflows/page.tsx',
  'src/app/[locale]/(ops)/ops/workflow-runs/page.tsx',
  'src/app/[locale]/(ops)/ops/workflow-runs/[id]/page.tsx',
  'src/app/[locale]/(ops)/ops/question-runs/page.tsx',
  'src/app/[locale]/(ops)/ops/question-runs/[id]/page.tsx',
] as const;

describe('Evidex complete frontend route surface', () => {
  it('ships every public and operations route required by the product spec', async () => {
    await Promise.all(routes.map((route) => access(resolve(root, route))));
  });

  it('protects the entire operations route group with the existing admin permission', async () => {
    const source = await readFile(
      resolve(root, 'src/app/[locale]/(ops)/ops/layout.tsx'),
      'utf8'
    );

    expect(source).toContain('requireAdminAccess');
    expect(source).toContain("redirectUrl: '/no-permission'");
  });
});
