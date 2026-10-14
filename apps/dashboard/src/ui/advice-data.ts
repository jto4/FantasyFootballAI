import { record, type AdviceMode } from '@sidekick/core';
import { isAdviceMode } from './advice-navigation';

export type AdviceSummary = {
  id: string;
  createdAt: string;
  mode: AdviceMode;
  leagueId?: string;
  headline: string;
  confidence: number;
  confidenceLabel?: 'Low' | 'Moderate' | 'High';
  model: string;
};
export function isAdviceHistory(value: unknown): value is { items: AdviceSummary[] } {
  return (
    record(value) &&
    Array.isArray(value.items) &&
    value.items.length <= 100 &&
    value.items.every(
      (item) =>
        record(item) &&
        typeof item.id === 'string' &&
        /^[a-f0-9-]{36}$/i.test(item.id) &&
        typeof item.createdAt === 'string' &&
        Number.isFinite(Date.parse(item.createdAt)) &&
        isAdviceMode(item.mode) &&
        (item.leagueId === undefined || typeof item.leagueId === 'string') &&
        typeof item.headline === 'string' &&
        item.headline.length <= 180 &&
        typeof item.confidence === 'number' &&
        item.confidence >= 0 &&
        item.confidence <= 100 &&
        (item.confidenceLabel === undefined ||
          ['Low', 'Moderate', 'High'].includes(String(item.confidenceLabel))) &&
        typeof item.model === 'string' &&
        item.model.length <= 160,
    )
  );
}
