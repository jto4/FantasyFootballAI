import { describe, expect, it } from 'vitest';
import { preferredScrollBehavior } from './motion.js';

describe('motion preferences', () => {
  it('disables animated scrolling when reduced motion is requested', () => {
    expect(preferredScrollBehavior(true)).toBe('auto');
    expect(preferredScrollBehavior(false)).toBe('smooth');
  });
});
