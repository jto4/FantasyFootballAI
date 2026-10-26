import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { settingTarget } from '../search-catalog';
import { helpArticle } from '../help-content';
import { isAdviceMode } from '../advice-navigation';
import type { AdviceMode } from '@sidekick/core';

const pages = {
  desk: 'League desk',
  live: 'Live',
  props: 'Props',
  sunday: 'Sunday',
  compare: 'Start/sit',
  trade: 'Trade calculator',
  dynasty: 'Dynasty',
  ask: 'Ask',
  leagues: 'Leagues',
  schedule: 'Schedule',
  reports: 'Reports',
  memory: 'Members & memory',
  imports: 'Imports',
  settings: 'Settings',
  help: 'Help',
  advice: 'Advice',
};
export type Route = {
  section: string;
  leagueId: string;
  reportId: string;
  settingId: string;
  helpId?: string;
  adviceMode?: AdviceMode;
  adviceId?: string;
  /** Advice opened on its results view instead of a new decision. */
  adviceView?: 'results' | undefined;
};
export function readWorkspaceRoute(
  hash = typeof window === 'undefined' ? '' : window.location.hash,
): Route {
  const [page, query] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const id = (key: string) => (params.get(key) ?? '').slice(0, 256);
  return {
    section: pages[page as keyof typeof pages] ?? 'League desk',
    leagueId: id('league'),
    reportId: page === 'reports' ? id('report') : '',
    settingId: page === 'settings' && settingTarget(id('setting')) ? id('setting') : '',
    ...(page === 'help' && helpArticle(id('answer')) ? { helpId: id('answer') } : {}),
    ...(page === 'advice' && isAdviceMode(id('mode'))
      ? { adviceMode: id('mode') as AdviceMode }
      : {}),
    ...(page === 'advice' && id('view') === 'results' ? { adviceView: 'results' as const } : {}),
    ...(page === 'advice' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id('result'))
      ? { adviceId: id('result') }
      : {}),
  };
}
export function workspaceHash(route: Route): string {
  const page = Object.entries(pages).find(([, label]) => label === route.section)?.[0] ?? 'desk';
  const params = new URLSearchParams();
  if (route.leagueId) params.set('league', route.leagueId);
  if (page === 'reports' && route.reportId) params.set('report', route.reportId);
  if (page === 'settings' && route.settingId) params.set('setting', route.settingId);
  if (page === 'help' && route.helpId && helpArticle(route.helpId))
    params.set('answer', route.helpId);
  if (page === 'advice' && route.adviceMode && isAdviceMode(route.adviceMode))
    params.set('mode', route.adviceMode);
  if (page === 'advice' && route.adviceId) params.set('result', route.adviceId);
  if (page === 'advice' && route.adviceView === 'results') params.set('view', 'results');
  return `#/${page}${params.size ? `?${params}` : ''}`;
}

/**
 * Hash routes work in the static desktop bundle and preserve native browser history. `canLeave`
 * may answer later (an in-app confirmation): navigation is held, then replayed if it resolves true.
 */
export function useWorkspaceRoute(canLeave: () => boolean | Promise<boolean>) {
  const [route, setRoute] = useState<Route>(() => {
    const parsed = readWorkspaceRoute();
    if (!parsed.leagueId) {
      try {
        parsed.leagueId = localStorage.getItem('sidekick.activeLeagueId') ?? '';
      } catch {
        /* Optional storage. */
      }
    }
    return parsed;
  });
  const current = useRef(route);
  const startAtTop = useRef(false);
  useLayoutEffect(() => {
    if (!startAtTop.current) return;
    startAtTop.current = false;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [route.section]);
  const guard = useRef(canLeave);
  guard.current = canLeave;
  const index = useRef(
    typeof history !== 'undefined' && Number.isInteger(history.state?.sidekickIndex)
      ? Number(history.state.sidekickIndex)
      : 0,
  );
  const reverting = useRef(false);
  const approved = useRef(false);
  useEffect(() => {
    history.replaceState(
      { ...history.state, sidekickIndex: index.current },
      '',
      workspaceHash(current.current),
    );
    const onPop = () => {
      const nextIndex = history.state?.sidekickIndex;
      if (reverting.current) {
        reverting.current = false;
        return;
      }
      const allowed = approved.current ? true : guard.current();
      approved.current = false;
      if (allowed !== true) {
        // A pending confirmation replays the same back/forward step once it is accepted.
        const target = readWorkspaceRoute();
        const step = Number.isInteger(nextIndex) ? nextIndex - index.current : 0;
        if (allowed instanceof Promise)
          void allowed.then((ok) => {
            if (!ok) return;
            if (step) {
              approved.current = true;
              history.go(step);
            } else update(target, false, false);
          });
        if (Number.isInteger(nextIndex) && nextIndex !== index.current) {
          reverting.current = true;
          history.go(index.current - nextIndex);
        } else
          history.replaceState(
            { sidekickIndex: index.current },
            '',
            workspaceHash(current.current),
          );
        return;
      }
      startAtTop.current = false;
      index.current = Number.isInteger(nextIndex) ? nextIndex : index.current + 1;
      current.current = readWorkspaceRoute();
      setRoute(current.current);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  function update(patch: Partial<Route>, replace = false, check = true) {
    const next = { ...current.current, ...patch };
    if (next.section !== 'Settings') next.settingId = '';
    if (next.section !== 'Reports') next.reportId = '';
    if (next.section !== 'Help') delete next.helpId;
    if (next.section !== 'Advice') {
      delete next.adviceMode;
      delete next.adviceId;
      delete next.adviceView;
    }
    if (JSON.stringify(next) === JSON.stringify(current.current)) return true;
    if (check) {
      const allowed = guard.current();
      if (allowed instanceof Promise) {
        void allowed.then((ok) => {
          if (ok) update(patch, replace, false);
        });
        return false;
      }
      if (!allowed) return false;
    }
    startAtTop.current = next.section !== current.current.section && !next.settingId;
    current.current = next;
    if (!replace) index.current++;
    history[replace ? 'replaceState' : 'pushState'](
      { sidekickIndex: index.current },
      '',
      workspaceHash(next),
    );
    setRoute(next);
    return true;
  }
  return { route, update };
}
