import { useEffect, useState } from 'react';
import { isLeagueConnection, parseLeagueInput, type LeagueConnection } from '@sidekick/core';
import { requestJson } from './api-client';
import { ErrorNotice } from './ErrorNotice';
export function EspnSnapshotImport({
  leagueInput,
  season,
  disabled,
  onBusy,
  onImported,
}: {
  leagueInput: string;
  season: number;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onImported: (league: LeagueConnection) => Promise<void>;
}) {
  const [file, setFile] = useState<File>(),
    [error, setError] = useState('');
  let id = '';
  try {
    id = parseLeagueInput('espn', leagueInput).leagueId;
  } catch {
    /* A valid ID is required before import. */
  }
  useEffect(() => {
    setFile(undefined);
    setError('');
  }, [leagueInput, season]);
  const url = id
    ? `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${id}?view=mTeam&view=mSettings&view=mMatchupScore&view=mRoster&view=mDraftDetail`
    : undefined;
  async function load() {
    if (!file || !id || disabled) return;
    if (file.size > 6 * 1024 * 1024) {
      setError('Choose an ESPN JSON file smaller than 6 MB.');
      return;
    }
    onBusy(true);
    setError('');
    try {
      const league = await requestJson(
        `/api/leagues/import/espn?${new URLSearchParams({ league: id, season: String(season) })}`,
        isLeagueConnection,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file },
        30000,
      );
      await onImported(league);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot import failed.');
    } finally {
      onBusy(false);
    }
  }
  return (
    <details className="connection-help espn-snapshot-import">
      <summary>Use my signed-in browser instead</summary>
      <p>
        Import league data without copying login cookies. This creates a manual snapshot; automatic
        refresh needs a provider connection.
      </p>
      {url ? (
        <ol>
          <li>
            <a href={url} target="_blank" rel="noreferrer">
              Open this league’s ESPN data
            </a>{' '}
            in the browser where you are signed in.
          </li>
          <li>
            Save the page as <strong>Page Source</strong> with a .json filename.
          </li>
          <li>
            Choose that file below, then import it. No account tokens or member contact details are
            saved.
          </li>
        </ol>
      ) : (
        <p>Enter the league URL or ID above first.</p>
      )}
      <label>
        ESPN JSON snapshot
        <input
          type="file"
          accept=".json,application/json"
          disabled={disabled || !id}
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setError('');
          }}
        />
      </label>
      <button
        type="button"
        className="small-button"
        disabled={disabled || !file || !id}
        onClick={() => void load()}
      >
        Import league snapshot
      </button>
      {error && <ErrorNotice error={error} />}
    </details>
  );
}
