import { nflTeamKey } from './advice-math.js';
import { projectionRange } from './fantasy-projection.js';
import { fantasyOutcomeSpread, matchupVarianceScale } from './fantasy-projection-settings.js';

export type LiveGameState = 'pre' | 'in' | 'post' | 'bye' | 'unknown';

export interface LiveStarterInput {
  id: string;
  name: string;
  position: string;
  nflTeam?: string;
  estimate?: number;
  /** Chance he plays, when listed Questionable; counted until his game starts. */
  playChance?: number;
  /** Points so far from the NFL box score under this league's rules; set once a game starts. */
  livePoints?: number;
  /**
   * Not playing: listed Out or inactive before his game, or missing from the box score of a game
   * under way while listed so. Counts as zero points, never as an unknown estimate.
   */
  out?: true;
}

export interface LiveSide {
  teamId: string;
  name: string;
  /**
   * Score so far: the platform's when it has one, otherwise the sum of starters' box-score points
   * (undefined if any started starter could not be scored).
   */
  points?: number;
  scoreSource?: 'platform' | 'box-score';
  /** Score so far plus estimates for starters whose games have not started. */
  projectedFinal?: number;
  starters: (LiveStarterInput & { state: LiveGameState; detail?: string })[];
  yetToPlay: number;
  playing: number;
}

export interface LiveMatchup {
  you: LiveSide;
  opponent: LiveSide;
  /** Chance you finish ahead; present only when both sides have scores and estimates. */
  winChance?: number;
}

/** Normal cumulative distribution (Abramowitz–Stegun 7.1.26). */
function normal(z: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Combines platform matchup points, NFL game states and weekly estimates.
 *
 * Projected final adds estimates only for starters whose games have not kicked off; players in
 * progress are already partly counted in the platform score, so they add nothing further. The win
 * chance is a normal approximation: unplayed starters use the position spreads fitted on past
 * results (calibrated before kickoff), and each player mid-game adds a flat 3-point spread, which
 * is untested.
 */
export function liveMatchup(
  sides: {
    you: { teamId: string; name: string; points?: number; starters: LiveStarterInput[] };
    opponent: { teamId: string; name: string; points?: number; starters: LiveStarterInput[] };
  },
  games: { home: string; away: string; state: 'pre' | 'in' | 'post'; detail: string }[],
  byeTeams: string[] = [],
): LiveMatchup {
  const byTeam = new Map<string, (typeof games)[number]>();
  for (const game of games) {
    byTeam.set(nflTeamKey(game.home), game);
    byTeam.set(nflTeamKey(game.away), game);
  }
  const byes = new Set(byeTeams.map(nflTeamKey));
  let variance = 0;
  const side = (input: (typeof sides)['you']): LiveSide => {
    let unknownRemaining = false;
    let remaining = 0;
    const starters = input.starters.map((starter) => {
      const team = starter.nflTeam ? nflTeamKey(starter.nflTeam) : undefined;
      const game = team ? byTeam.get(team) : undefined;
      const state: LiveGameState = game ? game.state : team && byes.has(team) ? 'bye' : 'unknown';
      if ((state === 'pre' || state === 'unknown') && !starter.out) {
        if (starter.estimate === undefined) unknownRemaining = true;
        else {
          const p = starter.playChance ?? 1;
          remaining += p * starter.estimate;
          const range = projectionRange(starter.position, starter.estimate, fantasyOutcomeSpread);
          const sd = range?.sd ?? 0.45 * starter.estimate;
          // A mix of zero and the estimate (see matchupWinProbability).
          variance += matchupVarianceScale * (p * sd ** 2 + p * (1 - p) * starter.estimate ** 2);
        }
      }
      return { ...starter, state, ...(game?.detail ? { detail: game.detail } : {}) };
    });
    const started = starters.filter((s) => s.state === 'in' || s.state === 'post');
    const boxScore = started.every((s) => s.livePoints !== undefined)
      ? Math.round(started.reduce((sum, s) => sum + s.livePoints!, 0) * 100) / 100
      : undefined;
    const points = input.points ?? boxScore;
    return {
      teamId: input.teamId,
      name: input.name,
      ...(points !== undefined
        ? { points, scoreSource: input.points !== undefined ? 'platform' : 'box-score' }
        : {}),
      ...(points !== undefined && !unknownRemaining ? { projectedFinal: points + remaining } : {}),
      starters,
      yetToPlay: starters.filter((s) => s.state === 'pre' || s.state === 'unknown').length,
      playing: starters.filter((s) => s.state === 'in').length,
    };
  };
  const you = side(sides.you),
    opponent = side(sides.opponent);
  let winChance: number | undefined;
  if (you.projectedFinal !== undefined && opponent.projectedFinal !== undefined) {
    const lead = you.projectedFinal - opponent.projectedFinal;
    // Players mid-game still add uncertainty that the estimate model does not track.
    const spread = Math.sqrt(variance + 9 * (you.playing + opponent.playing));
    winChance = spread > 0 ? normal(lead / spread) : lead > 0 ? 1 : lead < 0 ? 0 : 0.5;
  }
  return { you, opponent, ...(winChance !== undefined ? { winChance } : {}) };
}
