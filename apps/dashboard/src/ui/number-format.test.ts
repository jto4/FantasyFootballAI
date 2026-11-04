import { expect, it } from 'vitest';
import { formatNumber, formatOptional } from './number-format';

it('formats with at most the requested decimals and a dash for a missing number', () => {
  expect(formatNumber(12.34)).toBe('12.3');
  expect(formatNumber(12)).toBe('12');
  expect(formatNumber(12.6, 0)).toBe('13');
  expect(formatOptional(undefined)).toBe('—');
  expect(formatOptional(4.25, 2)).toBe('4.25');
});
