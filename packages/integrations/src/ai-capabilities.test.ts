import { expect, it } from 'vitest';
import { adviceModelChoices, isOpenAIReasoningModel } from './ai-capabilities.js';

it('recommends only a discovered reasoning model and excludes specialized endpoints', () => {
  const choice = adviceModelChoices(
    [
      'gpt-4o-mini',
      'gpt-6.1-sol',
      'gpt-6-astra-2026-10-01',
      'gpt-6-astra',
      'gpt-6-astra',
      'gpt-image-1',
      'gpt-6-codex',
      'gpt-5.4-pro',
      'o3-deep-research',
    ],
    'gpt-4o-mini',
  );
  expect(choice.recommendedModel).toBe('gpt-6-astra');
  expect(choice.models.map((model) => model.id)).toEqual([
    'gpt-6-astra',
    'gpt-6-astra-2026-10-01',
    'gpt-6.1-sol',
    'gpt-5.4-pro',
    'gpt-4o-mini',
  ]);
  expect(isOpenAIReasoningModel('gpt-5.4-pro')).toBe(true);
});
it('preserves custom endpoints, local labels and saved models when discovery is unavailable', () => {
  expect(adviceModelChoices(['gpt-6-astra'], 'custom-model', 'https://compatible.test/v1')).toEqual(
    { models: [{ id: 'custom-model', reasoning: false }] },
  );
  expect(adviceModelChoices([], 'gpt-4o-mini')).toEqual({
    models: [{ id: 'gpt-4o-mini', reasoning: false }],
  });
  expect(adviceModelChoices(['gpt-4o'], 'gpt-4o-mini').recommendedModel).toBeUndefined();
});
