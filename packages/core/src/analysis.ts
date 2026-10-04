import type { ReportKind, LeagueConnection, PlayerProjection } from './domain-types.js';
import { leagueSeasonPhase, boundedSettingInteger } from './league-status.js';
export function analyzeLeague(league: LeagueConnection, kind: ReportKind, style: string) {
  const titleByKind: Record<ReportKind, string> = {
    'offseason-update': `${league.displayName}: offseason check-in`,
    'draft-hype': `${league.displayName}: draft day is here`,
    'draft-review': `${league.displayName}: the draft receipts`,
    'power-rankings': `${league.displayName}: power rankings`,
    'matchup-preview': `${league.displayName}: matchup preview`,
  };
  const lead = `${league.teamCount}-team ${league.platform.toUpperCase()} league`;
  const scoring =
    Object.entries(league.scoring)
      .map(([key, value]) => `${key} ${value} pts`)
      .join(', ') || 'standard scoring settings';
  const ranking = rankTeams(league);
  const rankingText = ranking.basis
    ? ranking.teams
        .slice(0, 5)
        .map((team, index) => {
          const record =
            ranking.basis === 'wins'
              ? `, ${team.wins} wins${team.losses !== undefined ? `, ${team.losses} losses` : ''}${team.pointsFor !== undefined ? `, ${team.pointsFor.toFixed(1)} points for` : ''}`
              : `, ${team.pointsFor?.toFixed(1)} points for`;
          const place = ranking.places[index]!;
          const rankLabel = `${place.tied ? 'T-' : ''}${place.rank}`;
          return `${rankLabel}. ${team.name}${team.owner ? ` (${team.owner})` : ''}${record}`;
        })
        .join('\n')
    : 'Team data is incomplete; there is no reliable common metric for a standings ranking.';
  const body =
    kind === 'power-rankings'
      ? `${lead}, using ${scoring}.\n\n${rankingText}\n\nRanking basis: ${ranking.basis ?? 'unavailable'}${ranking.tieBreaker ? `; tie-breaker: ${ranking.tieBreaker}` : ''}. This is a standings-based snapshot, not a projection. Voice: ${style}.`
      : `${lead}, using ${scoring}.\n\n${kind === 'draft-hype' ? 'Draft board: clear your calendar, charge your phone, and prepare your best confident reach.' : kind === 'draft-review' ? 'Draft review: the picks are in. Let’s see who built a contender and who drafted purely for the group chat.' : kind === 'matchup-preview' ? 'Matchup preview: bring the receipts, check the lineups, and get ready for a week of questionable confidence.' : 'Offseason check-in: rosters are taking shape and the group chat is about to become a full-time job.'}\n\nVoice: ${style}. Connect an AI provider to generate a personalized breakdown from current player projections and news.`;
  return { title: titleByKind[kind], body, citations: [] as { title: string; url: string }[] };
}

/** Rank on a complete primary metric and use points-for only as a complete wins tiebreaker. */
export function rankTeams(league: LeagueConnection) {
  const hasStandingsSignal = league.teams.some(
    (team) => (team.wins ?? 0) > 0 || (team.losses ?? 0) > 0 || (team.pointsFor ?? 0) > 0,
  );
  const basis =
    hasStandingsSignal &&
    league.teams.length > 0 &&
    league.teams.every((team) => Number.isFinite(team.wins))
      ? 'wins'
      : hasStandingsSignal &&
          league.teams.length > 0 &&
          league.teams.every((team) => Number.isFinite(team.pointsFor))
        ? 'pointsFor'
        : undefined;
  const tieBreaker =
    basis === 'wins' && league.teams.every((team) => Number.isFinite(team.pointsFor))
      ? 'pointsFor'
      : undefined;
  const teams = [...league.teams].sort((left, right) => {
    if (basis === 'wins' && right.wins !== left.wins) return (right.wins ?? 0) - (left.wins ?? 0);
    if (basis === 'pointsFor' && right.pointsFor !== left.pointsFor)
      return (right.pointsFor ?? 0) - (left.pointsFor ?? 0);
    if (tieBreaker === 'pointsFor' && right.pointsFor !== left.pointsFor)
      return (right.pointsFor ?? 0) - (left.pointsFor ?? 0);
    return 0;
  });
  let currentRank = 0;
  const ranks = teams.map((team, index) => {
    const previous = teams[index - 1];
    const tied =
      previous !== undefined &&
      (basis === 'wins'
        ? team.wins === previous.wins &&
          (tieBreaker !== 'pointsFor' || team.pointsFor === previous.pointsFor)
        : basis === 'pointsFor' && team.pointsFor === previous.pointsFor);
    if (!tied) currentRank = index + 1;
    return currentRank;
  });
  const rankCounts = new Map<number, number>();
  for (const rank of ranks) rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  const places = ranks.map((rank) => ({ rank, tied: (rankCounts.get(rank) ?? 0) > 1 }));
  return { basis, tieBreaker, teams, places };
}

/** Provide cautious preseason power-ranking evidence from one complete owner-confirmed source. */
function preseasonRosterProjectionEvidence(
  league: LeagueConnection,
  projections: PlayerProjection[],
): string | undefined {
  if (
    league.teams.length === 0 ||
    league.teams.length > 32 ||
    league.teams.length !== league.teamCount
  )
    return undefined;

  const sources = projectionSourceGroups(projections)
    .map((source) => ({
      ...source,
      projections: source.projections.filter((projection) => projection.week === undefined),
    }))
    .filter(
      (source) =>
        source.projections.length > 0 &&
        source.projections.every((projection) => projection.scoringMatched === true),
    )
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  const source = sources[0];
  if (!source) return undefined;

  const projectionsById = new Map<string, PlayerProjection[]>();
  const projectionsByName = new Map<string, PlayerProjection[]>();
  for (const projection of source.projections) {
    if (projection.playerId) {
      const matches = projectionsById.get(projection.playerId) ?? [];
      matches.push(projection);
      projectionsById.set(projection.playerId, matches);
    }
    const name = projectionNameKey(projection.playerName);
    if (name) {
      const matches = projectionsByName.get(name) ?? [];
      matches.push(projection);
      projectionsByName.set(name, matches);
    }
  }

  const projectedTeams = [] as Array<{ name: string; total: number; rosterSize: number }>;
  const rosterSizes = new Set<number>();
  for (const team of league.teams) {
    const roster = team.roster;
    if (
      !roster?.length ||
      roster.length > 100 ||
      team.rosterSize !== roster.length ||
      !Number.isInteger(team.rosterSize)
    )
      return undefined;
    const teamProjections: PlayerProjection[] = [];
    for (const player of roster) {
      const byId = projectionsById.get(player.id) ?? [];
      const byName = projectionsByName.get(projectionNameKey(player.name)) ?? [];
      const matched =
        byId.length === 1 &&
        projectionNameKey(byId[0]!.playerName) === projectionNameKey(player.name)
          ? byId[0]
          : byId.length === 0 && byName.length === 1
            ? byName[0]
            : undefined;
      if (!matched || !Number.isFinite(matched.projectedPoints)) return undefined;
      teamProjections.push(matched);
    }
    rosterSizes.add(roster.length);
    projectedTeams.push({
      name: team.name,
      total: teamProjections.reduce((total, projection) => total + projection.projectedPoints, 0),
      rosterSize: roster.length,
    });
  }
  if (rosterSizes.size !== 1) return undefined;

  const ordered = projectedTeams
    .sort((left, right) => right.total - left.total)
    .map(
      (team, index) =>
        `${index + 1}. ${JSON.stringify(team.name)}: ${team.total.toFixed(1)} projected points across ${team.rosterSize} rostered players`,
    );
  return `No comparable played-season standings are available. The newest owner-confirmed season projection source is ${JSON.stringify(source.sourceName)}${source.sourceUrl ? ` (${source.sourceUrl})` : ''}, imported ${source.importedAt}. Exact player IDs or unique normalized names matched every player in complete, equal-size roster snapshots. Full-roster projection totals (bench included), ordered high to low: ${ordered.join('; ')}. Use this only for a clearly labeled AI preseason power ranking, not as a starting-lineup projection, standings result, or win forecast. Treat the owner-confirmed scoring alignment and projection source as unverified estimates.`;
}

/** Tell the model what the connected snapshot cannot support, report by report. */
export function reportEvidenceGuidance(
  league: LeagueConnection,
  kind: ReportKind,
  projections: PlayerProjection[] = [],
): string {
  if (kind === 'power-rankings') {
    const { basis, tieBreaker } = rankTeams(league);
    const preseasonEvidence = basis
      ? undefined
      : preseasonRosterProjectionEvidence(league, projections);
    const rankingGuidance = basis
      ? `Rank only from the comparable team snapshot using ${basis}${basis === 'wins' ? (tieBreaker === 'pointsFor' ? ' and use pointsFor as the tie-breaker because every team has a value' : '; keep equal records tied because complete pointsFor tie-break data is unavailable') : ''}; state that this is not a projection.`
      : (preseasonEvidence ??
        'There is no complete shared record or points-for metric across all teams, and complete owner-confirmed roster projections are unavailable; say rankings are unavailable instead of inventing an order.');
    return `${rankingGuidance} ${leagueSeasonPhaseGuidance(league)}`;
  }
  const hasRosterPlayers = league.teams.some((team) => (team.roster?.length ?? 0) > 0);
  if (kind === 'matchup-preview') {
    const matchups = league.matchups ?? [];
    if (!matchups.length)
      return 'No current matchup data is available. Say so and do not invent opponents, projections, or lineup details.';

    const teamNames = new Map(league.teams.map((team) => [team.id, team.name]));
    const pairings = matchups.slice(0, 24).map((matchup) => {
      const sides = matchup.teams.slice(0, 2).map((side) => {
        const label = teamNames.get(side.teamId);
        const name = label ? JSON.stringify(label) : `team ID ${JSON.stringify(side.teamId)}`;
        return `${name}${side.points !== undefined ? ` (${side.points} platform-reported points)` : ''}`;
      });
      return `week ${matchup.week}: ${sides.join(' vs ')}`;
    });
    const scoreContext = matchups.some((matchup) =>
      matchup.teams.some((side) => side.points !== undefined),
    )
      ? 'Scores are the platform snapshot only; the connection does not establish whether they are live or final.'
      : 'No scores are available in this snapshot.';
    const injuryEvidence = platformAvailabilityEvidence(league);
    return `Available pairings: ${pairings.join('; ')}. ${scoreContext} ${leagueSeasonPhaseGuidance(league)} ${hasRosterPlayers ? 'Roster snapshots are available for player-name context.' : 'Player-level rosters are not available.'} ${injuryEvidence} ${matchupProjectionEvidence(league, projections)} Do not call platform scores projections, infer winners from an in-progress score, give unsupported lineup advice, or infer diagnosis or return dates from a roster status.`;
  }
  if (kind === 'draft-review')
    return league.draft?.picks.length
      ? `The draft pick log contains ${league.draft.picks.length} ${league.draft.picks.length === 1 ? 'pick' : 'picks'}${league.draft.status ? ` and draft status ${league.draft.status}` : ''}. Discuss the logged picks and current roster context. ${draftProjectionEvidence(league, projections)}`
      : hasRosterPlayers
        ? `Current roster players are available, but this snapshot has no draft pick log or pick order. Discuss current roster construction only; do not attribute players to draft rounds. ${draftProjectionEvidence(league, projections)}`
        : `This snapshot has no draft pick log or player-level roster data. Explain the data gap. ${draftProjectionEvidence(league, projections)}`;
  if (kind === 'draft-hype')
    return 'No draft date, draft order, or live draft room status is available. Keep this as general draft-day hype and do not invent logistics.';
  return hasRosterPlayers
    ? 'Current roster players are available, but there is no transaction history or historical roster snapshot. Keep offseason claims limited to current roster construction, standings, and supplied news.'
    : 'This snapshot has no transaction history or player-level roster data. Keep offseason claims general unless supported by the supplied standings or news.';
}

function leagueSeasonPhaseGuidance(league: LeagueConnection): string {
  const currentWeek = boundedSettingInteger(league.settings.currentWeek);
  const playoffStartWeek =
    boundedSettingInteger(league.settings.playoffStartWeek) ??
    boundedSettingInteger(league.settings.playoff_start_week) ??
    boundedSettingInteger(league.settings.playoff_week_start);
  switch (leagueSeasonPhase(league)) {
    case 'offseason':
      return 'Sleeper reports a pre-draft or draft phase. Do not describe weekly matchups as underway; owner-scheduled one-time draft reports remain available.';
    case 'regular-season':
      return `The platform settings identify regular-season week ${currentWeek}; do not describe playoff stakes.`;
    case 'playoffs':
      if (league.settings.playoffStartWeekSource === 'derived')
        return `ESPN's schedule settings suggest playoff week ${currentWeek} (estimated start week ${playoffStartWeek}). Treat this phase as inferred; discuss postseason stakes only when supported by supplied matchups and standings, and do not infer elimination or bracket rules.`;
      return `The platform settings identify playoff week ${currentWeek} (playoffs start in week ${playoffStartWeek}). Discuss postseason stakes only when supported by supplied matchups and standings; do not infer elimination or bracket rules.`;
    case 'complete':
      return 'The platform marks this league season complete; do not describe matchups as upcoming.';
    default:
      return 'The platform snapshot does not confirm season phase. Do not claim a team is in or out of the playoffs or invent postseason stakes.';
  }
}

/** Match owner-imported season projections to picks and compute conservative points-above-replacement evidence. */
function draftProjectionEvidence(
  league: LeagueConnection,
  projections: PlayerProjection[],
): string {
  if (!projections.length)
    return 'No owner-imported projections are available; do not invent projections or grade pick value.';
  const seasonSources = projectionSourceGroups(projections)
    .map((source) => ({
      ...source,
      projections: source.projections.filter((projection) => projection.week === undefined),
    }))
    .filter((source) => source.projections.length > 0)
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  const scoringMatchedSources = seasonSources.filter((source) =>
    source.projections.every((projection) => projection.scoringMatched === true),
  );
  const primarySource = scoringMatchedSources[0];
  const seasonProjections = primarySource?.projections ?? [];
  if (!seasonProjections.length)
    return seasonSources.length
      ? 'Season projection files are available, but none is confirmed by the owner as matching this league’s scoring settings. Do not use their point totals, ADP, or positional baselines for draft grades.'
      : 'Only week-specific projections were imported; there are no season projections for draft value analysis.';
  const adpSources = scoringMatchedSources.filter((source) =>
    source.projections.some((projection) => projection.averageDraftPosition !== undefined),
  );
  const adpSourceDetails = adpSources.map(
    (source) =>
      `${JSON.stringify(source.sourceName)}${source.sourceUrl ? ` (${JSON.stringify(source.sourceUrl)})` : ''}, imported ${source.importedAt}`,
  );
  const metadata = `Owner-imported season projections from ${JSON.stringify(primarySource!.sourceName)}, imported ${primarySource!.importedAt}${primarySource!.sourceUrl ? `, source URL ${JSON.stringify(primarySource!.sourceUrl)}` : ''}; the owner confirms this source uses the league's scoring settings, which is not independently verified. ${adpSources.length ? `Owner-supplied ADP sources: ${adpSourceDetails.join('; ')}. ADP source independence and accuracy are not independently verified.` : 'These are estimates, not ADP or actual outcomes.'} ${adpSources.length >= 3 ? 'Player ADP evidence uses the median across at least three distinct imported source sets when the player is matched in each.' : `Only ${adpSources.length} scoring-matched ADP source set(s) are available; multi-source ADP evidence requires at least 3.`}`;
  const picks = league.draft?.picks ?? [];
  if (!picks.length) return `${metadata} No draft picks can be matched in this snapshot.`;

  const byId = new Map(
    seasonProjections.flatMap((projection) =>
      projection.playerId ? [[projection.playerId, projection] as const] : [],
    ),
  );
  const byName = new Map<string, PlayerProjection[]>();
  for (const projection of seasonProjections) {
    const name = projectionNameKey(projection.playerName);
    const matches = byName.get(name) ?? [];
    matches.push(projection);
    byName.set(name, matches);
  }

  const slots = Array.isArray(league.settings.roster_positions)
    ? league.settings.roster_positions
    : [];
  const includesFlexibleStarters = slots.some((slot) => {
    if (typeof slot !== 'string') return false;
    return [
      'FLEX',
      'FLX',
      'WRT',
      'RECFLEX',
      'WRRBFLEX',
      'WRTQB',
      'QBRBWRTE',
      'SUPERFLEX',
      'OP',
    ].includes(
      slot
        .trim()
        .toUpperCase()
        .replace(/[\s/_-]/g, ''),
    );
  });
  const pools = new Map<string, PlayerProjection[]>();
  for (const projection of seasonProjections) {
    const position = normalizeProjectionPosition(projection.position ?? '');
    if (!position) continue;
    const pool = pools.get(position) ?? [];
    pool.push(projection);
    pools.set(position, pool);
  }
  for (const pool of pools.values())
    pool.sort((left, right) => right.projectedPoints - left.projectedPoints);
  const replacementBaselines = draftReplacementBaselines(league.teamCount, slots, pools);

  const teamValue = new Map<
    string,
    { points: number; picks: number; complete: boolean; adpDelta: number; adpPicks: number }
  >();
  let allLoggedPicksSupported = picks.length <= 240;
  let allLoggedPicksHaveAdp = picks.length > 0 && picks.length <= 240;
  const pickEvidence = picks.slice(0, 240).flatMap((pick) => {
    const teamTotal = pick.teamId
      ? (teamValue.get(pick.teamId) ?? {
          points: 0,
          picks: 0,
          complete: true,
          adpDelta: 0,
          adpPicks: 0,
        })
      : undefined;
    if (teamTotal) {
      teamTotal.picks += 1;
      teamValue.set(pick.teamId!, teamTotal);
    } else {
      allLoggedPicksSupported = false;
    }
    const name = pick.playerName?.trim();
    const projection =
      byId.get(pick.playerId) ??
      (name
        ? byName.get(projectionNameKey(name))?.length === 1
          ? byName.get(projectionNameKey(name))![0]
          : undefined
        : undefined);
    if (!projection) {
      allLoggedPicksSupported = false;
      allLoggedPicksHaveAdp = false;
      if (teamTotal) teamTotal.complete = false;
      return [];
    }
    const position = normalizeProjectionPosition(projection.position ?? pick.position ?? '');
    let replacement = '';
    let pointsAboveReplacement: number | undefined;
    if (position) {
      const baseline = replacementBaselines.get(position);
      if (baseline) {
        const value = projection.projectedPoints - baseline.projectedPoints;
        pointsAboveReplacement = value;
        replacement = `; ${value >= 0 ? '+' : ''}${value.toFixed(1)} projected points versus ${position} replacement (${baseline.projectedPoints.toFixed(1)})`;
      }
    }
    if (teamTotal) {
      if (pointsAboveReplacement === undefined) {
        teamTotal.complete = false;
        allLoggedPicksSupported = false;
      } else {
        teamTotal.points += pointsAboveReplacement;
      }
    }
    const pickLabel =
      pick.pickNumber !== undefined ? `pick ${pick.pickNumber}` : `round ${pick.round ?? '?'}`;
    const adpConsensus = multiSourceAdp(projection, adpSources);
    const adpComparison =
      adpConsensus && pick.pickNumber !== undefined
        ? `; selected ${pick.pickNumber - adpConsensus.median >= 0 ? `${(pick.pickNumber - adpConsensus.median).toFixed(1)} picks later` : `${(adpConsensus.median - pick.pickNumber).toFixed(1)} picks earlier`} than the ${adpConsensus.median.toFixed(1)} median ADP from ${adpConsensus.sourceCount} sources`
        : '';
    if (!adpConsensus || pick.pickNumber === undefined) {
      allLoggedPicksHaveAdp = false;
    } else if (teamTotal) {
      // Positive means the player was selected later than the multi-source median ADP.
      teamTotal.adpDelta += pick.pickNumber - adpConsensus.median;
      teamTotal.adpPicks += 1;
    } else {
      allLoggedPicksHaveAdp = false;
    }
    return [
      `${pickLabel}: ${JSON.stringify(projection.playerName)} (${position || 'position unavailable'}), ${projection.projectedPoints.toFixed(1)} projected season points${replacement}${adpComparison}`,
    ];
  });
  const lines = pickEvidence.length
    ? pickEvidence.join('; ')
    : 'No logged picks matched unambiguously to an imported projection.';
  const teamNames = new Map(league.teams.map((team) => [team.id, team.name]));
  const teamTotals = [...teamValue.entries()];
  const supportedTeamTotals =
    allLoggedPicksSupported &&
    teamTotals.length > 0 &&
    teamTotals.every(([, value]) => value.complete);
  const teamSummary = supportedTeamTotals
    ? ` Logged-pick projected surplus versus positional replacement by team: ${teamTotals
        .map(
          ([teamId, value]) =>
            `${JSON.stringify(teamNames.get(teamId) ?? teamId)} ${value.points >= 0 ? '+' : ''}${value.points.toFixed(1)} points across ${value.picks} picks`,
        )
        .join(
          '; ',
        )}. This compares only logged picks against the imported positional baseline; it is not a full-season outcome grade.`
    : 'A comparable team-level draft total is unavailable because one or more logged picks lack an unambiguous projection, team, position, or supported positional replacement baseline.';
  const confirmedComplete = /^(complete|completed|finished)$/i.test(league.draft?.status ?? '');
  const teamAdpTotals =
    confirmedComplete && allLoggedPicksHaveAdp && teamTotals.length > 0
      ? ` Team-level ADP timing across all logged picks: ${teamTotals
          .map(([teamId, value]) => {
            const averageDelta = value.adpDelta / value.adpPicks;
            const direction =
              averageDelta >= 0
                ? `${averageDelta.toFixed(1)} overall picks later`
                : `${Math.abs(averageDelta).toFixed(1)} overall picks earlier`;
            return `${JSON.stringify(teamNames.get(teamId) ?? teamId)} averaged ${direction} than the multi-source median ADP across ${value.adpPicks} matched picks`;
          })
          .join('; ')}. This is descriptive timing, not an outcome grade.`
      : ' A team-level ADP timing summary is withheld because the platform does not confirm a completed draft, every pick lacks an overall pick number or a player matched across at least three imported ADP sources, or team assignment is incomplete.';
  const hasCompleteGradeEvidence =
    confirmedComplete && supportedTeamTotals && allLoggedPicksHaveAdp && teamTotals.length > 0;
  const gradeGuidance = hasCompleteGradeEvidence
    ? 'If giving tentative team process grades, base them only on the complete owner-supplied points-above-replacement and ADP evidence above; label both as estimates and do not present a process grade as a player outcome.'
    : 'Do not assign team draft grades because the confirmed completed draft, three-source ADP matches, or positional replacement evidence is incomplete.';
  const flexibleStarterNote = includesFlexibleStarters
    ? 'Flex, receiver-flex, and superflex replacement slots are allocated to the eligible position with the strongest next imported projection; this is a projection-based approximation.'
    : '';
  return `${metadata} ${flexibleStarterNote} Matched pick evidence: ${lines}.${teamSummary}${teamAdpTotals} ${gradeGuidance} Use points-above-replacement only when the positional baseline is present; without a baseline, discuss the imported projected points without assigning a value grade. Treat ADP comparisons as descriptive timing only, not proof that a selection was good or bad. The multi-source ADP median is owner-supplied and not independently verified market consensus, a guarantee, or injury information.`;
}

type ProjectionSourceGroup = {
  id: string;
  sourceName: string;
  sourceUrl?: string;
  importedAt: string;
  projections: PlayerProjection[];
};

function projectionSourceGroups(projections: PlayerProjection[]): ProjectionSourceGroup[] {
  const groups = new Map<string, ProjectionSourceGroup>();
  for (const projection of projections) {
    const id =
      projection.sourceId ??
      `legacy:${projection.sourceName.trim().toLowerCase()}\u0000${projection.sourceUrl ?? ''}`;
    const group = groups.get(id) ?? {
      id,
      sourceName: projection.sourceName,
      ...(projection.sourceUrl ? { sourceUrl: projection.sourceUrl } : {}),
      importedAt: projection.importedAt,
      projections: [],
    };
    group.projections.push(projection);
    if (projection.importedAt > group.importedAt) group.importedAt = projection.importedAt;
    groups.set(id, group);
  }
  return [...groups.values()];
}

function multiSourceAdp(
  target: PlayerProjection,
  sources: ProjectionSourceGroup[],
): { median: number; sourceCount: number } | undefined {
  const values: number[] = [];
  for (const source of sources) {
    const exactMatches = target.playerId
      ? source.projections.filter((projection) => projection.playerId === target.playerId)
      : [];
    const nameMatches = source.projections.filter(
      (projection) =>
        projectionNameKey(projection.playerName) === projectionNameKey(target.playerName),
    );
    const match =
      exactMatches.length === 1
        ? exactMatches[0]
        : exactMatches.length > 1
          ? undefined
          : nameMatches.length === 1
            ? nameMatches[0]
            : undefined;
    if (match?.averageDraftPosition !== undefined) values.push(match.averageDraftPosition);
  }
  if (values.length < 3) return undefined;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0 ? (values[middle - 1]! + values[middle]!) / 2 : values[middle]!;
  return { median, sourceCount: values.length };
}

/** Compare imported weekly projections only for a complete, platform-reported lineup snapshot. */
function matchupProjectionEvidence(
  league: LeagueConnection,
  projections: PlayerProjection[],
): string {
  const allWeeklySources = projectionSourceGroups(projections)
    .map((source) => ({
      ...source,
      projections: source.projections.filter((projection) => projection.week !== undefined),
    }))
    .filter((source) => source.projections.length > 0)
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  const weeklySources = allWeeklySources.filter((source) =>
    source.projections.every((projection) => projection.scoringMatched === true),
  );
  if (!weeklySources.length)
    return allWeeklySources.length
      ? 'Week-specific projection files exist, but none is confirmed by the owner as matching this league’s scoring settings; do not calculate matchup totals or winners from them.'
      : 'No owner-imported week-specific projections are available; do not invent projected scores or winners.';
  const teamNames = new Map(league.teams.map((team) => [team.id, team.name]));
  const selectedSources = new Map<string, ProjectionSourceGroup>();
  const estimates = (league.matchups ?? []).slice(0, 24).flatMap((matchup) => {
    const source = weeklySources.find((candidate) =>
      candidate.projections.some((projection) => projection.week === matchup.week),
    );
    if (!source) return [];
    selectedSources.set(source.id, source);
    const weekProjections = source.projections.filter(
      (projection) => projection.week === matchup.week,
    );
    if (weekProjections.length === 0) return [];
    const byId = new Map(
      weekProjections.flatMap((projection) =>
        projection.playerId ? [[projection.playerId, projection] as const] : [],
      ),
    );
    const sides = matchup.teams.slice(0, 2).map((team) => {
      const starters = matchupStarterIds(league, team.teamId, team.starters);
      if (starters.length === 0) return undefined;
      const matched = starters.map((id) => byId.get(id));
      if (matched.some((projection) => projection === undefined)) return undefined;
      const total = matched.reduce((sum, projection) => sum + projection!.projectedPoints, 0);
      return `${JSON.stringify(teamNames.get(team.teamId) ?? team.teamId)} ${total.toFixed(1)}`;
    });
    if (sides.length !== 2 || sides.some((side) => side === undefined)) return [];
    return [`week ${matchup.week}: ${sides[0]} vs ${sides[1]}`];
  });
  if (!estimates.length)
    return 'Week-specific projections are imported, but no matchup has a complete starter-ID and projection match; do not estimate a team total or winner.';
  const sourcesText = [...selectedSources.values()]
    .map(
      (source) =>
        `${JSON.stringify(source.sourceName)}${source.sourceUrl ? ` (${JSON.stringify(source.sourceUrl)})` : ''}, imported ${source.importedAt}`,
    )
    .join('; ');
  const lineupFreshness = league.lastSyncedAt
    ? `Starter assignments came from the platform snapshot last synced ${league.lastSyncedAt}; confirm current lineups before kickoff.`
    : 'The starter snapshot has no recorded sync time; confirm current lineups before kickoff.';
  return `Imported week-specific projection estimates from ${sourcesText}; the owner confirms these sources use the league's scoring settings, which is not independently verified. Complete starter-based totals: ${estimates.join('; ')}. ${lineupFreshness} These are model-independent sums of the owner's imported estimates, not platform scores or guaranteed outcomes. Do not treat incomplete or unmatched lineups as projected totals.`;
}

function matchupStarterIds(
  league: LeagueConnection,
  teamId: string,
  reportedStarters: string[] | undefined,
): string[] {
  if (reportedStarters !== undefined) {
    if (
      reportedStarters.length === 0 ||
      reportedStarters.some((id) => id === '0' || id.trim() === '') ||
      new Set(reportedStarters).size !== reportedStarters.length
    )
      return [];
    return reportedStarters;
  }
  const team = league.teams.find((candidate) => candidate.id === teamId);
  const roster = team?.roster;
  if (!team || !roster?.length || team.rosterSize !== roster.length) return [];
  const starters: string[] = [];
  for (const player of roster) {
    const slot = player.rosterPosition?.trim().toUpperCase().replace(/[ _-]/g, '') ?? '';
    if (['BN', 'BENCH', 'BE', 'IR', 'IR+', 'NA', 'RES', 'SUSP'].includes(slot)) continue;
    // An unrecognized or missing slot makes the whole roster snapshot incomplete for projections.
    if (!slot || !normalizeProjectionPosition(slot)) return [];
    starters.push(player.id);
  }
  return new Set(starters).size === starters.length ? starters : [];
}

/**
 * Allocate flex starters to the strongest next projected player across eligible positions.
 * Unknown slots or incomplete pools for a flex-eligible position invalidate the model; a
 * missing fixed-position pool only withholds that position's baseline.
 */
function draftReplacementBaselines(
  teamCount: number,
  slots: unknown[],
  pools: ReadonlyMap<string, PlayerProjection[]>,
): Map<string, PlayerProjection> {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 32 || !slots.length)
    return new Map();

  const fixedStarters = new Map<string, number>();
  const flexibleSlots: string[][] = [];
  const reservedSlots = new Set([
    'BN',
    'BE',
    'BENCH',
    'IR',
    'IR+',
    'NA',
    'RES',
    'SUSP',
    'TAXI',
    'PUP',
    'NFI',
  ]);
  const flexEligibility: Record<string, string[]> = {
    FLEX: ['RB', 'WR', 'TE'],
    FLX: ['RB', 'WR', 'TE'],
    WRT: ['RB', 'WR', 'TE'],
    RECFLEX: ['WR', 'TE'],
    WRRBFLEX: ['RB', 'WR'],
    WRTQB: ['QB', 'RB', 'WR', 'TE'],
    QBRBWRTE: ['QB', 'RB', 'WR', 'TE'],
    SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
    OP: ['QB', 'RB', 'WR', 'TE'],
  };

  for (const rawSlot of slots) {
    if (typeof rawSlot !== 'string') return new Map();
    const compactSlot = rawSlot
      .trim()
      .toUpperCase()
      .replace(/[\s/_-]/g, '');
    if (reservedSlots.has(compactSlot)) continue;
    const eligibility = flexEligibility[compactSlot];
    if (eligibility) {
      flexibleSlots.push(eligibility);
      continue;
    }
    const position = normalizeProjectionPosition(rawSlot);
    if (!['QB', 'RB', 'WR', 'TE', 'DST', 'K'].includes(position)) return new Map();
    fixedStarters.set(position, (fixedStarters.get(position) ?? 0) + 1);
  }

  if (fixedStarters.size === 0 && flexibleSlots.length === 0) return new Map();
  const starterCounts = new Map(
    [...fixedStarters].map(([position, count]) => [position, count * teamCount]),
  );
  for (const eligibility of flexibleSlots) {
    for (let teamSlot = 0; teamSlot < teamCount; teamSlot += 1) {
      if (eligibility.some((position) => !pools.get(position)?.[starterCounts.get(position) ?? 0]))
        return new Map();
      let selected: { position: string; projectedPoints: number } | undefined;
      for (const position of eligibility) {
        const candidate = pools.get(position)?.[starterCounts.get(position) ?? 0];
        if (candidate && (!selected || candidate.projectedPoints > selected.projectedPoints))
          selected = { position, projectedPoints: candidate.projectedPoints };
      }
      if (!selected) return new Map();
      starterCounts.set(selected.position, (starterCounts.get(selected.position) ?? 0) + 1);
    }
  }

  const baselines = new Map<string, PlayerProjection>();
  for (const [position, count] of starterCounts) {
    const baseline = pools.get(position)?.[count - 1];
    if (baseline) baselines.set(position, baseline);
  }
  return baselines;
}

function projectionNameKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeProjectionPosition(value: string): string {
  const position = value
    .trim()
    .toUpperCase()
    .replace(/[\/ -]+/g, '');
  if (position === 'DEF' || position === 'DST') return 'DST';
  if (['QB', 'RB', 'WR', 'TE', 'K'].includes(position)) return position;
  if (['SUPERFLEX', 'WRTQB', 'QBRBWRTE', 'OP'].includes(position)) return 'SUPERFLEX';
  if (['FLEX', 'FLX', 'WRT', 'RECFLEX', 'WRRBFLEX'].includes(position)) return 'FLEX';
  if (position === 'BN' || position === 'BENCH') return 'BENCH';
  if (position === 'IR') return 'IR';
  return '';
}

/** Include only known availability labels; provider roster status is not a medical report. */
function platformAvailabilityEvidence(league: LeagueConnection): string {
  const allowed = new Set([
    'QUESTIONABLE',
    'DOUBTFUL',
    'OUT',
    'IR',
    'INJURED RESERVE',
    'INJURY RESERVE',
    'PUP',
    'PUP LIST',
    'PHYSICALLY UNABLE TO PERFORM',
    'NFI',
    'NON FOOTBALL INJURY',
    'SUSPENDED',
  ]);
  const statuses = league.teams.flatMap((team) =>
    (team.roster ?? []).flatMap((player) => {
      const status = player.status
        ?.trim()
        .replace(/[\s_-]+/g, ' ')
        .toUpperCase();
      if (!status || !allowed.has(status)) return [];
      return [`${JSON.stringify(player.name)}: ${JSON.stringify(status)}`];
    }),
  );
  if (!statuses.length)
    return 'No non-active availability tags were supplied by the connected platform.';
  const evidence = statuses.slice(0, 30).join('; ');
  const omitted = statuses.length > 30 ? `; ${statuses.length - 30} additional tags omitted` : '';
  const synced = league.lastSyncedAt ? ` at ${league.lastSyncedAt}` : ' (sync time unavailable)';
  return `Platform-reported roster availability as of the last league sync${synced}: ${evidence}${omitted}. Treat these labels as potentially stale roster data, not verified injury reports.`;
}
