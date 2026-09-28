import type { AIUsageSummary } from '@sidekick/core';

export type ProviderTokenUsage = { inputTokens: number; outputTokens: number };

/** Save usage even when the owner has not entered rates; only estimate cost with both rates. */
export function summarizeAIUsage(
  model: string,
  usage: ProviderTokenUsage,
  inputUsdPerMillionTokens?: number,
  outputUsdPerMillionTokens?: number,
): AIUsageSummary {
  const ratesConfigured =
    inputUsdPerMillionTokens !== undefined && outputUsdPerMillionTokens !== undefined;
  const estimate = ratesConfigured
    ? (usage.inputTokens * inputUsdPerMillionTokens +
        usage.outputTokens * outputUsdPerMillionTokens) /
      1_000_000
    : undefined;
  return {
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(inputUsdPerMillionTokens !== undefined ? { inputUsdPerMillionTokens } : {}),
    ...(outputUsdPerMillionTokens !== undefined ? { outputUsdPerMillionTokens } : {}),
    ...(estimate !== undefined ? { estimatedCostUsd: Math.round(estimate * 1e8) / 1e8 } : {}),
  };
}
