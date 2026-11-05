import { createHash, randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import {
  moveApplied,
  moveRosterKey,
  planLineupMoves,
  platformMovePage,
  type LeagueConnection,
  type MoveKind,
  type MovePlayer,
  type MoveProposal,
} from '@sidekick/core';
import {
  espnLineupRequest,
  type EspnLineupRequest,
  type EspnSubmitOutcome,
} from '@sidekick/integrations';
import type { MoveStore } from './move-store.js';
import type { LocalStore } from './store.js';
import type { WeeklyBriefing } from './weekly-service.js';

const approvalMinutes = 30;
const waitingDays = 7;

export interface MoveDependencies {
  store: Pick<LocalStore, 'snapshot'>;
  moves: MoveStore;
  briefing: (leagueId: string, teamId: string) => Promise<WeeklyBriefing>;
  /** Saved ESPN session, read only at the moment a move is sent. */
  readEspnSession: () => Promise<string | null>;
  /** Reads the platform and saves the result. */
  refreshLeague: (leagueId: string) => Promise<void>;
  espn: (session: string) => {
    ownsTeam(leagueId: string, season: number, teamId: string): Promise<boolean>;
    submit(
      leagueId: string,
      season: number,
      request: EspnLineupRequest,
    ): Promise<EspnSubmitOutcome>;
  };
  now?: () => number;
}

const text = (value: unknown, max = 120) =>
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;

function requestFor(move: MoveProposal) {
  return move.kind === 'lineup' && move.platform === 'espn' && move.lineup
    ? espnLineupRequest({ teamId: move.teamId, week: move.week, items: move.lineup })
    : undefined;
}

const fingerprint = (move: Omit<MoveProposal, 'fingerprint'>) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        move.leagueId,
        move.teamId,
        move.kind,
        move.week,
        move.lineup,
        move.add,
        move.drop,
        move.trade,
        move.rosterKey,
      ]),
    )
    .digest('hex');

/**
 * Moves the owner approves one at a time. Nothing here is reachable from Ask, the AI or MCP, and
 * nothing is ever sent without an approval naming the exact fingerprint the owner reviewed.
 */
export function createMoveRouter(deps: MoveDependencies) {
  const router = Router();
  const now = deps.now ?? Date.now;
  const iso = () => new Date(now()).toISOString();
  const leagueOf = (id: string): LeagueConnection | undefined =>
    deps.store.snapshot().leagues.find((league) => league.id === id);
  const finish = (move: MoveProposal, status: MoveProposal['status'], message: string) =>
    deps.moves.save({ ...move, status, message, finishedAt: iso() });

  /** Why this move can't be sent by the app, if so. The owner can still make it themself. */
  function directIssue(move: MoveProposal, league: LeagueConnection | undefined) {
    if (move.kind !== 'lineup' || move.platform !== 'espn')
      return 'Sidekick can only submit ESPN lineup changes so far.';
    if (!league?.season) return 'This league’s season isn’t known.';
    if (!requestFor(move)) return 'This change uses a lineup spot Sidekick can’t submit yet.';
    if (league.settings.currentWeek !== move.week)
      return `This league’s data is on a different week. Refresh it first.`;
    return undefined;
  }

  /** Settles anything whose time has passed or that the latest league data now shows. */
  function settle(move: MoveProposal, league: LeagueConnection | undefined) {
    if (move.status === 'proposed' && Date.parse(move.expiresAt) <= now())
      return finish(move, 'expired', 'This expired. Review it again for current advice.');
    if (move.status === 'waiting') {
      if (league && moveApplied(move, league))
        return finish(move, 'confirmed', 'Your league now shows this move.');
      if (Date.parse(move.createdAt) + waitingDays * 86_400_000 <= now())
        return finish(move, 'unconfirmed', 'This never appeared in your league data.');
    }
    return move;
  }
  const view = (move: MoveProposal) => {
    const league = leagueOf(move.leagueId);
    const settled = settle(move, league);
    const issue = directIssue(settled, league);
    return { ...settled, ...(issue ? { directIssue: issue } : {}) };
  };

  function propose(
    league: LeagueConnection,
    teamId: string,
    week: number,
    kind: MoveKind,
    details: Pick<MoveProposal, 'title' | 'steps'> & Partial<MoveProposal>,
  ) {
    const base = {
      ...details,
      id: randomUUID(),
      leagueId: league.id,
      teamId,
      platform: league.platform,
      ...(league.season ? { season: league.season } : {}),
      week,
      kind,
      platformUrl: platformMovePage(league, teamId, kind),
      rosterKey: moveRosterKey(league, teamId),
      createdAt: iso(),
      expiresAt: new Date(now() + approvalMinutes * 60_000).toISOString(),
      status: 'proposed' as const,
    };
    const print = fingerprint(base);
    const open = deps.moves
      .list(league.id, teamId)
      .find((row) => row.status === 'proposed' && row.fingerprint === print);
    if (open && Date.parse(open.expiresAt) > now()) return open;
    return deps.moves.save({ ...base, fingerprint: print });
  }

  /** The checks every approval passes. A failure explains itself and changes nothing else. */
  function approvable(res: Response, id: string, print: unknown) {
    const found = deps.moves.get(id);
    if (!found) {
      res.status(404).json({ error: 'That move no longer exists.' });
      return undefined;
    }
    const league = leagueOf(found.leagueId);
    const move = settle(found, league);
    if (move.status !== 'proposed') {
      res.status(409).json({ error: 'This move has already been handled.', move: view(move) });
      return undefined;
    }
    if (print !== move.fingerprint) {
      res.status(409).json({ error: 'This move changed after you reviewed it. Review it again.' });
      return undefined;
    }
    const issue = directIssue(move, league);
    if (issue || !deps.moves.directSubmit(move.leagueId)) {
      res.status(409).json({ error: issue ?? 'Submitting is turned off for this league.' });
      return undefined;
    }
    return { move, league: league! };
  }

  /** Roster drift means the review no longer describes reality, so the approval ends here. */
  function stillCurrent(res: Response, move: MoveProposal) {
    const league = leagueOf(move.leagueId);
    if (league && moveRosterKey(league, move.teamId) === move.rosterKey) return true;
    const ended = finish(move, 'expired', 'Your roster changed, so nothing was sent.');
    res.status(409).json({ error: ended.message, move: view(ended) });
    return false;
  }

  /** Decides the result from what the league shows, not from what the send reported. */
  function concluded(move: MoveProposal, sent: boolean, reason?: string) {
    const league = leagueOf(move.leagueId);
    if (league && moveApplied(move, league))
      return finish(move, 'confirmed', 'Done. Your league now shows this change.');
    return sent
      ? finish(
          move,
          'unconfirmed',
          reason ?? 'We couldn’t confirm this took. Check your league before trying again.',
        )
      : finish(move, 'failed', reason ?? 'The platform refused this. Nothing changed.');
  }

  router.get('/api/moves', (req, res) => {
    const leagueId = text(req.query.league),
      teamId = text(req.query.team);
    if (!leagueId || !teamId) return res.status(400).json({ error: 'Choose a league and team.' });
    res.json({
      moves: deps.moves.list(leagueId, teamId).map(view),
      directSubmit: deps.moves.directSubmit(leagueId),
    });
  });

  router.put('/api/moves/settings', (req, res) => {
    const leagueId = text(req.body?.league);
    if (!leagueId || !leagueOf(leagueId) || typeof req.body?.directSubmit !== 'boolean')
      return res.status(400).json({ error: 'Choose a connected league.' });
    deps.moves.setDirectSubmit(leagueId, req.body.directSubmit);
    res.json({ directSubmit: deps.moves.directSubmit(leagueId) });
  });

  router.post('/api/moves', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const league = leagueOf(text(body.league) ?? '');
    const teamId = text(body.team);
    const team = league?.teams.find((row) => row.id === teamId);
    if (!league || !team || !teamId)
      return res.status(400).json({ error: 'Choose a connected league and team.' });
    const week = Number(league.settings.currentWeek ?? 0);
    const mine = new Map((team.roster ?? []).map((p) => [p.id, p.name]));
    const gain =
      typeof body.gain === 'number' && Number.isFinite(body.gain) && Math.abs(body.gain) < 500
        ? { gain: body.gain }
        : {};
    if (body.kind === 'lineup') {
      let briefing: WeeklyBriefing;
      try {
        briefing = await deps.briefing(league.id, teamId);
      } catch {
        return res.status(502).json({ error: 'Your lineup advice could not be prepared.' });
      }
      const { changes } = briefing.lineup;
      if (!changes.length) return res.status(409).json({ error: 'Your lineup already looks set.' });
      const plan = planLineupMoves(league, teamId, changes);
      if ('problem' in plan) return res.status(409).json({ error: plan.problem });
      const total = changes.reduce((sum, c) => sum + c.start.points - (c.bench?.points ?? 0), 0);
      return res.status(201).json(
        view(
          propose(league, teamId, briefing.week, 'lineup', {
            title: `Lineup changes for week ${briefing.week}`,
            steps: plan.items.map((item) =>
              /^(BN|BE|BENCH)$/i.test(item.to)
                ? `Bench ${item.name} (now ${item.from})`
                : /^(BN|BE|BENCH)$/i.test(item.from)
                  ? `Start ${item.name} at ${item.to}`
                  : `Move ${item.name} from ${item.from} to ${item.to}`,
            ),
            lineup: plan.items,
            gain: Math.round(total * 10) / 10,
          }),
        ),
      );
    }
    if (body.kind === 'add-drop') {
      const addId = text(body.addId, 40),
        addName = text(body.addName),
        dropId = text(body.dropId, 40);
      const rostered = league.teams.some((t) => t.roster?.some((p) => p.id === addId));
      if (!addId || !addName || rostered || (dropId && !mine.has(dropId)))
        return res.status(409).json({ error: 'That pickup no longer fits your roster.' });
      const add: MovePlayer = { id: addId, name: addName };
      const drop: MovePlayer | undefined = dropId
        ? { id: dropId, name: mine.get(dropId)! }
        : undefined;
      return res.status(201).json(
        view(
          propose(league, teamId, week, 'add-drop', {
            title: drop ? `Add ${add.name}, drop ${drop.name}` : `Add ${add.name}`,
            steps: [`Add ${add.name}`, ...(drop ? [`Drop ${drop.name}`] : [])],
            add,
            ...(drop ? { drop } : {}),
            ...gain,
          }),
        ),
      );
    }
    if (body.kind === 'trade') {
      const partner = league.teams.find((t) => t.id === text(body.tradeTeamId));
      const giveId = text(body.giveId, 40),
        receiveId = text(body.receiveId, 40);
      const receive = partner?.roster?.find((p) => p.id === receiveId);
      if (!partner || partner.id === teamId || !giveId || !mine.has(giveId) || !receive)
        return res.status(409).json({ error: 'That trade no longer fits these rosters.' });
      const give = { id: giveId, name: mine.get(giveId)! };
      return res.status(201).json(
        view(
          propose(league, teamId, week, 'trade', {
            title: `Offer ${give.name} for ${receive.name}`,
            steps: [
              `Open a trade with ${partner.name}`,
              `Offer ${give.name}`,
              `Ask for ${receive.name}`,
            ],
            trade: {
              teamId: partner.id,
              teamName: partner.name,
              give,
              receive: { id: receive.id, name: receive.name },
            },
            ...gain,
          }),
        ),
      );
    }
    res.status(400).json({ error: 'Choose a lineup change, pickup or trade.' });
  });

  // Sent by the API with the saved ESPN session.
  router.post('/api/moves/:id/approve', async (req, res) => {
    const ready = approvable(res, req.params.id, req.body?.fingerprint);
    if (!ready) return;
    const { move, league } = ready;
    const session = await deps.readEspnSession().catch(() => null);
    if (!session)
      return res.status(409).json({ error: 'No saved ESPN login.', needsBrowser: true });
    const client = deps.espn(session);
    try {
      await deps.refreshLeague(move.leagueId);
      if (!(await client.ownsTeam(move.leagueId, league.season!, move.teamId)))
        return res
          .status(409)
          .json({ error: 'This ESPN login doesn’t own this team, so nothing was sent.' });
    } catch {
      return res.status(409).json({ error: 'ESPN couldn’t be read.', needsBrowser: true });
    }
    if (!stillCurrent(res, move)) return;
    const sending: MoveProposal = { ...move, status: 'submitting', method: 'direct' };
    if (!deps.moves.claim(move.id, 'proposed', sending))
      return res.status(409).json({ error: 'This move has already been handled.' });
    const result = await client.submit(move.leagueId, league.season!, requestFor(move)!);
    if (result.outcome === 'signed-out') {
      // ESPN refused the session before acting, so this is safe to offer again.
      deps.moves.save({ ...move });
      return res.status(409).json({ error: 'Your ESPN login expired.', needsBrowser: true });
    }
    if (result.outcome === 'rejected') {
      await deps.refreshLeague(move.leagueId).catch(() => undefined);
      return res.json(view(concluded(sending, false, result.reason)));
    }
    await deps.refreshLeague(move.leagueId).catch(() => undefined);
    res.json(view(concluded(sending, true)));
  });

  // The desktop app sends these from its own signed-in window; the session never reaches the API.
  router.post('/api/moves/:id/browser/start', (req, res) => {
    const ready = approvable(res, req.params.id, req.body?.fingerprint);
    if (!ready || !stillCurrent(res, ready.move)) return;
    const { move, league } = ready;
    const sending: MoveProposal = { ...move, status: 'submitting', method: 'browser' };
    if (!deps.moves.claim(move.id, 'proposed', sending))
      return res.status(409).json({ error: 'This move has already been handled.' });
    res.json({
      leagueId: move.leagueId,
      season: league.season,
      teamId: move.teamId,
      request: requestFor(move),
    });
  });

  router.post('/api/moves/:id/browser/finish', (req, res) => {
    const move = deps.moves.get(req.params.id);
    if (!move || move.status !== 'submitting' || move.method !== 'browser')
      return res.status(409).json({ error: 'This move isn’t being sent.' });
    const outcome = req.body?.outcome as unknown;
    if (!['sent', 'rejected', 'signed-out', 'uncertain'].includes(outcome as string))
      return res.status(400).json({ error: 'Unknown result.' });
    if (outcome === 'signed-out') {
      const proposed: MoveProposal = { ...move, status: 'proposed' };
      delete proposed.method;
      return res.json(view(deps.moves.save(proposed)));
    }
    res.json(view(concluded(move, outcome !== 'rejected', text(req.body?.reason, 160))));
  });

  // The owner makes this move on the platform; the next league data confirms it.
  router.post('/api/moves/:id/guided', (req, res) => {
    const move = deps.moves.get(req.params.id);
    if (!move) return res.status(404).json({ error: 'That move no longer exists.' });
    const waiting: MoveProposal = { ...move, status: 'waiting', method: 'guided' };
    if (move.status !== 'proposed' || !deps.moves.claim(move.id, 'proposed', waiting))
      return res.status(409).json({ error: 'This move has already been handled.' });
    res.json(view(waiting));
  });

  router.post('/api/moves/:id/cancel', (req, res) => {
    const move = deps.moves.get(req.params.id);
    if (!move) return res.status(404).json({ error: 'That move no longer exists.' });
    if (move.status !== 'proposed' && move.status !== 'waiting')
      return res.status(409).json({ error: 'This move has already been handled.' });
    res.json(view(finish(move, 'cancelled', 'Cancelled.')));
  });

  return router;
}
