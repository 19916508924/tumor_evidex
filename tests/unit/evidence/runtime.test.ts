import { afterEach, describe, expect, it, vi } from 'vitest';

const { createRepository } = vi.hoisted(() => ({
  createRepository: vi.fn(() => ({})),
}));

vi.mock('@/core/db', () => ({ dbPostgres: vi.fn(() => ({})) }));
vi.mock('@/extensions/ai/evidence-answer', () => ({
  createEvolinkEvidenceAnswerGenerator: vi.fn(() => ({})),
  createOpenRouterEvidenceAnswerGenerator: vi.fn(() => ({})),
}));
vi.mock('@/shared/services/evidence/postgres-evidence-repository', () => ({
  createPostgresEvidenceRepository: createRepository,
}));

describe('structured answer release selection', () => {
  afterEach(() => {
    delete process.env.EVIDEX_KNOWLEDGE_RELEASE;
    delete process.env.EVIDEX_KNOWLEDGE_RELEASE_OVERRIDE;
    vi.resetModules();
    createRepository.mockClear();
  });

  it('defaults to the latest published release even when the legacy variable remains configured', async () => {
    process.env.EVIDEX_KNOWLEDGE_RELEASE = 'v0.2.0';
    const { getEvidenceAnswerDependencies } = await import(
      '@/shared/services/evidence/runtime'
    );

    getEvidenceAnswerDependencies();

    expect(createRepository).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ releaseVersion: undefined })
    );
  });

  it('pins a historical release only through the explicit rollback override', async () => {
    process.env.EVIDEX_KNOWLEDGE_RELEASE = 'v0.2.0';
    process.env.EVIDEX_KNOWLEDGE_RELEASE_OVERRIDE = ' v0.1.0 ';
    const { getEvidenceAnswerDependencies } = await import(
      '@/shared/services/evidence/runtime'
    );

    getEvidenceAnswerDependencies();

    expect(createRepository).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ releaseVersion: 'v0.1.0' })
    );
  });
});
