/** Three seasons × eighteen defense weeks plus totals, schedules and selected imports. */
export const maximumAdviceSources = 75;

export type AdviceMode = 'draft-plan' | 'draft-review' | 'lineup' | 'trade' | 'waivers' | 'betting';
export type AdviceConnection = 'saved' | 'claude-cli' | 'codex-cli';
export type SignedInAIStatus = 'signed-in' | 'not-installed' | 'signed-out' | 'unavailable';

export const kickingStatKeys = [
  'fg_made',
  'fg_att',
  'fg_missed',
  'fg_blocked',
  'fg_made_0_19',
  'fg_made_20_29',
  'fg_made_30_39',
  'fg_made_40_49',
  'fg_made_50_59',
  'fg_made_60_',
  'fg_missed_0_19',
  'fg_missed_20_29',
  'fg_missed_30_39',
  'fg_missed_40_49',
  'fg_missed_50_59',
  'fg_missed_60_',
  'fg_made_distance',
  'pat_made',
  'pat_att',
  'pat_missed',
  'pat_blocked',
] as const;
export const defenseStatKeys = [
  'dst_sacks',
  'dst_interceptions',
  'dst_fumble_recoveries',
  'dst_touchdowns',
  'dst_special_teams_touchdowns',
  'dst_special_teams_fumble_recoveries',
  'dst_forced_fumbles',
  'dst_special_teams_forced_fumbles',
  'dst_safeties',
  'dst_blocked_kicks',
  'dst_points_allowed',
  'dst_yards_allowed',
  // Split touchdown and rare-score counts, for platforms that weight them separately (ESPN).
  'dst_interception_return_tds',
  'dst_fumble_return_tds',
  'dst_kickoff_return_tds',
  'dst_punt_return_tds',
  'dst_blocked_kick_return_tds',
  'dst_two_point_returns',
  'dst_one_point_safeties',
] as const;
export const footballStatKeys = [
  'attempts',
  'completions',
  'passing_yards',
  'passing_tds',
  'passing_interceptions',
  'passing_2pt_conversions',
  'carries',
  'rushing_yards',
  'rushing_tds',
  'rushing_fumbles_lost',
  'rushing_2pt_conversions',
  'receptions',
  'targets',
  'receiving_yards',
  'receiving_tds',
  'receiving_fumbles_lost',
  'receiving_2pt_conversions',
  'sack_fumbles_lost',
  'passing_first_downs',
  'rushing_first_downs',
  'receiving_first_downs',
  'special_teams_tds',
  ...kickingStatKeys,
  ...defenseStatKeys,
] as const;
export type FootballStatKey = (typeof footballStatKeys)[number];

/** A missing statistic remains missing; an absent CSV value must never become zero. */
export interface PlayerGameStats {
  playerId: string;
  name: string;
  position: string;
  team: string;
  opponent: string;
  gameId: string;
  season: number;
  week: number;
  seasonType: 'REG' | 'POST';
  stats: Partial<Record<FootballStatKey, number>>;
  /** Explicit provenance for non-player feeds; legacy player rows use stats-{season}. */
  sourceIds?: string[];
  /** Validated individual distances; aggregate misses exclude blocks in nflverse. */
  blockedFieldGoalDistances?: number[];
  madeFieldGoalDistances?: number[];
  /** Opportunity measures when the source supplies them; missing values stay unknown. */
  usage?: PlayerGameUsage;
}

export interface PlayerGameUsage {
  /** Share of the team's offensive snaps, 0–1 (nflverse snap counts). */
  snapShare?: number;
  /** Share of the team's targets, 0–1. */
  targetShare?: number;
  /** Air yards on all targets, catchable or not. */
  receivingAirYards?: number;
}

export interface PregameTeamContext {
  /** Dated reports list game designations, not all injuries or proof of health. */
  reportUpdatedAt?: string;
  reportSource?: 'nflverse' | 'espn' | 'nfl-official';
  reportUrl?: string;
  offenseOut?: number;
  defenseOut?: number;
  quarterbackOut?: boolean;
  quarterbackDoubtful?: boolean;
  previousQuarterbackName?: string;
  previousQuarterbackId?: string;
  /** Captured rank-one depth-chart listing, not confirmed game-day participation. */
  expectedQuarterbackName?: string;
  expectedQuarterbackId?: string;
  quarterbackObservedAt?: string;
  quarterbackChanged?: boolean;
  personnel?: {
    /** Earlier completed-game facts, with a 24-hour availability allowance. */
    availableBy: string;
    throughSeason: number;
    throughWeek: number;
    quarterbackQuality?: number;
    quarterbackAbsenceValue?: number;
    /** Shrunken earlier-game EPA per play, including QB rushing; not opponent-adjusted intrinsic value. */
    quarterbackEpa?: number;
    quarterbackRushEpa?: number;
    quarterbackTeamDelta?: number;
    offensiveLineOutSnaps?: number;
    skillOutSnaps?: number;
    offenseDoubtfulSnaps?: number;
    defenseDoubtfulSnaps?: number;
    offenseLimitedSnaps?: number;
    defenseLimitedSnaps?: number;
    offenseDnpSnaps?: number;
    defenseDnpSnaps?: number;
    offenseOutSnaps?: number;
    defenseOutSnaps?: number;
    offenseQuestionableSnaps?: number;
    defenseQuestionableSnaps?: number;
    matchedReports: number;
    reportedPlayers: number;
  };
}
export interface PregameGameContext {
  asOf: string;
  home: PregameTeamContext;
  away: PregameTeamContext;
  weather?: {
    venueId: string;
    validAt: string;
    /** Conservative availability bound for the archived 48-hour-lead forecast; not exact publication time. */
    availableBy: string;
    model: 'jma_gsm';
    leadHours: 48;
    temperatureC: number;
    windKph: number;
    precipitationMm: number;
  };
}
export interface FootballGame {
  id: string;
  season: number;
  week: number;
  seasonType: string;
  date: string;
  /** Verified provider kickoff converted from Eastern time to an explicit UTC timestamp. */
  kickoffAt?: string;
  /** Explicit schedule venue classification; absent is unknown. */
  neutralSite?: boolean;
  /** Numeric ESPN event identity supplied by the independently loaded NFL schedule. */
  espnId?: string;
  home: string;
  away: string;
  /** Recorded starters are usable only from completed earlier games, never from the target row. */
  homeQuarterbackId?: string;
  awayQuarterbackId?: string;
  homeQuarterbackName?: string;
  awayQuarterbackName?: string;
  stadiumId?: string;
  stadiumName?: string;
  pregame?: PregameGameContext;
  homeScore?: number;
  awayScore?: number;
  /** Home points minus away points: positive means home favored, not home handicap. */
  spreadLine?: number;
  totalLine?: number;
  /** Archive prices have no verified quote-publication timestamps; never treat as live. */
  archivedOdds?: {
    homeMoneyline?: number;
    awayMoneyline?: number;
    homeSpreadOdds?: number;
    awaySpreadOdds?: number;
    overOdds?: number;
    underOdds?: number;
  };
}

export interface FootballDataSource {
  id: string;
  name: string;
  url?: string;
  retrievedAt?: string;
  status: 'available' | 'unavailable';
}

export interface PlayerMarketActivity {
  /** Sleeper identifier, deliberately separate from nflverse GSIS IDs. */
  sleeperId: string;
  adds?: number;
  drops?: number;
  lookbackHours: number;
}

export interface FootballDataSnapshot {
  season: number;
  players: PlayerGameStats[];
  games: FootballGame[];
  market: PlayerMarketActivity[];
  sources: FootballDataSource[];
  warnings: string[];
  draftPicks?: NFLDraftProfile[];
  playerForecasts?: PublicPlayerForecast[];
}

/** Publisher expectations, deliberately separate from observed NFL statistics. */
export interface PublicPlayerForecast {
  espnId: string;
  name: string;
  position: string;
  team: string;
  season: number;
  week: number;
  /** Feed's current scoring period, not an independently verified update timestamp. */
  issuedWeek: number;
  stats: Partial<Record<FootballStatKey, number>>;
  sourceId: string;
}

export interface NFLDraftProfile {
  gsisId?: string;
  pfrId?: string;
  name: string;
  position: string;
  season: number;
  round: number;
  pick: number;
  /** Drafting team's historical PFR code, not evidence of current team or role. */
  draftTeam: string;
  college?: string;
}

export interface AdviceMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  sourceIds: string[];
  sampleSize?: number;
  description?: string;
}

export interface AdviceConfidence {
  score: number;
  label: 'Low' | 'Moderate' | 'High';
  /** Evidence quality score, never a probability of a successful decision. */
  meaning: string;
  factors: { label: string; score: number; maximum: number }[];
}

export interface PlayerAdviceEvidence {
  id: string;
  name: string;
  position: string;
  team?: string;
  status?: string;
  projectedPoints?: number;
  projectionScope?: 'week' | 'season' | 'remaining-season';
  projectionPeriod?: import('./domain-types.js').ProjectionPeriod;
  projectionMethod?:
    | 'imported'
    | 'historical-baseline'
    | 'rolling-form-v1'
    | 'rolling-baseline-v1'
    | 'public-projection-v1';
  projectionSourceIds: string[];
  /** Verified complete team schedule has no game in the requested week. */
  weeklyGameStatus?: 'bye';
  metrics: AdviceMetric[];
  historicalPoints: number[];
  warnings: string[];
  draftProfile?: NFLDraftProfile & { sourceId: string };
  matchup?: { gameId: string; opponent: string; home: boolean; date: string };
}

export interface LineupEstimate {
  complete: boolean;
  points?: number;
  /** `locked` marks a starter whose game has begun; their points are not estimated (0 here). */
  assignments: { slot: string; playerId: string; points: number; locked?: true }[];
  missingSlots: string[];
  warnings: string[];
}

/** A conditional choice for one spot, never a verified full starting lineup. */
export interface StartSitComparison {
  candidateIds: string[];
  eligibleSlots: string[];
}

export interface BetTerms {
  /** Fetched snapshot chosen by the user; manual edits clear this identity. */
  quoteId?: string;
  kind: 'player-prop' | 'spread' | 'total' | 'moneyline';
  gameId: string;
  playerId?: string;
  stat?: FootballStatKey;
  side: 'over' | 'under' | 'home' | 'away';
  /** Sportsbook handicap for the selected team; e.g. home -3.5. */
  line?: number;
  americanOdds: number;
  oppositeAmericanOdds?: number;
}

export interface BetEvidence {
  forecast?: BetModelForecast;
  metrics: AdviceMetric[];
  wins: number;
  losses: number;
  pushes: number;
  historicalRate?: number;
  historicalInterval?: [number, number];
  breakEvenRate: number;
  /** Historical sample ROI at entered odds, not an expected future return. */
  historicalRoi?: number;
  warnings: string[];
}

export interface BetModelForecast {
  method:
    | 'rolling-residual-v1'
    | 'market-regularized-v2'
    | 'market-context-v3'
    | 'health-weather-total-v4';
  estimate: number;
  rawProbability: number;
  probability: number;
  lower: number;
  upper: number;
  pushRate: number;
  residualSamples: number;
  fresh: boolean;
  evaluation: {
    baselineKind?: 'frequency' | 'sportsbook';
    games: number;
    weeks: number;
    brier: number;
    baselineBrier: number;
    /** Lower approximate 95% bound on weekly improvement over the stated matched baseline. */
    improvementLower: number;
    calibrationSamples: number;
    calibrationWeeks: number;
    calibrationObserved: number;
    calibrationPredicted: number;
  };
}

export interface FantasyAdviceRequest {
  mode: Exclude<AdviceMode, 'betting'>;
  teamId: string;
  week?: number;
  season?: number;
  throughWeek?: number;
  /** Draft/waiver shortlist, or 2–20 owned players competing for one lineup spot. */
  candidateIds?: string[];
  /** Optional owned player removed in a waiver add/drop comparison. */
  dropPlayerId?: string;
  giveIds?: string[];
  receiveIds?: string[];
  tradeTeamId?: string;
}

export interface FantasyAdvicePlan {
  mode: FantasyAdviceRequest['mode'];
  teamId: string;
  candidates: { playerId: string; value?: number; rationale: string }[];
  players: PlayerAdviceEvidence[];
  metrics: AdviceMetric[];
  lineup?: LineupEstimate;
  startSit?: StartSitComparison;
  alternativeLineup?: LineupEstimate;
  confidence: AdviceConfidence;
  warnings: string[];
}

export interface AdviceRequest {
  mode: AdviceMode;
  /** Explicit analysis-local selection; never changes scheduled/report settings. */
  connection?: AdviceConnection;
  /** This analysis only; reuses the saved API endpoint and credential. */
  model?: string;
  /** Advice-only reasoning/answer limit per pass; leaves short-report limits unchanged. */
  maxOutputTokens?: number;
  leagueId?: string;
  teamId?: string;
  season?: number;
  week?: number;
  /** Last NFL week included in remaining trade value; defaults to 18. */
  throughWeek?: number;
  candidateIds?: string[];
  dropPlayerId?: string;
  giveIds?: string[];
  receiveIds?: string[];
  tradeTeamId?: string;
  bet?: BetTerms;
  question?: string;
}

export interface AdviceStatement {
  /** Numeric facts appear only as {{metric-id}} placeholders resolved from computed evidence. */
  text: string;
  metricIds: string[];
  sourceIds: string[];
}

export interface AdviceAssessment {
  verdict: 'recommend' | 'lean' | 'hold' | 'insufficient';
  headline: string;
  recommendedPlayerIds: string[];
  reasons: AdviceStatement[];
  risks: AdviceStatement[];
  alternative: AdviceStatement;
  perception: AdviceStatement & { tone: 'positive' | 'negative' | 'mixed' | 'unknown' };
  /** Model judgment, distinct from measured facts and historical frequencies. */
  forecast?: { probability: number; lower: number; upper: number; rationale: AdviceStatement };
}

export interface AdviceResult {
  id: string;
  createdAt: string;
  request: AdviceRequest;
  season: number;
  week: number;
  model: string;
  assessment: AdviceAssessment;
  confidence: AdviceConfidence;
  players: PlayerAdviceEvidence[];
  metrics: AdviceMetric[];
  sources: FootballDataSource[];
  warnings: string[];
  readiness?: import('./advice-readiness.js').AdviceDataReadiness;
  perceptionEvidence?: AdvicePerceptionEvidence;
  lineup?: LineupEstimate;
  startSit?: StartSitComparison;
  alternativeLineup?: LineupEstimate;
  betHistory?: BetEvidence;
  marketQuote?: import('./sportsbook-types.js').SportsbookQuote;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd?: number };
}

export interface AdvicePerceptionEvidence {
  windowHours: number;
  feedStatus: 'current' | 'stale' | 'unavailable';
  checkedAt?: string;
  headlines: { sourceId: string; publishedAt: string; playerIds: string[]; teamCodes: string[] }[];
  activityMetricIds: string[];
}

export interface AdviceOptions {
  season: number;
  week: number;
  players: { id: string; name: string; position: string; nflTeam?: string; teamId?: string }[];
  games: FootballGame[];
  warnings: string[];
  model: string;
  models?: { id: string; reasoning: boolean }[];
  recommendedModel?: string;
  /** False for signed-in connections that cannot enforce API token budgets. */
  tokenBudgetSupported?: boolean;
  connection?: AdviceConnection;
  connections?: { id: AdviceConnection; label: string; status: 'saved' | SignedInAIStatus }[];
}
