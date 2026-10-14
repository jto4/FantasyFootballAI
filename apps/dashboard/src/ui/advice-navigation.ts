import type { AdviceMode } from '@sidekick/core';

export const adviceChoices: {
  mode: AdviceMode;
  title: string;
  description: string;
  aliases: string;
}[] = [
  {
    mode: 'draft-plan',
    title: 'Plan my draft',
    description: 'Compare available players, roster needs, and draft value.',
    aliases: 'pre draft planning who should I draft rankings sleeper picks',
  },
  {
    mode: 'draft-review',
    title: 'Review my draft',
    description: 'Review your picks, value, and gaps after the draft.',
    aliases: 'post draft grade analysis review picks adp',
  },
  {
    mode: 'lineup',
    title: 'Set my lineup',
    description: 'Choose starters with scoring, workload, and availability evidence.',
    aliases: 'start sit bench matchup lineup flex who should I start',
  },
  {
    mode: 'trade',
    title: 'Compare a trade',
    description: 'See how giving and receiving players affects your team.',
    aliases: 'trade evaluate offer accept reject player swap',
  },
  {
    mode: 'waivers',
    title: 'Find waiver pickups',
    description: 'Compare available players and their impact on your lineup.',
    aliases: 'waiver wire free agents add drop pickup faab',
  },
  {
    mode: 'betting',
    title: 'Analyze a bet',
    description: 'Check fetched game prices or manually entered lines and player props.',
    aliases: 'football nfl bet betting props spread total over under moneyline odds',
  },
];
export function isAdviceMode(value: unknown): value is AdviceMode {
  return adviceChoices.some((choice) => choice.mode === value);
}
export function adviceTitle(mode: AdviceMode): string {
  return adviceChoices.find((choice) => choice.mode === mode)!.title;
}
