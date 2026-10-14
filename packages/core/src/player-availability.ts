/** Recorded reserve/inactive flags cannot establish eligibility for a lineup.
 * Unknown or questionable status stays separate from verified availability. */
export function isInactiveFootballStatus(status: string | undefined): boolean {
  return /^(out|inactive|injured reserve|ir|suspended|pup|nfi)$/i.test(status?.trim() ?? '');
}
