import { describe, expect, it } from 'vitest';
import { navigationItems, settingTargets } from './search-catalog';
import { searchItems, searchTerms } from './search';
import { readWorkspaceRoute, workspaceHash } from './hooks/useWorkspaceRoute';

const items = navigationItems(false);
describe('workspace search', () => {
  it('finds rookie history and draft-capital guidance with everyday search words', () => {
    expect(
      searchItems('rookie college NFL draft round no history', items).some(
        (item) => item.destination.helpId === 'advice-rookies',
      ),
    ).toBe(true);
  });
  it('finds kicker scoring and blocked-kick guidance in global search', () => {
    expect(
      searchItems('kicker blocked missed kick', items).some(
        (item) => item.destination.helpId === 'advice-kickers',
      ),
    ).toBe(true);
  });
  it('finds the one-spot start/sit explanation through workspace search', () => {
    expect(
      searchItems('compare players one starting spot', items).some(
        (item) => item.destination.helpId === 'advice-start-sit',
      ),
    ).toBe(true);
  });
  it('finds the automatic draft forecast explanation without needing an import', () => {
    expect(
      searchItems('automatic draft forecast', items).some(
        (item) => item.destination.helpId === 'advice-automatic-projections',
      ),
    ).toBe(true);
  });
  it.each(['ChatGPT sign in', 'Codex subscription', 'Codex token budget'])(
    'finds Codex guidance for %s',
    (query) => {
      expect(
        searchItems(query, items).some(
          (item) => item.destination.helpId === 'advice-signed-in-codex',
        ),
      ).toBe(true);
    },
  );
  it('finds signed-in Claude guidance without contacting a provider', () => {
    expect(
      searchItems('signed in Claude subscription', items).some(
        (item) => item.destination.helpId === 'advice-signed-in-ai',
      ),
    ).toBe(true);
  });
  it.each([
    ['Where can I change my email address?', 'email-recipient'],
    ['How do I stop swearing?', 'profanity'],
    ['make reports shorter', 'report-length'],
    ['automatic backpus', 'routine-backups'],
    ['profantiy', 'profanity'],
    ['delete old messages', 'source-retention'],
    ['change assistant nickname', 'chat-agent-name'],
    ['check a backup file', 'validate-backup'],
  ])('finds the intended setting for %s', (query, target) => {
    expect(searchItems(query, items)[0]?.destination.settingId).toBe(target);
  });
  it('handles partial words, empty queries, and no matches without selecting arbitrary actions', () => {
    expect(searchItems('profan', items)[0]?.destination.settingId).toBe('profanity');
    expect(searchItems('', items)).toEqual([]);
    expect(searchItems('zxqv unrecognized', items)).toEqual([]);
    expect(searchItems('email broken plumbing', items)).toEqual([]);
    expect(searchItems("Please don't use bad language", items)[0]?.destination.settingId).toBe(
      'profanity',
    );
    expect(
      searchItems('Can you help me change my email address?', items)[0]?.destination.settingId,
    ).toBe('email-recipient');
    expect(searchTerms('Find my Vintage championship report')).toEqual([
      'vintage',
      'championship',
      'report',
    ]);
  });
  it('keeps a unique catalog, prioritizes exact names, and hides desktop-only controls in the browser', () => {
    expect(new Set(settingTargets.map((item) => item.id)).size).toBe(settingTargets.length);
    for (const target of settingTargets.filter((item) => !item.desktopOnly))
      expect(searchItems(target.title, items)[0]?.destination.settingId).toBe(target.id);
    expect(items.some((item) => item.destination.settingId === 'desktop-startup')).toBe(false);
    expect(
      navigationItems(true).some((item) => item.destination.settingId === 'desktop-startup'),
    ).toBe(true);
  });
  it('round-trips a setting bookmark and rejects unknown targets', () => {
    const route = {
      section: 'Settings',
      leagueId: 'league with spaces',
      reportId: '',
      settingId: 'profanity',
    };
    expect(readWorkspaceRoute(workspaceHash(route))).toEqual(route);
    expect(readWorkspaceRoute('#/settings?setting=unknown-control').settingId).toBe('');
    expect(readWorkspaceRoute('#/reports?setting=profanity&report=report-id').settingId).toBe('');
  });
  it('finds team defense scoring help with everyday language', () => {
    expect(
      searchItems('team defense', items).some(
        (item) => item.destination.helpId === 'advice-defense',
      ),
    ).toBe(true);
  });
  it('finds each advice mode and round-trips validated saved-result bookmarks', () => {
    for (const [query, mode] of [
      ['Set my lineup', 'lineup'],
      ['Compare a trade', 'trade'],
      ['Find waiver pickups', 'waivers'],
      ['Plan my draft', 'draft-plan'],
      ['Review my draft', 'draft-review'],
      ['Analyze a bet', 'betting'],
    ] as const)
      expect(searchItems(query, items)[0]?.destination.adviceMode).toBe(mode);
    const route = {
      section: 'Advice',
      leagueId: 'league',
      reportId: '',
      settingId: '',
      adviceMode: 'trade' as const,
      adviceId: 'd732dfd7-d845-4cab-a966-0ae7ff3799cd',
    };
    expect(readWorkspaceRoute(workspaceHash(route))).toEqual(route);
    expect(
      readWorkspaceRoute('#/advice?mode=unsupported&result=unknown').adviceMode,
    ).toBeUndefined();
    expect(readWorkspaceRoute('#/advice?mode=unsupported&result=unknown').adviceId).toBeUndefined();
  });
});
