import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice, adviceData, adviceNow, adviceAnswer } from './advice-fixture';
function gameData() {
  const data = adviceData();
  const g = data.games.find((g) => g.id === 'upcoming')!;
  g.espnId = '401872994';
  g.kickoffAt = '2026-10-11T17:00:00.000Z';
  return data;
}
async function open(page: import('@playwright/test').Page, url: string) {
  await page.goto(`${url}/#/advice?mode=betting`);
  await expect(page).toHaveTitle('Sunday Sidekick');
  await page.getByRole('combobox', { name: 'Bet type', exact: true }).selectOption('moneyline');
  await page.getByRole('combobox', { name: 'NFL game', exact: true }).selectOption('upcoming');
}
test('fetched prices fill both odds, survive analysis/reload, and settle a recorded probability without generation', async ({
  page,
}, info) => {
  const w = await apiWorkspace(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await seedAdvice(w.store);
    w.setAdviceFootballData(gameData());
    const settings = w.store.settingsSnapshot();
    await open(page, w.url);
    await page.getByRole('button', { name: 'Fetch sportsbook prices', exact: true }).click();
    const live = page.getByRole('region', { name: 'Live sportsbook prices' });
    await expect(live).toContainText('Fictional sportsbook');
    await live.getByRole('button', { name: 'Use this price', exact: true }).click();
    await expect(page.getByLabel('American odds', { exact: true })).toHaveValue('-180');
    await expect(page.getByLabel('Opposite side’s odds (optional)')).toHaveValue('150');
    await live.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('fetched-prices.png') });
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
      await result.getByText('Numbers & comparisons', { exact: true }).click();
    const price = result.getByRole('region', { name: 'Fetched price analyzed' });
    await expect(price).toContainText('Fictional sportsbook');
    await expect(price).toContainText('-180');
    const saved = w.store.snapshot().adviceResults![0]!;
    expect(saved.marketQuote?.id).toBe(saved.request.bet?.quoteId);
    expect(w.store.snapshot().predictionRecords).toHaveLength(1);
    expect(w.store.snapshot().predictionRecords![0]!.selected).toBe(false);
    await page.reload();
    await expect(price).toContainText('-180');
    expect(w.adviceCalls).toHaveLength(2);
    await page.getByRole('button', { name: 'Track results', exact: true }).click();
    await page.getByText('Prediction accuracy and paper results', { exact: true }).click();
    await expect(page.getByText(/1 recorded forecasts/)).toBeVisible();
    w.setOddsFinal(true);
    w.setAdviceClock(Date.parse('2026-10-11T22:00:00Z'));
    await page.getByRole('button', { name: 'Check finished games', exact: true }).click();
    await expect(page.getByText(/1 settled comparisons/)).toBeVisible();
    await expect(page.getByText(/Probability error: 0.16/)).toBeVisible();
    expect(w.adviceCalls).toHaveLength(2);
    expect(w.store.snapshot().predictionRecords![0]!).toMatchObject({
      status: 'settled',
      actual: 1,
    });
    await page
      .getByText('Prediction accuracy and paper results', { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('settled-track-record.png') });
    expect(w.store.settingsSnapshot()).toEqual(settings);
    expect(w.credentialWrites).toEqual([]);
    expect(w.sends).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await w.close();
  }
});
test('unavailable feeds preserve manual entry, and edited prices do not retain fetched provenance', async ({
  page,
}) => {
  const w = await apiWorkspace();
  try {
    await seedAdvice(w.store);
    w.setAdviceFootballData(gameData());
    w.setOddsMissing(true);
    await open(page, w.url);
    await page.getByRole('button', { name: 'Fetch sportsbook prices', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Live sportsbook prices' })).toContainText(
      'could not be verified',
    );
    await expect(page.getByLabel('American odds', { exact: true })).toHaveValue('-110');
    w.setOddsMissing(false);
    await page.getByRole('button', { name: 'Refresh sportsbook prices', exact: true }).click();
    await page
      .getByRole('region', { name: 'Live sportsbook prices' })
      .getByRole('button', { name: 'Use this price', exact: true })
      .click();
    await page.getByLabel('American odds', { exact: true }).fill('-175');
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    const saved = w.store.snapshot().adviceResults![0]!;
    expect(saved.request.bet?.quoteId).toBeUndefined();
    expect(saved.marketQuote).toBeUndefined();
    expect(w.store.snapshot().predictionRecords![0]!.selected).toBe(false);
  } finally {
    await w.close();
  }
});
test('expired snapshots stop before paid generation and the fixed archive test calls no AI', async ({
  page,
}, info) => {
  const w = await apiWorkspace();
  try {
    await seedAdvice(w.store);
    w.setAdviceFootballData(gameData());
    await open(page, w.url);
    await page.getByRole('button', { name: 'Fetch sportsbook prices', exact: true }).click();
    await page
      .getByRole('region', { name: 'Live sportsbook prices' })
      .getByRole('button', { name: 'Use this price', exact: true })
      .click();
    w.setAdviceClock(adviceNow + 301000);
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    await expect(page.getByText(/selected live price changed, expired/)).toBeVisible();
    expect(w.adviceCalls).toHaveLength(0);
    expect(w.store.snapshot().adviceResults).toHaveLength(0);
    await page.getByRole('button', { name: 'Track results', exact: true }).click();
    await page.getByText('Prediction accuracy and paper results', { exact: true }).click();
    await page.getByRole('button', { name: 'Test historical market prices', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Historical market-price test' })).toBeVisible();
    if (info.project.name === 'mobile')
      await expect(
        page
          .getByRole('region', { name: 'Historical market-price test' })
          .getByText('Games with prices:', { exact: true })
          .first(),
      ).toBeVisible();
    expect(w.adviceCalls).toHaveLength(0);
    expect(w.sends).toHaveLength(0);
  } finally {
    await w.close();
  }
});
test('a price moved during analysis retains its snapshot and cannot become a paper selection', async ({
  page,
}) => {
  const w = await apiWorkspace();
  try {
    await seedAdvice(w.store);
    w.setAdviceFootballData(gameData());
    await open(page, w.url);
    await page.getByRole('button', { name: 'Fetch sportsbook prices', exact: true }).click();
    await page
      .getByRole('region', { name: 'Live sportsbook prices' })
      .getByRole('button', { name: 'Use this price', exact: true })
      .click();
    w.setAdviceAnswer((request) => {
      w.setOddsHomePrice(-185);
      w.setAdviceClock(adviceNow + 61000);
      return adviceAnswer(request);
    });
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const result = page.getByRole('article', { name: 'Advice result' });
    await expect(result).toBeVisible();
    if (!(await result.locator('.result-numbers').evaluate((el: HTMLDetailsElement) => el.open)))
      await result.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(result).toContainText(
      'fetched price changed, expired or became unavailable during analysis',
    );
    const saved = w.store.snapshot().adviceResults![0]!;
    expect(saved.marketQuote?.americanOdds).toBe(-180);
    expect(saved.confidence.score).toBeLessThanOrEqual(49);
    expect(['hold', 'insufficient']).toContain(saved.assessment.verdict);
    expect(w.store.snapshot().predictionRecords!.every((r) => !r.selected)).toBe(true);
    expect(w.adviceCalls).toHaveLength(2);
  } finally {
    await w.close();
  }
});
test('switching the team clears its fetched handicap and selecting the opposite quote fills the correct sign', async ({
  page,
}) => {
  const w = await apiWorkspace();
  try {
    await seedAdvice(w.store);
    w.setAdviceFootballData(gameData());
    await open(page, w.url);
    await page.getByRole('combobox', { name: 'Bet type', exact: true }).selectOption('spread');
    await page.getByRole('button', { name: 'Fetch sportsbook prices', exact: true }).click();
    const live = page.getByRole('region', { name: 'Live sportsbook prices' });
    await live.getByRole('button', { name: 'Use this price', exact: true }).click();
    await expect(page.getByLabel('Selected team’s handicap')).toHaveValue('-3.5');
    await page.getByRole('combobox', { name: 'Team to back', exact: true }).selectOption('away');
    await expect(page.getByLabel('Selected team’s handicap')).toHaveValue('');
    await expect(page.getByLabel('American odds', { exact: true })).toHaveValue('');
    await live.getByRole('button', { name: 'Use this price', exact: true }).click();
    await expect(page.getByLabel('Selected team’s handicap')).toHaveValue('3.5');
    await expect(page.getByLabel('American odds', { exact: true })).toHaveValue('-115');
    expect(w.adviceCalls).toHaveLength(0);
  } finally {
    await w.close();
  }
});
test('smart search opens sportsbook and performance Help with actions into Advice', async ({
  page,
}) => {
  const w = await apiWorkspace();
  try {
    await seedAdvice(w.store);
    await page.goto(w.url);
    for (const [query, title, id, label] of [
      [
        'live sportsbook lines',
        'How do I fetch sportsbook lines?',
        'advice-live-prices',
        'Analyze a bet',
      ],
      [
        'paper prediction accuracy',
        'How accurate and profitable are the predictions?',
        'advice-track-record',
        'View prediction results',
      ],
    ]) {
      await page.getByRole('button', { name: 'Search the app', exact: true }).click();
      await page
        .getByRole('combobox', { name: 'Search settings, pages, leagues, and reports' })
        .fill(query);
      await page.getByRole('option').filter({ hasText: title }).click();
      const article = page.locator(`#help-${id}`);
      await expect(article).toBeVisible();
      await article.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
    }
    expect(w.adviceCalls).toHaveLength(0);
  } finally {
    await w.close();
  }
});
