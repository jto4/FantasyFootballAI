import type { AITask, AppSettings, UserPreferences } from '@sidekick/core';

/**
 * The owner's tone and length choices as one extra instruction line. Empty for the defaults, so
 * prompts stay exactly as tested unless the owner changed something.
 */
export function styleInstructions(preferences: UserPreferences | undefined): string {
  const tone = preferences?.ai?.tone;
  const length = preferences?.ai?.length;
  return [
    tone === 'straight' ? 'Owner preference: plain and direct; skip jokes and banter.' : '',
    tone === 'playful'
      ? 'Owner preference: playful league-chat trash talk is welcome, never at the cost of accuracy or the numbers.'
      : '',
    length === 'brief' ? 'Owner preference: keep it short, about 100 words or fewer.' : '',
    length === 'detailed'
      ? 'Owner preference: more detail is welcome, up to about 450 words, with the key numbers.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Settings with the owner's model for this task, when one is set and the connection is an API
 * whose model can be chosen per request. Owner-entered prices belong to the saved model, so they
 * are dropped when the model changes. CLI and signed-in connections keep their own model.
 */
export function settingsForTask(settings: AppSettings, task: AITask): AppSettings {
  const model = settings.preferences?.ai?.models?.[task];
  const runtime = settings.aiRuntime;
  if (!model || !runtime || model === runtime.model) return settings;
  if (
    runtime.mode === 'anthropic-api'
      ? !/^claude-[a-z0-9-]{1,60}$/.test(model)
      : runtime.mode !== 'api'
  )
    return settings;
  const { inputUsdPerMillionTokens: _input, outputUsdPerMillionTokens: _output, ...rest } = runtime;
  void _input;
  void _output;
  return { ...settings, aiRuntime: { ...rest, model } };
}
