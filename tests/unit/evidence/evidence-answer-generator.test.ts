import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEvolinkEvidenceAnswerGenerator,
  createOpenRouterEvidenceAnswerGenerator,
} from '@/extensions/ai/evidence-answer';

const {
  chat,
  createOpenAICompatible,
  createOpenRouter,
  evolinkChat,
  generateObject,
} = vi.hoisted(() => ({
  chat: vi.fn(() => ({ modelId: 'fixed-model' })),
  evolinkChat: vi.fn(() => ({ modelId: 'evolink-model' })),
  createOpenAICompatible: vi.fn(() => ({
    chatModel: vi.fn(),
  })),
  createOpenRouter: vi.fn(() => ({ chat })),
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible }));
vi.mock('@openrouter/ai-sdk-provider', () => ({ createOpenRouter }));
vi.mock('ai', () => ({ generateObject }));

const generatedAnswer = {
  overallSummary: 'summary',
  groups: [
    { scope: 'SAME_DISEASE', therapies: [] },
    { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
  ],
  overallLimitations: [],
};

describe('OpenRouter EvidenceAnswerGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOpenAICompatible.mockReturnValue({
      chatModel: evolinkChat,
    });
    generateObject.mockResolvedValue({ object: generatedAnswer });
  });

  it('fails locally when the fixed server-side model configuration is missing', async () => {
    const generator = createOpenRouterEvidenceAnswerGenerator({
      apiKey: '',
      model: '',
    });
    await expect(
      generator.generate({
        normalizedQuery: {} as never,
        evidencePack: {} as never,
        promptVersion: 'evidex-answer-v1',
        locale: 'zh-CN',
      })
    ).rejects.toThrow(/EVIDEX_OPENROUTER_API_KEY/);
    expect(createOpenRouter).not.toHaveBeenCalled();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('uses a fixed model and sends the evidence pack as untrusted structured context', async () => {
    const generator = createOpenRouterEvidenceAnswerGenerator({
      apiKey: 'test-key',
      model: 'fixed-model',
      baseUrl: 'https://openrouter.test/api/v1',
    });
    const evidencePack = { groups: [{ scope: 'SAME_DISEASE' }] };

    await expect(
      generator.generate({
        normalizedQuery: { disease: 'NSCLC' } as never,
        evidencePack: evidencePack as never,
        promptVersion: 'evidex-answer-v1',
        locale: 'zh-CN',
      })
    ).resolves.toEqual(generatedAnswer);

    expect(createOpenRouter).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://openrouter.test/api/v1',
    });
    expect(chat).toHaveBeenCalledWith('fixed-model');
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'fixed-model' },
        temperature: 0,
        system: expect.stringMatching(/untrusted data/i),
        prompt: expect.stringContaining('SAME_DISEASE'),
      })
    );
  });

  it('uses the provider default base URL when none is configured', async () => {
    const generator = createOpenRouterEvidenceAnswerGenerator({
      apiKey: 'test-key',
      model: 'fixed-model',
    });
    await generator.generate({
      normalizedQuery: {} as never,
      evidencePack: {} as never,
      promptVersion: 'evidex-answer-v1',
      locale: 'zh-CN',
    });
    expect(createOpenRouter).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: undefined,
    });
  });
});

describe('Evolink EvidenceAnswerGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOpenAICompatible.mockReturnValue({
      chatModel: evolinkChat,
    });
    generateObject.mockResolvedValue({ object: generatedAnswer });
  });

  it('fails locally when the Evolink key or fixed model is missing', async () => {
    const generator = createEvolinkEvidenceAnswerGenerator({
      apiKey: '',
      model: '',
    });

    await expect(
      generator.generate({
        normalizedQuery: {} as never,
        evidencePack: {} as never,
        promptVersion: 'evidex-answer-v1',
        locale: 'zh-CN',
      })
    ).rejects.toThrow(/EVIDEX_EVOLINK_API_KEY/);
    expect(createOpenAICompatible).not.toHaveBeenCalled();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('uses Evolink structured outputs without unsupported sampling settings', async () => {
    const generator = createEvolinkEvidenceAnswerGenerator({
      apiKey: 'test-key',
      model: 'gpt-5.6-terra',
    });

    await expect(
      generator.generate({
        normalizedQuery: { disease: 'NSCLC' } as never,
        evidencePack: { groups: [{ scope: 'SAME_DISEASE' }] } as never,
        promptVersion: 'evidex-answer-v1',
        locale: 'zh-CN',
      })
    ).resolves.toEqual(generatedAnswer);

    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'evolink',
      apiKey: 'test-key',
      baseURL: 'https://direct.evolink.ai/v1',
      supportsStructuredOutputs: true,
    });
    expect(evolinkChat).toHaveBeenCalledWith('gpt-5.6-terra');
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'evolink-model' },
        system: expect.stringMatching(/untrusted data/i),
        prompt: expect.stringContaining('SAME_DISEASE'),
        maxOutputTokens: 6_000,
      })
    );
    expect(generateObject.mock.calls[0][0]).not.toHaveProperty('temperature');
  });

  it('accepts an explicit Evolink base URL', async () => {
    const generator = createEvolinkEvidenceAnswerGenerator({
      apiKey: 'test-key',
      model: 'gpt-5.6-terra',
      baseUrl: 'https://evolink.test/v1',
    });
    await generator.generate({
      normalizedQuery: {} as never,
      evidencePack: {} as never,
      promptVersion: 'evidex-answer-v1',
      locale: 'zh-CN',
    });
    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://evolink.test/v1' })
    );
  });
});
