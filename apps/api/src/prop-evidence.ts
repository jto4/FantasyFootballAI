import {
  propModelStats,
  type BetEvidence,
  type BetTerms,
  type FootballDataSnapshot,
  type FootballGame,
  type RosterPlayer,
} from '@sidekick/core';
import type { UsageSnapshot } from '@sidekick/integrations';
import { propModelFor } from './prop-model-runtime.js';

/**
 * Adds the props board's numbers to a player-prop bet's evidence: the app's chance of the over
 * and its fair line, so the analysis and the board agree. Non-prop bets and players the model
 * cannot price are left unchanged.
 */
export function addPropEvidence(
  betHistory: BetEvidence,
  input: {
    bet: BetTerms;
    players: RosterPlayer[];
    data: FootballDataSnapshot;
    targetGame: FootballGame | undefined;
    season: number;
    /** Snap counts and depth charts; without them those model features stay off. */
    usage?: UsageSnapshot | undefined;
  },
) {
  const { bet, data, targetGame } = input;
  const propPlayer =
    bet.kind === 'player-prop'
      ? input.players.find((player) => player.id === bet.playerId)
      : undefined;
  // The props board's model: tested center, fitted outcome spread, anchored to the line.
  if (
    propPlayer &&
    targetGame &&
    bet.stat &&
    bet.line !== undefined &&
    (propModelStats as readonly string[]).includes(bet.stat)
  ) {
    const prediction = propModelFor(data, input.usage).predict({
      stat: bet.stat,
      playerName: propPlayer.name,
      team: propPlayer.nflTeam,
      game: targetGame,
      line: bet.line,
    });
    if (prediction) {
      const modelSources = [
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
          description: `The app’s own projection from recent production, snap share, depth chart, the betting total and spread, the opponent and home field; outcome spread fitted on 2025 games and checked on 2026 games it never saw. The line is treated as the market’s coin flip and the model claims only part of its disagreement, because books price role and injury news the model lacks. Not tested against historical sportsbook lines; graded going forward on the props board.`,
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
