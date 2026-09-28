import { describe, expect, it } from 'vitest';
import { suggestedSetupStep } from './setup.js';

describe('guided setup', () => {
  it('starts at the first incomplete required step, then offers optional personalization', () => {
    expect(suggestedSetupStep(false, false)).toBe(0);
    expect(suggestedSetupStep(true, false)).toBe(1);
    expect(suggestedSetupStep(false, true)).toBe(0);
    expect(suggestedSetupStep(true, true)).toBe(2);
  });
});
