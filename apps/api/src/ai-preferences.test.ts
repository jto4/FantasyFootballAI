import { expect, it } from 'vitest';
import type { AppSettings } from '@sidekick/core';
import { settingsForTask, styleInstructions } from './ai-preferences.js';

const runtime = (mode: string, model: string) =>
  ({
    aiRuntime: {
      mode,
      model,
      command: '',
      args: '',
      baseUrl: 'https://api.openai.com/v1',
      inputUsdPerMillionTokens: 1,
    },
  }) as unknown as AppSettings;

it('uses the owner’s model per task only on API connections', () => {
  const api = {
    ...runtime('api', 'gpt-6-luna'),
    preferences: { ai: { models: { chat: 'gpt-6-sol' } } },
  };
  expect(settingsForTask(api, 'chat').aiRuntime?.model).toBe('gpt-6-sol');
  // Prices belong to the saved model.
  expect(settingsForTask(api, 'chat').aiRuntime?.inputUsdPerMillionTokens).toBeUndefined();
  expect(settingsForTask(api, 'reports')).toBe(api);
  const cli = { ...runtime('codex-cli', 'gpt-6.1-sol'), preferences: api.preferences };
  expect(settingsForTask(cli, 'chat')).toBe(cli);
  const anthropic = {
    ...runtime('anthropic-api', 'claude-opus-5-5'),
    preferences: { ai: { models: { chat: 'claude-sonnet-5-5', advice: 'gpt-6-sol' } } },
  };
  expect(settingsForTask(anthropic, 'chat').aiRuntime?.model).toBe('claude-sonnet-5-5');
  expect(settingsForTask(anthropic, 'advice').aiRuntime?.model).toBe('claude-opus-5-5');
});

it('adds tone and length lines only when changed from the defaults', () => {
  expect(styleInstructions(undefined)).toBe('');
  expect(styleInstructions({ ai: { tone: 'friendly', length: 'standard' } })).toBe('');
  const style = styleInstructions({ ai: { tone: 'straight', length: 'brief' } });
  expect(style).toMatch(/skip jokes/);
  expect(style).toMatch(/100 words/);
});
