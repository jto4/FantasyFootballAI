import { describe, expect, it } from 'vitest';
import { DeliveryGuard } from './delivery-guard.js';

describe('report delivery guard', () => {
  it('allows only one in-flight send for a report and permits retry after release', () => {
    const guard = new DeliveryGuard();
    expect(guard.acquire('report-1')).toBe(true);
    expect(guard.acquire('report-1')).toBe(false);
    expect(guard.acquire('report-2')).toBe(true);
    guard.release('report-1');
    expect(guard.acquire('report-1')).toBe(true);
  });
});
