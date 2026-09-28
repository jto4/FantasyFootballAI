import { describe, expect, it } from 'vitest';
import { isValidAction, isValidRuntime, isValidSettingsUpdate } from './settings-validation.js';

const runtime = {
  mode: 'api',
  model: 'gpt-test',
  command: '',
  args: '',
  baseUrl: 'https://api.example.test/v1',
};

const action = {
  kind: 'power-rankings',
  channel: 'dashboard',
  enabled: true,
  mode: 'draft',
  schedule: {
    enabled: true,
    frequency: 'weekly',
    weekday: 2,
    time: '09:00',
    timezone: 'America/New_York',
  },
};

describe('AI runtime settings validation', () => {
  it('accepts a valid API runtime and bounded optional controls', () => {
    expect(
      isValidRuntime({
        ...runtime,
        temperature: 0.8,
        maxOutputTokens: 1200,
        inputUsdPerMillionTokens: 0.15,
        outputUsdPerMillionTokens: 0.6,
      }),
    ).toBe(true);
  });

  const invalidValues: unknown[] = [
    { ...runtime, mode: 'shell' },
    { ...runtime, baseUrl: 'http://127.0.0.1:8080/v1' },
    { ...runtime, temperature: Number.NaN },
    { ...runtime, temperature: 2.1 },
    { ...runtime, maxOutputTokens: 127 },
    { ...runtime, inputUsdPerMillionTokens: 1001 },
    { ...runtime, command: 'x'.repeat(301) },
    null,
  ];

  it.each(invalidValues)('rejects malformed or unsafe runtime values', (value) => {
    expect(isValidRuntime(value)).toBe(false);
  });
});

describe('scheduled action settings validation', () => {
  it('accepts a valid action and selected league scope', () => {
    expect(isValidAction({ ...action, leagueIds: ['league-a', 'league-b'] })).toBe(true);
  });

  const invalidValues: unknown[] = [
    { ...action, kind: 'unknown' },
    { ...action, mode: 'automatic-ish' },
    { ...action, leagueIds: ['league-a', 'league-a'] },
    { ...action, leagueIds: [false] },
    { ...action, schedule: { ...action.schedule, timezone: 'Invalid/Zone' } },
    undefined,
  ];

  it.each(invalidValues)('rejects malformed actions and schedules', (value) => {
    expect(isValidAction(value)).toBe(false);
  });
});

describe('complete settings update validation', () => {
  const validSettings = {
    writingStyle: 'Playful and sharp',
    reportLength: 'standard',
    actions: [action],
    aiRuntime: runtime,
    newsRefreshMinutes: 15,
  };
  const leagueIds = new Set(['league-a']);

  it('accepts settings scoped to connected leagues', () => {
    expect(
      isValidSettingsUpdate(
        {
          ...validSettings,
          calendarEvents: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              leagueId: 'league-a',
              title: 'Draft night',
              kind: 'draft-hype',
              date: '2026-08-01',
              time: '19:00',
              timezone: 'America/New_York',
            },
          ],
        },
        leagueIds,
      ),
    ).toBe(true);
  });

  it.each([
    undefined,
    [],
    { ...validSettings, writingStyle: 42 },
    { ...validSettings, imessageSyncIntervalMinutes: '15' },
    { ...validSettings, chatAgentName: 'Bot\nInjected' },
    {
      ...validSettings,
      calendarEvents: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          leagueId: 'disconnected-league',
          title: 'Draft night',
          kind: 'draft-hype',
          date: '2026-08-01',
          time: '19:00',
          timezone: 'America/New_York',
        },
      ],
    },
  ])('rejects malformed, unsafe, or stale settings updates', (candidate) => {
    expect(isValidSettingsUpdate(candidate, leagueIds)).toBe(false);
  });
});
