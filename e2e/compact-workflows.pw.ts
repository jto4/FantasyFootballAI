import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { isAdviceResult } from '@sidekick/core';
import { apiWorkspace } from './api-fixture';
import { seedAdvice } from './advice-fixture';

test('advice views preserve a draft and keep the lineup visible before optional evidence', async ({
  page,
}, info) => {
  const workspace = await apiWorkspace(true, true, ['fixture-reasoning-model']);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(workspace.store);
    const settings = workspace.store.settingsSnapshot();
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=lineup`);
    const nav = page.getByRole('navigation', { name: 'Advice workspace' });
    await expect(page.locator('.advice-choices button')).toHaveText([
      'Set my lineup',
      'Find waiver pickups',
      'Compare a trade',
      'Plan my draft',
      'Review my draft',
      'Analyze a bet',
    ]);
    await expect(
      page.getByRole('combobox', { name: 'AI for this analysis', exact: true }),
    ).toBeVisible();
    const note = page.getByLabel('Anything else to consider? (optional)');
    await note.fill('Retain this note while I review saved advice.');
    await nav.getByRole('button', { name: /^Saved advice/ }).click();
    await expect(note).toBeHidden();
    await expect(page.getByText('Your completed analyses will appear here.')).toBeVisible();
    await nav.getByRole('button', { name: 'Track results', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Track results', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'New decision', exact: true }).click();
    await expect(note).toHaveValue('Retain this note while I review saved advice.');
    expect(workspace.adviceCalls).toHaveLength(0);

    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    await expect(
      result.getByRole('heading', {
        name: 'Compare the fictional choices before acting',
        exact: true,
      }),
    ).toBeInViewport();
    await expect(result.locator('.lineup-estimate').first()).toBeVisible();
    await expect(result.getByRole('region', { name: 'Decision in brief' })).toContainText(
      'No complete decision-level improvement is quantified',
    );
    await expect(result.getByRole('region', { name: 'Decision in brief' })).toContainText(
      'not a win probability',
    );
    await expect(result.locator('.result-numbers table').first()).toBeHidden();
    await result.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(result.locator('.result-numbers table').first().first()).toBeVisible();
    await result.getByText('Numbers & comparisons', { exact: true }).click();
    await result
      .getByRole('heading', { name: 'What could change the decision', exact: true })
      .click();
    await expect(
      result
        .locator('.result-disclosure')
        .filter({ has: page.getByRole('heading', { name: 'What could change the decision' }) })
        .locator('ul'),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('compact-result.png') });
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.store.settingsSnapshot()).toEqual(settings);
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});

test('saved advice shows five decisions first and reopens without new model calls', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await page.goto(`${workspace.url}/#/advice?league=browser-league&mode=lineup`);
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    const saved = workspace.store.snapshot().adviceResults![0]!;
    await workspace.store.update((state) => {
      state.adviceResults = Array.from({ length: 8 }, (_, index) => ({
        ...saved,
        id: index === 0 ? saved.id : randomUUID(),
        createdAt: saved.createdAt,
        assessment: {
          ...saved.assessment,
          headline: `Saved decision ${String.fromCharCode(65 + index)}`,
        },
      }));
    });
    expect(workspace.store.snapshot().adviceResults!.every(isAdviceResult)).toBe(true);
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Advice workspace' })
      .getByRole('button', { name: /^Saved advice/ })
      .click();
    const history = page.getByRole('region', { name: 'Saved advice', exact: true });
    await expect(history.locator('li')).toHaveCount(5);
    await history.getByRole('button', { name: 'Show more saved advice' }).click();
    await expect(history.locator('li')).toHaveCount(8);
    await history.getByRole('button', { name: /Saved decision A/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Saved decision A', exact: true }),
    ).toBeVisible();
    expect(workspace.adviceCalls).toHaveLength(2);
    expect(workspace.sends).toHaveLength(0);
  } finally {
    await workspace.close();
  }
});

test('Home keeps pending work visible while settings and league details expand on demand', async ({
  page,
}) => {
  const workspace = await apiWorkspace();
  try {
    await seedAdvice(workspace.store);
    await workspace.store.update((state) => {
      state.reports.push({
        id: 'pending-review',
        leagueId: 'browser-league',
        kind: 'power-rankings',
        createdAt: new Date().toISOString(),
        title: 'Review this draft',
        body: 'Saved draft for review.',
        citations: [],
        status: 'draft',
        revision: 0,
      });
    });
    await page.goto(workspace.url);
    await expect(
      page.getByRole('button', { name: 'Review your drafts', exact: true }),
    ).toBeVisible();
    const activity = page
      .locator('.home-disclosure')
      .filter({ has: page.locator('summary', { hasText: /^Report activity/ }) });
    await expect(activity).toHaveJSProperty('open', true);
    await expect(page.getByRole('heading', { name: 'Power rankings', exact: true })).toBeHidden();
    await page.getByText('League standings & news', { exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Power rankings', exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Appearance', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Storage & desktop', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Appearance', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Refresh diagnostics', exact: true }),
    ).toBeHidden();
    await page
      .locator('summary')
      .filter({ hasText: /^Diagnostics$/ })
      .click();
    await page.getByRole('button', { name: 'Refresh diagnostics', exact: true }).click();
    await expect(page.getByText('Generation queue:', { exact: false })).toBeVisible();
    expect(workspace.sends).toHaveLength(0);
    expect(workspace.credentialWrites).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await workspace.close();
  }
});

test('primary navigation starts the new page at the top after a long Home view', async ({
  page,
}, info) => {
  const w = await apiWorkspace();
  try {
    await page.goto(w.url + '/#/desk');
    await page.getByText('League standings & news', { exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Schedule', exact: true })).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    if (info.project.name === 'mobile')
      expect(
        await page
          .getByRole('heading', { name: 'Schedule', exact: true })
          .evaluate(
            (el) =>
              el.getBoundingClientRect().top >=
              document.querySelector('.sidebar')!.getBoundingClientRect().bottom,
          ),
      ).toBe(true);
    await page.screenshot({ path: info.outputPath('navigation-top.png') });
    await page.goBack();
    await expect(page).toHaveURL(/#\/desk/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    expect(w.sends).toEqual([]);
  } finally {
    await w.close();
  }
});
