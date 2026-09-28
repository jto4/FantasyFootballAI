import { describe, expect, it } from 'vitest';
import { summarizeAIUsage } from './ai-usage.js';

describe('AI usage estimates', () => {
  it('computes a rounded estimate from owner-entered per-million token rates', () => {
    expect(
      summarizeAIUsage('model-x', { inputTokens: 100_000, outputTokens: 200_000 }, 3, 15),
    ).toEqual({
      model: 'model-x',
      inputTokens: 100_000,
      outputTokens: 200_000,
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15,
      estimatedCostUsd: 3.3,
    });
  });

  it('retains token counts without inventing a cost when either rate is missing', () => {
    expect(summarizeAIUsage('model-x', { inputTokens: 100, outputTokens: 50 }, 2)).toEqual({
      model: 'model-x',
      inputTokens: 100,
      outputTokens: 50,
      inputUsdPerMillionTokens: 2,
    });
  });
});
