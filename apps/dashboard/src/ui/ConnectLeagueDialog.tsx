import type { FormEvent } from 'react';
import { Zap } from 'lucide-react';
import {
  detectLeagueLink,
  espnSeasonBounds,
  type LeagueConnection,
  type Platform,
} from '@sidekick/core';
import { Dialog } from './Dialog';
import { EspnSnapshotImport } from './EspnSnapshotImport';
import { FriendlyError } from './FriendlyError';
import { platformName } from './platform-name';

/** League link/ID entry. Connecting and importing stay owned by App, which holds the state. */
export function ConnectLeagueDialog({
  busy,
  platform,
  onPlatformChange,
  leagueId,
  onLeagueIdChange,
  espnSeason,
  onEspnSeasonChange,
  connectionError,
  onConnectionErrorChange,
  yahooConfigured,
  espnConfigured,
  onSubmit,
  onClose,
  onBusy,
  onSetupAccess,
  onImported,
}: {
  busy: boolean;
  platform: Platform;
  onPlatformChange: (platform: Platform) => void;
  leagueId: string;
  onLeagueIdChange: (value: string) => void;
  espnSeason: number;
  onEspnSeasonChange: (season: number) => void;
  connectionError: string;
  onConnectionErrorChange: (error: string) => void;
  yahooConfigured: boolean;
  espnConfigured: boolean;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onSetupAccess: (target: 'yahoo' | 'credentials') => void;
  onImported: (league: LeagueConnection) => Promise<void>;
}) {
  return (
    <Dialog
      titleId="connect-league-title"
      className="connect-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={onSubmit}>
        <button
          type="button"
          className="modal-close"
          aria-label="Close league connection"
          onClick={onClose}
        >
          ×
        </button>
        <div className="modal-mark">
          <Zap size={18} />
        </div>
        <h2 id="connect-league-title">Bring your league in.</h2>
        <p>
          Paste your league URL or ID. Your settings and scoring format come along for the ride.
        </p>
        <label>
          Fantasy platform
          <select
            disabled={busy}
            value={platform}
            onChange={(event) => {
              onPlatformChange(event.target.value as Platform);
              onConnectionErrorChange('');
            }}
          >
            <option value="sleeper">Sleeper</option>
            <option value="espn">ESPN</option>
            <option value="yahoo">Yahoo</option>
          </select>
        </label>
        <label>
          LEAGUE ID OR URL
          <input
            required
            value={leagueId}
            disabled={busy}
            maxLength={2048}
            onChange={(event) => {
              const value = event.target.value;
              onLeagueIdChange(value);
              onConnectionErrorChange('');
              const detected = detectLeagueLink(value);
              if (detected) {
                onPlatformChange(detected.platform);
                if (detected.season) onEspnSeasonChange(detected.season);
              }
            }}
            placeholder="Paste a league URL or ID"
          />
        </label>
        {detectLeagueLink(leagueId) && (
          <p role="status">
            ✓ {platformName(detectLeagueLink(leagueId)!.platform)} league recognized. We’ll check
            access when you connect.
          </p>
        )}
        <details className="connection-help">
          <summary>Where do I find my league link?</summary>
          <p>
            Open your league in a web browser, then copy the address from the address bar. Paste it
            above.
          </p>
          <p>
            {platform === 'sleeper'
              ? 'Sleeper: open your league on sleeper.com. Use the league page, rather than an invite link.'
              : platform === 'espn'
                ? 'ESPN: open Fantasy Football, select your league, and copy the League home address. The link may include the season year.'
                : 'Yahoo: open Fantasy Football, select your league, and copy its home-page address.'}
          </p>
          <p>If you only have a league ID, select your platform and enter the ID instead.</p>
        </details>
        {connectionError && (
          <FriendlyError
            message="We couldn’t connect your league. Check the link and any private-league access below, then try Connect league again."
            detail={connectionError}
          />
        )}
        {platform === 'espn' && (
          <label>
            ESPN SEASON
            <input
              required
              type="number"
              min={espnSeasonBounds.min}
              max={espnSeasonBounds.max}
              step={1}
              value={espnSeason}
              onChange={(event) => onEspnSeasonChange(Number(event.target.value))}
            />
            <small className="modal-hint">
              Select the league year to load; refreshes continue using this season.
            </small>
          </label>
        )}
        {platform === 'espn' && (
          <EspnSnapshotImport
            leagueInput={leagueId}
            season={espnSeason}
            disabled={busy}
            onBusy={onBusy}
            onImported={onImported}
          />
        )}
        <small className="modal-hint">
          Public leagues can connect directly. Private leagues need permission from your own
          account.
        </small>
        {platform === 'yahoo' && !yahooConfigured && (
          <div className="provider-setup-callout" role="note">
            <p>
              Sign in to Yahoo and authorize league access before connecting. If account connection
              has not been set up, the Yahoo settings include the required steps.
            </p>
            <button type="button" className="text-button" onClick={() => onSetupAccess('yahoo')}>
              Set up Yahoo access <span>→</span>
            </button>
          </div>
        )}
        {platform === 'espn' && !espnConfigured && (
          <div className="provider-setup-callout" role="note">
            <p>
              For a private ESPN league, add your own ESPN access details first. The ESPN access
              card explains how to find them. Public leagues can connect without this step.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => onSetupAccess('credentials')}
            >
              Add ESPN access <span>→</span>
            </button>
          </div>
        )}
        <button
          className="primary-button full"
          type="submit"
          disabled={busy || (platform === 'yahoo' && !yahooConfigured)}
        >
          {busy ? 'Connecting…' : 'Connect league'} <span>→</span>
        </button>
      </form>
    </Dialog>
  );
}
