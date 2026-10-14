import { test, expect } from '@playwright/test';
import { apiWorkspace } from './api-fixture';
import { seedAdvice, adviceNow } from './advice-fixture';
import { isAdviceResult, type FootballDataSnapshot } from '@sidekick/core';
function fictionalMarkets(): FootballDataSnapshot {
  const teams = [
      'BUF',
      'MIA',
      'NE',
      'NYJ',
      'KC',
      'DEN',
      'LV',
      'LAC',
      'BAL',
      'CIN',
      'CLE',
      'PIT',
      'TEN',
      'IND',
      'JAX',
      'HOU',
    ],
    games: FootballDataSnapshot['games'] = [];
  for (let season = 2018; season <= 2026; season++)
    for (let week = 1; week <= (season === 2026 ? 4 : 18); week++)
      for (let i = 0; i < 8; i++) {
        const date = new Date(Date.UTC(season, 8, 1 + (week - 1) * 7)).toISOString().slice(0, 10);
        games.push({
          id: `fictional-${season}-${week}-${i}`,
          season,
          week,
          seasonType: 'REG',
          date,
          kickoffAt: `${date}T17:00:00Z`,
          neutralSite: week % 7 === 0,
          home: teams[i]!,
          away: teams[8 + ((i + week) % 8)]!,
          homeScore: 24 + (i % 3) * 2 + (week % 2),
          awayScore: 18 + ((i + week) % 3) * 2,
          spreadLine: 3.5,
          totalLine: 44.5,
          archivedOdds: {
            homeMoneyline: -135,
            awayMoneyline: 115,
            homeSpreadOdds: -110,
            awaySpreadOdds: -110,
            overOdds: -110,
            underOdds: -110,
          },
        });
      }
  games.push({
    id: 'upcoming',
    season: 2026,
    week: 5,
    seasonType: 'REG',
    date: '2026-10-11',
    kickoffAt: '2026-10-11T17:00:00Z',
    espnId: '401872994',
    neutralSite: false,
    home: 'BUF',
    away: 'MIA',
  });
  return {
    season: 2026,
    games,
    players: [],
    market: [],
    warnings: [],
    sources: [
      {
        id: 'games',
        name: 'Fictional schedule and archived prices',
        status: 'available',
        retrievedAt: new Date(adviceNow).toISOString(),
      },
    ],
  };
}
test('market-aware analysis discloses odds input, validates/saves longer evaluation and records its new method without changing old history', async ({
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
    w.setAdviceFootballData(fictionalMarkets());
    const settings = w.store.settingsSnapshot();
    await page.goto(`${w.url}/#/advice?mode=betting`);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await page.getByRole('combobox', { name: 'Bet type', exact: true }).selectOption('moneyline');
    await page.getByRole('combobox', { name: 'NFL game', exact: true }).selectOption('upcoming');
    await page.getByRole('button', { name: 'Fetch sportsbook prices', exact: true }).click();
    await page
      .getByRole('region', { name: 'Live sportsbook prices' })
      .getByRole('button', { name: 'Use this price', exact: true })
      .click();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const forecast = page.getByRole('region', { name: 'Market-aware betting forecast' });
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    await page.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(forecast).toBeVisible();
    await expect(forecast).toContainText('Uses both sportsbook prices as an input');
    await expect(forecast).toContainText('V3 also learns from schedule rest');
    const saved = w.store.snapshot().adviceResults![0]!;
    expect(saved.betHistory?.forecast?.method).toBe('market-context-v3');
    expect(saved.betHistory?.forecast?.evaluation.baselineKind).toBe('sportsbook');
    expect(saved.betHistory!.forecast!.evaluation.weeks).toBeGreaterThan(40);
    expect(
      w.store.snapshot().predictionRecords!.some((r) => r.method === 'market-context-v3'),
    ).toBe(true);
    await forecast.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('market-aware-forecast.png') });
    await page.reload();
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    await page.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(forecast).toBeVisible();
    const legacy = structuredClone(saved);
    legacy.betHistory!.forecast!.method = 'market-regularized-v2';
    expect(isAdviceResult(legacy)).toBe(true);
    const invalid = structuredClone(saved);
    invalid.betHistory!.forecast!.evaluation.baselineKind = 'frequency';
    expect(isAdviceResult(invalid)).toBe(false);
    expect(
      isAdviceResult({
        ...saved,
        betHistory: {
          ...saved.betHistory,
          forecast: { ...saved.betHistory!.forecast, method: ['market-context-v3'] },
        },
      }),
    ).toBe(false);
    await w.store.update((state) => {
      state.adviceResults = [legacy];
    });
    await page.reload();
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    await page.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(forecast).toBeVisible();
    await expect(forecast).not.toContainText('V3 also learns');
    expect(w.store.snapshot().adviceResults![0]!.betHistory!.forecast!.method).toBe(
      'market-regularized-v2',
    );
    expect(w.store.snapshot().adviceResults![0]!.betHistory!.forecast!.probability).toBe(
      saved.betHistory!.forecast!.probability,
    );
    expect(w.adviceCalls).toHaveLength(2);
    expect(w.store.settingsSnapshot()).toEqual(settings);
    expect(w.credentialWrites).toHaveLength(0);
    expect(w.sends).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await w.close();
  }
});
test('historical comparison shows the previous model, book and paired uncertainty with explicit odds-input disclosure', async ({
  page,
}) => {
  const w = await apiWorkspace();
  try {
    await seedAdvice(w.store);
    w.setAdviceFootballData(fictionalMarkets());
    await page.goto(`${w.url}/#/advice?mode=betting`);
    await page.getByRole('button', { name: 'Track results', exact: true }).click();
    await page.getByText('Prediction accuracy and paper results', { exact: true }).click();
    const response = page.waitForResponse((r) =>
      r.url().endsWith('/api/advice/performance/backtest'),
    );
    await page.getByRole('button', { name: 'Test historical market prices', exact: true }).click();
    const api = await response;
    expect(api.status()).toBe(200);
    expect((await api.json()).method).toBe('market-context-v3');
    const report = page.getByRole('region', { name: 'Historical market-price test' });
    await expect(report).toBeVisible();
    await expect(report).toContainText('uses sportsbook probabilities as an input');
    await expect(
      report.getByRole('columnheader', { name: 'Previous model error' }).first(),
    ).toBeAttached();
    await report.getByText('Accuracy comparison and uncertainty', { exact: true }).first().click();
    await expect(report).toContainText('Paired improvement interval:');
    expect(w.adviceCalls).toHaveLength(0);
    expect(w.sends).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await w.close();
  }
});

test('supported totals show dated injury and regional weather evidence, save v4 and preserve it without another inference', async ({
  page,
}, info) => {
  // The replay worker has a two-minute bound; allow the existing UI request budget plus setup.
  test.setTimeout(180_000);
  const w = await apiWorkspace(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    const clock = Date.parse('2026-10-11T16:00:00Z');
    w.setAdviceClock(clock);
    await seedAdvice(w.store);
    const data = fictionalMarkets();
    data.sources[0]!.retrievedAt = new Date(clock).toISOString();
    for (const game of data.games) {
      game.stadiumId = 'BUF00';
      game.stadiumName = 'Highmark Stadium';
      const t = Date.parse(game.kickoffAt!);
      game.pregame = {
        asOf:
          game.id === 'upcoming' ? new Date(clock).toISOString() : new Date(t - 1000).toISOString(),
        home: {
          reportUpdatedAt: new Date(t - 86400000).toISOString(),
          offenseOut: game.week % 3,
          defenseOut: 0,
          quarterbackOut: false,
          previousQuarterbackName: 'Recorded home QB',
        },
        away: {
          reportUpdatedAt: new Date(t - 86400000).toISOString(),
          offenseOut: 0,
          defenseOut: 1,
          quarterbackOut: game.week % 7 === 0,
        },
        weather: {
          venueId: 'BUF00',
          model: 'jma_gsm',
          leadHours: 48,
          validAt: game.kickoffAt!,
          availableBy: new Date(t - 36 * 3600000).toISOString(),
          temperatureC: 10,
          windKph: game.week % 2 ? 10 : 40,
          precipitationMm: 0,
        },
      };
      if (game.id === 'upcoming') {
        game.pregame.home.reportSource = 'nfl-official';
        game.pregame.home.reportUrl = 'https://www.nfl.com/news/fictional-test-report';
        game.pregame.home.personnel = {
          availableBy: '2026-10-10T12:00:00Z',
          throughSeason: 2026,
          throughWeek: 4,
          quarterbackQuality: 0.25,
          offenseOutSnaps: 0.8,
          matchedReports: 1,
          reportedPlayers: 1,
        };
      }
    }
    w.setAdviceFootballData(data);
    const settings = w.store.settingsSnapshot();
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${w.url}/#/advice?mode=betting`);
    await expect(page).toHaveTitle('Sunday Sidekick');
    await expect(page.getByRole('heading', { name: 'Advice', exact: true })).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('v4-initial.png') });
    await page.getByRole('combobox', { name: 'Bet type', exact: true }).selectOption('total');
    await page.getByRole('combobox', { name: 'NFL game', exact: true }).selectOption('upcoming');
    await page.getByRole('button', { name: 'Fetch sportsbook prices', exact: true }).click();
    const live = page.getByRole('region', { name: 'Live sportsbook prices' });
    await live.getByRole('button', { name: 'Use this price', exact: true }).first().click();
    await page.getByRole('button', { name: 'Analyze my choices', exact: true }).click();
    const forecast = page.getByRole('region', { name: 'Market-aware betting forecast' });
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    await page.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(forecast).toContainText('Only totals use the added variables');
    await expect(forecast).toContainText('Missing reports do not prove health');
    await expect(forecast).toContainText('Their tested numerical corrections performed worse');
    const saved = w.store.snapshot().adviceResults![0]!;
    expect(saved.betHistory!.forecast!.method).toBe('health-weather-total-v4');
    expect(isAdviceResult(saved)).toBe(true);
    expect(saved.metrics.some((m) => m.id === 'bet-model-weather-wind')).toBe(true);
    expect(saved.metrics.some((m) => m.id === 'bet-model-home-quarterback-efficiency')).toBe(true);
    expect(
      saved.warnings.some((w) => w.includes('experimental numerical correction was rejected')),
    ).toBe(true);
    expect(
      w.store.snapshot().predictionRecords!.some((r) => r.method === 'health-weather-total-v4'),
    ).toBe(true);
    await forecast.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('v4-forecast.png') });
    await page.reload();
    await expect(page.getByRole('article', { name: 'Advice result' })).toBeVisible();
    await page.getByText('Numbers & comparisons', { exact: true }).click();
    await expect(forecast).toContainText('Only totals use the added variables');
    await page.getByRole('button', { name: 'Track results', exact: true }).click();
    await page.getByText('Prediction accuracy and paper results', { exact: true }).click();
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/advice/performance/backtest'),
      { timeout: 150_000 },
    );
    await page.getByRole('button', { name: 'Test historical market prices', exact: true }).click();
    const api = await response;
    expect(api.status()).toBe(200);
    const report = await api.json();
    expect(report.method).toBe('health-weather-total-v4');
    expect(report.seasons[1].markets[2].availabilityAwareForecasts).toBeGreaterThan(0);
    const historical = page.getByRole('region', { name: 'Historical market-price test' });
    await expect(historical).toBeVisible();
    await historical
      .getByText('Accuracy comparison and uncertainty', { exact: true })
      .first()
      .click();
    await expect(historical).toContainText('Previous v3 error:');
    await expect(historical).toContainText('regional weather cases');
    expect(w.adviceCalls).toHaveLength(2);
    expect(w.store.settingsSnapshot()).toEqual(settings);
    expect(w.credentialWrites).toHaveLength(0);
    expect(w.sends).toHaveLength(0);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await w.close();
  }
});
