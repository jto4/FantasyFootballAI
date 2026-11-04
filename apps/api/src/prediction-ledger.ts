import {
  maximumPredictionBytes,
  maximumPredictionRecords,
  type PredictionRecord,
} from '@sidekick/core';

/**
 * Adds new prediction records within the ledger limits, skipping ids already present. Returns how
 * many were left out for space; room is kept for later outcome fields so a full ledger can settle.
 */
export function appendPredictionRecords(
  state: { predictionRecords?: PredictionRecord[] },
  records: PredictionRecord[],
): number {
  const previous = state.predictionRecords ?? [];
  const ids = new Set(previous.map((r) => r.id));
  let bytes = Buffer.byteLength(JSON.stringify(previous)),
    omitted = 0;
  const added = [...previous];
  const full = (extra: number) =>
    added.length >= maximumPredictionRecords ||
    bytes + extra > maximumPredictionBytes - maximumPredictionRecords * 160;
  for (const record of records) {
    if (ids.has(record.id)) continue;
    const size = Buffer.byteLength(JSON.stringify(record)) + 1;
    // Full: the oldest graded record makes room, so the track record stays current. A forecast
    // still waiting on its game is never given up for that, so with none graded this one waits.
    while (full(size)) {
      const oldest = added.findIndex((item) => item.status !== 'pending');
      if (oldest < 0) break;
      bytes -= Buffer.byteLength(JSON.stringify(added[oldest])) + 1;
      added.splice(oldest, 1);
    }
    if (full(size)) {
      omitted++;
      continue;
    }
    added.push(record);
    ids.add(record.id);
    bytes += size;
  }
  state.predictionRecords = added;
  return omitted;
}
