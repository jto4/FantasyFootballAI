import type { LeagueConnection } from '@sidekick/core';
const key = 'sidekick.teamSelection.v1';
export function readTeamSelections(): Record<string, string> {
  try {
    const value: unknown =
      window.sidekickDesktop?.getTeamSelections?.() ??
      JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([league, team]) =>
            league.length <= 256 &&
            typeof team === 'string' &&
            team.length <= 256 &&
            !/[\u0000-\u001f]/.test(league + team),
        )
        .slice(0, 100),
    );
  } catch {
    return {};
  }
}
export async function saveTeamSelections(value: Record<string, string>) {
  if (window.sidekickDesktop?.setTeamSelections)
    await window.sidekickDesktop.setTeamSelections(value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('Your team choice could not be saved.');
  }
}
export function selectedTeamId(
  league: LeagueConnection | undefined,
  selections: Record<string, string>,
) {
  const id = league && selections[league.id];
  return league?.teams.some((team) => team.id === id) ? id : undefined;
}
