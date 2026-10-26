import type { LeagueConnection } from '@sidekick/core';
import { PropsBoard } from './PropsBoard';
import { stashPropHandoff } from './prop-handoff';
import type { SearchDestination } from './search-catalog';

/** Player props get their own page; a pick still opens the bet analysis in Advice. */
export function PropsPage({
  league,
  teamId,
  initialPlayer,
  onNavigate,
}: {
  league: LeagueConnection | undefined;
  teamId: string | undefined;
  initialPlayer?: string;
  onNavigate: (destination: SearchDestination) => void;
}) {
  return (
    <div className="props-page">
      {/* The board below carries the week and the explanation. */}
      <div className="page-title-block compact">
        <div>
          <p className="section-overline">BETTING RESEARCH</p>
          <h1>Props</h1>
        </div>
      </div>
      <PropsBoard
        leagueId={league?.id}
        myTeamName={league?.teams.find((t) => t.id === teamId)?.name}
        {...(initialPlayer ? { initialPlayer } : {})}
        onAnalyze={(pick) => {
          stashPropHandoff(pick);
          onNavigate({ section: 'Advice', adviceMode: 'betting', adviceId: '' });
        }}
      />
    </div>
  );
}
