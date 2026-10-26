/**
 * Owner preferences that change what the app computes or shows, saved with the other settings
 * (one "personalize" section). Appearance choices that belong to a device (theme, text size)
 * stay in the dashboard's local storage instead.
 */
export type LineupStrategy = 'balanced' | 'safe' | 'upside' | 'win-chance';
export const homeCardIds = [
  'next-up',
  'matchup',
  'week-summary',
  'watchlist',
  'decisions',
  'scorecard',
  'drafts',
  'activity',
  'league-news',
] as const;
export type HomeCardId = (typeof homeCardIds)[number];
export const homeCardLabels: Record<HomeCardId, string> = {
  'next-up': 'Do this next',
  matchup: 'This week’s matchup',
  'week-summary': 'Lineup, availability and waivers',
  watchlist: 'Watchlist',
  decisions: 'Saved decisions',
  scorecard: 'Advice scorecard',
  drafts: 'Reports ready to send',
  activity: 'Report activity',
  'league-news': 'League standings & news',
};
export type AITask = 'chat' | 'advice' | 'reports';

export interface PlayerRef {
  leagueId: string;
  playerId: string;
  name: string;
}
export interface PlayerNudge extends PlayerRef {
  /** Percent change to the app's projection, −50 to +50. */
  percent: number;
}

export interface UserPreferences {
  /** How lineups are chosen from the same projections (see lineupValue). */
  lineupStrategy?: LineupStrategy;
  /** Turn off individual model adjustments; both are on unless set to false. */
  projectionAdjustments?: { wind?: boolean; vacatedCarries?: boolean; questionable?: boolean };
  playerNudges?: PlayerNudge[];
  watchlist?: PlayerRef[];
  /** Overrides the detected redraft, keeper or dynasty format, by league id. */
  leagueFormats?: Record<string, 'redraft' | 'keeper' | 'dynasty'>;
  props?: {
    /** Minimum edge over the break-even rate, in percentage points, before a lean is shown. */
    minEdgePoints?: number;
    /** Sportsbook names to show and compare; empty or absent means all. */
    sportsbooks?: string[];
    /** Save prop lines in the background for later model checks. */
    lineCapture?: boolean;
  };
  notifications?: {
    out?: boolean;
    inactive?: boolean;
    doubtful?: boolean;
    bye?: boolean;
    stale?: boolean;
    watchlist?: boolean;
    /** One notification before your first starter kicks off: projection and win chance. */
    gameDaySummary?: boolean;
    /** Hours before kickoff that starter problems are announced. */
    leadHours?: 2 | 6 | 24;
    /** Local "HH:MM"; notifications wait until the quiet hours end. */
    quietStart?: string;
    quietEnd?: string;
  };
  ai?: {
    tone?: 'straight' | 'friendly' | 'playful';
    length?: 'brief' | 'standard' | 'detailed';
    /** Model name per task, for API connections; absent uses the connection's model. */
    models?: Partial<Record<AITask, string>>;
  };
  /** Home cards in display order with visibility; missing cards keep their default place. */
  homeCards?: { id: HomeCardId; visible: boolean }[];
}

export const defaultNotificationPreferences = {
  out: true,
  inactive: true,
  doubtful: true,
  bye: true,
  stale: true,
  watchlist: true,
  gameDaySummary: false,
  leadHours: 24,
} as const;

/** Home cards in the owner's order, with any newer cards appended in default order. */
export function orderedHomeCards(preferences: UserPreferences | undefined) {
  const saved = (preferences?.homeCards ?? []).filter((card) => homeCardIds.includes(card.id));
  const seen = new Set(saved.map((card) => card.id));
  return [
    ...saved,
    ...homeCardIds.filter((id) => !seen.has(id)).map((id) => ({ id, visible: true })),
  ];
}

/** The owner's percent change for a player in a league, or 0. */
export function playerNudge(
  preferences: UserPreferences | undefined,
  leagueId: string,
  playerId: string,
): number {
  return (
    preferences?.playerNudges?.find((n) => n.leagueId === leagueId && n.playerId === playerId)
      ?.percent ?? 0
  );
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);
const optionalBoolean = (value: unknown) => value === undefined || typeof value === 'boolean';
const clock = (value: unknown) =>
  value === undefined || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const isPlayerRef = (value: unknown, leagueIds: ReadonlySet<string>): value is PlayerRef =>
  isObject(value) &&
  typeof value.leagueId === 'string' &&
  leagueIds.has(value.leagueId) &&
  text(value.playerId, 120) &&
  text(value.name, 120);
const uniquePlayers = (items: PlayerRef[]) =>
  new Set(items.map((p) => `${p.leagueId}\u0000${p.playerId}`)).size === items.length;

/** Validates untrusted preferences; league-scoped entries must name a connected league. */
export function isValidPreferences(
  value: unknown,
  leagueIds: ReadonlySet<string>,
): value is UserPreferences {
  if (value === undefined) return true;
  if (!isObject(value)) return false;
  if (
    !onlyKeys(value, [
      'lineupStrategy',
      'projectionAdjustments',
      'playerNudges',
      'watchlist',
      'leagueFormats',
      'props',
      'notifications',
      'ai',
      'homeCards',
    ])
  )
    return false;
  const {
    lineupStrategy,
    projectionAdjustments,
    playerNudges,
    watchlist,
    leagueFormats,
    props,
    notifications,
    ai,
    homeCards,
  } = value;
  if (
    lineupStrategy !== undefined &&
    !['balanced', 'safe', 'upside', 'win-chance'].includes(String(lineupStrategy))
  )
    return false;
  if (
    leagueFormats !== undefined &&
    !(
      isObject(leagueFormats) &&
      Object.keys(leagueFormats).length <= 50 &&
      Object.entries(leagueFormats).every(
        ([id, format]) =>
          leagueIds.has(id) && ['redraft', 'keeper', 'dynasty'].includes(String(format)),
      )
    )
  )
    return false;
  if (
    projectionAdjustments !== undefined &&
    !(
      isObject(projectionAdjustments) &&
      onlyKeys(projectionAdjustments, ['wind', 'vacatedCarries', 'questionable']) &&
      optionalBoolean(projectionAdjustments.wind) &&
      optionalBoolean(projectionAdjustments.vacatedCarries) &&
      optionalBoolean(projectionAdjustments.questionable)
    )
  )
    return false;
  if (
    playerNudges !== undefined &&
    !(
      Array.isArray(playerNudges) &&
      playerNudges.length <= 200 &&
      playerNudges.every(
        (n) =>
          isPlayerRef(n, leagueIds) &&
          onlyKeys(n as unknown as Record<string, unknown>, [
            'leagueId',
            'playerId',
            'name',
            'percent',
          ]) &&
          Number.isInteger((n as PlayerNudge).percent) &&
          Math.abs((n as PlayerNudge).percent) <= 50 &&
          (n as PlayerNudge).percent !== 0,
      ) &&
      uniquePlayers(playerNudges as PlayerRef[])
    )
  )
    return false;
  if (
    watchlist !== undefined &&
    !(
      Array.isArray(watchlist) &&
      watchlist.length <= 100 &&
      watchlist.every(
        (p) =>
          isPlayerRef(p, leagueIds) &&
          onlyKeys(p as unknown as Record<string, unknown>, ['leagueId', 'playerId', 'name']),
      ) &&
      uniquePlayers(watchlist as PlayerRef[])
    )
  )
    return false;
  if (
    props !== undefined &&
    !(
      isObject(props) &&
      onlyKeys(props, ['minEdgePoints', 'sportsbooks', 'lineCapture']) &&
      (props.minEdgePoints === undefined ||
        (typeof props.minEdgePoints === 'number' &&
          Number.isFinite(props.minEdgePoints) &&
          props.minEdgePoints >= 0 &&
          props.minEdgePoints <= 20)) &&
      (props.sportsbooks === undefined ||
        (Array.isArray(props.sportsbooks) &&
          props.sportsbooks.length <= 30 &&
          props.sportsbooks.every((book) => text(book, 60)) &&
          new Set(props.sportsbooks).size === props.sportsbooks.length)) &&
      optionalBoolean(props.lineCapture)
    )
  )
    return false;
  if (
    notifications !== undefined &&
    !(
      isObject(notifications) &&
      onlyKeys(notifications, [
        'out',
        'inactive',
        'doubtful',
        'bye',
        'stale',
        'watchlist',
        'gameDaySummary',
        'leadHours',
        'quietStart',
        'quietEnd',
      ]) &&
      ['out', 'inactive', 'doubtful', 'bye', 'stale', 'watchlist', 'gameDaySummary'].every((key) =>
        optionalBoolean(notifications[key]),
      ) &&
      (notifications.leadHours === undefined ||
        [2, 6, 24].includes(Number(notifications.leadHours))) &&
      clock(notifications.quietStart) &&
      clock(notifications.quietEnd) &&
      (notifications.quietStart === undefined) === (notifications.quietEnd === undefined)
    )
  )
    return false;
  if (
    ai !== undefined &&
    !(
      isObject(ai) &&
      onlyKeys(ai, ['tone', 'length', 'models']) &&
      (ai.tone === undefined || ['straight', 'friendly', 'playful'].includes(String(ai.tone))) &&
      (ai.length === undefined || ['brief', 'standard', 'detailed'].includes(String(ai.length))) &&
      (ai.models === undefined ||
        (isObject(ai.models) &&
          onlyKeys(ai.models, ['chat', 'advice', 'reports']) &&
          Object.values(ai.models).every(
            (model) => typeof model === 'string' && /^[A-Za-z0-9._:/-]{1,120}$/.test(model),
          )))
    )
  )
    return false;
  if (
    homeCards !== undefined &&
    !(
      Array.isArray(homeCards) &&
      homeCards.length <= homeCardIds.length &&
      homeCards.every(
        (card) =>
          isObject(card) &&
          onlyKeys(card, ['id', 'visible']) &&
          homeCardIds.includes(card.id as HomeCardId) &&
          typeof card.visible === 'boolean',
      ) &&
      new Set(homeCards.map((card) => (card as { id: string }).id)).size === homeCards.length
    )
  )
    return false;
  return true;
}

/**
 * Preferences without watchlist entries, nudges and format choices for leagues that are no longer connected, so
 * removing a league never leaves settings that fail validation (and never discards the rest).
 */
export function prunePreferences(
  preferences: UserPreferences | undefined,
  leagueIds: ReadonlySet<string>,
): UserPreferences | undefined {
  if (!isObject(preferences)) return preferences;
  const record = preferences as Record<string, unknown>;
  // Saved data is untrusted here; anything malformed is left for validation to reject.
  const kept = (items: unknown) =>
    Array.isArray(items)
      ? items.filter((item) => !isObject(item) || leagueIds.has(String(item.leagueId)))
      : items;
  const next: Record<string, unknown> = { ...record };
  if (record.watchlist !== undefined) next.watchlist = kept(record.watchlist);
  if (record.playerNudges !== undefined) next.playerNudges = kept(record.playerNudges);
  if (isObject(record.leagueFormats))
    next.leagueFormats = Object.fromEntries(
      Object.entries(record.leagueFormats).filter(([id]) => leagueIds.has(id)),
    );
  return next as UserPreferences;
}

/**
 * Whether the owner changed any projection for this league (a nudge, or a model adjustment
 * switched off). Recorded predictions must then be rebuilt without those changes so accuracy
 * tracking measures the model, not the owner's takes.
 */
export function hasProjectionChanges(
  preferences: UserPreferences | undefined,
  leagueId: string,
): boolean {
  return Boolean(
    preferences?.playerNudges?.some((nudge) => nudge.leagueId === leagueId) ||
    preferences?.projectionAdjustments?.wind === false ||
    preferences?.projectionAdjustments?.vacatedCarries === false ||
    preferences?.projectionAdjustments?.questionable === false,
  );
}
