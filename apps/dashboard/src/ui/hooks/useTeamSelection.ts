import { useState } from 'react';
import type { LeagueConnection } from '@sidekick/core';
import { readTeamSelections, saveTeamSelections, selectedTeamId } from '../team-selection';

/**
 * The owner's team in each league, shared by Home, Live and Advice and kept across restarts.
 * `onSaveFailed` reports a choice that applies now but could not be saved on this device.
 */
export function useTeamSelection(league: LeagueConnection | undefined, onSaveFailed: () => void) {
  const [selections, setSelections] = useState(readTeamSelections);
  const teamId = selectedTeamId(league, selections);
  function chooseTeam(id: string) {
    if (!league?.teams.some((team) => team.id === id)) return;
    const next = Object.fromEntries([
      ...Object.entries(selections)
        .filter(([key]) => key !== league.id)
        .slice(-99),
      [league.id, id],
    ]);
    void saveTeamSelections(next).catch(onSaveFailed);
    setSelections(next);
  }
  return { teamId, chooseTeam };
}
