import { useState } from 'react';
import { leagueFormat, type LeagueConnection, type UserPreferences } from '@sidekick/core';
import { TradeCalculator } from './DynastyPage';
import './dynasty.css';

/**
 * Trade calculator for any league. Redraft leagues value the rest of this season; keeper and
 * dynasty leagues can switch to this season plus the next three (with draft picks).
 */
export function TradePage({
  league,
  teamId,
  preferences,
}: {
  league: LeagueConnection | undefined;
  teamId: string | undefined;
  preferences?: UserPreferences | undefined;
}) {
  const longTerm = league ? leagueFormat(league, preferences) !== 'redraft' : false;
  const [horizon, setHorizon] = useState<'season' | 'dynasty'>(longTerm ? 'dynasty' : 'season');
  const season = league?.season ?? new Date().getFullYear();
  return (
    <div className="dynasty-page">
      <div className="page-title-block">
        <div>
          <p className="section-overline">TRADES</p>
          <h1>Trade calculator</h1>
          <p>
            Both sides’ value, the players you would have to release, and what it means for them.
          </p>
        </div>
      </div>
      {!league || !teamId ? (
        <p className="empty-activity">Connect a league and choose your team on Home first.</p>
      ) : (
        <>
          {longTerm && (
            <div className="trade-horizon" role="group" aria-label="Value over">
              {(
                [
                  ['season', 'This season'],
                  ['dynasty', 'This season and next three'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={horizon === value ? 'active' : undefined}
                  aria-pressed={horizon === value}
                  onClick={() => setHorizon(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <TradeCalculator
            key={horizon}
            season={season}
            league={league}
            teamId={teamId}
            horizon={horizon}
          />
        </>
      )}
    </div>
  );
}
