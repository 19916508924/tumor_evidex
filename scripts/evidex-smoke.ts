#!/usr/bin/env node
import { closeDb } from '@/core/db';
import { answerEvidenceQuery } from '@/shared/services/evidence/answer-evidence-query';
import { getEvidenceAnswerDependencies } from '@/shared/services/evidence/runtime';

async function main() {
  const result = await answerEvidenceQuery(
    {
      disease: 'NSCLC',
      biomarkers: [{ gene: 'EGFR', alterationType: 'SNV', hgvsp: 'p.L858R' }],
      jurisdiction: 'US',
      locale: 'zh-CN',
    },
    getEvidenceAnswerDependencies()
  );
  const therapyCount =
    'resultGroups' in result
      ? result.resultGroups.reduce(
          (sum, group) => sum + group.therapies.length,
          0
        )
      : 0;
  const output = {
    status: result.status,
    cached: 'cached' in result ? result.cached : null,
    therapyCount,
    knowledge: 'knowledge' in result ? result.knowledge : null,
    ...((process.env.EVIDEX_SMOKE_FULL === '1' && 'answer' in result
      ? { answer: result.answer }
      : {}) as object),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (result.status !== 'ANSWERED' || therapyCount !== 4) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
