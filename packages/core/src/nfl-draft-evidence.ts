import type { LeagueConnection, RosterPlayer } from './domain-types.js';
import type {
  AdviceMetric,
  FootballDataSnapshot,
  NFLDraftProfile,
  PlayerGameStats,
} from './advice-types.js';
import {
  footballPosition,
  footballRowSourceIds,
  playerNameKey,
  scoreHistoricalGame,
} from './advice-math.js';

const sourceId = 'nfl-draft-picks';
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const bucket = (round: number) => (round === 1 ? 'first' : round <= 3 ? 'early' : 'late');
const quantile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]!;

/** Draft facts and comparable recorded outcomes are not player-specific projections.
 * Equal-player means avoid giving frequently used rookies extra cohort weight. */
export function prepareNFLDraftEvidence(
  data: FootballDataSnapshot,
  league: LeagueConnection,
  target: { season: number; asOf: string },
  history: PlayerGameStats[],
) {
  const fresh = (id: string, hours = 48) => {
    const source = data.sources.find((s) => s.id === id);
    const age = Date.parse(target.asOf) - Date.parse(source?.retrievedAt ?? '');
    return (
      source?.status === 'available' && Number.isFinite(age) && age >= 0 && age <= hours * 3600000
    );
  };
  const profiles = (data.draftPicks ?? []).filter(
    (p) => p.season <= target.season && `${p.season}-05-01` <= target.asOf.slice(0, 10),
  );
  const byId = new Map<string, NFLDraftProfile[]>(),
    byName = new Map<string, NFLDraftProfile[]>();
  for (const profile of profiles) {
    if (profile.gsisId) byId.set(profile.gsisId, [...(byId.get(profile.gsisId) ?? []), profile]);
    const name = `${playerNameKey(profile.name)}:${profile.position}`;
    byName.set(name, [...(byName.get(name) ?? []), profile]);
  }
  const bySeason = new Map<string, PlayerGameStats[]>(),
    games = new Map<string, number>();
  for (const game of data.games) games.set(game.id, (games.get(game.id) ?? 0) + 1);
  for (const row of history) {
    const key = `${row.playerId}:${row.season}`;
    bySeason.set(key, [...(bySeason.get(key) ?? []), row]);
  }
  type Comparable = { season: number; points: number; games: number; sourceIds: string[] };
  const cohorts = new Map<string, Comparable[]>();
  if (fresh(sourceId, 168) && fresh('games')) {
    for (const p of profiles) {
      if (
        !p.gsisId ||
        byId.get(p.gsisId)?.length !== 1 ||
        p.season >= target.season ||
        p.season < target.season - 2 ||
        !['QB', 'RB', 'WR', 'TE'].includes(p.position)
      )
        continue;
      const rows = bySeason.get(`${p.gsisId}:${p.season}`) ?? [];
      if (
        rows.length < 4 ||
        rows.some((r) => r.position !== p.position || games.get(r.gameId) !== 1) ||
        new Set(rows.map((r) => r.gameId)).size !== rows.length ||
        rows.some(
          (r) =>
            !footballRowSourceIds(r).length || !footballRowSourceIds(r).every((id) => fresh(id)),
        )
      )
        continue;
      const scores = rows.map((r) => scoreHistoricalGame(league, r).points);
      if (scores.some((p) => p === undefined)) continue;
      const key = `${p.position}:${bucket(p.round)}`;
      cohorts.set(key, [
        ...(cohorts.get(key) ?? []),
        {
          season: p.season,
          points: mean(scores as number[]),
          games: rows.length,
          sourceIds: [...new Set(rows.flatMap(footballRowSourceIds))],
        },
      ]);
    }
  }
  return (player: RosterPlayer) => {
    const result: {
      profile?: NFLDraftProfile & { sourceId: string };
      metrics: AdviceMetric[];
      warnings: string[];
    } = { metrics: [], warnings: [] };
    if (!fresh(sourceId, 168)) return result;
    const position = footballPosition(player.position);
    const gsis = player.gsisId ?? (/^00-\d{7}$/.test(player.id) ? player.id : undefined);
    const matching =
      (gsis ? byId.get(gsis) : byName.get(`${playerNameKey(player.name)}:${position}`)) ?? [];
    if (matching.length !== 1 || matching[0]!.position !== position) {
      if (matching.length > 1)
        result.warnings.push(
          'NFL draft identity is ambiguous; draft facts and rookie comparisons were withheld.',
        );
      return result;
    }
    const profile = matching[0]!;
    result.profile = { ...profile, sourceId };
    const metric = (
      suffix: string,
      label: string,
      value: number,
      unit: string,
      sources = [sourceId],
      extra: Partial<AdviceMetric> = {},
    ) =>
      result.metrics.push({
        id: `${player.id}:${suffix}`,
        label,
        value,
        unit,
        sourceIds: sources,
        ...extra,
      });
    metric('nfl-draft-year', 'NFL draft year', profile.season, 'year');
    metric('nfl-draft-round', 'NFL draft round', profile.round, 'round');
    metric('nfl-draft-pick', 'Overall NFL draft pick', profile.pick, 'pick');
    metric(
      'nfl-draft-age',
      'Years since the NFL draft',
      target.season - profile.season,
      'years',
      [sourceId],
      {
        description:
          'Years since being drafted, not verified NFL playing experience. Draft capital does not establish current roster status, role or fantasy ADP.',
      },
    );
    if (profile.season !== target.season || !['QB', 'RB', 'WR', 'TE'].includes(position))
      return result;
    const cohort = cohorts.get(`${position}:${bucket(profile.round)}`) ?? [];
    const seasons = new Set(cohort.map((p) => p.season));
    const sources = [
      ...new Set([
        sourceId,
        ...(cohort.length ? ['games', ...cohort.flatMap((p) => p.sourceIds)] : []),
      ]),
    ];
    const scope =
      profile.round === 1
        ? 'first round'
        : profile.round <= 3
          ? 'rounds two through three'
          : 'rounds four through seven';
    metric(
      'rookie-comparable-sample',
      'Comparable recorded rookies',
      cohort.length,
      'players',
      sources,
      {
        description: `Same position, ${scope}, two earlier draft classes; at least four scoring-complete recorded rookie appearances. Not all drafted rookies.`,
      },
    );
    metric(
      'rookie-comparable-classes',
      'Earlier draft classes represented',
      seasons.size,
      'classes',
      sources,
    );
    if (cohort.length >= 8 && seasons.size >= 2) {
      const values = cohort.map((p) => p.points);
      for (const [suffix, label, value] of [
        ['mean', 'Comparable rookie scoring average', mean(values)],
        ['lower', 'Comparable rookie lower quartile', quantile(values, 0.25)],
        ['upper', 'Comparable rookie upper quartile', quantile(values, 0.75)],
      ] as const)
        metric(`rookie-comparable-${suffix}`, label, value, 'points/recorded appearance', sources, {
          sampleSize: cohort.length,
          description:
            'Equal-player summary of prior recorded rookie appearances under this league scoring. Descriptive cohort outcomes, not this player’s estimate, prediction interval or success probability.',
        });
      result.warnings.push(
        'Rookie comparisons select players with recorded usage and exclude missing/short histories. This selection favors players who earned appearances; draft capital alone does not predict playing time, injury, opportunity or fantasy points.',
      );
    } else
      result.warnings.push(
        'Too few comparable scoring-complete rookies across earlier draft classes; cohort scoring summaries were withheld. Missing history is not zero production.',
      );
    return result;
  };
}
