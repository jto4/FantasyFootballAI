import { expect, it } from 'vitest';
import { initialState } from './store-defaults.js';
import { validateState, makeRestoredStateSafe } from './store-validation.js';
import { isValidAction } from './settings-validation.js';
it('validates saved-data policies through settings/storage and pauses restored schedules', () => {
  const state = structuredClone(initialState),
    action = state.settings.actions[0]!;
  Object.assign(action, {
    dataMode: 'saved',
    mode: 'draft',
    channel: 'dashboard',
    leagueIds: ['league'],
  });
  expect(isValidAction(action)).toBe(true);
  expect(validateState(state).settings.actions[0]!.dataMode).toBe('saved');
  expect(makeRestoredStateSafe(state).settings.actions.every((a) => !a.schedule.enabled)).toBe(
    true,
  );
  for (const patch of [
    { dataMode: 'fallback' },
    { mode: 'automatic' },
    { channel: 'email' },
    { leagueIds: [] },
    { leagueIds: ['bad\nheader'] },
    { leagueIds: [null] },
  ]) {
    const invalid = structuredClone(initialState);
    Object.assign(invalid.settings.actions[0]!, action, patch);
    expect(isValidAction(invalid.settings.actions[0])).toBe(false);
    expect(() => validateState(invalid)).toThrow('Invalid saved-report data policy');
  }
});
