import { test, expect, type Page } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice } from './advice-fixture';
import { dynastyFixture } from '../apps/dashboard/src/states/fixtures';

// Live and Dynasty need game-day and long-term data the fixture service does not have.
const starter = (id: string, name: string, position: string, state: string, points?: number) => ({
  id,
  name,
  position,
  nflTeam: 'BUF',
  state,
  estimate: 12.4,
  ...(points !== undefined ? { livePoints: points } : {}),
  ...(state === 'post' ? { detail: 'Final' } : state === 'pre' ? { detail: 'Sun 1:00 PM' } : {}),
});
const side = (teamId: string, name: string) => ({
  teamId,
  name,
  points: 61.3,
  projectedFinal: 98.7,
  starters: [
    starter(`${teamId}1`, 'Alex Quarterback With A Long Name', 'QB', 'post', 24.2),
    starter(`${teamId}2`, 'Blake Receiver', 'WR', 'in', 9.1),
    starter(`${teamId}3`, 'Casey Runner', 'RB', 'pre'),
  ],
  yetToPlay: 1,
  playing: 1,
});
const liveFixture = {
  leagueName: 'Fictional Advice League',
  week: 5,
  imported: false,
  gamesAvailable: true,
  matchupWeek: 5,
  matchup: {
    you: side('1', 'Your fictional team'),
    opponent: side('2', 'Other fictional team'),
    winChance: 0.58,
  },
  history: [
    { at: '2026-10-25T17:00:00Z', chance: 0.52 },
    { at: '2026-10-25T19:00:00Z', chance: 0.61 },
    { at: '2026-10-25T21:00:00Z', chance: 0.58 },
  ],
};

// Every main page at phone, tablet, laptop and wide-screen sizes: nothing may scroll sideways
// and no visible element may stick out past the window.
const pages = [
  'desk',
  'advice',
  'ask',
  'reports',
  'live',
  'props',
  'schedule',
  'settings',
  'leagues',
  'dynasty',
  'sunday',
  'compare',
  'trade',
  'help',
];
const widths = [320, 375, 768, 1024, 1280, 1920, 2560];

async function overflow(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.position === 'fixed') continue;
      // Content inside a horizontally scrollable box (wide tables) is fine.
      let scroller = el.parentElement,
        contained = false;
      while (scroller && scroller !== document.body) {
        const s = getComputedStyle(scroller);
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
          contained = true;
          break;
        }
        scroller = scroller.parentElement;
      }
      if (contained) continue;
      if (rect.right > width + 1 || rect.left < -1)
        offenders.push(
          `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(rect.right)} "${(el.textContent ?? '').trim().slice(0, 40)}"`,
        );
    }
    return {
      scroll: document.documentElement.scrollWidth - width,
      offenders: offenders.slice(0, 8),
    };
  });
}

test('every page fits phone to wide-screen widths without sideways scrolling', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Sweeps its own viewport sizes.');
  test.setTimeout(240_000);
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await page.addInitScript(() =>
      localStorage.setItem('sidekick.teamSelection.v1', JSON.stringify({ 'browser-league': '1' })),
    );
    await page.route('**/api/dynasty?*', (route) => route.fulfill({ json: dynastyFixture }));
    await page.route('**/api/live?*', (route) => route.fulfill({ json: liveFixture }));
    const problems: string[] = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 1000 });
      for (const name of pages) {
        await page.goto(`${workspace.url}/#/${name}?league=browser-league`);
        await page.locator('main h1').first().waitFor({ timeout: 10_000 });
        await page.waitForTimeout(400);
        const result = await overflow(page);
        if (process.env.RESPONSIVE_SHOTS)
          await page.screenshot({
            path: `${process.env.RESPONSIVE_SHOTS}/${name}-${width}.png`,
            fullPage: false,
          });
        if (result.scroll > 1 || result.offenders.length)
          problems.push(
            `${name} @${width}: scroll +${result.scroll}px; ${result.offenders.join(' | ')}`,
          );
      }
    }
    // The player card is a full-height side panel; on a phone it must fit the screen.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${workspace.url}/#/compare?league=browser-league`);
    const picker = page.getByRole('group', { name: /Players choices/ });
    await picker.getByRole('checkbox', { name: /Blake Receiver/ }).check();
    await picker.getByRole('checkbox', { name: /Alex Quarterback/ }).check();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await page
      .getByRole('region', { name: 'Comparison' })
      .getByRole('button', { name: 'Blake Receiver' })
      .click();
    const drawer = page.getByRole('dialog', { name: 'Blake Receiver' });
    await expect(drawer).toContainText('Recent games');
    const box = (await drawer.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(376);
    expect(problems, problems.join('\n')).toEqual([]);
  } finally {
    await workspace.close();
  }
});
