export type WeeklyBriefing = {
  week: number;
  coverage: { known: number; total: number; alreadyPlayed: number };
  lineup: {
    complete: boolean;
    points?: number;
    comparedWeek?: number;
    changes: {
      slot: string;
      start: { id: string; name: string; points: number };
      bench?: { id: string; name: string; points?: number };
    }[];
  };
  availability: {
    id: string;
    name: string;
    status: string;
    basis: 'dated-report' | 'this-week-report' | 'roster';
    validUntil?: string;
  }[];
  waivers: { id: string; name: string; position: string; gain: number }[];
  notes: string[];
  matchup?: { week: number; you: MatchupSide; opponent: MatchupSide };
};

export type MatchupSide = {
  teamId: string;
  name: string;
  points?: number;
  /** `started`: the game has begun, so the player's points are already in the score. */
  starters: { id: string; name: string; position: string; estimate?: number; started?: boolean }[];
  projected?: number;
};

const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length <= max;
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const person = (x: unknown) => record(x) && text(x.id, 160) && text(x.name);

function isMatchupSide(x: unknown): x is MatchupSide {
  return (
    record(x) &&
    text(x.teamId, 256) &&
    text(x.name, 500) &&
    (x.points === undefined || finite(x.points)) &&
    (x.projected === undefined || finite(x.projected)) &&
    Array.isArray(x.starters) &&
    x.starters.length <= 30 &&
    x.starters.every(
      (p) =>
        person(p) &&
        text((p as { position?: unknown }).position, 10) &&
        ((p as { estimate?: unknown }).estimate === undefined ||
          finite((p as { estimate?: unknown }).estimate)),
    )
  );
}

/** Validates the API's deterministic weekly briefing before it is rendered on Home. */
export function isWeeklyBriefing(value: unknown): value is WeeklyBriefing {
  if (!record(value) || !record(value.coverage) || !record(value.lineup)) return false;
  const { coverage, lineup } = value;
  return (
    Number.isInteger(value.week) &&
    Number(value.week) >= 1 &&
    Number(value.week) <= 22 &&
    ['known', 'total', 'alreadyPlayed'].every((k) => Number.isInteger(coverage[k])) &&
    typeof lineup.complete === 'boolean' &&
    (lineup.points === undefined || finite(lineup.points)) &&
    Array.isArray(lineup.changes) &&
    lineup.changes.length <= 20 &&
    lineup.changes.every(
      (c) =>
        record(c) &&
        text(c.slot, 40) &&
        person(c.start) &&
        finite((c.start as { points?: unknown }).points) &&
        (c.bench === undefined || person(c.bench)),
    ) &&
    Array.isArray(value.availability) &&
    value.availability.length <= 20 &&
    value.availability.every(
      (a) =>
        person(a) &&
        text((a as { status?: unknown }).status) &&
        ['dated-report', 'this-week-report', 'roster'].includes(String(a.basis)),
    ) &&
    Array.isArray(value.waivers) &&
    value.waivers.length <= 10 &&
    value.waivers.every((w) => person(w) && text(w.position, 10) && finite(w.gain)) &&
    Array.isArray(value.notes) &&
    value.notes.length <= 10 &&
    value.notes.every((n) => text(n, 400)) &&
    (value.matchup === undefined ||
      (record(value.matchup) &&
        Number.isInteger(value.matchup.week) &&
        isMatchupSide(value.matchup.you) &&
        isMatchupSide(value.matchup.opponent)))
  );
}

export const points = (value: number) => value.toFixed(1);
