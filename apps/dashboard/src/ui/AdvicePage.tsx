import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  isAdviceOptions,
  isAdviceDataReadiness,
  type AdviceDataReadiness,
  isAdviceRequest,
  isAdviceResult,
  nflTeamKey,
  playerNameKey,
  starterSlots,
  type AdviceMode,
  type AdviceConnection,
  type AdviceOptions,
  type AdviceRequest,
  type AdviceResult,
  type BetTerms,
  type FootballStatKey,
  type LeagueConnection,
  type SportsbookQuote,
} from '@sidekick/core';
import { requestJson, requestResponse, ApiError } from './api-client';
import { adviceChoices, adviceTitle } from './advice-navigation';
import { AdviceHistory } from './AdviceHistory';
import { useAdviceHistory } from './hooks/useAdviceHistory';
import { AdviceResultView } from './AdviceResultView';
import { LoadingStatus } from './LoadFeedback';
import { WaitStatus } from './WaitStatus';
import { useMediaQuery } from './hooks/useMediaQuery';
import type { SearchDestination } from './search-catalog';
import './advice.css';
import './props.css';
import { PropsBoard, type PropHandoff } from './PropsBoard';
import { clearPropHandoff, peekPropHandoff, stashPropHandoff } from './prop-handoff';
import { BetFields } from './BetFields';
import { BetLimit } from './BetLimit';
import { TradeIdeasPanel, WaiverDayPanel } from './RosterMoves';
import { PlayerPicker } from './PlayerPicker';
import { AdvicePerformance } from './AdvicePerformance';
import { AdviceJournal } from './AdviceJournal';
import { DataReadiness } from './DataReadiness';
import { confirmAction } from './ConfirmDialog';

const MarketSignalsPanel = lazy(() =>
  import('./MarketSignalsPanel').then((m) => ({ default: m.MarketSignalsPanel })),
);

export function AdvicePage({
  leagues,
  leagueId,
  mode = 'lineup',
  resultId = '',
  preferredTeamId,
  onTeamSelect,
  onNavigate,
  onDirtyChange,
  initialView = 'decision',
}: {
  initialView?: 'decision' | 'research';
  leagues: LeagueConnection[];
  leagueId: string;
  mode?: AdviceMode;
  resultId?: string;
  preferredTeamId?: string | undefined;
  onTeamSelect?: (id: string) => void;
  onNavigate: (destination: SearchDestination, check?: boolean) => boolean | Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const league = leagues.find((item) => item.id === leagueId) ?? leagues[0];
  const [teamId, setTeamId] = useState(preferredTeamId ?? league?.teams[0]?.id ?? '');
  const [tradeTeamId, setTradeTeamId] = useState(league?.teams[1]?.id ?? '');
  const [week, setWeek] = useState('');
  const [tradeThroughWeek, setTradeThroughWeek] = useState('18');
  const [view, setView] = useState<'decision' | 'history' | 'props' | 'research' | 'signals'>(
    initialView,
  );
  const [pendingProp, setPendingProp] = useState(peekPropHandoff);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [dropPlayerId, setDropPlayerId] = useState('');
  const [lineupComparison, setLineupComparison] = useState(false);
  const [give, setGive] = useState<string[]>([]);
  const [receive, setReceive] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [betKind, setBetKind] = useState<BetTerms['kind']>('spread');
  const [gameId, setGameId] = useState('');
  const [propPlayer, setPropPlayer] = useState<string[]>([]);
  const [stat, setStat] = useState<FootballStatKey>('passing_yards');
  const [side, setSide] = useState<BetTerms['side']>('home');
  const [line, setLine] = useState('');
  const [odds, setOdds] = useState('-110');
  const [oppositeOdds, setOppositeOdds] = useState('');
  const [quote, setQuote] = useState<SportsbookQuote>();
  const [options, setOptions] = useState<AdviceOptions | null>(null);
  const [model, setModel] = useState('');
  const [connection, setConnection] = useState<AdviceConnection>('saved');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionFeedback, setConnectionFeedback] = useState('');
  const connectionTest = useRef<AbortController | null>(null);
  const usesCodex =
    connection === 'codex-cli' ||
    (connection === 'saved' && options?.tokenBudgetSupported === false);
  const [outputLimit, setOutputLimit] = useState('16384');
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const { history, historyError, reload: reloadHistory } = useAdviceHistory();
  const [result, setResult] = useState<AdviceResult | null>(null);
  const [resultLoading, setResultLoading] = useState(Boolean(resultId));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busySince, setBusySince] = useState(0);
  const [readiness, setReadiness] = useState<{ key: string; report: AdviceDataReadiness } | null>(
    null,
  );
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const readinessRequest = useRef<AbortController | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastRequestId, setLastRequestId] = useState('');
  const [status, setStatus] = useState('');
  const analysis = useRef<{ id: string; controller: AbortController; started: boolean } | null>(
    null,
  );
  const mounted = useRef(true);
  const submitted = useRef(false);
  const betting = mode === 'betting';
  // Wide windows keep the form beside a saved result, refilled from that result's request.
  const wide = useMediaQuery('(min-width: 1200px)');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      analysis.current?.controller.abort();
      connectionTest.current?.abort();
      readinessRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    onDirtyChange(dirty || busy);
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    if ((dirty || busy) && window.sidekickDesktop?.isVerificationMode?.() !== true)
      window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    if ((resultId && !wide) || (!betting && !league)) return;
    const controller = new AbortController();
    setOptionsLoading(true);
    setError('');
    const params = new URLSearchParams({ mode });
    if (connection !== 'saved') params.set('connection', connection);
    if (!betting && league) params.set('league', league.id);
    requestJson(
      `/api/advice/options?${params}`,
      isAdviceOptions,
      { signal: controller.signal },
      50_000,
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setOptions(data);
          setModel((current) => current || data.recommendedModel || data.model);
          setWeek((current) => current || String(data.week));
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(message(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setOptionsLoading(false);
      });
    return () => controller.abort();
  }, [mode, league?.id, betting, resultId, wide, optionsRevision, connection]);
  useEffect(() => {
    if (!resultId) return;
    const controller = new AbortController();
    setResultLoading(true);
    requestJson(`/api/advice/${encodeURIComponent(resultId)}`, isAdviceResult, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          refill(data.request);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(message(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setResultLoading(false);
      });
    return () => controller.abort();
  }, [resultId, optionsRevision]);
  useEffect(() => {
    if (result && view === 'decision') {
      const heading = document.getElementById('advice-result-title');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, [result?.id, view]);
  /** Restores the inputs behind a saved result; quote identity is dropped, so prices read as typed. */
  function refill(saved: AdviceRequest) {
    if (saved.teamId) setTeamId(saved.teamId);
    if (saved.connection) setConnection(saved.connection);
    if (saved.model) setModel(saved.model);
    if (saved.maxOutputTokens) setOutputLimit(String(saved.maxOutputTokens));
    if (saved.week) setWeek(String(saved.week));
    if (saved.throughWeek) setTradeThroughWeek(String(saved.throughWeek));
    setCandidates(saved.candidateIds ?? []);
    if (saved.mode === 'lineup') setLineupComparison(Boolean(saved.candidateIds?.length));
    setDropPlayerId(saved.dropPlayerId ?? '');
    setGive(saved.giveIds ?? []);
    setReceive(saved.receiveIds ?? []);
    if (saved.tradeTeamId) setTradeTeamId(saved.tradeTeamId);
    setQuestion(saved.question ?? '');
    if (saved.bet) {
      setBetKind(saved.bet.kind);
      setGameId(saved.bet.gameId);
      setSide(saved.bet.side);
      setOdds(String(saved.bet.americanOdds));
      setLine(saved.bet.line === undefined ? '' : String(saved.bet.line));
      setOppositeOdds(
        saved.bet.oppositeAmericanOdds === undefined ? '' : String(saved.bet.oppositeAmericanOdds),
      );
      if (saved.bet.playerId) setPropPlayer([saved.bet.playerId]);
      if (saved.bet.stat) setStat(saved.bet.stat);
    }
  }
  function changed() {
    setDirty(true);
    setStatus('');
  }
  const allPlayers = options?.players ?? [];
  // A prop picked on the props board fills the bet form once the game's players are loaded.
  useEffect(() => {
    if (!pendingProp || !options || mode !== 'betting') return;
    const game = options.games.find((g) => g.id === pendingProp.gameId);
    const matches = (options.players ?? []).filter(
      (p) =>
        game &&
        [game.home, game.away].map(nflTeamKey).includes(nflTeamKey(p.nflTeam ?? '')) &&
        playerNameKey(p.name) === playerNameKey(pendingProp.playerName),
    );
    setBetKind('player-prop');
    setGameId(pendingProp.gameId);
    setStat(pendingProp.stat);
    setLine(String(pendingProp.line));
    setSide(pendingProp.side);
    setOdds(pendingProp.odds === undefined ? '-110' : String(pendingProp.odds));
    setOppositeOdds(pendingProp.oppositeOdds === undefined ? '' : String(pendingProp.oppositeOdds));
    setQuote(undefined);
    setPropPlayer(matches.length === 1 ? [matches[0]!.id] : []);
    setView('decision');
    clearPropHandoff();
    setPendingProp(undefined);
  }, [pendingProp, options, mode]);
  function analyzeProp(pick: PropHandoff) {
    if (mode === 'betting') {
      setPendingProp(pick);
      return;
    }
    stashPropHandoff(pick);
    onNavigate({ section: 'Advice', adviceMode: 'betting', adviceId: '' });
  }
  const mine = allPlayers.filter((player) => player.teamId === teamId);
  const other = allPlayers.filter((player) => player.teamId === tradeTeamId);
  const commonStartingSpot = starterSlots(league?.settings.roster_positions).slots.some((slot) =>
    candidates.every((id) => {
      const player = mine.find((row) => row.id === id);
      return player && slot.positions.includes(player.position === 'DEF' ? 'DST' : player.position);
    }),
  );
  const picked = new Set(league?.draft?.picks.map((pick) => pick.playerId) ?? []);
  const available = allPlayers.filter(
    (player) => !player.teamId && (mode !== 'draft-plan' || !picked.has(player.id)),
  );
  const game = options?.games.find((item) => item.id === gameId);
  const gamePlayers = allPlayers.filter(
    (player) =>
      game && [game.home, game.away].map(nflTeamKey).includes(nflTeamKey(player.nflTeam ?? '')),
  );
  const selectedQuote =
    quote &&
    quote.gameId === gameId &&
    quote.kind === betKind &&
    quote.side === side &&
    quote.americanOdds === Number(odds) &&
    quote.oppositeAmericanOdds === Number(oppositeOdds) &&
    quote.line === (betKind === 'moneyline' ? undefined : Number(line))
      ? quote
      : undefined;
  const request: AdviceRequest = {
    mode,
    ...(connection !== 'saved' ? { connection } : {}),
    ...(!usesCodex ? { maxOutputTokens: Number(outputLimit) } : {}),
    ...(model && options?.models?.length ? { model } : {}),
    ...(options ? { season: options.season } : {}),
    ...(week
      ? {
          week:
            betting && game
              ? game.week
              : mode === 'trade'
                ? (options?.week ?? Number(week))
                : Number(week),
        }
      : {}),
    ...(!betting && league ? { leagueId: league.id, teamId } : {}),
    ...(question.trim() ? { question: question.trim() } : {}),
    ...((['draft-plan', 'waivers'].includes(mode) || (mode === 'lineup' && lineupComparison)) &&
    candidates.length
      ? { candidateIds: candidates }
      : {}),
    ...(mode === 'trade'
      ? { tradeTeamId, giveIds: give, receiveIds: receive, throughWeek: Number(tradeThroughWeek) }
      : {}),
    ...(mode === 'waivers' && mine.some((p) => p.id === dropPlayerId) ? { dropPlayerId } : {}),
    ...(betting
      ? {
          bet: {
            kind: betKind,
            gameId,
            side,
            americanOdds: Number(odds),
            ...(selectedQuote ? { quoteId: selectedQuote.id } : {}),
            ...(betKind === 'moneyline' ? {} : { line: line.trim() ? Number(line) : NaN }),
            ...(oppositeOdds.trim() ? { oppositeAmericanOdds: Number(oppositeOdds) } : {}),
            ...(betKind === 'player-prop' ? { playerId: propPlayer[0] ?? '', stat } : {}),
          },
        }
      : {}),
  };
  const canAnalyze = Boolean(
    options &&
    (options.connection ?? 'saved') === connection &&
    (connection === 'saved' ||
      options.connections?.some((item) => item.id === connection && item.status === 'signed-in')) &&
    (betting || league) &&
    isAdviceRequest(request) &&
    (mode !== 'lineup' || !lineupComparison || (candidates.length >= 2 && commonStartingSpot)) &&
    (!options?.models?.length || options.models.some((item) => item.id === model)) &&
    (mode !== 'trade' || (give.length && receive.length && tradeTeamId !== teamId)),
  );
  async function testSignedInConnection() {
    if (connectionTest.current || busy || testingConnection) return;
    const controller = new AbortController();
    connectionTest.current = controller;
    setTestingConnection(true);
    setConnectionFeedback('Testing the signed-in connection without league data…');
    try {
      const response = await requestResponse(
        '/api/advice/connection-test',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ connection }),
          signal: controller.signal,
        },
        40_000,
      );
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || (result as { ok?: unknown }).ok !== true)
        throw new Error('The signed-in connection test could not be verified.');
      if (mounted.current && !controller.signal.aborted)
        setConnectionFeedback(
          `${connection === 'codex-cli' ? 'Codex' : 'Claude'} answered the test. Both analysis passes will use this connection. Account limits and availability still apply.`,
        );
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) setConnectionFeedback(message(failure));
    } finally {
      if (connectionTest.current === controller) connectionTest.current = null;
      if (mounted.current) setTestingConnection(false);
    }
  }
  function cancelConnectionTest() {
    connectionTest.current?.abort();
    setConnectionFeedback('Connection test canceled. No league data was shared.');
  }
  const readinessKey = JSON.stringify(request);
  const currentReadiness = readiness?.key === readinessKey ? readiness.report : undefined;
  async function checkReadiness(signal?: AbortSignal) {
    const report = await requestJson(
      '/api/advice/readiness',
      isAdviceDataReadiness,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        ...(signal ? { signal } : {}),
      },
      60_000,
    );
    if (mounted.current && !signal?.aborted) setReadiness({ key: readinessKey, report });
    return report;
  }
  async function showReadiness() {
    if (checkingReadiness || !canAnalyze) return;
    const controller = new AbortController();
    readinessRequest.current = controller;
    setCheckingReadiness(true);
    setError('');
    try {
      await checkReadiness(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted) setError(message(failure));
    } finally {
      if (!controller.signal.aborted) setCheckingReadiness(false);
    }
  }
  async function analyze() {
    if (submitted.current || !canAnalyze || checkingReadiness) return;
    submitted.current = true;
    const id = crypto.randomUUID(),
      controller = new AbortController();
    analysis.current = { id, controller, started: false };
    setBusy(true);
    setBusySince(Date.now());
    setError('');
    setStatus('Analyzing the evidence, then reviewing the recommendation…');
    try {
      setStatus('Checking data readiness before AI analysis…');
      const report = await checkReadiness(controller.signal);
      if (report.status === 'blocked') {
        setStatus('Resolve data readiness before analyzing. No AI call was made.');
        setError(
          betting
            ? 'Choose another game and check its current odds. The selected game is no longer verified as upcoming.'
            : 'Choose a connected team and refresh your league before analyzing.',
        );
        return;
      }
      setStatus('Analyzing supported evidence, then reviewing the recommendation…');
      if (analysis.current?.id === id) analysis.current.started = true;
      setLastRequestId(id);
      const data = await requestJson(
        `/api/advice/${id}`,
        isAdviceResult,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        },
        315_000,
      );
      if (!mounted.current || controller.signal.aborted) return;
      setResult(data);
      setDirty(false);
      reloadHistory();
      setStatus('Advice saved.');
      onDirtyChange(false);
      onNavigate(
        {
          section: 'Advice',
          adviceId: data.id,
          adviceMode: data.request.mode,
          ...(data.request.leagueId ? { leagueId: data.request.leagueId } : {}),
        },
        false,
      );
    } catch (failure) {
      if (!mounted.current || controller.signal.aborted) return;
      setError(message(failure));
      setStatus(
        analysis.current?.started
          ? 'Check saved advice before starting a new paid analysis.'
          : 'Data could not be verified. No AI analysis was started.',
      );
      reloadHistory();
    } finally {
      if (mounted.current && !controller.signal.aborted) setBusy(false);
      if (analysis.current?.id === id) analysis.current = null;
      submitted.current = false;
    }
  }
  async function cancel() {
    const active = analysis.current;
    if (!active || canceling) return;
    if (!active.started) {
      active.controller.abort();
      analysis.current = null;
      submitted.current = false;
      setBusy(false);
      setStatus('Data check canceled. No AI analysis was started.');
      return;
    }
    setCanceling(true);
    try {
      await requestResponse(`/api/advice/${active.id}`, { method: 'DELETE' });
      active.controller.abort();
      analysis.current = null;
      submitted.current = false;
      if (mounted.current) {
        setBusy(false);
        setStatus('Analysis canceled. Provider work already performed may still be billed.');
      }
    } catch (failure) {
      if (mounted.current) setError(message(failure));
    } finally {
      if (mounted.current) setCanceling(false);
    }
  }
  async function checkSaved() {
    if (!lastRequestId) return;
    setError('');
    try {
      const response = await requestResponse(`/api/advice/${lastRequestId}`);
      if (!mounted.current) return;
      if (response.status === 202) {
        setStatus('This analysis is still running. Check again shortly.');
        return;
      }
      const value: unknown = await response.json();
      if (!isAdviceResult(value)) throw new Error('The saved advice could not be verified.');
      onNavigate({ section: 'Advice', adviceId: value.id, adviceMode: value.request.mode }, false);
    } catch (failure) {
      if (mounted.current) setError(message(failure));
    }
  }
  async function deleteResult() {
    if (
      !result ||
      !(await confirmAction('The analysis and its evidence will be removed from this computer.', {
        title: 'Delete this saved advice?',
        confirmLabel: 'Delete',
        tone: 'danger',
      }))
    )
      return;
    setError('');
    try {
      await requestResponse(`/api/advice/${result.id}`, { method: 'DELETE' });
      if (!mounted.current) return;
      onNavigate({ section: 'Advice', adviceId: '', adviceMode: result.request.mode }, false);
    } catch (failure) {
      if (mounted.current) setError(message(failure));
    }
  }
  const splitView = Boolean(
    wide &&
    result &&
    result.request.mode === mode &&
    (betting || (league && result.request.leagueId === league.id)),
  );
  const adviceForm = (
    <form
      className="advice-form"
      onSubmit={(event) => {
        event.preventDefault();
        void analyze();
      }}
    >
      <h2>{adviceTitle(mode)}</h2>
      {/* Deterministic shortlists; picking a row fills this form for the full analysis. */}
      {!result && league && teamId && mode === 'waivers' && (
        <WaiverDayPanel
          league={league.id}
          team={teamId}
          onUse={(candidate, drop) => {
            setCandidates([candidate]);
            setDropPlayerId(drop ?? '');
            changed();
          }}
        />
      )}
      {!result && league && teamId && mode === 'trade' && (
        <TradeIdeasPanel
          league={league.id}
          team={teamId}
          onUse={(idea) => {
            setTradeTeamId(idea.teamId);
            setGive([idea.give.playerId]);
            setReceive([idea.receive.playerId]);
            changed();
          }}
        />
      )}
      {optionsLoading && (
        <LoadingStatus message="Loading public football data and player choices…" />
      )}
      <fieldset disabled={busy || optionsLoading || testingConnection || checkingReadiness}>
        <div className="advice-form-columns">
          <div className="advice-form-main">
            {!betting && (
              <div className="advice-fields">
                <label>
                  Fantasy league
                  <select
                    value={league?.id ?? ''}
                    onChange={(event) =>
                      onNavigate({
                        section: 'Advice',
                        leagueId: event.target.value,
                        adviceMode: mode,
                        adviceId: '',
                      })
                    }
                  >
                    {leagues.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Your team
                  <select
                    value={teamId}
                    onChange={(event) => {
                      setTeamId(event.target.value);
                      onTeamSelect?.(event.target.value);
                      setDropPlayerId('');
                      setCandidates([]);
                      setGive([]);
                      setReceive([]);
                      changed();
                    }}
                  >
                    {league?.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {['lineup', 'waivers'].includes(mode) && (
              <label>
                NFL week
                <input
                  type="number"
                  min="1"
                  max="18"
                  required
                  value={week}
                  onChange={(event) => {
                    setWeek(event.target.value);
                    changed();
                  }}
                />
              </label>
            )}
            {mode === 'lineup' && (
              <>
                <label>
                  What do you want to check?
                  <select
                    value={lineupComparison ? 'compare' : 'full'}
                    onChange={(event) => {
                      setLineupComparison(event.target.value === 'compare');
                      setCandidates([]);
                      changed();
                    }}
                  >
                    <option value="full">My full starting lineup</option>
                    <option value="compare">Compare players for one spot</option>
                  </select>
                </label>
                {lineupComparison && (
                  <PlayerPicker
                    label="Players competing for one spot"
                    players={mine}
                    selected={candidates}
                    onChange={(ids) => {
                      setCandidates(ids);
                      changed();
                    }}
                    hint="Choose 2–20 players from your team who fit the same starting spot, such as two receivers or a running back and receiver for Flex. Other lineup slots are not included."
                  />
                )}
                {lineupComparison && candidates.length >= 2 && !commonStartingSpot && (
                  <p role="status">
                    Choose players who share a starting spot in your league, such as two receivers
                    or a running back and receiver for Flex.
                  </p>
                )}
              </>
            )}
            {['draft-plan', 'draft-review', 'trade'].includes(mode) && (
              <p>
                {mode === 'trade'
                  ? `We estimate remaining points for ${options?.season ?? 'this season'}, weeks ${options?.week ?? 'the current week'}–${tradeThroughWeek}, from public stats and the NFL schedule when enough history is available. Already-earned points are excluded.`
                  : 'We estimate season points from public stats and the NFL schedule when enough history is available. Estimates assume the player’s recorded role continues.'}{' '}
                Matching scoring-confirmed imports take priority and can cover missing estimates.{' '}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onNavigate({ section: 'Imports' })}
                >
                  Import projections
                </button>
              </p>
            )}
            {mode === 'trade' && (
              <label>
                Count remaining value through NFL week
                <input
                  type="number"
                  min={options?.week ?? 1}
                  max="18"
                  required
                  value={tradeThroughWeek}
                  onChange={(event) => {
                    setTradeThroughWeek(event.target.value);
                    changed();
                  }}
                />
                <span>
                  Choose your league’s last week. Automatic estimates exclude byes and played games.
                  Imported projections must cover the same interval.
                </span>
              </label>
            )}
            {mode === 'draft-review' && (
              <p>
                We review the connected team’s logged picks. Refresh the league after the draft so
                its latest picks are included.
              </p>
            )}
            {['draft-plan', 'waivers'].includes(mode) && (
              <PlayerPicker
                label="Players to compare (optional)"
                players={available}
                selected={candidates}
                onChange={(ids) => {
                  setCandidates(ids);
                  changed();
                }}
                hint="Leave empty to screen available players. Search and choose up to 20 for a specific comparison."
              />
            )}
            {mode === 'waivers' && (
              <label>
                Player to drop (optional)
                <select
                  aria-label="Player to drop (optional)"
                  aria-describedby="advice-waiver-drop-hint"
                  value={mine.some((p) => p.id === dropPlayerId) ? dropPlayerId : ''}
                  onChange={(event) => {
                    setDropPlayerId(event.target.value);
                    changed();
                  }}
                >
                  <option value="">Screen additions before choosing a drop</option>
                  {mine.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} · {player.position}
                    </option>
                  ))}
                </select>
                <span id="advice-waiver-drop-hint">
                  Choose a player to compare the full add/drop impact on your starting lineup.
                  Confirm roster locks and waiver rules before submitting a move.
                </span>
              </label>
            )}
            {mode === 'trade' && (
              <>
                <PlayerPicker
                  label="Players you give"
                  players={mine}
                  selected={give}
                  onChange={(ids) => {
                    setGive(ids);
                    changed();
                  }}
                />
                <label>
                  Other team
                  <select
                    value={tradeTeamId}
                    onChange={(event) => {
                      setTradeTeamId(event.target.value);
                      setReceive([]);
                      changed();
                    }}
                  >
                    <option value="">Choose a team</option>
                    {league?.teams
                      .filter((team) => team.id !== teamId)
                      .map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                  </select>
                </label>
                <PlayerPicker
                  label="Players you receive"
                  players={other}
                  selected={receive}
                  onChange={(ids) => {
                    setReceive(ids);
                    changed();
                  }}
                />
              </>
            )}
            {betting && <BetLimit history={history} />}
            {betting && (
              <BetFields
                options={options}
                game={game}
                gamePlayers={gamePlayers}
                selectedQuote={selectedQuote}
                busy={busy}
                betKind={betKind}
                setBetKind={setBetKind}
                gameId={gameId}
                setGameId={setGameId}
                propPlayer={propPlayer}
                setPropPlayer={setPropPlayer}
                stat={stat}
                setStat={setStat}
                side={side}
                setSide={setSide}
                line={line}
                setLine={setLine}
                odds={odds}
                setOdds={setOdds}
                oppositeOdds={oppositeOdds}
                setOppositeOdds={setOppositeOdds}
                quote={quote}
                setQuote={setQuote}
                changed={changed}
                onExploreSignals={() => setView('signals')}
                onOpenProps={() => setView('props')}
              />
            )}
            <label>
              Anything else to consider? (optional)
              <textarea
                rows={3}
                maxLength={2000}
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  changed();
                }}
                placeholder="Example: I need safer starters this week, or I want to improve my running back depth."
              />
            </label>
          </div>
          {/* Connection, limits and the Analyze button stay in view beside the inputs on desktop. */}
          <div className="advice-run-panel">
            {options && (
              <p>
                {options.season} NFL season ·{' '}
                {connection !== 'saved'
                  ? 'AI connection for this analysis: '
                  : 'Saved AI connection: '}
                <strong>{options.model}</strong>
              </p>
            )}
            {/* Most people keep the saved connection, so per-analysis overrides stay tucked away. */}
            {(!!options?.connections?.length || !!options?.models?.length) && (
              <details className="advice-ai-options" open={connection !== 'saved' || undefined}>
                <summary>Change AI connection or model</summary>
                {!!options?.connections?.length && (
                  <section aria-label="AI connection for this analysis">
                    <label>
                      AI connection
                      <select
                        value={connection}
                        onChange={(event) => {
                          setConnection(event.target.value as AdviceConnection);
                          setModel('');
                          setConnectionFeedback('');
                          changed();
                        }}
                      >
                        {options.connections.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                            {item.status === 'not-installed'
                              ? ' · Not installed'
                              : item.status === 'signed-out'
                                ? ' · Sign in needed'
                                : item.status === 'unavailable'
                                  ? ' · Sign-in check unavailable'
                                  : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    {connection !== 'saved' && (
                      <>
                        <p>
                          {options.connections.find((item) => item.id === connection)?.status ===
                          'signed-in'
                            ? connection === 'codex-cli'
                              ? 'Your ChatGPT subscription is signed in. No new API key is needed. GPT-6.1-Sol analyzes and reviews with high reasoning; subscription limits apply.'
                              : 'Your Claude subscription is signed in. No new API key is needed. Opus analyzes and reviews; subscription limits apply.'
                            : connection === 'codex-cli'
                              ? 'An installed Codex CLI with a supported version and ChatGPT sign-in is needed. Check Help, then reload connections. This does not create an account or API key.'
                              : 'An installed, signed-in Claude CLI is needed. Check its sign-in, then reload connections. This does not create an account or API key.'}
                        </p>
                        <button
                          type="button"
                          className="small-button"
                          disabled={
                            !options.connections.some(
                              (item) => item.id === connection && item.status === 'signed-in',
                            )
                          }
                          onClick={() => void testSignedInConnection()}
                        >
                          Test signed-in AI
                        </button>
                        <details>
                          <summary>Connection details</summary>
                          <p>
                            Uses the {connection === 'codex-cli' ? 'Codex' : 'Claude'} CLI installed
                            on this computer. Sign-in does not guarantee the model is currently
                            available. Test signed-in AI checks generation without sharing league
                            data.
                            {connection === 'codex-cli' &&
                              ' This experimental connection requires the verified CLI version listed in Help.'}
                          </p>
                        </details>
                      </>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setOptionsRevision((value) => value + 1)}
                    >
                      Reload connections
                    </button>
                    {connectionFeedback && <p role="status">{connectionFeedback}</p>}
                  </section>
                )}
                {!!options?.models?.length && (
                  <div className="advice-model-choice">
                    <label>
                      Model
                      <select
                        value={model}
                        onChange={(event) => {
                          setModel(event.target.value);
                          changed();
                        }}
                      >
                        {!options.models.some((item) => item.id === model) && (
                          <option value={model} disabled>
                            {model} · No longer available
                          </option>
                        )}
                        {options.models.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.id}
                            {item.id === options.recommendedModel
                              ? ' · Recommended for deep analysis'
                              : ''}
                            {item.id === options.model && connection === 'saved'
                              ? ' · Saved model'
                              : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {connection !== 'saved'
                        ? 'Applies to this analysis only. Your saved API prices do not apply to subscription usage.'
                        : model !== options.model
                          ? 'Applies to this analysis only. Your saved model’s prices do not apply, so a cost estimate will be unavailable.'
                          : 'Applies to this analysis only; your saved settings don’t change.'}
                    </p>
                  </div>
                )}
              </details>
            )}
            <details>
              <summary>Advanced analysis limits</summary>
              {usesCodex ? (
                <p>
                  Codex subscription limits apply. This connection does not support a token budget
                  per pass. Analysis still has a time and response-size limit, and you can cancel
                  it.
                </p>
              ) : (
                <>
                  <label>
                    Reasoning and answer limit per pass
                    <select
                      value={outputLimit}
                      onChange={(event) => {
                        setOutputLimit(event.target.value);
                        changed();
                      }}
                    >
                      <option value="16384">Deep analysis · up to 16,384 tokens</option>
                      <option value="8192">Standard · up to 8,192 tokens</option>
                      <option value="4096">Compact · up to 4,096 tokens</option>
                    </select>
                  </label>
                  <p>
                    The provider counts reasoning and answer text toward this limit. Lower limits
                    can end an answer early. Charges depend on actual usage.
                  </p>
                </>
              )}
            </details>
            <p className="advice-privacy">
              Uses two AI calls, which your provider may charge for. Only football data and your
              note are sent.
            </p>
            <details>
              <summary>Privacy & analysis details</summary>
              <p>
                The selected football evidence, team name and note go to your chosen AI service.
                Private member notes and conversations are excluded. Analysis and review may take
                several minutes; you can cancel while they run. No new key is needed.
              </p>
            </details>

            {!canAnalyze && options && (
              <p>
                {connection !== 'saved' &&
                !options.connections?.some(
                  (item) => item.id === connection && item.status === 'signed-in',
                )
                  ? connection === 'codex-cli'
                    ? 'Check the supported Codex CLI version and ChatGPT sign-in, then reload connections before analyzing.'
                    : 'Check the Claude CLI sign-in and reload connections before analyzing.'
                  : options.models?.length && !options.models.some((item) => item.id === model)
                    ? 'Choose an available AI model to continue. Your previous choice has been retained.'
                    : mode === 'trade'
                      ? 'Choose players from both teams to continue.'
                      : betting
                        ? 'Choose a game and complete the line, odds, and player when needed.'
                        : 'Choose your team and a valid week to continue.'}
              </p>
            )}
            <section className="readiness-entry">
              <h3>Check the evidence first</h3>
              <p>See which players have estimates and injury reports before spending an AI call.</p>
              <button
                type="button"
                className="small-button"
                disabled={!canAnalyze || busy || checkingReadiness}
                onClick={() => void showReadiness()}
              >
                {checkingReadiness ? 'Checking data…' : 'Check data readiness'}
              </button>
              {currentReadiness && <DataReadiness report={currentReadiness} />}
            </section>
            <button
              className="primary-button"
              type="submit"
              disabled={
                !canAnalyze ||
                busy ||
                testingConnection ||
                checkingReadiness ||
                currentReadiness?.status === 'blocked'
              }
            >
              {busy ? 'Analyzing & reviewing…' : 'Analyze my choices'}
            </button>
          </div>
        </div>
      </fieldset>
      {testingConnection && (
        <button className="small-button" type="button" onClick={cancelConnectionTest}>
          Cancel connection test
        </button>
      )}

      {!!options?.warnings.length && (
        <details>
          <summary>Public data notices ({options.warnings.length})</summary>
          <ul>
            {options.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </form>
  );
  return (
    <div className="advice-page">
      <div className="page-title-block">
        <div>
          <p className="section-overline">DECIDE WITH EVIDENCE</p>
          <h1>Advice</h1>
          {!result && (
            <p>
              Pick a decision, check the evidence, then make the call your league will screenshot.
            </p>
          )}
        </div>
        <button
          className="small-button"
          type="button"
          onClick={() => onNavigate({ section: 'Help', helpId: 'advice' })}
        >
          How advice works
        </button>
        {result && (
          <button
            type="button"
            className="small-button"
            onClick={() =>
              onNavigate({ section: 'Advice', adviceId: '', adviceMode: result.request.mode })
            }
          >
            New decision
          </button>
        )}
      </div>
      <nav className="advice-view-nav" aria-label="Advice workspace">
        {(
          [
            ['decision', result ? 'Your decision' : 'New decision'],
            ['history', `Saved advice${history.length ? ` (${history.length})` : ''}`],
            ['props', 'Player props'],
            ['research', 'Track results'],
            ['signals', 'Market signals'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={view === key ? 'page' : undefined}
            className={view === key ? 'active' : undefined}
            disabled={busy || testingConnection || checkingReadiness}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div hidden={view !== 'decision'}>
        {!result && (
          <>
            <div className="advice-choices" aria-label="Choose an advice type">
              {[...adviceChoices]
                .sort(
                  (a, b) =>
                    ['lineup', 'waivers', 'trade', 'draft-plan', 'draft-review', 'betting'].indexOf(
                      a.mode,
                    ) -
                    ['lineup', 'waivers', 'trade', 'draft-plan', 'draft-review', 'betting'].indexOf(
                      b.mode,
                    ),
                )
                .map((choice) => (
                  <Fragment key={choice.mode}>
                    {choice.mode === 'betting' && (
                      <span className="labs-label" aria-hidden="true">
                        Labs
                      </span>
                    )}
                    <button
                      type="button"
                      className={mode === choice.mode ? 'active' : ''}
                      aria-pressed={mode === choice.mode}
                      onClick={() =>
                        onNavigate({ section: 'Advice', adviceMode: choice.mode, adviceId: '' })
                      }
                    >
                      <strong>{choice.title}</strong>
                    </button>
                  </Fragment>
                ))}
            </div>
            {betting && (
              <p className="betting-brief">
                Research only · a consistent sportsbook edge has not been established.
              </p>
            )}
          </>
        )}
        {error && (
          <div className="advice-error" role="alert">
            <p>{error}</p>
            {!busy && (
              <button
                className="small-button"
                type="button"
                onClick={() => setOptionsRevision((value) => value + 1)}
              >
                {resultId ? 'Retry saved advice' : 'Reload choices'}
              </button>
            )}
            {!!lastRequestId && !busy && (
              <button className="small-button" type="button" onClick={() => void checkSaved()}>
                Check saved advice
              </button>
            )}
            <button
              className="text-button"
              type="button"
              onClick={() => onNavigate({ section: 'Settings', settingId: 'ai-runtime' })}
            >
              Check AI connection
            </button>
          </div>
        )}
        {busy ? (
          <WaitStatus
            label={status || 'Analyzing…'}
            since={busySince}
            typical="usually under a minute (two AI calls)"
            slowAfterSeconds={120}
            onCancel={() => void cancel()}
            cancelLabel="Cancel analysis"
            canceling={canceling}
          />
        ) : (
          status && <p role="status">{status}</p>
        )}
        {resultLoading ? (
          <LoadingStatus message="Opening saved advice…" />
        ) : result ? (
          <div className={splitView ? 'advice-split' : undefined}>
            {splitView && (
              <section className="advice-split-form" aria-label="Change inputs and analyze again">
                <p className="section-overline">CHANGE AND RE-RUN</p>
                {adviceForm}
              </section>
            )}
            <div>
              <AdviceResultView result={result} />
              <div className="advice-result-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() =>
                    onNavigate({ section: 'Advice', adviceId: '', adviceMode: result.request.mode })
                  }
                >
                  Start another analysis
                </button>
                <button className="text-button" type="button" onClick={() => void deleteResult()}>
                  Delete saved advice
                </button>
              </div>
            </div>
          </div>
        ) : !resultId ? (
          <>
            {!betting && !league ? (
              <section className="advice-empty">
                <h2>Connect a league for fantasy advice</h2>
                <p>We use your league’s teams, roster slots, and scoring rules.</p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onNavigate({ section: 'Leagues' })}
                >
                  Connect a league
                </button>
              </section>
            ) : (
              adviceForm
            )}
          </>
        ) : null}
      </div>
      {view === 'props' && (
        <PropsBoard
          leagueId={league?.id}
          myTeamName={league?.teams.find((t) => t.id === (preferredTeamId ?? teamId))?.name}
          onAnalyze={analyzeProp}
        />
      )}
      {view === 'signals' && (
        <Suspense fallback={<LoadingStatus message="Loading Market Signals…" />}>
          <MarketSignalsPanel />
        </Suspense>
      )}
      {view === 'research' && (
        <section className="advice-research">
          <h2>Track results</h2>
          <p>Review saved forecasts and hypothetical outcomes.</p>
          <AdviceJournal disabled={busy} />
          <AdvicePerformance disabled={busy} />
        </section>
      )}
      <AdviceHistory
        hidden={view !== 'history'}
        history={history}
        historyError={historyError}
        onRefresh={reloadHistory}
        onOpen={(item) => {
          if (
            item.id === resultId ||
            onNavigate({
              section: 'Advice',
              adviceId: item.id,
              adviceMode: item.mode,
              ...(item.leagueId ? { leagueId: item.leagueId } : {}),
            })
          )
            setView('decision');
        }}
      />
    </div>
  );
}
function message(error: unknown): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : 'Advice could not be loaded. Try again.';
}
