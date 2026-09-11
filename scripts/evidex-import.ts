#!/usr/bin/env node
import postgres from 'postgres';

import {
  importKnowledgePackage,
  loadKnowledgePackageFromDirectory,
} from '@/shared/services/evidence/import-knowledge-package';

interface CliOptions {
  dataDirectory: string;
  releaseVersion?: string;
  dryRun: boolean;
}

function readValue(args: string[], index: number, option: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    dataDirectory: 'data/evidex/v0',
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      continue;
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--data') {
      options.dataDirectory = readValue(args, index, argument);
      index += 1;
    } else if (argument === '--release') {
      options.releaseVersion = readValue(args, index, argument);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const knowledgePackage = await loadKnowledgePackageFromDirectory(
    options.dataDirectory
  );
  if (
    options.releaseVersion &&
    options.releaseVersion !== knowledgePackage.release.version
  ) {
    throw new Error(
      `Requested release ${options.releaseVersion} does not match package release ${knowledgePackage.release.version}`
    );
  }

  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const result = await importKnowledgePackage(client, knowledgePackage, {
      dryRun: options.dryRun,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
