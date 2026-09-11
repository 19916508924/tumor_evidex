import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  importKnowledgePackage,
  loadKnowledgePackageFromDirectory,
} from '@/shared/services/evidence/import-knowledge-package';
import { createPostgresEvidenceRepository } from '@/shared/services/evidence/postgres-evidence-repository';

const migrationsFolder = 'src/config/db/migrations';
const databaseUrl = process.env.DATABASE_URL;
const testSchema = `evidex_import_${randomUUID().replaceAll('-', '')}`;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for the explicit database test');
}

const directDatabaseUrl = (() => {
  const url = new URL(databaseUrl);
  url.hostname = url.hostname.replace('-pooler.', '.');
  return url.toString();
})();

const admin = postgres(directDatabaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});
let client: ReturnType<typeof postgres> | undefined;

describe('Evidex knowledge package import', () => {
  beforeAll(async () => {
    await access(`${migrationsFolder}/meta/_journal.json`);
    await admin.unsafe(`create schema "${testSchema}"`);
    client = postgres(directDatabaseUrl, {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
    await client.unsafe(`set search_path to "${testSchema}"`);
    await migrate(drizzle(client), {
      migrationsFolder,
      migrationsSchema: testSchema,
      migrationsTable: '__evidex_migrations',
    });
  }, 120_000);

  afterAll(async () => {
    if (client) await client.end();
    await admin.unsafe(`drop schema if exists "${testSchema}" cascade`);
    await admin.end();
  }, 30_000);

  it('dry-runs, transactionally publishes, retrieves, and idempotently reuses v0.2', async () => {
    const knowledgePackage =
      await loadKnowledgePackageFromDirectory('data/evidex/v0');

    const dryRun = await importKnowledgePackage(client!, knowledgePackage, {
      dryRun: true,
    });
    expect(dryRun).toMatchObject({
      status: 'DRY_RUN',
      version: 'v0.2.0',
      counts: { associations: 13, claims: 20, approvals: 9 },
    });
    expect(
      await client!`select count(*)::int as count from knowledge_release`
    ).toEqual([{ count: 0 }]);

    const imported = await importKnowledgePackage(client!, knowledgePackage);
    expect(imported).toMatchObject({
      status: 'IMPORTED',
      version: 'v0.2.0',
      counts: { associations: 13, claims: 20, approvals: 9 },
    });
    expect(
      await client!`
        select version, status, published_by
        from knowledge_release
        where version = 'v0.2.0'
      `
    ).toEqual([
      {
        version: 'v0.2.0',
        status: 'PUBLISHED',
        published_by: 'product-owner-fast-track',
      },
    ]);

    const repository = createPostgresEvidenceRepository(drizzle(client!), {
      releaseVersion: 'v0.2.0',
    });
    const release = await repository.getPublishedRelease();
    const groups = await repository.retrieveEvidence(release!.id, {
      disease: 'NSCLC',
      gene: 'EGFR',
      alterationType: 'SNV',
      hgvsp: 'p.L858R',
      canonicalVariantKey: 'EGFR|SNV|p.L858R',
      jurisdiction: 'US',
      locale: 'zh-CN',
    });
    expect(groups[0].therapies).toHaveLength(4);
    expect(
      groups[0].therapies.map(({ associationId }) => associationId)
    ).toEqual([
      'assoc_nsclc_egfr_l858r_afatinib',
      'assoc_nsclc_egfr_l858r_amivantamab_lazertinib',
      'assoc_nsclc_egfr_l858r_gefitinib',
      'assoc_nsclc_egfr_l858r_osimertinib',
    ]);
    expect(groups[1].therapies).toEqual([]);

    const cases = [
      {
        query: {
          disease: 'NSCLC',
          gene: 'EGFR',
          alterationType: 'DEL',
          hgvsp: 'p.E746_A750del',
          canonicalVariantKey: 'EGFR|DEL|p.E746_A750del',
        },
        direct: 4,
        cross: 0,
      },
      {
        query: {
          disease: 'NSCLC',
          gene: 'EGFR',
          alterationType: 'SNV',
          hgvsp: 'p.T790M',
          canonicalVariantKey: 'EGFR|SNV|p.T790M',
        },
        direct: 1,
        cross: 0,
      },
      {
        query: {
          disease: 'NSCLC',
          gene: 'KRAS',
          alterationType: 'SNV',
          hgvsp: 'p.G12C',
          canonicalVariantKey: 'KRAS|SNV|p.G12C',
        },
        direct: 2,
        cross: 1,
      },
      {
        query: {
          disease: 'CRC',
          gene: 'KRAS',
          alterationType: 'SNV',
          hgvsp: 'p.G12C',
          canonicalVariantKey: 'KRAS|SNV|p.G12C',
        },
        direct: 1,
        cross: 2,
      },
      {
        query: {
          disease: 'CRC',
          gene: 'KRAS',
          alterationType: 'SNV',
          hgvsp: 'p.G12D',
          canonicalVariantKey: 'KRAS|SNV|p.G12D',
        },
        direct: 1,
        cross: 0,
      },
      {
        query: {
          disease: 'CRC',
          gene: 'EGFR',
          alterationType: 'SNV',
          hgvsp: 'p.L858R',
          canonicalVariantKey: 'EGFR|SNV|p.L858R',
        },
        direct: 0,
        cross: 0,
      },
    ] as const;

    for (const item of cases) {
      const [direct, cross] = await repository.retrieveEvidence(release!.id, {
        ...item.query,
        jurisdiction: 'US',
        locale: 'zh-CN',
      });
      expect(
        [direct.therapies.length, cross.therapies.length],
        `${item.query.disease} ${item.query.canonicalVariantKey}`
      ).toEqual([item.direct, item.cross]);
    }

    const [g12dDirect] = await repository.retrieveEvidence(release!.id, {
      disease: 'CRC',
      gene: 'KRAS',
      alterationType: 'SNV',
      hgvsp: 'p.G12D',
      canonicalVariantKey: 'KRAS|SNV|p.G12D',
      jurisdiction: 'US',
      locale: 'zh-CN',
    });
    expect(g12dDirect.therapies[0]).toMatchObject({
      associationId: 'assoc_crc_kras_g12d_panitumumab_resistance',
      direction: 'RESISTANCE',
      approvedLevel: 'R1',
    });

    await expect(
      importKnowledgePackage(client!, knowledgePackage)
    ).resolves.toMatchObject({ status: 'UNCHANGED', version: 'v0.2.0' });
    expect(
      await client!`select count(*)::int as count from knowledge_release`
    ).toEqual([{ count: 1 }]);
  }, 90_000);

  it('fails on a conflicting stable record and rolls back the new release', async () => {
    const knowledgePackage =
      await loadKnowledgePackageFromDirectory('data/evidex/v0');
    const conflicting = structuredClone(knowledgePackage);
    conflicting.release.id = 'release_v0_conflict';
    conflicting.release.version = 'v0.2.0-conflict';
    conflicting.entities.drugs[0].displayNameEn = 'conflicting-name';

    await expect(importKnowledgePackage(client!, conflicting)).rejects.toThrow(
      /stable record conflict/i
    );
    expect(
      await client!`
        select count(*)::int as count
        from knowledge_release
        where version = 'v0.2.0-conflict'
      `
    ).toEqual([{ count: 0 }]);
  }, 60_000);
});
