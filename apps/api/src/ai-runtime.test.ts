import { expect, it, vi } from 'vitest';
import { resolveConfiguredAI } from './ai-runtime.js';
import { initialState } from './store-defaults.js';
import { validateState, makeRestoredStateSafe } from './store-validation.js';
import { isValidRuntime } from './settings-validation.js';
import { isAppSettings } from '@sidekick/core';

const settings = {
  ...structuredClone(initialState.settings),
  aiRuntime: {
    ...initialState.settings.aiRuntime!,
    mode: 'codex-cli' as const,
    model: 'gpt-6.1-sol',
    command: '',
    args: '',
  },
};

it('uses signed-in Codex without reading an API key and never falls back on failure', async () => {
  const key = vi.fn(async () => 'unused-key');
  const ai = { id: 'codex-cli', generate: vi.fn(async () => 'OK') };
  const codex = { provider: vi.fn(async () => ai) };
  expect(await resolveConfiguredAI(settings, key, codex)).toBe(ai);
  expect(key).not.toHaveBeenCalled();
  codex.provider.mockRejectedValueOnce(new Error('Sign-in unavailable'));
  await expect(resolveConfiguredAI(settings, key, codex)).rejects.toThrow('Sign-in unavailable');
  expect(key).not.toHaveBeenCalled();
});

it('validates persisted Codex settings and resets subscription access on backup restore', () => {
  expect(isValidRuntime(settings.aiRuntime)).toBe(true);
  expect(isAppSettings(settings)).toBe(true);
  const stored = validateState({ ...structuredClone(initialState), settings });
  expect(stored.settings.aiRuntime?.mode).toBe('codex-cli');
  expect(makeRestoredStateSafe(stored).settings.aiRuntime?.mode).toBe('api');
  for (const patch of [{ model: 'arbitrary' }, { command: '/tmp/custom' }, { args: '--tools' }]) {
    const runtime = { ...settings.aiRuntime, ...patch };
    expect(isValidRuntime(runtime)).toBe(false);
    expect(isAppSettings({ ...settings, aiRuntime: runtime })).toBe(false);
    expect(() =>
      validateState({
        ...structuredClone(initialState),
        settings: { ...settings, aiRuntime: runtime },
      }),
    ).toThrow();
  }
});

it('uses the Anthropic key only for the Claude API mode and returns nothing without one', async () => {
  const claude = {
    ...settings,
    aiRuntime: { ...settings.aiRuntime, mode: 'anthropic-api' as const, model: 'claude-opus-5-5' },
  };
  const openai = vi.fn(async () => 'openai-key');
  const codex = { provider: vi.fn() };
  expect(await resolveConfiguredAI(claude, openai, codex, async () => null)).toBeNull();
  const ai = await resolveConfiguredAI(claude, openai, codex, async () => 'test-anthropic-key');
  expect(ai?.id).toBe('anthropic');
  expect(openai).not.toHaveBeenCalled();
  expect(isValidRuntime(claude.aiRuntime)).toBe(true);
  expect(isValidRuntime({ ...claude.aiRuntime, model: 'gpt-6-luna' })).toBe(false);
});
