import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { isReportPage, type LeagueConnection, type ReportSummary } from '@sidekick/core';
import { Dialog } from './Dialog';
import { requestJson } from './api-client';
import { navigationItems, type SearchDestination, type SearchItem } from './search-catalog';
import { searchItems, searchTerms } from './search';
import { taskSearchItems } from './search-tasks';

function reportItem(report: ReportSummary, leagues: LeagueConnection[]): SearchItem {
  return {
    id: `report:${report.id}`,
    title: report.title,
    description: `${report.status === 'sent' ? 'Sent report' : 'Saved draft'} · ${report.createdAt.slice(0, 10)}`,
    location: `Reports → ${leagues.find((league) => league.id === report.leagueId)?.displayName ?? 'Saved league'}`,
    kind: 'Report',
    aliases: report.kind.replaceAll('-', ' '),
    destination: { section: 'Reports', leagueId: report.leagueId, reportId: report.id },
  };
}
const examples = [
  'Email address',
  'Stop sending emails',
  'Rankings every Tuesday',
  'Why did my report not send?',
];
export function WorkspaceSearch({
  leagues,
  reports,
  onNavigate,
}: {
  leagues: LeagueConnection[];
  reports: ReportSummary[];
  onNavigate: (destination: SearchDestination) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [history, setHistory] = useState<{
    query: string;
    items: ReportSummary[];
    total: number;
  }>();
  const [historyError, setHistoryError] = useState('');
  const [searchingHistory, setSearchingHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const desktop = Boolean(typeof window !== 'undefined' && window.sidekickDesktop);
  const trimmed = query.trim();
  const historyQuery = searchTerms(trimmed)
    .filter((word) => !['report', 'reports'].includes(word))
    .join(' ');
  const items = useMemo(
    () => [
      ...navigationItems(desktop),
      ...leagues.map((league): SearchItem => ({
        id: `league:${league.id}`,
        title: league.displayName,
        description: `${league.platform.toUpperCase()} · ${league.teamCount} teams`,
        location: 'League desk',
        kind: 'League',
        aliases: `${league.name} ${league.platform}`,
        destination: { section: 'League desk', leagueId: league.id },
      })),
      ...reports.map((report) => reportItem(report, leagues)),
    ],
    [desktop, leagues, reports],
  );
  const local = trimmed ? searchItems(trimmed, items, 10) : [];
  const saved = history?.query === trimmed ? history : undefined;
  const results = [
    ...taskSearchItems(trimmed),
    ...local,
    ...(saved?.items ?? []).map((report) => reportItem(report, leagues)),
  ]
    .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
    .slice(0, 16);
  const selected = Math.min(active, Math.max(0, results.length - 1));
  function close() {
    setOpen(false);
  }
  function choose(item: SearchItem) {
    if (onNavigate(item.destination)) close();
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.repeat) {
        event.preventDefault();
        // Keep unfinished modal work and its keyboard focus together.
        if (
          document.querySelector('[role="dialog"]:not([aria-labelledby="workspace-search-title"])')
        )
          return;
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!open || trimmed.length < 2 || !historyQuery) {
      setSearchingHistory(false);
      return;
    }
    const abort = new AbortController();
    setSearchingHistory(true);
    setHistoryError('');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ search: historyQuery, limit: '50' });
      void requestJson(`/api/report-history?${params}`, isReportPage, { signal: abort.signal })
        .then((page) => {
          if (!abort.signal.aborted)
            setHistory({ query: trimmed, items: page.items, total: page.total });
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setHistoryError(
              'Saved-report search is unavailable. Settings and page results still work.',
            );
        })
        .finally(() => {
          if (!abort.signal.aborted) setSearchingHistory(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [open, trimmed, historyQuery]);
  useEffect(() => {
    if (!open) return;
    for (const result of document.querySelectorAll<HTMLElement>(
      '.workspace-search-result[aria-selected="true"]',
    ))
      result.scrollIntoView({ block: 'nearest' });
  }, [open, selected]);
  return (
    <>
      <button
        type="button"
        className="workspace-search-trigger"
        onClick={() => {
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        aria-label="Search the app"
      >
        <Search size={17} aria-hidden="true" />
        <span>Search settings, reports, and more</span>
        <kbd>⌘ / Ctrl K</kbd>
      </button>
      {open && (
        <Dialog
          titleId="workspace-search-title"
          className="workspace-search-dialog"
          onClose={close}
        >
          <h2 id="workspace-search-title">What are you looking for?</h2>
          <p className="workspace-search-intro">
            Use your own words. Find a setting, task, or help answer. Changes need your review.
          </p>
          <div className="workspace-search-field">
            <Search size={20} aria-hidden="true" />
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Search settings, pages, leagues, and reports"
              aria-autocomplete="list"
              aria-expanded={Boolean(results.length)}
              aria-controls="workspace-search-results"
              aria-activedescendant={
                results.length ? `workspace-search-result-${selected}` : undefined
              }
              placeholder="Try “stop swearing” or “email address”"
              value={query}
              maxLength={120}
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive((current) =>
                    Math.max(
                      0,
                      Math.min(results.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
                    ),
                  );
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (results[selected]) choose(results[selected]);
                }
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  setActive(0);
                  inputRef.current?.focus();
                }}
              >
                <X size={17} />
              </button>
            )}
          </div>
          {!trimmed && (
            <div className="workspace-search-examples">
              <p>Popular searches</p>
              {examples.map((example) => (
                <button
                  type="button"
                  className="small-button"
                  key={example}
                  onClick={() => {
                    setQuery(example);
                    setActive(0);
                    inputRef.current?.focus();
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          )}
          <p className="workspace-search-status" role="status">
            {trimmed
              ? `${results.length} ${results.length === 1 ? 'result' : 'results'}${searchingHistory ? ' · Checking saved reports…' : ''}`
              : 'Search settings, tasks, help answers, connected leagues, and saved report titles.'}
          </p>
          <div
            id="workspace-search-results"
            role="listbox"
            aria-label="Search results"
            className="workspace-search-results"
          >
            {results.map((item, index) => (
              <button
                type="button"
                role="option"
                aria-selected={selected === index}
                id={`workspace-search-result-${index}`}
                key={item.id}
                className="workspace-search-result"
                onClick={() => choose(item)}
              >
                <span>
                  <small>
                    {item.kind} · {item.location}
                  </small>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
          {trimmed && !results.length && !searchingHistory && (
            <p className="workspace-search-empty">
              No matches yet. Try “backup”, “email”, or “privacy”, or open Help & FAQ.
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (onNavigate({ section: 'Help' })) close();
                }}
              >
                Open Help & FAQ
              </button>
            </p>
          )}
          {saved && saved.total > results.filter((item) => item.kind === 'Report').length && (
            <p className="workspace-search-status">
              More saved reports match. Add words from the title to narrow your search.
            </p>
          )}
          {historyError && trimmed.length >= 2 && (
            <p role="status" className="workspace-search-status">
              {historyError}
            </p>
          )}
          <div className="workspace-search-footer">
            <span>↑ ↓ to choose · Enter to open · Esc to close</span>
            <button type="button" className="small-button" onClick={close}>
              Close search
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
