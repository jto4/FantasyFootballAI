/** Resolve a remembered league ID safely when leagues are added or disconnected. */
export function resolveActiveLeague<T extends { id: string }>(
  leagues: readonly T[],
  preferredId: string,
): T | undefined {
  return leagues.find((league) => league.id === preferredId) ?? leagues[0];
}
