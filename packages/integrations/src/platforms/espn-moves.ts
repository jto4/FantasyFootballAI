import { readBoundedText } from '../http.js';
import { asRecord } from './shared.js';

const writeHost = 'https://lm-api-writes.fantasy.espn.com';
const readHost = 'https://lm-api-reads.fantasy.espn.com';

// Only the slots whose IDs are confirmed. Anything else stays a move the owner makes themself.
const writableSlots: Record<string, number> = {
  QB: 0,
  RB: 2,
  WR: 4,
  TE: 6,
  DST: 16,
  K: 17,
  BENCH: 20,
  BE: 20,
  BN: 20,
  FLEX: 23,
};

export function espnLineupSlotId(slot: string): number | undefined {
  return writableSlots[
    slot
      .trim()
      .toUpperCase()
      .replace(/[\s/_-]/g, '')
  ];
}

/** The account ID inside the owner's session; ESPN expects it as the transaction's member. */
export function espnMemberId(sessionCookie: string): string | undefined {
  return /(?:^|;\s*)SWID=(\{?[0-9A-Fa-f-]{36}\}?)/.exec(sessionCookie)?.[1];
}

export interface EspnLineupRequest {
  isLeagueManager: false;
  teamId: number;
  scoringPeriodId: number;
  executionType: 'EXECUTE';
  type: 'ROSTER';
  items: {
    playerId: number;
    type: 'LINEUP';
    fromLineupSlotId: number;
    toLineupSlotId: number;
  }[];
}

/** Builds the lineup transaction, or nothing when any part of it can't be stated exactly. */
export function espnLineupRequest(input: {
  teamId: string;
  week: number;
  items: { id: string; from: string; to: string }[];
}): EspnLineupRequest | undefined {
  const teamId = Number(input.teamId);
  if (!Number.isSafeInteger(teamId) || teamId < 1 || !input.items.length) return undefined;
  const items: EspnLineupRequest['items'] = [];
  for (const item of input.items) {
    const playerId = Number(item.id);
    const fromLineupSlotId = espnLineupSlotId(item.from);
    const toLineupSlotId = espnLineupSlotId(item.to);
    // D/ST player IDs are negative on ESPN.
    if (!Number.isSafeInteger(playerId) || fromLineupSlotId === undefined) return undefined;
    if (toLineupSlotId === undefined) return undefined;
    items.push({ playerId, type: 'LINEUP', fromLineupSlotId, toLineupSlotId });
  }
  return {
    isLeagueManager: false,
    teamId,
    scoringPeriodId: input.week,
    executionType: 'EXECUTE',
    type: 'ROSTER',
    items,
  };
}

export type EspnSubmitOutcome =
  /** ESPN accepted the request; the caller still confirms it by re-reading the league. */
  | { outcome: 'sent' }
  /** ESPN refused it, so nothing changed. */
  | { outcome: 'rejected'; reason?: string }
  /** The session no longer works, so nothing changed. */
  | { outcome: 'signed-out' }
  /** No clear answer: ESPN may have applied it. Never retry this automatically. */
  | { outcome: 'uncertain' };

const rejectionReason = (text: string) => {
  try {
    const messages = asRecord(JSON.parse(text))?.messages;
    const first = Array.isArray(messages) ? messages[0] : undefined;
    return typeof first === 'string' ? first.slice(0, 160) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * ESPN's write endpoint is undocumented, so everything here assumes it can change. The cookie is a
 * full account session: it goes only to ESPN's hosts and is never logged or returned.
 */
export class EspnMoveClient {
  constructor(
    private readonly sessionCookie: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** ESPN's cookies can reach other teams, so confirm this one is really the signed-in owner's. */
  async ownsTeam(leagueId: string, season: number, teamId: string) {
    const member = espnMemberId(this.sessionCookie)?.toUpperCase();
    if (!member) return false;
    const response = await this.fetcher(
      `${readHost}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}?view=mTeam`,
      { headers: { cookie: this.sessionCookie }, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) return false;
    const teams = asRecord(JSON.parse(await readBoundedText(response, 2_000_000)))?.teams;
    if (!Array.isArray(teams)) return false;
    const team = teams.map(asRecord).find((row) => String(row?.id) === teamId);
    return (
      Array.isArray(team?.owners) &&
      team.owners.some((owner) => String(owner).toUpperCase() === member)
    );
  }

  /** Sends once. There are deliberately no retries: a timeout may still have been applied. */
  async submit(
    leagueId: string,
    season: number,
    request: EspnLineupRequest,
  ): Promise<EspnSubmitOutcome> {
    const memberId = espnMemberId(this.sessionCookie);
    if (!memberId) return { outcome: 'signed-out' };
    try {
      const response = await this.fetcher(
        `${writeHost}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(leagueId)}/transactions/`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: {
            cookie: this.sessionCookie,
            'content-type': 'application/json',
            'x-fantasy-platform': 'espn-fantasy-web',
            'x-fantasy-source': 'kona',
          },
          body: JSON.stringify({ ...request, memberId }),
        },
      );
      if (response.ok) return { outcome: 'sent' };
      if (response.status === 401 || response.status === 403) return { outcome: 'signed-out' };
      if (response.status >= 500 || response.status === 429) return { outcome: 'uncertain' };
      const reason = rejectionReason(await readBoundedText(response, 64_000).catch(() => ''));
      return { outcome: 'rejected', ...(reason ? { reason } : {}) };
    } catch {
      return { outcome: 'uncertain' };
    }
  }
}
