import { describe, expect, it, vi } from 'vitest';
import type { AIProvider, AppSettings } from '@sidekick/core';
import { analyzeGroupChatMembers } from './group-chat-analysis.js';

const optedIn = { memoryEnabled: true, analyzeImportsWithAI: true } as AppSettings;
const participants = [
  { authorId: 'alex', authoredMessages: 'Alex waiver comment' },
  { authorId: 'blair', authoredMessages: 'Blair trade comment' },
];
const response = 'Writing style\nplayful\nLeague context\nactive manager';

describe('group chat profile analysis', () => {
  it('does not initialize AI without the saved owner opt-in', async () => {
    const createAI = vi.fn(async () => null);
    const result = await analyzeGroupChatMembers({
      initialSettings: { ...optedIn, analyzeImportsWithAI: false },
      currentSettings: () => optedIn,
      participants,
      createAI,
    });
    expect(createAI).not.toHaveBeenCalled();
    expect(result).toMatchObject({ failures: 0, wasOptedIn: false });
    expect(result.notes.size).toBe(0);
  });

  it('rechecks consent after initializing the AI runtime', async () => {
    let enabled = true;
    const generate = vi.fn(async () => response);
    const createAI = vi.fn(async () => {
      enabled = false;
      return { id: 'fixture', generate } as unknown as AIProvider;
    });
    const result = await analyzeGroupChatMembers({
      initialSettings: optedIn,
      currentSettings: () => ({ ...optedIn, analyzeImportsWithAI: enabled }),
      participants,
      createAI,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ failures: 0, wasOptedIn: true });
  });

  it('discards an in-flight result and stops before sending the next author after revocation', async () => {
    let enabled = true;
    const generate = vi.fn(async () => {
      enabled = false;
      return response;
    });
    const result = await analyzeGroupChatMembers({
      initialSettings: optedIn,
      currentSettings: () => ({ ...optedIn, analyzeImportsWithAI: enabled }),
      participants,
      createAI: async () => ({ id: 'fixture', generate }) as unknown as AIProvider,
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(result.notes.size).toBe(0);
    expect(result.failures).toBe(0);
  });

  it('provides only each participant’s own authored messages to the model', async () => {
    const prompts: string[] = [];
    const generate = vi.fn(async (request: { prompt: string }) => {
      prompts.push(request.prompt);
      return response;
    });
    const result = await analyzeGroupChatMembers({
      initialSettings: optedIn,
      currentSettings: () => optedIn,
      participants,
      createAI: async () => ({ id: 'fixture', generate }) as unknown as AIProvider,
    });
    expect(result.notes.size).toBe(2);
    expect(prompts[0]).toContain('Alex waiver comment');
    expect(prompts[0]).not.toContain('Blair trade comment');
    expect(prompts[1]).toContain('Blair trade comment');
    expect(prompts[1]).not.toContain('Alex waiver comment');
  });
});
