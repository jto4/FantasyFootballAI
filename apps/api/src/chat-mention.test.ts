import { describe, expect, it } from 'vitest';
import { isDirectChatMention } from './chat-mention.js';

describe('direct group chat mentions', () => {
  it('matches a leading name or @name with optional punctuation and case differences', () => {
    expect(isDirectChatMention('@Sunday Sidekick, who should I start?', 'Sunday Sidekick')).toBe(
      true,
    );
    expect(isDirectChatMention('Sunday Sidekick: explain these rankings', 'Sunday Sidekick')).toBe(
      true,
    );
    expect(isDirectChatMention('sUnDaY  sIdEkIcK! help', 'Sunday Sidekick')).toBe(true);
  });

  it('ignores quoted mentions and ordinary mid-sentence references', () => {
    expect(
      isDirectChatMention('I asked Sunday Sidekick about this last week', 'Sunday Sidekick'),
    ).toBe(false);
    expect(isDirectChatMention('> @Sunday Sidekick, make a ranking', 'Sunday Sidekick')).toBe(
      false,
    );
    expect(isDirectChatMention('Morning!\n@Sunday Sidekick, help', 'Sunday Sidekick')).toBe(false);
  });

  it('rejects empty or oversized agent names and messages', () => {
    expect(isDirectChatMention('@Bot hello', '  ')).toBe(false);
    expect(isDirectChatMention('@Bot hello', 'B'.repeat(61))).toBe(false);
    expect(isDirectChatMention(`@Bot ${'x'.repeat(20_000)}`, 'Bot')).toBe(false);
  });
});
