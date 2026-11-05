import { useEffect, useId, useState } from 'react';
import { isMoveProposal, record, type MoveProposal } from '@sidekick/core';
import { requestJson, requestResponse } from './api-client';
import { Dialog } from './Dialog';
import { platformName } from './platform-name';
import { confirmAction } from './ConfirmDialog';

export type ReviewableMove = MoveProposal & { directIssue?: string };
export type MoveRequest =
  | { kind: 'lineup' }
  | { kind: 'add-drop'; addId: string; addName: string; dropId?: string; gain?: number }
  | { kind: 'trade'; tradeTeamId: string; giveId: string; receiveId: string; gain?: number };

const isMove = (value: unknown): value is ReviewableMove => isMoveProposal(value);
const isMoveList = (value: unknown): value is { moves: ReviewableMove[]; directSubmit: boolean } =>
  record(value) &&
  Array.isArray(value.moves) &&
  value.moves.every(isMove) &&
  typeof value.directSubmit === 'boolean';
const isDirectSetting = (value: unknown): value is { directSubmit: boolean } =>
  record(value) && typeof value.directSubmit === 'boolean';
const isBrowserStart = (
  value: unknown,
): value is { leagueId: string; season: number; teamId: string; request: unknown } =>
  record(value) && typeof value.leagueId === 'string' && typeof value.season === 'number';

const post = <T,>(path: string, guard: (value: unknown) => value is T, body: unknown = {}) =>
  requestJson(
    path,
    guard,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    60_000,
  );

const statusText: Record<MoveProposal['status'], string> = {
  proposed: 'Waiting for your approval',
  submitting: 'Sending',
  waiting: 'Waiting to appear in your league',
  confirmed: 'Done',
  unconfirmed: 'Not confirmed',
  failed: 'Not made',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/** Opens the app's signed-in window, or a normal tab outside the desktop app. */
async function openPlatform(url: string) {
  const browser = window.sidekickDesktop?.leagueBrowser;
  if (browser && (await browser.open(url))) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** The league as ESPN shows it in the signed-in window, saved the same way as a manual import. */
async function refreshFromBrowser(move: MoveProposal) {
  const browser = window.sidekickDesktop?.leagueBrowser;
  if (!browser || !move.season) throw new Error('The signed-in window isn’t available.');
  const body = await browser.espnRead({ leagueId: move.leagueId, season: move.season });
  await requestResponse(
    `/api/leagues/import/espn?${new URLSearchParams({ league: move.leagueId, season: String(move.season) })}`,
    { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body },
    30_000,
  );
}

/** Used when no ESPN login is saved: the signed-in window sends it, so no cookie is ever copied. */
async function submitInBrowser(move: ReviewableMove): Promise<ReviewableMove | 'sign-in'> {
  const browser = window.sidekickDesktop?.leagueBrowser;
  if (!browser)
    throw new Error('Open Sunday Sidekick’s desktop app to send this, or do it yourself.');
  if (!(await browser.espnStatus()).signedIn) {
    await browser.open(move.platformUrl);
    return 'sign-in';
  }
  await refreshFromBrowser(move);
  const start = await post(`/api/moves/${move.id}/browser/start`, isBrowserStart, {
    fingerprint: move.fingerprint,
  });
  const result = await browser.espnSubmit(start);
  // A failed re-read leaves the result to the send's own report; `finish` then says unconfirmed.
  await refreshFromBrowser(move).catch(() => undefined);
  return post(`/api/moves/${move.id}/browser/finish`, isMove, result);
}

function failureOf(failure: unknown) {
  return failure instanceof Error ? failure.message : 'This could not be finished.';
}

/** Review of one exact change: nothing leaves the app until the owner approves it here. */
export function MoveReview({
  request,
  league,
  team,
  onClose,
}: {
  request: MoveRequest;
  league: string;
  team: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [move, setMove] = useState<ReviewableMove>();
  const [directSubmit, setDirectSubmit] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([
      requestJson(
        '/api/moves',
        isMove,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...request, league, team }),
          signal: abort.signal,
        },
        60_000,
      ),
      requestJson(`/api/moves?${new URLSearchParams({ league, team })}`, isMoveList, {
        signal: abort.signal,
      }),
    ])
      .then(([created, list]) => {
        setMove(created);
        setDirectSubmit(list.directSubmit);
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setError(failureOf(failure));
      });
    return () => abort.abort();
  }, [request, league, team]);

  const platform = move ? platformName(move.platform) : 'your league';
  const open = move?.status === 'proposed';
  const canSubmit = open && !move.directIssue;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      await action();
    } catch (failure) {
      setError(failureOf(failure));
    } finally {
      setBusy(false);
    }
  }

  const toggleDirect = (enabled: boolean) =>
    run(async () => {
      const saved = await requestJson('/api/moves/settings', isDirectSetting, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ league, directSubmit: enabled }),
      });
      setDirectSubmit(saved.directSubmit);
    });

  const approve = () =>
    run(async () => {
      if (!move) return;
      const yes = await confirmAction(`This changes your real ${platform} team now.`, {
        title: 'Submit this change?',
        confirmLabel: 'Submit to ' + platform,
      });
      if (!yes) return;
      // Read directly: a refusal here carries more than an error message.
      const response = await fetch(`/api/moves/${move.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fingerprint: move.fingerprint }),
        signal: AbortSignal.timeout(60_000),
      });
      const body: unknown = await response.json().catch(() => undefined);
      if (response.ok && isMove(body)) return setMove(body);
      if (record(body) && body.needsBrowser === true) {
        const sent = await submitInBrowser(move);
        if (sent === 'sign-in')
          setNote(`Sign in to ${platform} in the window that opened, then choose Submit again.`);
        else setMove(sent);
        return;
      }
      if (record(body) && isMove(body.move)) setMove(body.move);
      setError(
        record(body) && typeof body.error === 'string' ? body.error : 'This could not be sent.',
      );
    });

  const doItMyself = () =>
    run(async () => {
      if (!move) return;
      setMove(await post(`/api/moves/${move.id}/guided`, isMove));
      await openPlatform(move.platformUrl);
    });

  const cancel = () =>
    run(async () => {
      if (move) setMove(await post(`/api/moves/${move.id}/cancel`, isMove));
    });

  return (
    <Dialog titleId={titleId} onClose={onClose} className="report-review-modal move-review-modal">
      <h2 id={titleId}>{move?.title ?? 'Review this move'}</h2>
      {!move && !error && <p role="status">Preparing the exact change…</p>}
      {move && (
        <>
          <p className={`move-status move-status-${move.status}`} role="status">
            {statusText[move.status]}
            {move.message ? `: ${move.message}` : ''}
          </p>
          <ol className="move-steps">
            {move.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {move.gain !== undefined && (
            <p className="move-note">
              Estimated change: {move.gain >= 0 ? '+' : ''}
              {move.gain.toFixed(1)} points
            </p>
          )}
          {move.status === 'unconfirmed' && (
            <p className="move-note">
              Sidekick won’t resend this. Check {platform} first, because the change may have gone
              through.
            </p>
          )}
          {open && move.kind === 'trade' && (
            <p className="move-note">
              This goes to a real person. If your league has no review period, an accepted trade
              goes through straight away.
            </p>
          )}
          {open && move.kind === 'add-drop' && move.drop && (
            <p className="move-note">
              Dropping {move.drop.name} can lose them for good, because anyone may pick them up.
            </p>
          )}
          {open && move.kind === 'lineup' && move.platform === 'espn' && !move.directIssue && (
            <label className="move-switch">
              <input
                type="checkbox"
                checked={directSubmit}
                disabled={busy}
                onChange={(event) => void toggleDirect(event.target.checked)}
              />
              <span>
                Let Sidekick submit lineup changes for this league. This uses ESPN’s private,
                undocumented connection, which can stop working and may not be allowed by ESPN’s
                terms. You still approve each change.
              </span>
            </label>
          )}
          {open && move.directIssue && <p className="move-note">{move.directIssue}</p>}
        </>
      )}
      {note && <p role="status">{note}</p>}
      {error && (
        <p className="move-error" role="alert">
          {error}
        </p>
      )}
      <div className="move-actions">
        {canSubmit && directSubmit && (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void approve()}
          >
            {busy ? 'Working…' : `Submit to ${platform}`}
          </button>
        )}
        {open && (
          <button
            type="button"
            className={canSubmit && directSubmit ? 'small-button' : 'primary-button'}
            disabled={busy}
            onClick={() => void doItMyself()}
          >
            I’ll do it on {platform}
          </button>
        )}
        {move?.status === 'waiting' && (
          <button
            type="button"
            className="primary-button"
            onClick={() => void openPlatform(move.platformUrl)}
          >
            Open {platform}
          </button>
        )}
        {(open || move?.status === 'waiting') && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void cancel()}
          >
            Cancel this move
          </button>
        )}
        <button type="button" className="text-button" disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}

/** What became of recent moves. Waiting ones settle here once the league data shows them. */
export function RecentMoves({
  league,
  team,
  revision,
}: {
  league: string;
  team: string;
  revision: number;
}) {
  const [moves, setMoves] = useState<ReviewableMove[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    requestJson(`/api/moves?${new URLSearchParams({ league, team })}`, isMoveList, {
      signal: abort.signal,
    })
      .then((list) => setMoves(list.moves.filter((m) => m.status !== 'proposed').slice(0, 5)))
      .catch(() => undefined);
    return () => abort.abort();
  }, [league, team, revision]);
  if (!moves.length) return null;
  return (
    <details className="recent-moves">
      <summary>Recent moves</summary>
      <ul>
        {moves.map((move) => (
          <li key={move.id}>
            <strong>{move.title}</strong> <span>{statusText[move.status]}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
