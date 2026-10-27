import { describe, expect, it } from 'vitest';
import { aiProblemMessage } from './FriendlyError';

describe('aiProblemMessage', () => {
  it('shows the Codex version explanation instead of the generic message', () => {
    const codex =
      'ChatGPT updated its Codex to 0.165.0, which Sunday Sidekick has not verified yet: choose another AI connection.';
    expect(aiProblemMessage(codex, 'Generic')).toBe(codex);
  });

  it('keeps other failures generic so raw provider text stays under support details', () => {
    expect(aiProblemMessage('HTTP 401 from https://example.test/v1', 'Generic')).toBe('Generic');
  });
});
