export type SetupStep = 0 | 1 | 2;

/** Resume at the first required setup action; personalization stays available afterward. */
export function suggestedSetupStep(hasLeague: boolean, aiReady: boolean): SetupStep {
  if (!hasLeague) return 0;
  if (!aiReady) return 1;
  return 2;
}
