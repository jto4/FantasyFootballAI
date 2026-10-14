import type { FootballGame, PregameGameContext, PregameTeamContext } from './advice-types.js';
const instant = (x: unknown): x is string => {
  if (
    typeof x !== 'string' ||
    x.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(x) ||
    !Number.isFinite(Date.parse(x))
  )
    return false;
  const year = Number(x.slice(0, 4)),
    month = Number(x.slice(5, 7)),
    day = Number(x.slice(8, 10));
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
    Number(x.slice(11, 13)) < 24
  );
};
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const optional = (x: unknown, f: (x: unknown) => boolean) => x === undefined || f(x);
function team(value: unknown, asOf: number, kickoff: number): value is PregameTeamContext {
  if (
    !object(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          'reportUpdatedAt',
          'reportSource',
          'reportUrl',
          'offenseOut',
          'defenseOut',
          'quarterbackOut',
          'quarterbackDoubtful',
          'previousQuarterbackName',
          'previousQuarterbackId',
          'expectedQuarterbackName',
          'expectedQuarterbackId',
          'quarterbackObservedAt',
          'quarterbackChanged',
          'personnel',
        ].includes(k),
    )
  )
    return false;
  const reported = value.reportUpdatedAt !== undefined;
  return (
    optional(
      value.reportSource,
      (x) =>
        reported &&
        ['nflverse', 'espn', 'nfl-official'].includes(String(x)) &&
        typeof x === 'string',
    ) &&
    optional(
      value.reportUrl,
      (x) =>
        reported &&
        value.reportSource === 'nfl-official' &&
        typeof x === 'string' &&
        /^https:\/\/www\.nfl\.com\/news\/[a-z0-9-]{1,200}$/.test(x),
    ) &&
    optional(
      value.reportUpdatedAt,
      (x) => instant(x) && Date.parse(x) <= asOf && Date.parse(x) >= kickoff - 7 * 86400000,
    ) &&
    ['offenseOut', 'defenseOut'].every((k) =>
      optional(
        value[k],
        (x) => reported && typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 60,
      ),
    ) &&
    ['quarterbackOut', 'quarterbackDoubtful'].every((k) =>
      optional(value[k], (x) => reported && typeof x === 'boolean'),
    ) &&
    optional(
      value.previousQuarterbackName,
      (x) => typeof x === 'string' && x.length > 0 && x.length <= 120 && !/[\u0000-\u001f]/.test(x),
    ) &&
    ['previousQuarterbackId', 'expectedQuarterbackId'].every((k) =>
      optional(value[k], (x) => typeof x === 'string' && /^\d{2}-\d{7}$/.test(x)),
    ) &&
    optional(
      value.expectedQuarterbackName,
      (x) =>
        typeof x === 'string' &&
        x.length > 0 &&
        x.length <= 120 &&
        !/[\u0000-\u001f]/.test(x) &&
        instant(value.quarterbackObservedAt),
    ) &&
    optional(
      value.quarterbackObservedAt,
      (x) =>
        instant(x) &&
        Date.parse(x) <= asOf &&
        Date.parse(x) >= asOf - 3 * 86400000 &&
        typeof value.expectedQuarterbackName === 'string',
    ) &&
    optional(
      value.quarterbackChanged,
      (x) => typeof x === 'boolean' && value.quarterbackObservedAt !== undefined,
    )
  );
}
/** Source timestamps are checked again at use time. No current target starter/observed-weather archive fields are consulted. */
export function usablePregameContext(
  game: FootballGame,
  at?: string,
): PregameGameContext | undefined {
  const p = game.pregame,
    k = Date.parse(game.kickoffAt ?? ''),
    a = Date.parse(at ?? game.kickoffAt ?? '') - (at ? 0 : 1);
  if (
    !p ||
    !object(p) ||
    Object.keys(p).some((k) => !['asOf', 'home', 'away', 'weather'].includes(k)) ||
    !instant(p.asOf) ||
    !Number.isFinite(k) ||
    !Number.isFinite(a) ||
    a >= k ||
    Date.parse(p.asOf) > a ||
    Date.parse(p.asOf) >= k ||
    !team(p.home, Date.parse(p.asOf), k) ||
    !team(p.away, Date.parse(p.asOf), k) ||
    (p.home.personnel !== undefined && !validPersonnel(p.home.personnel, game, p.asOf, p.home)) ||
    (p.away.personnel !== undefined && !validPersonnel(p.away.personnel, game, p.asOf, p.away))
  )
    return;
  const w = p.weather;
  if (w) {
    if (
      !object(w) ||
      Object.keys(w).some(
        (k) =>
          ![
            'venueId',
            'validAt',
            'availableBy',
            'model',
            'leadHours',
            'temperatureC',
            'windKph',
            'precipitationMm',
          ].includes(k),
      ) ||
      w.venueId !== game.stadiumId ||
      w.model !== 'jma_gsm' ||
      w.leadHours !== 48 ||
      !instant(w.validAt) ||
      !instant(w.availableBy) ||
      Date.parse(w.validAt) > k ||
      k - Date.parse(w.validAt) >= 3600000 ||
      Date.parse(w.availableBy) !== Date.parse(w.validAt) - 36 * 3600000 ||
      Date.parse(w.availableBy) > Date.parse(p.asOf) ||
      ![
        ['temperatureC', -60, 60],
        ['windKph', 0, 250],
        ['precipitationMm', 0, 100],
      ].every(
        ([key, lo, hi]) =>
          typeof w[key as 'temperatureC' | 'windKph' | 'precipitationMm'] === 'number' &&
          Number.isFinite(w[key as 'temperatureC' | 'windKph' | 'precipitationMm']) &&
          (w[key as 'temperatureC' | 'windKph' | 'precipitationMm'] as number) >= (lo as number) &&
          (w[key as 'temperatureC' | 'windKph' | 'precipitationMm'] as number) <= (hi as number),
      )
    )
      return;
  }
  return p;
}
function validPersonnel(
  p: NonNullable<PregameTeamContext['personnel']>,
  game: FootballGame,
  asOf: string,
  context: PregameTeamContext,
) {
  if (
    !p ||
    !object(p) ||
    Object.keys(p).some(
      (k) =>
        ![
          'availableBy',
          'throughSeason',
          'throughWeek',
          'quarterbackQuality',
          'quarterbackAbsenceValue',
          ...richPersonnelKeys,
          'offenseOutSnaps',
          'defenseOutSnaps',
          'offenseQuestionableSnaps',
          'defenseQuestionableSnaps',
          'matchedReports',
          'reportedPlayers',
        ].includes(k),
    ) ||
    !instant(p.availableBy) ||
    Date.parse(p.availableBy) > Date.parse(asOf) ||
    !Number.isInteger(p.throughSeason) ||
    p.throughSeason < 2010 ||
    p.throughSeason > game.season ||
    !Number.isInteger(p.throughWeek) ||
    p.throughWeek < 1 ||
    p.throughWeek > 18 ||
    (p.throughSeason === game.season && p.throughWeek >= game.week) ||
    !Number.isInteger(p.reportedPlayers) ||
    p.reportedPlayers < 0 ||
    p.reportedPlayers > 60 ||
    !Number.isInteger(p.matchedReports) ||
    p.matchedReports < 0 ||
    p.matchedReports > p.reportedPlayers ||
    (p.quarterbackQuality !== undefined &&
      !context.previousQuarterbackId &&
      !context.previousQuarterbackName &&
      !context.expectedQuarterbackName) ||
    (p.quarterbackAbsenceValue !== undefined && context.quarterbackOut === undefined) ||
    (richPersonnelKeys.slice(0, 3).some((k) => p[k] !== undefined) &&
      !context.previousQuarterbackId &&
      !context.previousQuarterbackName &&
      !context.expectedQuarterbackName) ||
    (
      [
        ...richPersonnelKeys.slice(3),
        'quarterbackAbsenceValue',
        'offenseOutSnaps',
        'defenseOutSnaps',
        'offenseQuestionableSnaps',
        'defenseQuestionableSnaps',
      ] as const
    ).some((k) => p[k] !== undefined && !context.reportUpdatedAt) ||
    (
      [
        ...richPersonnelKeys,
        'quarterbackQuality',
        'quarterbackAbsenceValue',
        'offenseOutSnaps',
        'defenseOutSnaps',
        'offenseQuestionableSnaps',
        'defenseQuestionableSnaps',
      ] as const
    ).some(
      (k) =>
        !optional(
          p[k],
          (x) =>
            typeof x === 'number' &&
            Number.isFinite(x) &&
            x >= (k.startsWith('quarterback') ? -1 : 0) &&
            x <= (k.startsWith('quarterback') ? 1 : 30),
        ),
    )
  )
    return false;
  return true;
}
export function usablePersonnel(game: FootballGame, side: 'home' | 'away') {
  return usablePregameContext(game)?.[side].personnel;
}
export function personnelFeatures(
  kind: 'moneyline' | 'spread' | 'total',
  game: FootballGame,
): number[] {
  const h = usablePersonnel(game, 'home'),
    a = usablePersonnel(game, 'away');
  const keys = [
    'quarterbackQuality',
    'quarterbackAbsenceValue',
    'offenseOutSnaps',
    'defenseOutSnaps',
    'offenseQuestionableSnaps',
    'defenseQuestionableSnaps',
  ] as const;
  return keys.map((k, i) =>
    h?.[k] === undefined || a?.[k] === undefined
      ? 0
      : (kind === 'total' ? h[k]! + a[k]! : h[k]! - a[k]!) / (i < 2 ? 1 : 2),
  );
}
export function availabilityFeatures(
  kind: 'moneyline' | 'spread' | 'total',
  game: FootballGame,
  at?: string,
  includeExperimentalOfficialReports = false,
): number[] {
  const p = usablePregameContext(game, at),
    zeros = Array<number>(8).fill(0);
  if (!p) return zeros;
  const combine = (h: number, a: number) => (kind === 'total' ? h + a : h - a);
  if (
    p.home.reportUpdatedAt &&
    p.away.reportUpdatedAt &&
    (includeExperimentalOfficialReports ||
      (p.home.reportSource !== 'nfl-official' && p.away.reportSource !== 'nfl-official'))
  ) {
    zeros[0] = combine(p.home.offenseOut ?? 0, p.away.offenseOut ?? 0) / 4;
    zeros[1] = combine(p.home.defenseOut ?? 0, p.away.defenseOut ?? 0) / 4;
    if (p.home.quarterbackOut !== undefined && p.away.quarterbackOut !== undefined)
      zeros[2] = combine(Number(p.home.quarterbackOut), Number(p.away.quarterbackOut));
    if (p.home.quarterbackDoubtful !== undefined && p.away.quarterbackDoubtful !== undefined)
      zeros[3] = combine(Number(p.home.quarterbackDoubtful), Number(p.away.quarterbackDoubtful));
  }
  if (p.home.quarterbackChanged !== undefined && p.away.quarterbackChanged !== undefined)
    zeros[4] = combine(Number(p.home.quarterbackChanged), Number(p.away.quarterbackChanged));
  if (p.weather) {
    zeros[5] = Math.min(4, p.weather.windKph / 40);
    zeros[6] = Math.min(4, Math.max(0, 10 - p.weather.temperatureC) / 25);
    zeros[7] = Math.min(4, p.weather.precipitationMm / 5);
  }
  return zeros;
}

/** Fixed research feature order. Unknown paired values yield no correction, never imputed health. */
export const richPersonnelKeys = [
  'quarterbackEpa',
  'quarterbackRushEpa',
  'quarterbackTeamDelta',
  'offensiveLineOutSnaps',
  'skillOutSnaps',
  'offenseDoubtfulSnaps',
  'defenseDoubtfulSnaps',
  'offenseLimitedSnaps',
  'defenseLimitedSnaps',
  'offenseDnpSnaps',
  'defenseDnpSnaps',
] as const;
export function richPersonnelFeatures(
  kind: 'moneyline' | 'spread' | 'total',
  game: FootballGame,
  family: 'all' | 'quarterback' | 'injuries' = 'all',
): number[] {
  const h = usablePersonnel(game, 'home'),
    a = usablePersonnel(game, 'away');
  return richPersonnelKeys.map((k, i) =>
    (family === 'quarterback' && i >= 3) ||
    (family === 'injuries' && i < 3) ||
    h?.[k] === undefined ||
    a?.[k] === undefined
      ? 0
      : (kind === 'total' ? h[k]! + a[k]! : h[k]! - a[k]!) / (i < 3 ? 1 : 2),
  );
}
