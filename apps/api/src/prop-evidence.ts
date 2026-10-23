import {
  buildPropModelLeague,
  nflTeamKey,
  playerNameKey,
  predictProp,
  propLean,
  propModelSettings,
  propModelStats,
  type BetEvidence,
  type BetTerms,
  type FootballDataSnapshot,
  type FootballGame,
  type PropModelStat,
  type RosterPlayer,
} from '@sidekick/core';

/**
 * Adds the props board's numbers to a player-prop bet's evidence: ESPN's projection, the
 * typical-game estimate, the gap lean, and the prop model's chance and fair line. The analysis
 * and the board then agree. Non-prop bets and props without a projection are left unchanged.
 */
export function addPropEvidence(
  betHistory: BetEvidence,
  input: {
    bet: BetTerms;
    players: RosterPlayer[];
    data: FootballDataSnapshot;
    targetGame: FootballGame | undefined;
    season: number;
  },
) {
  const { bet, data, targetGame, season } = input;
  const propPlayer =
    bet.kind === 'player-prop'
      ? input.players.find((player) => player.id === bet.playerId)
      : undefined;
  const forecast =
    propPlayer && targetGame
      ? (data.playerForecasts ?? []).find(
          (f) =>
            f.week === targetGame.week &&
            (propPlayer.espnId
              ? f.espnId === propPlayer.espnId
              : playerNameKey(f.name) === playerNameKey(propPlayer.name) &&
                nflTeamKey(f.team) === nflTeamKey(propPlayer.nflTeam ?? '')),
        )
      : undefined;
  const projected = bet.stat ? forecast?.stats[bet.stat] : undefined;
  if (forecast && bet.stat && projected !== undefined && bet.line !== undefined) {
    // The same comparison the props board shows, so the analysis and the board agree.
    const recent = data.players
      .filter(
        (row) =>
          row.season === season &&
          row.seasonType === 'REG' &&
          row.week < targetGame!.week &&
          playerNameKey(row.name) === playerNameKey(forecast.name),
      )
      .map((row) => row.stats[bet.stat!])
      .filter((v): v is number => v !== undefined);
    const { lean, median, spread } = propLean(bet.stat, bet.line, projected, recent);
    betHistory.metrics.push(
      {
        id: 'prop-espn-projection',
        label: 'ESPN projection for this stat (average game)',
        value: projected,
        unit: bet.stat,
        sourceIds: [forecast.sourceId],
      },
      {
        id: 'prop-typical-game',
        label: 'Projection adjusted to a typical game',
        value: median,
        unit: bet.stat,
        sourceIds: [forecast.sourceId],
        description:
          'Most players finish below their own average in most games (2025: receivers topped average receiving yards in 42% of games), so the average is scaled by a measured typical-game ratio before comparing with the line.',
      },
      {
        id: 'prop-lean-score',
        label: 'Typical game minus line, in usual game-to-game swings',
        value: lean?.score ?? 0,
        unit: 'swings',
        sourceIds: [forecast.sourceId],
        ...(recent.length ? { sampleSize: recent.length } : {}),
        description: `Positive favors the over. Usual swing used: ${Math.round(spread * 10) / 10}. ${lean ? `Gap lean: ${lean.side} (${lean.strength}).` : 'Too close for a gap lean.'}`,
      },
    );
  }
  // The props board's model: tested center, fitted outcome spread, anchored to the line.
  if (
    propPlayer &&
    targetGame &&
    bet.stat &&
    bet.line !== undefined &&
    (propModelStats as readonly string[]).includes(bet.stat)
  ) {
    const regular = data.players.filter((row) => row.seasonType === 'REG');
    const ids = new Set(
      regular
        .filter(
          (row) =>
            playerNameKey(row.name) === playerNameKey(propPlayer.name) &&
            nflTeamKey(row.team) === nflTeamKey(propPlayer.nflTeam ?? ''),
        )
        .map((row) => row.playerId),
    );
    const history = ids.size === 1 ? regular.filter((row) => ids.has(row.playerId)) : [];
    const stat = bet.stat as PropModelStat;
    const prediction = history.length
      ? predictProp(
          {
            stat,
            position: propPlayer.position ?? history[0]!.position,
            team: propPlayer.nflTeam ?? history[0]!.team,
            game: targetGame,
            history,
            line: bet.line,
            ...(projected !== undefined ? { espnProjection: projected } : {}),
          },
          buildPropModelLeague(regular, data.games),
          propModelSettings[stat],
        )
      : undefined;
    if (prediction) {
      const modelSources = [
        ...(forecast ? [forecast.sourceId] : []),
        ...data.sources
          .filter((src) => src.id.startsWith('stats-') || src.id === 'games')
          .map((src) => src.id),
      ];
      betHistory.metrics.push(
        {
          id: 'prop-model-over-chance',
          label: 'Prop model chance of the over at this line',
          value: Math.round(prediction.overChance * 1000) / 10,
          unit: '%',
          sourceIds: modelSources,
          sampleSize: prediction.sampleGames,
          description: `Center from ${prediction.source === 'espn' ? 'ESPN’s projection' : prediction.source === 'blend' ? 'ESPN’s projection blended with the model' : 'the model alone'}; outcome spread fitted on 2025–26 games and calibrated on 2026 games it never saw. The line is treated as the market’s coin flip and the model claims only part of its disagreement, because books price role and injury news the model lacks. Not tested against historical sportsbook lines; graded going forward on the props board.`,
        },
        {
          id: 'prop-model-fair-line',
          label: 'Prop model coin-flip line (median)',
          value: Math.round(prediction.median * 10) / 10,
          unit: bet.stat,
          sourceIds: modelSources,
        },
      );
    }
  }
}
