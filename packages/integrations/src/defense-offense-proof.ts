import { nflTeamKey, type FootballGame } from '@sidekick/core';

export interface OffensiveFumbleProof {
  gameId: string;
  team: string;
  touchdowns: number;
  sourceId: string;
}

export function defenseSummaryUrl(eventId: string) {
  if (!/^\d{9}$/.test(eventId)) throw new Error('Invalid defense summary identity.');
  return `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid defense summary record.');
  return value as Record<string, unknown>;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error('Invalid defense summary list.');
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value))
    throw new Error('Invalid defense play identity.');
  return value;
}

/** This proves observed offensive scores only. A fumble-return label alone cannot
 * distinguish offense, defense or special teams. Exhaustion of the independent
 * team total is checked separately before any missing defense event becomes zero. */
export function parseOffensiveFumbleProof(
  input: unknown,
  game: FootballGame,
): OffensiveFumbleProof[] {
  const eventId = game.espnId;
  if (!eventId || game.seasonType !== 'REG') throw new Error('Missing defense summary identity.');
  defenseSummaryUrl(eventId);
  const data = record(input),
    header = record(data.header),
    season = record(header.season);
  if (
    header.id !== eventId ||
    season.year !== game.season ||
    season.type !== 2 ||
    header.week !== game.week ||
    record(header.league).slug !== 'nfl'
  )
    throw new Error('Defense summary scope mismatch.');
  const competitions = list(header.competitions, 1);
  if (competitions.length !== 1) throw new Error('Missing defense competition.');
  const competition = record(competitions[0]);
  const status = record(record(competition.status).type);
  if (
    competition.id !== eventId ||
    status.completed !== true ||
    status.state !== 'post' ||
    status.name !== 'STATUS_FINAL'
  )
    throw new Error('Defense game is not final.');
  const date = competition.date;
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z$/.test(date) ||
    !Number.isFinite(Date.parse(date))
  )
    throw new Error('Invalid defense summary date.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(date));
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  if (
    `${part('year')}-${part('month')}-${part('day')}` !== game.date ||
    (game.kickoffAt && Date.parse(game.kickoffAt) !== Date.parse(date))
  )
    throw new Error('Defense summary date mismatch.');
  const competitors = list(competition.competitors, 2);
  if (competitors.length !== 2) throw new Error('Missing defense competitors.');
  const teams = new Map<string, string>();
  const sides = new Set<string>();
  for (const raw of competitors) {
    const competitor = record(raw),
      team = record(competitor.team);
    const id = identifier(competitor.id);
    const side = competitor.homeAway;
    if (
      typeof team.abbreviation !== 'string' ||
      team.id !== id ||
      (side !== 'home' && side !== 'away') ||
      sides.has(side) ||
      teams.has(id)
    )
      throw new Error('Conflicting defense competitors.');
    const key = nflTeamKey(team.abbreviation);
    const expected = side === 'home' ? game.home : game.away;
    const score = side === 'home' ? game.homeScore : game.awayScore;
    if (key !== nflTeamKey(expected) || score === undefined || competitor.score !== String(score))
      throw new Error('Defense summary game mismatch.');
    sides.add(side);
    teams.set(id, key);
  }
  const drives = list(record(data.drives).previous, 100);
  const plays = new Map<string, Record<string, unknown>>();
  for (const raw of drives) {
    for (const value of list(record(raw).plays, 100)) {
      const play = record(value),
        id = identifier(play.id);
      if (!id.startsWith(eventId) || plays.has(id)) throw new Error('Duplicate defense play.');
      plays.set(id, play);
    }
  }
  if (plays.size > 500) throw new Error('Too many defense plays.');
  const observed = new Map<string, number>(),
    seen = new Set<string>();
  for (const raw of list(data.scoringPlays, 100)) {
    const scoring = record(raw),
      id = identifier(scoring.id);
    if (!id.startsWith(eventId) || seen.has(id)) throw new Error('Duplicate defense score.');
    seen.add(id);
    const type = record(scoring.type);
    if (type.id !== '9' && type.id !== '39') continue;
    const expectedType = type.id === '9' ? 'Fumble Recovery (Own)' : 'Fumble Return Touchdown';
    if (type.text !== expectedType || record(scoring.scoringType).name !== 'touchdown')
      throw new Error('Conflicting fumble touchdown type.');
    for (const [field, maximum] of [
      ['homeScore', game.homeScore],
      ['awayScore', game.awayScore],
    ] as const) {
      const value = scoring[field];
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        maximum === undefined ||
        value > maximum
      )
        throw new Error('Invalid fumble touchdown score.');
    }
    const play = plays.get(id);
    if (!play) continue;
    const playType = record(play.type),
      start = record(play.start),
      end = record(play.end);
    const scorer = record(scoring.team),
      scorerId = identifier(scorer.id);
    const scorerTeam = teams.get(scorerId);
    if (
      !scorerTeam ||
      typeof scorer.abbreviation !== 'string' ||
      nflTeamKey(scorer.abbreviation) !== scorerTeam
    )
      throw new Error('Conflicting touchdown scorer.');
    if (
      playType.id !== type.id ||
      playType.text !== type.text ||
      record(play.scoringType).name !== 'touchdown' ||
      play.scoringPlay !== true ||
      play.homeScore !== scoring.homeScore ||
      play.awayScore !== scoring.awayScore
    )
      throw new Error('Conflicting scoring play.');
    const participants = list(play.teamParticipants, 2).map(record);
    if (
      participants.length !== 2 ||
      !participants.every((p) => typeof p.id === 'string' && teams.has(p.id)) ||
      new Set(participants.map((p) => p.id)).size !== 2
    )
      throw new Error('Invalid defense play participants.');
    const offense = participants.filter((p) => p.type === 'offense');
    const defense = participants.filter((p) => p.type === 'defense');
    // Fourth-down fakes, kicks, punts and returns are deliberately unresolved.
    // These observations establish only an ordinary offensive down with retained possession.
    if (
      offense.length !== 1 ||
      defense.length !== 1 ||
      offense[0]!.id !== scorerId ||
      record(start.team).id !== scorerId ||
      record(end.team).id !== scorerId ||
      ![1, 2, 3].includes(start.down as number) ||
      play.isTurnover !== false ||
      typeof play.text !== 'string' ||
      play.text.length > 4000 ||
      !/fumble/i.test(play.text) ||
      /punt|kickoff|kick off|blocked|field goal/i.test(play.text)
    )
      continue;
    observed.set(scorerTeam, (observed.get(scorerTeam) ?? 0) + 1);
  }
  return [...observed].map(([team, touchdowns]) => ({
    gameId: game.id,
    team,
    touchdowns,
    sourceId: `dst-offense-${eventId}`,
  }));
}
