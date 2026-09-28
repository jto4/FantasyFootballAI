import type { LeagueConnection, ReportKind } from '@sidekick/core';
import { matchRosterInjuries, type NFLInjuryReportCache } from '@sidekick/integrations';

export interface InjuryCitationSource {
  title: string;
  url: string;
}

export interface InjuryPromptEvidence {
  text: string;
  citationSource?: InjuryCitationSource;
}

/** Resolve optional injury context separately from report orchestration and AI prompting. */
export async function buildInjuryPromptEvidence(
  enabled: boolean,
  kind: ReportKind,
  league: LeagueConnection,
  cache: NFLInjuryReportCache,
): Promise<InjuryPromptEvidence> {
  if (!enabled) {
    return {
      text: 'The separate nflverse injury-report feed is disabled. Existing fantasy-platform availability labels may be stale; do not infer diagnosis or return dates.',
    };
  }
  if (kind !== 'matchup-preview') {
    return {
      text: 'The separate nflverse injury-report feed is enabled but has no current-week data for this league. Do not invent or infer injury details.',
    };
  }

  const season = league.season;
  const matchupWeek = league.matchups?.[0]?.week;
  const configuredWeek = Number(league.settings.currentWeek);
  const week =
    Number.isInteger(configuredWeek) && configuredWeek >= 1 && configuredWeek <= 30
      ? configuredWeek
      : matchupWeek;
  if (season === undefined || season < 2009 || week === undefined) {
    return {
      text: 'The separate nflverse injury-report feed is enabled but has no current-week data for this league. Do not invent or infer injury details.',
    };
  }

  try {
    const snapshot = await cache.get(season);
    const matchedInjuries = matchRosterInjuries(league, snapshot.rows, week);
    if (!matchedInjuries.length) {
      return {
        text: `nflverse injury data retrieved locally at ${snapshot.retrievedAt}; no exact current-week roster matches were available for week ${week}. Do not invent or infer injury details.`,
      };
    }
    return {
      text: `nflverse injury data retrieved locally at ${snapshot.retrievedAt}; exact roster matches for week ${week}: ${JSON.stringify(matchedInjuries)}. These are source-reported practice and game-status labels, not medical advice. Do not infer diagnosis or return dates. When using these facts, cite the exact CSV URL ${snapshot.sourceUrl} and attribute nflverse-data contributors under CC BY 4.0.`,
      citationSource: {
        title: 'nflverse NFL injury reports (CC BY 4.0 attribution)',
        url: snapshot.sourceUrl,
      },
    };
  } catch {
    return {
      text: 'The nflverse injury feed could not be refreshed for this report. Do not infer injury details from it; any fantasy-platform availability labels may be stale.',
    };
  }
}
