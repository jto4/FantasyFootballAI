import type { LeagueConnection, PlayerProjection, RosterPlayer } from './domain-types.js';
import type {
  AdviceMetric,
  FootballDataSnapshot,
  FootballGame,
  FootballStatKey,
  PlayerAdviceEvidence,
  PlayerGameStats,
} from './advice-types.js';
import {
  historicalPlayerGames,
  footballRowSourceIds,
  footballPosition,
  defensePlayerIdentity,
  nflTeamKey,
  playerNameKey,
  scoreHistoricalGame,
  isUpcomingFootballGame,
} from './advice-math.js';
import { isProjectionPeriod } from './projection-period.js';
import { prepareFantasyForecast } from './fantasy-forecast.js';
import { prepareNFLDraftEvidence } from './nfl-draft-evidence.js';
import {
  projectFantasyPoints,
  projectSpecialTeamsPoints,
  projectionContext,
  projectionRange,
  teamGame,
  type UsageInput,
} from './fantasy-projection.js';
import {
  fantasyModelWeight,
  fantasyOutcomeSpread,
  specialTeamsSettings,
  vacatedCarryExponent,
  weatherSettings,
} from './fantasy-projection-settings.js';
import { propModelSettings, propUsageNorms } from './prop-model-settings.js';
import { playerNudge, type UserPreferences } from './preferences.js';
import { isInactiveFootballStatus } from './player-availability.js';
import { weeklyGameWithheldWarning } from './advice-warnings.js';

export interface PlayerEvidenceInput {
  league: LeagueConnection;
  players: RosterPlayer[];
  projections: PlayerProjection[];
  data: FootballDataSnapshot;
  season: number;
  week: number;
  throughWeek?: number;
  scope: 'week' | 'season' | 'remaining-season';
  asOf: string;
  /** Snap counts and depth charts for the projection model; features stay off without them. */
  usage?: UsageInput | undefined;
  /** Owner preferences: model adjustments that are switched off and per-player nudges. */
  preferences?: UserPreferences | undefined;
}

/** Saved ESPN projections (from older league imports) are never used; the app projects its own. */
const isEspnProjection = (row: PlayerProjection) =>
  row.sourceId?.startsWith('espn-browser:') === true ||
  /\bespn\b/i.test(row.sourceName) ||
  /(^|\.)espn\.com/i.test(row.sourceUrl ?? '');

/** Assemble source-linked facts before the model sees them; never ask AI to calculate points. */
export function buildPlayerEvidence(input: PlayerEvidenceInput): PlayerAdviceEvidence[] {
  const windOn = input.preferences?.projectionAdjustments?.wind !== false;
  const carriesOn = input.preferences?.projectionAdjustments?.vacatedCarries !== false;
  const forecast =
    input.scope === 'week' ? undefined : prepareFantasyForecast(input.league, input.data, input);
  const history = historicalPlayerGames(input.data, input);
  const draftEvidence = prepareNFLDraftEvidence(input.data, input.league, input, history);
  const projection =
    input.scope === 'week' ? projectionContext(input.data, input.usage) : undefined;
  const byName = new Map<string, PlayerGameStats[]>();
  for (const row of history) {
    const key = playerNameKey(row.name);
    const rows = byName.get(key) ?? [];
    rows.push(row);
    byName.set(key, rows);
  }
  const projections = input.projections.filter(
    (row) =>
      row.leagueId === input.league.id &&
      !isEspnProjection(row) &&
      row.scoringMatched === true &&
      (row.period === undefined || isProjectionPeriod(row.period)) &&
      (row.period === undefined || row.period.season === input.season) &&
      (input.scope === 'week'
        ? row.week === input.week
        : input.scope === 'remaining-season'
          ? row.week === undefined &&
            row.period?.fromWeek === input.week &&
            row.period.throughWeek === (input.throughWeek ?? 18)
          : row.week === undefined &&
            (row.period === undefined ||
              (row.period.fromWeek === 1 && row.period.throughWeek === 18))),
  );
  // This week's regular-season games by team, built once instead of scanned per player.
  const weekGames = new Map<string, FootballGame[]>();
  for (const game of input.data.games)
    if (game.season === input.season && game.week === input.week && game.seasonType === 'REG')
      for (const side of new Set([nflTeamKey(game.home), nflTeamKey(game.away)]))
        weekGames.set(side, [...(weekGames.get(side) ?? []), game]);
  const nameCounts = new Map<string, number>();
  for (const player of input.players) {
    const key = playerNameKey(player.name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  return input.players.slice(0, 2_000).map((player) => {
    const evidence: PlayerAdviceEvidence = {
      id: player.id,
      name: player.name,
      position: footballPosition(player.position),
      ...(player.nflTeam ? { team: player.nflTeam } : {}),
      ...(player.status ? { status: player.status } : {}),
      projectionSourceIds: [],
      historicalPoints: [],
      metrics: [],
      warnings: [],
    };
    const draft = draftEvidence(player);
    if (draft.profile) evidence.draftProfile = draft.profile;
    evidence.metrics.push(...draft.metrics);
    evidence.warnings.push(...draft.warnings);
    const defenseIdentity = defensePlayerIdentity(player);
    const named = (
      evidence.position === 'DST'
        ? history.filter(
            (row) => row.playerId === defenseIdentity && footballPosition(row.position) === 'DST',
          )
        : (byName.get(playerNameKey(player.name)) ?? [])
    ).filter((row) => !evidence.position || footballPosition(row.position) === evidence.position);
    const identities = new Set(named.map((row) => row.playerId));
    const exactGsis = named.filter((row) => row.playerId === (player.gsisId ?? player.id));
    const rows = (
      player.gsisId ? exactGsis : exactGsis.length ? exactGsis : identities.size === 1 ? named : []
    )
      .sort((a, b) => b.season - a.season || b.week - a.week)
      .slice(0, 12);
    if (player.gsisId && named.length && !exactGsis.length)
      evidence.warnings.push(
        'The supplied GSIS identity conflicts with the named history; historical statistics were not joined.',
      );
    if (identities.size > 1 && !exactGsis.length)
      evidence.warnings.push(
        'Multiple NFL players share this name/position; historical statistics were not joined.',
      );
    if (!rows.length)
      evidence.warnings.push(
        'No uniquely matched, completed prior regular-season games are available.',
      );
    if (!evidence.position && rows[0]) evidence.position = rows[0].position;
    const sourceIds = [...new Set(rows.flatMap(footballRowSourceIds))];
    const metric = (
      suffix: string,
      label: string,
      value: number,
      unit: string,
      extra: Partial<AdviceMetric> = {},
    ) =>
      evidence.metrics.push({
        id: `${player.id}:${suffix}`,
        label,
        value,
        unit,
        sourceIds,
        ...extra,
      });
    metric('sample', 'Matched prior games', rows.length, 'games');
    const scoreResults = rows.map((row) => scoreHistoricalGame(input.league, row));
    const completedDefenseGames =
      evidence.position === 'DST' && defenseIdentity
        ? input.data.games
            .filter(
              (g) =>
                g.seasonType === 'REG' &&
                g.season >= input.season - 2 &&
                (g.season < input.season || g.week < input.week) &&
                g.date < input.asOf.slice(0, 10) &&
                g.homeScore !== undefined &&
                g.awayScore !== undefined &&
                [g.home, g.away].some((team) => nflTeamKey(team) === nflTeamKey(player.nflTeam!)),
            )
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 12)
        : [];
    const completeScoring =
      rows.length > 0 &&
      scoreResults.every((result) => result.points !== undefined) &&
      (evidence.position !== 'DST' ||
        (completedDefenseGames.length > 0 &&
          completedDefenseGames.every(
            (game) => rows.filter((r) => r.gameId === game.id).length === 1,
          )));

    if (completeScoring) {
      evidence.historicalPoints = scoreResults.map((result) => result.points!);
      metric(
        'points-mean',
        'Prior 12-game scoring average',
        mean(evidence.historicalPoints),
        'points/game',
        {
          sampleSize: rows.length,
          description:
            'Up to twelve prior appearances under supported league scoring; missed games are not zeroes.',
        },
      );
      metric(
        'points-sd',
        'Game-to-game scoring variability',
        standardDeviation(evidence.historicalPoints),
        'points',
        { sampleSize: rows.length },
      );
      const recent = evidence.historicalPoints.slice(0, 4);
      metric('points-recent', 'Most recent 4-game scoring average', mean(recent), 'points/game', {
        sampleSize: recent.length,
      });
      const chronological = [...evidence.historicalPoints].reverse();
      const errors = chronological
        .slice(4)
        .map(
          (actual, index) =>
            actual - mean(chronological.slice(Math.max(0, index + 4 - 8), index + 4)),
        );
      if (errors.length >= 4) {
        metric(
          'baseline-backtest-mae',
          'Historical baseline rolling test error',
          mean(errors.map(Math.abs)),
          'points/game',
          {
            sampleSize: errors.length,
            description:
              'Mean absolute error using only games before each held-out game, with 4–8 prior games for training. Small local test, not proof of future accuracy.',
          },
        );
      }
    } else if (rows.length) {
      const unsupported = [...new Set(scoreResults.flatMap((result) => result.unsupported))];
      evidence.warnings.push(
        unsupported.length
          ? `Historical league points unavailable for scoring rules: ${unsupported.slice(0, 10).join(', ')}. Scoring-matched imports can still supply estimates.`
          : 'Historical league points require missing statistics; incomplete games were not treated as zero.',
      );
    }
    const statMetrics: readonly (readonly [FootballStatKey, string, string])[] =
      evidence.position === 'DST'
        ? [
            ['dst_sacks', 'Sacks per played game', 'sacks/game'],
            ['dst_interceptions', 'Interceptions per played game', 'interceptions/game'],
            [
              'dst_fumble_recoveries',
              'Defensive fumble recoveries per played game',
              'recoveries/game',
            ],
            ['dst_touchdowns', 'Defensive touchdowns per played game', 'touchdowns/game'],
            [
              'dst_points_allowed',
              'Points allowed for D/ST scoring per played game',
              'points/game',
            ],
            ['dst_yards_allowed', 'Opponent yards per played game', 'yards/game'],
          ]
        : evidence.position === 'K'
          ? [
              ['fg_att', 'Field-goal attempts per played game', 'attempts/game'],
              ['fg_made', 'Field goals made per played game', 'makes/game'],
              ['fg_missed', 'Unblocked field-goal misses per played game', 'misses/game'],
              ['fg_blocked', 'Blocked field goals per played game', 'blocks/game'],
              ['pat_att', 'Extra-point attempts per played game', 'attempts/game'],
              ['pat_made', 'Extra points made per played game', 'makes/game'],
              ['pat_missed', 'Unblocked extra-point misses per played game', 'misses/game'],
              ['pat_blocked', 'Blocked extra points per played game', 'blocks/game'],
            ]
          : [
              ['targets', 'Targets per played game', 'targets/game'],
              ['carries', 'Carries per played game', 'carries/game'],
              ['receptions', 'Receptions per played game', 'receptions/game'],
              ['receiving_yards', 'Receiving yards per played game', 'yards/game'],
              ['rushing_yards', 'Rushing yards per played game', 'yards/game'],
              ['passing_yards', 'Passing yards per played game', 'yards/game'],
            ];
    for (const [key, label, unit] of statMetrics) {
      const values = statValues(rows, key);
      if (values.length) metric(key, label, mean(values), unit, { sampleSize: values.length });
    }
    if (evidence.position === 'DST')
      evidence.warnings.push(
        'D/ST scoring uses published Sleeper points allowed, which can differ from the final score. Missing events remain unknown; current defensive personnel and weather are unverified.',
      );
    if (evidence.position === 'K')
      evidence.warnings.push(
        'Current weather, coaching fourth-down choices and the kicking job have not been independently verified.',
      );
    const groups = new Map<string, PlayerProjection[]>();
    for (const projection of projections) {
      // Imported IDs belong to the fantasy platform, not GSIS. A name mismatch is a conflict.
      if (playerNameKey(projection.playerName) !== playerNameKey(player.name)) continue;
      if (projection.playerId && projection.playerId !== player.id) continue;
      if (!projection.playerId && nameCounts.get(playerNameKey(player.name)) !== 1) continue;
      if (
        projection.position &&
        evidence.position &&
        footballPosition(projection.position) !== evidence.position
      )
        continue;
      const id =
        projection.sourceId ??
        `${projection.sourceName.trim().toLowerCase()}:${projection.sourceUrl ?? ''}`;
      const group = groups.get(id) ?? [];
      group.push(projection);
      groups.set(id, group);
    }
    const matched = [...groups.values()].flatMap((group) =>
      group.length === 1 && Number.isFinite(group[0]!.projectedPoints) ? [group[0]!] : [],
    );
    // The app's own weekly projection: stat models for skill players, scored history for K/DST.
    const game =
      projection && player.nflTeam
        ? teamGame(input.data.games, input.season, input.week, player.nflTeam)
        : undefined;
    const own =
      !matched.length && projection && game && rows.length
        ? evidence.position === 'K' || evidence.position === 'DST'
          ? completeScoring
            ? projectSpecialTeamsPoints(
                evidence.position,
                player.nflTeam!,
                game,
                rows.map((row, i) => ({ gameId: row.gameId, points: scoreResults[i]!.points! })),
                projection,
                specialTeamsSettings[evidence.position],
                windOn ? weatherSettings : undefined,
              )
            : undefined
          : projectFantasyPoints(
              input.league,
              {
                playerId: rows[0]!.playerId,
                position: evidence.position ?? rows[0]!.position,
                team: player.nflTeam!,
                game,
                history: projection.byPlayer.get(rows[0]!.playerId) ?? rows,
              },
              projection,
              propModelSettings,
              propUsageNorms,
              carriesOn ? vacatedCarryExponent : 0,
              windOn ? weatherSettings : undefined,
            )
        : undefined;
    if ([...groups.values()].some((group) => group.length > 1))
      evidence.warnings.push('Duplicate player rows in an imported source were excluded.');
    if (matched.length) {
      evidence.projectedPoints = median(matched.map((row) => row.projectedPoints));
      evidence.projectionScope = input.scope;
      evidence.projectionPeriod = {
        season: input.season,
        fromWeek: input.scope === 'season' ? 1 : input.week,
        throughWeek:
          input.scope === 'week'
            ? input.week
            : input.scope === 'remaining-season'
              ? (input.throughWeek ?? 18)
              : 18,
      };
      evidence.projectionMethod = 'imported';
      evidence.projectionSourceIds = matched.map(
        (row) =>
          `projection:${row.sourceId ?? `${row.sourceName.trim().toLowerCase()}:${row.sourceUrl ?? ''}`}`,
      );
      metric(
        'projected',
        input.scope === 'week'
          ? 'Imported weekly estimate (source median)'
          : input.scope === 'remaining-season'
            ? `Imported remaining estimate, weeks ${input.week}–${input.throughWeek ?? 18} (source median)`
            : 'Imported full-season estimate (source median)',
        evidence.projectedPoints,
        input.scope === 'week'
          ? 'points/week'
          : input.scope === 'remaining-season'
            ? 'remaining points'
            : 'points/season',
        {
          sourceIds: evidence.projectionSourceIds,
          sampleSize: matched.length,
          description:
            'Owner confirms scoring alignment. Source accuracy and independence are not independently verified.',
        },
      );
      if (matched.length > 1)
        metric(
          'source-spread',
          'Imported estimate range',
          Math.max(...matched.map((row) => row.projectedPoints)) -
            Math.min(...matched.map((row) => row.projectedPoints)),
          'points',
          { sourceIds: evidence.projectionSourceIds },
        );
      const adp = matched.filter(
        (row) =>
          row.averageDraftPosition !== undefined && Number.isFinite(row.averageDraftPosition),
      );
      if (adp.length)
        metric(
          'adp',
          'Imported average draft position (median)',
          median(adp.map((row) => row.averageDraftPosition!)),
          'pick',
          {
            sourceIds: adp.map(
              (row) =>
                `projection:${row.sourceId ?? `${row.sourceName.trim().toLowerCase()}:${row.sourceUrl ?? ''}`}`,
            ),
            sampleSize: adp.length,
            description:
              'Descriptive draft-market timing. Source independence and format alignment are unverified.',
          },
        );
      if (
        matched.some(
          (row) =>
            !Number.isFinite(Date.parse(row.importedAt)) ||
            Date.parse(row.importedAt) > Date.parse(input.asOf) ||
            Date.parse(input.asOf) - Date.parse(row.importedAt) >
              (input.scope === 'season' ? 24 * 30 : 48) * 60 * 60 * 1_000,
        )
      )
        evidence.warnings.push(
          'At least one imported estimate is old or has an invalid/future date. Refresh it before deciding.',
        );
    } else if (own) {
      // Blend with the recent fantasy average only where that tested better (see settings).
      const weight =
        evidence.position && evidence.position in fantasyModelWeight
          ? fantasyModelWeight[evidence.position as keyof typeof fantasyModelWeight]
          : 1;
      const recentAverage = completeScoring
        ? mean(evidence.historicalPoints.slice(0, 8))
        : undefined;
      evidence.projectedPoints =
        weight < 1 && recentAverage !== undefined
          ? weight * own.points + (1 - weight) * recentAverage
          : own.points;
      evidence.projectionScope = 'week';
      evidence.projectionPeriod = {
        season: input.season,
        fromWeek: input.week,
        throughWeek: input.week,
      };
      evidence.projectionMethod = 'sidekick-model-v1';
      // Cite the recent games behind the estimate (as the 8-game baseline did) plus the schedule;
      // answers can cite only a few sources per statement.
      evidence.projectionSourceIds = [
        ...new Set([...rows.slice(0, 8).flatMap(footballRowSourceIds), 'games']),
      ];
      metric(
        'projected',
        'Sidekick weekly projection for your league scoring',
        own.points,
        'points/week',
        {
          sourceIds: evidence.projectionSourceIds,
          sampleSize: own.sampleGames,
          description:
            'The app’s own model: recent production weighted toward the latest games, adjusted for snap share, depth chart, the betting total and spread, the opponent and home field, then scored with your league’s rules. Backtested on 2026 games it was not fitted on; not a guarantee.',
        },
      );
      const range = projectionRange(
        evidence.position ?? '',
        evidence.projectedPoints,
        fantasyOutcomeSpread,
      );
      if (range)
        for (const [id, label, value] of [
          ['range-low', 'Likely low end (1 in 10 similar projections finished lower)', range.low],
          [
            'range-high',
            'Likely high end (1 in 10 similar projections finished higher)',
            range.high,
          ],
        ] as const)
          metric(id, label, value, 'points/week', {
            sourceIds: evidence.projectionSourceIds,
            description:
              'Spread of past results around projections like this one, fitted on 2025 and checked on 2026 (70–85% of results landed inside, by position).',
          });
      const ownStats =
        'stats' in own ? (own.stats as Partial<Record<FootballStatKey, number>>) : {};
      for (const [stat, label, unit] of [
        ['passing_yards', 'Projected passing yards', 'yards'],
        ['passing_tds', 'Projected passing touchdowns', 'touchdowns'],
        ['passing_interceptions', 'Projected interceptions', 'interceptions'],
        ['carries', 'Projected carries', 'carries'],
        ['rushing_yards', 'Projected rushing yards', 'yards'],
        ['rushing_tds', 'Projected rushing touchdowns', 'touchdowns'],
        ['receptions', 'Projected receptions', 'receptions'],
        ['receiving_yards', 'Projected receiving yards', 'yards'],
        ['receiving_tds', 'Projected receiving touchdowns', 'touchdowns'],
      ] as const) {
        const value = ownStats[stat];
        if (value !== undefined && value >= 0.05)
          metric(`model-${stat}`, label, Math.round(value * 10) / 10, unit, {
            sourceIds: evidence.projectionSourceIds,
          });
      }
      const wind = own.windFactor;
      if (wind < 1)
        metric(
          'wind-adjustment',
          'Projection lost to forecast wind',
          Math.round((1 - wind) * 100),
          'percent',
          {
            sourceIds: evidence.projectionSourceIds,
            description:
              'Forecast wind at kickoff (issued about 48 hours ahead, outdoor stadiums only) lowers offensive and kicker projections, about 10% per 10 km/h above 10 km/h (fitted on 2025, checked on 2026).',
          },
        );
      const vacated = (own as { vacatedCarryShare?: number }).vacatedCarryShare ?? 0;
      if (vacated)
        metric(
          'vacated-carries',
          'Share of recent team running-back carries from backs ruled out this week',
          Math.round(vacated * 100),
          'percent',
          {
            sourceIds: evidence.projectionSourceIds,
            description:
              'Teammates listed Out or Doubtful on the NFL injury report; their recent carries raise this back’s rushing projection (fitted on 2025, checked on 2026).',
          },
        );
      evidence.warnings.push(
        'Sidekick projections assume the player is active. Running backs get extra carries when a teammate back is listed Out or Doubtful, and forecast wind is applied inside 36 hours of kickoff; other injuries, late role changes and weather news after the last data refresh are not included.',
      );
    } else if (input.scope !== 'week') {
      const estimate = forecast?.(
        player,
        input.scope,
        input.scope === 'season' ? 18 : (input.throughWeek ?? 18),
      );
      if (estimate) {
        evidence.projectedPoints = estimate.points;
        evidence.projectionScope = input.scope;
        evidence.projectionPeriod = {
          season: input.season,
          fromWeek: input.scope === 'season' ? 1 : input.week,
          throughWeek: input.scope === 'season' ? 18 : (input.throughWeek ?? 18),
        };
        evidence.projectionMethod = estimate.method;
        evidence.projectionSourceIds = estimate.sourceIds;
        const unit = input.scope === 'season' ? 'points/season' : 'remaining points';
        for (const [suffix, label, value, metricUnit, description] of [
          [
            'projected',
            input.scope === 'season'
              ? 'Recorded points + future estimate'
              : 'Automatic remaining estimate',
            estimate.points,
            unit,
            'League scoring, unique history, schedule; matching imports take priority.',
          ],
          [
            'forecast-baseline',
            'Future scoring baseline',
            estimate.baselinePoints,
            'future points',
            'Eight-appearance average × future games; missed games unmodelled.',
          ],
          [
            'forecast-form',
            'Scoring-form adjustment',
            estimate.formAdjustment,
            'future points',
            'Recent three vs eight scoring; zero under baseline.',
          ],
          [
            'forecast-workload',
            'Workload adjustment',
            estimate.workloadAdjustment,
            'future points',
            'Pass/kick attempts or carries/targets change; missing is not zero usage.',
          ],
          [
            'forecast-opponent',
            'Opponent adjustment',
            estimate.opponentAdjustment,
            'future points',
            'Opponent-position deviation over future games; excludes incomplete totals.',
          ],
          [
            'forecast-games',
            'Scheduled future games',
            estimate.futureGames,
            'games',
            'Byes/played games excluded; player availability unknown.',
          ],
          [
            'forecast-recorded',
            'Recorded points included',
            estimate.recordedPoints,
            'points',
            'Remaining scope zero; full season needs credited rows, absence is not zero.',
          ],
          [
            'forecast-lower',
            'Historical lower band sum',
            estimate.lower,
            unit,
            'Prior per-game tenth-percentile errors; no independence or season calibration.',
          ],
          [
            'forecast-upper',
            'Historical upper band sum',
            estimate.upper,
            unit,
            'Prior per-game ninetieth-percentile errors; role/injury changes may exceed.',
          ],
          [
            'forecast-mae',
            'Forecast mean absolute error',
            estimate.method === 'rolling-form-v1'
              ? estimate.evaluation.mae
              : estimate.evaluation.baselineMae,
            'points/game',
            'Position-cohort predictions before each tested week; not season validation.',
          ],
          [
            'forecast-test-weeks',
            'Earlier test weeks',
            estimate.evaluation.weeks,
            'weeks',
            'Grouped NFL weeks; player observations within a week dependent.',
          ],
          [
            'forecast-baseline-mae',
            'Baseline mean absolute error',
            estimate.evaluation.baselineMae,
            'points/game',
            'Eight-appearance mean on the same held-out observations.',
          ],
          [
            'forecast-candidate-mae',
            'Adjustment candidate mean absolute error',
            estimate.evaluation.candidateMae,
            'points/game',
            'Separate adjustment-model test; not the selected baseline error when adjustments were rejected.',
          ],
        ] as const)
          metric(suffix, label, value, metricUnit, {
            sourceIds: estimate.sourceIds,
            ...([
              'forecast-mae',
              'forecast-test-weeks',
              'forecast-baseline-mae',
              'forecast-candidate-mae',
            ].includes(suffix)
              ? { sampleSize: estimate.evaluation.cases }
              : {}),
            description,
          });
        evidence.warnings.push(...estimate.warnings);
      } else
        evidence.warnings.push(
          'Automatic season forecasting needs unique identity, supported scoring, fresh complete schedule/history, enough earlier tested weeks and no unknown current-game timing or missing credited-game rows. Import a scoring-matched forecast when this evidence is unavailable.',
        );
      if (input.scope === 'remaining-season' && !estimate)
        evidence.warnings.push(
          `Remaining-season value requires scoring-matched projections for ${input.season}, weeks ${input.week}–${input.throughWeek ?? 18}. Full-season points include already-played production and were not reused or reduced by historical scores.`,
        );
    } else if (input.scope === 'week' && completeScoring && rows.length >= 4) {
      evidence.projectedPoints = mean(evidence.historicalPoints.slice(0, 8));
      evidence.projectionScope = 'week';
      evidence.projectionMethod = 'historical-baseline';
      evidence.projectionSourceIds = [
        ...new Set([
          ...rows.slice(0, 8).flatMap(footballRowSourceIds),
          ...(evidence.position === 'DST' ? ['games'] : []),
        ]),
      ];
      metric(
        'baseline',
        '8-game historical scoring baseline',
        evidence.projectedPoints,
        'points/game',
        {
          sourceIds: evidence.projectionSourceIds,
          sampleSize: Math.min(8, rows.length),
          description:
            'Simple recent played-game average. Not opponent/injury adjusted, not a calibrated forecast.',
        },
      );
      evidence.warnings.push(
        'Historical baseline assumes the previous role continues. It excludes missed games and does not predict rookie development or role changes.',
      );
    }
    if (input.scope === 'week') {
      const upcoming = weekGames.get(nflTeamKey(player.nflTeam ?? '')) ?? [];
      if (
        player.nflTeam &&
        input.data.sources.some(
          (source) => source.id === 'games' && source.status === 'available',
        ) &&
        !upcoming.length
      ) {
        evidence.warnings.push(
          'No regular-season game is scheduled for this team in the selected week. Check for a bye.',
        );
        delete evidence.projectedPoints;
        const seasonWeeks = input.season >= 2021 ? 18 : 17;
        const teamSchedule = input.data.games.filter(
          (game) =>
            game.season === input.season &&
            game.seasonType === 'REG' &&
            (nflTeamKey(game.home) === nflTeamKey(player.nflTeam!) ||
              nflTeamKey(game.away) === nflTeamKey(player.nflTeam!)),
        );
        // An absent row in a partial schedule cannot establish a bye. Complete
        // regular seasons have exactly one idle week; ambiguous schedules stay unknown.
        if (
          input.week >= 1 &&
          input.week <= seasonWeeks &&
          teamSchedule.length === seasonWeeks - 1 &&
          new Set(teamSchedule.map((game) => game.id)).size === teamSchedule.length &&
          new Set(teamSchedule.map((game) => game.week)).size === teamSchedule.length &&
          teamSchedule.every((game) => game.week >= 1 && game.week <= seasonWeeks)
        )
          evidence.weeklyGameStatus = 'bye';
      }
      if (
        upcoming.length &&
        (upcoming.length !== 1 || !isUpcomingFootballGame(upcoming[0]!, input.asOf))
      ) {
        evidence.warnings.push(weeklyGameWithheldWarning);
        delete evidence.projectedPoints;
      }
      if (
        !input.data.sources.some((source) => source.id === 'games' && source.status === 'available')
      )
        evidence.warnings.push(
          'NFL schedule data is unavailable; current bye-week status cannot be verified.',
        );
    }
    if (player.status && isInactiveFootballStatus(player.status)) {
      evidence.warnings.push(
        `Recorded status is ${player.status}; omitted from active-lineup estimates. Confirm current availability.`,
      );
      delete evidence.projectedPoints;
    } else if (player.status && /questionable|doubtful|pup|nfi/i.test(player.status))
      evidence.warnings.push(
        `Recorded availability flag: ${player.status}. Recheck before kickoff.`,
      );
    evidence.metrics.push(
      ...buildPlayerMarketEvidence(player, input.data, input.league.platform === 'sleeper'),
    );
    for (const id of [
      ...new Set(evidence.projectionSourceIds.filter((id) => !id.startsWith('projection:'))),
    ]) {
      const source = input.data.sources.find((source) => source.id === id);
      if (
        !source?.retrievedAt ||
        source.status !== 'available' ||
        !Number.isFinite(Date.parse(source.retrievedAt)) ||
        Date.parse(input.asOf) - Date.parse(source.retrievedAt) > 48 * 60 * 60 * 1_000 ||
        Date.parse(source.retrievedAt) > Date.parse(input.asOf)
      ) {
        evidence.warnings.push(`${id}: source freshness is unknown or stale.`);
        if (evidence.position === 'DST' && evidence.projectionMethod !== 'imported')
          delete evidence.projectedPoints;
      }
    }
    // The owner's own take on this player, applied last so every projection source gets it.
    const nudge = playerNudge(input.preferences, input.league.id, player.id);
    if (nudge && evidence.projectedPoints !== undefined) {
      evidence.projectedPoints =
        Math.round(evidence.projectedPoints * (1 + nudge / 100) * 100) / 100;
      metric('owner-nudge', 'Your adjustment to this projection', nudge, 'percent', {
        description:
          'Set in Settings → Personalize → Player nudges; not part of the model or its backtest.',
      });
      evidence.warnings.push(
        `Includes your ${nudge > 0 ? '+' : ''}${nudge}% adjustment to this player's projection.`,
      );
    }
    return evidence;
  });
}

/** Preserve Sleeper identity even when the decision uses ESPN, Yahoo or GSIS identifiers. */
export function buildPlayerMarketEvidence(
  player: RosterPlayer,
  data: FootballDataSnapshot,
  sleeperLeague = false,
): AdviceMetric[] {
  const sleeperId = player.sleeperId ?? (sleeperLeague ? player.id : undefined);
  if (!sleeperId) return [];
  const rows = data.market.filter((item) => item.sleeperId === sleeperId);
  if (rows.length !== 1) return [];
  const activity = rows[0]!;
  if (
    !Number.isInteger(activity.lookbackHours) ||
    activity.lookbackHours < 1 ||
    activity.lookbackHours > 168
  )
    return [];
  return (['adds', 'drops'] as const).flatMap((field) => {
    const value = activity[field];
    if (value === undefined || !Number.isInteger(value) || value < 0) return [];
    return [
      {
        id: `${player.id}:market-${field}`,
        label: `Sleeper ${field} in the reported activity window`,
        value,
        unit: field,
        sourceIds: [field === 'adds' ? 'market-add' : 'market-drop'],
        description: `Matched Sleeper identifier; reported lookback ${activity.lookbackHours} hours. Platform behavior proxy, not overall opinion or player quality. Separately truncated lists; unlisted counts are unknown, not zero.`,
      },
    ];
  });
}

function statValues(rows: PlayerGameStats[], key: FootballStatKey): number[] {
  return rows.flatMap((row) => (row.stats[key] !== undefined ? [row.stats[key]!] : []));
}
export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1),
  );
}
