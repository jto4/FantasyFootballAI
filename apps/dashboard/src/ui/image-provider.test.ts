import { describe, expect, it } from 'vitest';
import { readImageProviderPreference, writeImageProviderPreference } from './image-provider.js';

describe('image provider preference', () => {
  it('uses OpenAI by default and persists an owner selection locally', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(readImageProviderPreference(storage)).toBe('openai');
    writeImageProviderPreference('stability', storage);
    expect(readImageProviderPreference(storage)).toBe('stability');
  });

  it('fails back to OpenAI when stored state is invalid or unavailable', () => {
    const storage = {
      getItem: () => 'unsupported-provider',
    };
    expect(readImageProviderPreference(storage)).toBe('openai');
    expect(
      readImageProviderPreference({
        getItem: () => {
          throw new Error('storage blocked');
        },
      }),
    ).toBe('openai');

    const blockedStorage = {
      setItem: (_key: string, _value: string) => {
        throw new Error('storage blocked');
      },
    };
    expect(() => writeImageProviderPreference('stability', blockedStorage)).not.toThrow();
  });
});
