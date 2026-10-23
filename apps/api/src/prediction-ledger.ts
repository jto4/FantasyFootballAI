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
  for (const record of records) {
    if (ids.has(record.id)) continue;
    const size = Buffer.byteLength(JSON.stringify(record)) + 1;
    if (
      added.length >= maximumPredictionRecords ||
      bytes + size > maximumPredictionBytes - maximumPredictionRecords * 160
    ) {
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
