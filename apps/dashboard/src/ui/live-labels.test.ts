import { expect, it } from 'vitest';
import { kickoffLabel } from './LivePage';

it('writes ESPN kickoff text the way the rest of the app writes dates', () => {
  expect(kickoffLabel('11/9 - 8:15 PM EST')).toMatch(/^Nov 9, 8:15 PM EST$/);
  expect(kickoffLabel('Final')).toBe('Final');
  expect(kickoffLabel(undefined)).toBeUndefined();
});
