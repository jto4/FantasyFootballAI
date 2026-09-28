/** Prevent a report from being delivered twice concurrently by this local process. */
export class DeliveryGuard {
  private readonly inFlight = new Set<string>();

  acquire(reportId: string): boolean {
    if (this.inFlight.has(reportId)) return false;
    this.inFlight.add(reportId);
    return true;
  }

  release(reportId: string): void {
    this.inFlight.delete(reportId);
  }
}
