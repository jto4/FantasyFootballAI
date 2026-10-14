import type { ProjectionPeriod } from './domain-types.js';

export function isProjectionPeriod(value: unknown): value is ProjectionPeriod {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const integer = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  return (
    Object.keys(row).length === 3 &&
    integer(row.season, 2010, 2099) &&
    integer(row.fromWeek, 1, 30) &&
    integer(row.throughWeek, 1, 30) &&
    row.fromWeek <= row.throughWeek
  );
}

/** A weekly value must cover exactly that week; weekless intervals cover regular-season weeks. */
export function projectionPeriodMatchesWeek(
  period: ProjectionPeriod,
  week: number | undefined,
): boolean {
  return week === undefined
    ? period.throughWeek <= 18
    : period.fromWeek === week && period.throughWeek === week;
}
