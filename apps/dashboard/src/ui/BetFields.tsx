import { lazy, Suspense } from 'react';
import type { AdviceOptions, BetTerms, FootballStatKey, SportsbookQuote } from '@sidekick/core';
import { LiveSportsbookPrices } from './LiveSportsbookPrices';
import { PlayerPicker } from './PlayerPicker';

const PlayerPropResearch = lazy(() =>
  import('./PlayerPropResearch').then((m) => ({ default: m.PlayerPropResearch })),
);

const propStats: { value: FootballStatKey; label: string }[] = [
  { value: 'passing_yards', label: 'Passing yards' },
  { value: 'attempts', label: 'Passing attempts' },
  { value: 'completions', label: 'Passing completions' },
  { value: 'passing_tds', label: 'Passing touchdowns' },
  { value: 'passing_interceptions', label: 'Interceptions thrown' },
  { value: 'rushing_yards', label: 'Rushing yards' },
  { value: 'carries', label: 'Rushing attempts' },
  { value: 'rushing_tds', label: 'Rushing touchdowns' },
  { value: 'receiving_yards', label: 'Receiving yards' },
  { value: 'receptions', label: 'Receptions' },
  { value: 'targets', label: 'Targets' },
  { value: 'receiving_tds', label: 'Receiving touchdowns' },
];

type Setter<T> = (value: T) => void;

/** Betting inputs for Advice. Any manual edit clears a fetched quote so its provenance is not kept. */
export function BetFields({
  options,
  game,
  gamePlayers,
  selectedQuote,
  busy,
  betKind,
  setBetKind,
  gameId,
  setGameId,
  propPlayer,
  setPropPlayer,
  stat,
  setStat,
  side,
  setSide,
  line,
  setLine,
  odds,
  setOdds,
  oppositeOdds,
  setOppositeOdds,
  quote,
  setQuote,
  changed,
  onExploreSignals,
}: {
  options: AdviceOptions | null;
  game: AdviceOptions['games'][number] | undefined;
  gamePlayers: AdviceOptions['players'];
  selectedQuote: SportsbookQuote | undefined;
  busy: boolean;
  betKind: BetTerms['kind'];
  setBetKind: Setter<BetTerms['kind']>;
  gameId: string;
  setGameId: Setter<string>;
  propPlayer: string[];
  setPropPlayer: Setter<string[]>;
  stat: FootballStatKey;
  setStat: Setter<FootballStatKey>;
  side: BetTerms['side'];
  setSide: Setter<BetTerms['side']>;
  line: string;
  setLine: Setter<string>;
  odds: string;
  setOdds: Setter<string>;
  oppositeOdds: string;
  setOppositeOdds: Setter<string>;
  quote: SportsbookQuote | undefined;
  setQuote: Setter<SportsbookQuote | undefined>;
  changed: () => void;
  onExploreSignals: () => void;
}) {
  return (
    <>
      <p>
        Fetch and choose a sportsbook price, or enter one below. This app provides analysis and does
        not place bets.
      </p>
      <div className="advice-fields">
        <label>
          Bet type
          <select
            value={betKind}
            onChange={(event) => {
              const next = event.target.value as BetTerms['kind'];
              if (quote) {
                setQuote(undefined);
                setOdds('');
                setOppositeOdds('');
              }
              setBetKind(next);
              setSide(['player-prop', 'total'].includes(next) ? 'over' : 'home');
              setLine('');
              changed();
            }}
          >
            <option value="spread">Point spread</option>
            <option value="total">Game total</option>
            <option value="moneyline">Moneyline (winner)</option>
            <option value="player-prop">Player prop</option>
          </select>
        </label>
        <label>
          NFL game
          <select
            required
            value={gameId}
            onChange={(event) => {
              if (quote) {
                setQuote(undefined);
                setOdds('');
                setOppositeOdds('');
                setLine('');
              }
              setGameId(event.target.value);
              setPropPlayer([]);
              changed();
            }}
          >
            <option value="">Choose an upcoming game</option>
            {options?.games.map((item) => (
              <option key={item.id} value={item.id}>
                {item.away} at {item.home} · {item.date} · Week {item.week}
              </option>
            ))}
          </select>
        </label>
      </div>
      {options && !options.games.length && (
        <p>No upcoming regular-season games were found. Refresh public data later.</p>
      )}
      <div className="research-actions" role="group" aria-label="Betting markets">
        <button
          type="button"
          className="small-button"
          aria-pressed={betKind === 'player-prop'}
          onClick={() => {
            setBetKind('player-prop');
            setSide('over');
            setLine('');
            setQuote(undefined);
            changed();
          }}
        >
          Player props
        </button>
        <button type="button" className="small-button" onClick={onExploreSignals}>
          Explore market signals
        </button>
      </div>
      {betKind !== 'player-prop' && (
        <LiveSportsbookPrices
          game={game}
          season={options?.season ?? new Date().getFullYear()}
          kind={betKind}
          side={side}
          selected={selectedQuote}
          disabled={busy}
          onSelect={(q) => {
            setQuote(q);
            setBetKind(q.kind);
            setSide(q.side);
            setLine(q.line === undefined ? '' : String(q.line));
            setOdds(String(q.americanOdds));
            setOppositeOdds(String(q.oppositeAmericanOdds));
            changed();
          }}
        />
      )}
      {betKind === 'player-prop' && (
        <>
          <PlayerPicker
            label="Player for this prop"
            players={gamePlayers}
            selected={propPlayer}
            maximum={1}
            onChange={(ids) => {
              setPropPlayer(ids);
              changed();
            }}
          />
          <label>
            Player statistic
            <select
              value={stat}
              onChange={(event) => {
                setStat(event.target.value as FootballStatKey);
                changed();
              }}
            >
              {propStats.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {betKind === 'player-prop' && (
        <Suspense fallback={<p>Loading prop research…</p>}>
          <PlayerPropResearch
            gameId={gameId}
            playerId={propPlayer[0] ?? ''}
            stat={stat}
            line={line}
          />
        </Suspense>
      )}
      <div className="advice-fields">
        <label>
          {['total', 'player-prop'].includes(betKind) ? 'Over or under' : 'Team to back'}
          <select
            value={side}
            onChange={(event) => {
              if (quote) {
                setQuote(undefined);
                setOdds('');
                setOppositeOdds('');
              }
              setSide(event.target.value as BetTerms['side']);
              if (quote && betKind === 'spread') setLine('');
              changed();
            }}
          >
            {['total', 'player-prop'].includes(betKind) ? (
              <>
                <option value="over">Over</option>
                <option value="under">Under</option>
              </>
            ) : (
              <>
                <option value="home">Home · {game?.home ?? 'Choose game first'}</option>
                <option value="away">Away · {game?.away ?? 'Choose game first'}</option>
              </>
            )}
          </select>
        </label>
        {betKind !== 'moneyline' && (
          <label>
            {betKind === 'spread' ? 'Selected team’s handicap' : 'Line'}
            <input
              type="number"
              step="any"
              required
              value={line}
              onChange={(event) => {
                setQuote(undefined);
                setLine(event.target.value);
                changed();
              }}
              placeholder={betKind === 'spread' ? 'Example: -3.5' : 'Example: 47.5'}
            />
          </label>
        )}
      </div>
      {betKind === 'spread' && (
        <p>
          A favorite might be −3.5; an underdog might be +3.5. Enter the handicap for the team you
          selected.
        </p>
      )}
      <div className="advice-fields">
        <label>
          American odds
          <input
            type="number"
            step="1"
            required
            value={odds}
            onChange={(event) => {
              setQuote(undefined);
              setOdds(event.target.value);
              changed();
            }}
            placeholder="Example: -110 or +150"
          />
        </label>
        <label>
          Opposite side’s odds (optional)
          <input
            type="number"
            step="1"
            value={oppositeOdds}
            onChange={(event) => {
              setQuote(undefined);
              setOppositeOdds(event.target.value);
              changed();
            }}
            placeholder="Same game, line, and sportsbook"
          />
        </label>
      </div>
      <p>
        Odds must be −100 or below, or +100 or above. Opposite odds help estimate the price before
        the sportsbook’s margin.
      </p>
    </>
  );
}
