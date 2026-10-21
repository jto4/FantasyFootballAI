import type { RefObject } from 'react';
import type { LeagueConnection, ReportSummary } from '@sidekick/core';
import {
  CalendarDays,
  ChevronDown,
  CircleHelp,
  FileText,
  Home,
  MessageCircle,
  Power,
  Settings,
  ShieldCheck,
  Sparkles,
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
  { section: 'Reports', label: 'Reports', icon: FileText },
  { section: 'Schedule', label: 'Schedule', icon: CalendarDays },
  { section: 'Settings', label: 'Settings', icon: Settings },
];
const tools = [
  { section: 'Leagues', label: 'Leagues', icon: Users },
  { section: 'Members & memory', label: 'League members', icon: MessageCircle },
  { section: 'Imports', label: 'Imports', icon: FileText },
  { section: 'Help', label: 'Help', icon: CircleHelp },
];

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
}: {
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
        {menu.map(({ section: destination, label, icon: Icon }) => (
          <button
            key={label}
            aria-current={section === destination ? 'page' : undefined}
            onClick={() => navigate(destination)}
            className={`nav-item ${section === destination ? 'active' : ''}`}
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
          <summary>More tools</summary>
          {tools.map(({ section: destination, label, icon: Icon }) => (
            <button
              type="button"
              key={destination}
              className={`nav-item ${section === destination ? 'active' : ''}`}
              onClick={() => navigate(destination)}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
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
}: {
  league: LeagueConnection | undefined;
  leagues: LeagueConnection[];
  reports: ReportSummary[];
  dateLabel: string;
  serviceStatus: ServiceStatus;
  verificationMode: boolean;
  onLeagueChange: (leagueId: string) => void;
  onSearchNavigate: (destination: SearchDestination) => boolean;
}) {
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
            <span>
              {league
                ? `${platformName(league.platform)} · ${league.teamCount} teams`
                : 'Connect to get started'}
            </span>
          </div>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
      </div>
      <WorkspaceSearch leagues={leagues} reports={reports} onNavigate={onSearchNavigate} />
      <div className="top-actions">
        <span className="date-label">{dateLabel}</span>
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
