import { Fragment, type RefObject } from 'react';
import type { LeagueConnection, ReportSummary } from '@sidekick/core';
import {
  CalendarDays,
  ChevronDown,
  CircleHelp,
  FileText,
  Home,
  MessageCircle,
  Power,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Sprout,
  MessagesSquare,
  Users,
  Zap,
} from 'lucide-react';
import { ThemeSwitch } from './Appearance';
import { WorkspaceSearch } from './WorkspaceSearch';
import { platformName } from './platform-name';
import type { SearchDestination } from './search-catalog';

export type ServiceStatus = 'checking' | 'running' | 'stopping' | 'stopped' | 'unavailable';

const menu = [
  { section: 'League desk', label: 'Home', icon: Home },
  { section: 'Advice', label: 'Advice', icon: Sparkles },
  { section: 'Ask', label: 'Ask', icon: MessagesSquare },
  { section: 'Reports', label: 'Reports', icon: FileText },
  { section: 'Live', label: 'Live', icon: Radio },
  { section: 'Schedule', label: 'Schedule', icon: CalendarDays },
  { section: 'Settings', label: 'Settings', icon: Settings },
];
// Labs tools (chat memory and imports) sit after the everyday tools under their own label.
const tools = [
  { section: 'Leagues', label: 'Leagues', icon: Users, labs: false },
  { section: 'Dynasty', label: 'Dynasty', icon: Sprout, labs: false },
  { section: 'Help', label: 'Help', icon: CircleHelp, labs: false },
  { section: 'Members & memory', label: 'League members', icon: MessageCircle, labs: true },
  { section: 'Imports', label: 'Imports', icon: FileText, labs: true },
];

/** Matches the CSS breakpoint where navigation becomes a bottom tab bar. */
export function isPhoneLayout() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 800px)').matches === true
  );
}

export function isToolSection(section: string) {
  return tools.some((tool) => tool.section === section);
}

export function AppSidebar({
  asideRef,
  section,
  showTools,
  onShowToolsChange,
  serviceStatus,
  onNavigate: navigate,
  onStop,
  dynastyLeague = false,
}: {
  /** The active league is keeper or dynasty: its page joins the main menu on desktop. */
  dynastyLeague?: boolean;
  asideRef: RefObject<HTMLElement | null>;
  section: string;
  showTools: boolean;
  onShowToolsChange: (open: boolean) => void;
  serviceStatus: ServiceStatus;
  onNavigate: (section: string) => void;
  onStop: () => void;
}) {
  return (
    <aside ref={asideRef} className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Zap size={19} fill="currentColor" />
        </div>
        <span>
          Sunday<span className="brand-light">Sidekick</span>
        </span>
      </div>
      <nav className="nav-list">
        {(dynastyLeague
          ? [
              ...menu.slice(0, 5),
              { section: 'Dynasty', label: 'Dynasty', icon: Sprout },
              ...menu.slice(5),
            ]
          : menu
        ).map(({ section: destination, label, icon: Icon }) => (
          <button
            key={label}
            aria-current={section === destination ? 'page' : undefined}
            onClick={() => navigate(destination)}
            // The phone bottom bar has no room for Ask (the top bar's Ask button opens chat there)
            // or Dynasty (under More tools there).
            className={`nav-item ${section === destination ? 'active' : ''}${destination === 'Ask' || destination === 'Dynasty' ? ' nav-item-desktop' : ''}`}
          >
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
            {label === 'Home' && <i className="nav-dot" />}
          </button>
        ))}
        <details
          className="more-tools"
          open={showTools}
          onToggle={(event) => onShowToolsChange(event.currentTarget.open)}
        >
          <summary>
            More<span className="more-tools-full"> tools</span>
          </summary>
          <div className="more-tools-menu">
            {tools
              .filter((tool) => tool.section !== 'Dynasty' || !dynastyLeague || isPhoneLayout())
              .map(({ section: destination, label, icon: Icon, labs }, index, shown) => (
                <Fragment key={destination}>
                  {labs && !shown[index - 1]?.labs && (
                    <span className="nav-group-label" aria-hidden="true">
                      Labs
                    </span>
                  )}
                  <button
                    type="button"
                    className={`nav-item ${section === destination ? 'active' : ''}`}
                    onClick={() => {
                      if (isPhoneLayout()) onShowToolsChange(false);
                      navigate(destination);
                    }}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                  </button>
                </Fragment>
              ))}
          </div>
        </details>
      </nav>
      <div className="sidebar-bottom">
        <div className="service-status">
          <span className={`status-pulse ${serviceStatus !== 'running' ? 'offline' : ''}`} />
          <span>
            {serviceStatus === 'checking' && 'Checking local service'}
            {serviceStatus === 'running' && 'Local service running'}
            {serviceStatus === 'stopping' && 'Stopping local service'}
            {serviceStatus === 'stopped' && 'Local service stopped'}
            {serviceStatus === 'unavailable' && 'Local service unavailable'}
          </span>
          {serviceStatus === 'running' && <ShieldCheck size={14} />}
        </div>
        <button
          className="stop-service-button"
          onClick={onStop}
          disabled={serviceStatus !== 'running'}
          title="Stop Sunday Sidekick"
          aria-label="Stop Sunday Sidekick"
        >
          <Power size={15} /> <span>Stop app</span>
        </button>
        <button type="button" className="help-link" onClick={() => navigate('Help')}>
          <CircleHelp size={16} /> Help & FAQ
        </button>
        <div className="user-chip">
          <div className="user-avatar">C</div>
          <div>
            <strong>Commissioner</strong>
            <small>Local workspace</small>
          </div>
          <button
            type="button"
            className="workspace-settings-button"
            aria-label="Open settings"
            onClick={() => navigate('Settings')}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function AppTopbar({
  league,
  leagues,
  reports,
  dateLabel,
  serviceStatus,
  verificationMode,
  onLeagueChange,
  onSearchNavigate,
  staleAfterHours = 24,
  refreshing = false,
  onFreshen,
  chatOpen = false,
  onChat,
}: {
  chatOpen?: boolean;
  /** Opens or closes the docked chat panel; absent on the Ask page itself. */
  onChat?: () => void;
  staleAfterHours?: number;
  refreshing?: boolean;
  /** Refreshes a connected league or starts a re-import for an imported one. */
  onFreshen?: () => void;
  league: LeagueConnection | undefined;
  leagues: LeagueConnection[];
  reports: ReportSummary[];
  dateLabel: string;
  serviceStatus: ServiceStatus;
  verificationMode: boolean;
  onLeagueChange: (leagueId: string) => void;
  onSearchNavigate: (destination: SearchDestination) => boolean | Promise<boolean>;
}) {
  const stale = league ? isStale(league, staleAfterHours) : false;
  return (
    <header className="topbar">
      <div className="topbar-context">
        <span className="topbar-label">ACTIVE LEAGUE</span>
        <div className="league-select">
          <div className="league-avatar">{league?.displayName?.slice(0, 1) ?? 'S'}</div>
          <div className="league-details">
            <label className="visually-hidden" htmlFor="active-league-select">
              Active league
            </label>
            <select
              id="active-league-select"
              aria-label="Active league"
              value={league?.id ?? ''}
              disabled={leagues.length === 0}
              onChange={(event) => onLeagueChange(event.target.value)}
            >
              {leagues.length === 0 ? (
                <option value="">Your league</option>
              ) : (
                leagues.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName}
                  </option>
                ))
              )}
            </select>
            <span className={stale ? 'league-stale' : undefined}>
              {league
                ? `${platformName(league.platform)} · ${league.teamCount} teams${updatedLabel(league)}`
                : 'Connect to get started'}
            </span>
          </div>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
        {stale && onFreshen && (
          <button
            type="button"
            className="small-button freshness-action"
            disabled={refreshing}
            onClick={onFreshen}
            title="League data is older than your stale-data setting"
            aria-label={
              league?.connectionMode === 'snapshot'
                ? 'League data is out of date. Re-import'
                : 'League data is out of date. Refresh'
            }
          >
            {refreshing
              ? 'Refreshing…'
              : league?.connectionMode === 'snapshot'
                ? 'Re-import'
                : 'Refresh'}
          </button>
        )}
      </div>
      <WorkspaceSearch leagues={leagues} reports={reports} onNavigate={onSearchNavigate} />
      <div className="top-actions">
        <span className="date-label">{dateLabel}</span>
        {onChat && (
          <button
            type="button"
            className={`small-button chat-toggle${chatOpen ? ' active' : ''}`}
            aria-pressed={chatOpen}
            title="Ask Sidekick (⌘J)"
            onClick={onChat}
          >
            <MessagesSquare size={15} aria-hidden="true" />
            <span>Ask</span>
          </button>
        )}
        <ThemeSwitch />
        <span className={`status-pulse ${serviceStatus !== 'running' ? 'offline' : ''}`} />
        <span
          className="date-label"
          title={serviceStatus === 'running' ? 'Local service running' : 'Local service'}
        >
          {serviceStatus === 'running'
            ? verificationMode
              ? 'Test profile'
              : 'Running'
            : 'Service'}
        </span>
      </div>
    </header>
  );
}

/** League data older than the owner's stale threshold, or with no update time at all. */
export function isStale(
  league: Pick<LeagueConnection, 'lastSyncedAt' | 'snapshotImportedAt'>,
  staleAfterHours: number,
  now = Date.now(),
): boolean {
  const at = Date.parse(league.lastSyncedAt ?? league.snapshotImportedAt ?? '');
  return !Number.isFinite(at) || now - at > staleAfterHours * 3_600_000;
}

/** One freshness phrase shared by the header: when league data last arrived, in plain words. */
export function updatedLabel(
  league: Pick<LeagueConnection, 'lastSyncedAt' | 'snapshotImportedAt'>,
  now = Date.now(),
): string {
  const at = Date.parse(league.lastSyncedAt ?? league.snapshotImportedAt ?? '');
  if (!Number.isFinite(at) || at > now + 60_000) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 2) return ' · updated just now';
  if (minutes < 60) return ` · updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ` · updated ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return ` · updated ${days} day${days === 1 ? '' : 's'} ago`;
}
