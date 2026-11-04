import { expect, it } from 'vitest';
import { lineupSlotName } from './lineup-slot';

it('names a slot without the optimizer’s list index', () => {
  expect(lineupSlotName('DST 7')).toBe('Team defense');
  expect(lineupSlotName('FLEX 8')).toBe('Flex');
  expect(lineupSlotName('QB')).toBe('Quarterback');
  expect(lineupSlotName('UNKNOWN 3')).toBe('UNKNOWN');
});
