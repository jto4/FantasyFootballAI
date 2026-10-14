import { describe, expect, it } from 'vitest';
import { taskSearchItems } from './search-tasks';
import { helpArticles } from './help-content';
import { navigationItems, settingTarget } from './search-catalog';
import { searchItems } from './search';
import { readWorkspaceRoute, workspaceHash } from './hooks/useWorkspaceRoute';
describe('task search and help destinations', () => {
  it('retains the difference between on and off and scopes a named report', () => {
    expect(taskSearchItems('stop sending emails')[0]?.destination.task).toEqual({
      type: 'delivery',
      automatic: false,
      channel: 'email',
    });
    expect(taskSearchItems('turn automatic emails on')[0]?.destination.task).toEqual({
      type: 'delivery',
      automatic: true,
      channel: 'email',
    });
    expect(taskSearchItems("don't send rankings automatically")[0]?.destination.task).toMatchObject(
      { type: 'delivery', automatic: false, kind: 'power-rankings' },
    );
    for (const query of [
      'do not stop sending emails',
      'turn emails on and off',
      'enable automatic rankings and matchup previews',
    ])
      expect(taskSearchItems(query)).toEqual([]);
  });
  it('proposes explicit schedule details and routes failure questions to help rather than toggles', () => {
    expect(
      taskSearchItems('email rankings every Tuesday at 9:30 AM')[0]?.destination.task,
    ).toMatchObject({
      type: 'schedule',
      prefill: {
        kind: 'power-rankings',
        weekday: 2,
        time: '09:30',
        channel: 'email',
        requestedSend: true,
      },
    });
    expect(
      taskSearchItems('rankings every Tuesday and Thursday')[0]?.destination.task,
    ).not.toHaveProperty('prefill.weekday');
    expect(taskSearchItems('why did my report not send?')[0]?.destination).toEqual({
      section: 'Help',
      helpId: 'delivery',
    });
  });
  it('indexes every FAQ with a valid bookmarked answer and only real setting destinations', () => {
    for (const article of helpArticles) {
      expect(
        searchItems(article.title, navigationItems(false)).some(
          (result) => result.destination.helpId === article.id,
        ),
      ).toBe(true);
      if ('action' in article && 'settingId' in article.action)
        expect(settingTarget(article.action.settingId)).toBeDefined();
      expect(
        readWorkspaceRoute(
          workspaceHash({
            section: 'Help',
            leagueId: '',
            reportId: '',
            settingId: '',
            helpId: article.id,
          }),
        ).helpId,
      ).toBe(article.id);
    }
    expect(readWorkspaceRoute('#/help?answer=unknown').helpId).toBeUndefined();
  });
  it('does not choose one channel from conflicting or compound channel requests', () => {
    for (const query of [
      'stop sending texts but keep emails',
      'stop sending emails and SMS',
      'enable automatic emails and iMessage',
      'email rankings every Friday by SMS',
    ])
      expect(taskSearchItems(query)).toEqual([]);
    expect(taskSearchItems('stop sending texts')[0]?.destination.task).toMatchObject({
      channel: 'sms',
      automatic: false,
    });
  });
  it('never converts unsupported cadence into a weekly schedule', () => {
    for (const query of [
      'schedule power rankings monthly',
      'rankings every day',
      'rankings every month',
      'schedule rankings tomorrow',
      'weekly rankings every other Friday',
      'rankings fortnightly',
    ])
      expect(taskSearchItems(query)).toEqual([
        expect.objectContaining({ kind: 'Page', destination: { section: 'Schedule' } }),
      ]);
    expect(taskSearchItems('monthly rankings')[0]?.title).toBe('Open Schedule to choose monthly');
    expect(taskSearchItems('daily rankings')[0]?.title).toBe('Open Schedule to choose daily');
    expect(taskSearchItems('send rankings every other Tuesday')[0]?.destination).toEqual({
      section: 'Schedule',
    });
  });
  it('accepts compact AM/PM times without choosing among multiple times', () => {
    for (const [query, time] of [
      ['rankings every Friday at 9:30pm', '21:30'],
      ['rankings every Friday at 9am', '09:00'],
      ['rankings every Friday at 09:30 AM', '09:30'],
      ['rankings every Friday at 12pm', '12:00'],
      ['rankings every Friday at 12am', '00:00'],
    ])
      expect(taskSearchItems(query!)[0]?.destination.task).toMatchObject({ prefill: { time } });
    for (const query of ['rankings Friday at 9am or 10am', 'rankings Friday at 9:99pm'])
      expect(taskSearchItems(query)[0]?.destination.task).not.toHaveProperty('prefill.time');
  });
});
