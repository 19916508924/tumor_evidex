import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEvolinkEvidenceExtractionGenerator } from '@/extensions/ai/evidence-extraction';

const { chatModel, createOpenAICompatible, generateObject } = vi.hoisted(
  () => ({
    chatModel: vi.fn(() => ({ modelId: 'extraction-model' })),
    createOpenAICompatible: vi.fn(),
    generateObject: vi.fn(),
  })
);

vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible }));
vi.mock('ai', () => ({ generateObject }));

const input = {
  source: {
    pmid: '12345678',
    title: 'Trial title',
    abstract: 'Abstract evidence.',
    doi: null,
    documentHash: 'document-hash',
    publicationDate: '2026-09-15',
    journal: 'Trial Journal',
    url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
  },
  association: {
    id: 'assoc-1',
    approvedLevel: '1' as const,
    gradingRationale: 'Reviewed association.',
  },
};

describe('Evolink evidence extraction generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOpenAICompatible.mockReturnValue({ chatModel });
    generateObject.mockResolvedValue({ object: { claims: [], qaIssues: [] } });
  });

  it('fails locally when server credentials are missing', async () => {
    const generator = createEvolinkEvidenceExtractionGenerator({
      apiKey: '',
      model: '',
    });
    await expect(generator.generate(input)).rejects.toThrow(
      /EVIDEX_EVOLINK_API_KEY/
    );
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('uses the fixed Evolink model and structured output without sampling overrides', async () => {
    const output = { claims: [], qaIssues: [] };
    generateObject.mockResolvedValue({ object: output });
    const generator = createEvolinkEvidenceExtractionGenerator({
      apiKey: 'test-key',
      model: 'gpt-5.6-terra',
      baseUrl: 'https://evolink.test/v1',
    });

    await expect(generator.generate(input)).resolves.toBe(output);
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'evolink',
      apiKey: 'test-key',
      baseURL: 'https://evolink.test/v1',
      supportsStructuredOutputs: true,
    });
    expect(chatModel).toHaveBeenCalledWith('gpt-5.6-terra');
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'extraction-model' },
        system: expect.stringMatching(/untrusted source data/i),
        prompt: expect.stringContaining('12345678'),
        maxOutputTokens: 6_000,
      })
    );
    expect(generateObject.mock.calls[0][0]).not.toHaveProperty('temperature');
  });
});
