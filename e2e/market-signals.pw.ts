import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { apiWorkspace } from './api-fixture';
import { adviceNow, seedAdvice } from './advice-fixture';
import type {
  ExternalTotalTape,
  FootballDataSnapshot,
  SportsbookSnapshot,
  RosterPlayer,
} from '@sidekick/core';
import type { FootballNewsSnapshot } from '@sidekick/integrations';
const fixtureTime = new Date(adviceNow).toISOString();
test('Market Signals charts and prospective freeze are separate from predictions; missing provider is honest', async ({
  page,
}, info) => {
  const w = await apiWorkspace();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    await seedAdvice(w.store);
    const game = {
      id: 'research-game',
      season: 2026,
      week: 5,
      seasonType: 'REG',
      date: '2026-10-11',
      home: 'BUF',
      away: 'MIA',
      kickoffAt: '2026-10-11T17:00:00.000Z',
      espnId: '401872994',
      totalLine: 45.5,
    };
    w.setAdviceFootballData({
      season: 2026,
      games: [game],
      players: [],
      market: [],
      sources: [],
      warnings: [],
    });
    w.setMarketTape({
      provider: 'kalshi',
      gameId: game.id,
      contractId: 'KXNFLTOTAL-26OCT11MIABUF-46',
      line: 45.5,
      kickoffAt: game.kickoffAt,
      cutoffAt: fixtureTime,
      capturedAt: fixtureTime,
      createdAt: '2026-10-01T12:00:00Z',
      windowStartAt: new Date(adviceNow - 86400000).toISOString(),
      complete: true,
      prices: [
        { at: new Date(adviceNow - 1800000).toISOString(), probability: 0.49 },
        { at: new Date(adviceNow - 60000).toISOString(), probability: 0.53 },
      ],
      trades: [
        {
          id: 'large',
          at: new Date(adviceNow - 60000).toISOString(),
          shares: 2000,
          price: 0.5,
          overProbability: 0.5,
          direction: 1,
        },
      ],
    });
    w.setResearchOdds({
      gameId: game.id,
      status: 'available',
      warnings: [],
      quotes: [
        {
          id: 'q',
          gameId: game.id,
          espnId: game.espnId,
          sportsbook: 'Fixture book',
          providerId: '100',
          kind: 'total',
          side: 'over',
          line: 45.5,
          americanOdds: -110,
          oppositeAmericanOdds: -110,
          observedAt: fixtureTime,
          kickoffAt: game.kickoffAt,
          sourceUrl: `https://www.espn.com/nfl/odds/_/gameId/${game.espnId}`,
        },
      ],
    });
    w.setResearchNews({
      stale: false,
      refreshedAt: fixtureTime,
      items: [
        {
          title: 'Buffalo Bills football injury update',
          source: 'ESPN',
          url: 'https://www.espn.com/nfl/test',
          publishedAt: new Date(adviceNow - 3600000).toISOString(),
        },
      ],
    });
    const before = w.store.snapshot();
    await page.goto(`${w.url}/#/advice?mode=betting`);
    await expect(page).toHaveTitle(/Sunday Sidekick/);
    await page.getByRole('button', { name: 'Market signals', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Market Signals', exact: true });
    await expect(panel).toContainText('do not affect betting predictions');
    await panel.getByLabel('NFL game').selectOption(game.id);
    await panel.getByRole('button', { name: 'Load signals', exact: true }).click();
    await expect(panel.getByRole('img')).toHaveCount(3);
    await expect(panel).toContainText('Complete pagination');
    await panel.getByRole('button', { name: 'Freeze prospective record' }).click();
    await expect(panel.getByRole('status')).toContainText('Frozen');
    expect(w.marketResearch.list()).toHaveLength(1);
    expect(w.store.snapshot()).toEqual(before);
    expect(w.adviceCalls).toHaveLength(0);
    expect(w.sends).toHaveLength(0);
    expect(w.credentialWrites).toHaveLength(0);
    await page.screenshot({ path: info.outputPath('market-signals.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await panel.getByLabel('Provider').selectOption('polymarket');
    await panel.getByRole('button', { name: 'Load signals', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Freeze prospective record' })).toBeDisabled();
    await expect(panel).toContainText('No verified observations');
    await page.reload();
    await page.getByRole('button', { name: 'Market signals', exact: true }).click();
    await expect(page.getByText('Prospective tracking (1)', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await w.close();
  }
});

// Explicit opt-in: frozen public provider capture only. Replay does not create owner history.
test('real NFL market capture and player-prop logs render with independently verified arithmetic', async ({
  page,
}, info) => {
  test.skip(
    !process.env.SIDEKICK_REAL_MARKET_CAPTURE,
    'Set a real capture file from scripts/capture-market-signals.mjs.',
  );
  const real = JSON.parse(await readFile(process.env.SIDEKICK_REAL_MARKET_CAPTURE!, 'utf8')) as {
    data: FootballDataSnapshot;
    catalog: [string, RosterPlayer][];
    snapshot: { capturedAt: string; game: { id: string }; line: number };
    tape: ExternalTotalTape;
    odds: SportsbookSnapshot;
    news: FootballNewsSnapshot;
    prop: { playerId: string; name: string; rows: { value: number }[] };
  };
  const w = await apiWorkspace(false);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  try {
    w.setAdviceFootballData(real.data);
    w.setAdviceCatalog(new Map(real.catalog));
    w.setAdviceClock(Date.parse(real.snapshot.capturedAt));
    w.setMarketTape(real.tape);
    w.setResearchOdds(real.odds);
    w.setResearchNews(real.news);
    await page.goto(`${w.url}/#/advice?mode=betting`);
    await page.getByRole('button', { name: 'Market signals', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Market Signals', exact: true });
    await panel.getByLabel('NFL game').selectOption(real.snapshot.game.id);
    await panel.getByLabel('Exact game total').fill(String(real.snapshot.line));
    await panel.getByRole('button', { name: 'Load signals', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Freeze prospective record' })).toBeEnabled();
    await expect(panel).toContainText('Complete pagination');
    await expect(panel.getByRole('img')).toHaveCount(real.news.items.length ? 3 : 2);
    await panel.screenshot({ path: info.outputPath('real-market-signals.png') });
    await page.getByRole('switch', { name: 'Dark mode' }).check();
    await panel.screenshot({ path: info.outputPath('real-market-signals-dark.png') });
    await page.getByRole('switch', { name: 'Dark mode' }).uncheck();
    await panel.getByRole('button', { name: 'Freeze prospective record' }).click();
    await expect(panel.getByRole('status')).toContainText('Frozen');
    expect(w.marketResearch.list()[0]?.candidateProbability).toBe(
      real.tape.prices.at(-1)?.probability,
    );
    await page.getByRole('button', { name: 'New decision', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'NFL game', exact: true })
      .selectOption(real.snapshot.game.id);
    await page.getByRole('button', { name: 'Player props', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Player for this prop' }).fill(real.prop.name);
    await page.getByRole('checkbox', { name: new RegExp(real.prop.name) }).check();
    await page.getByLabel('Line', { exact: true }).fill('225.5');
    const prop = page.getByRole('region', { name: 'Player prop research', exact: true });
    await expect(prop.getByRole('img')).toBeVisible();
    const values = real.prop.rows.map((r) => r.value),
      average = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
    await expect(prop).toContainText(`average ${average}`);
    await expect(prop).toContainText(
      `Over ${values.filter((v) => v > 225.5).length} / Under ${values.filter((v) => v < 225.5).length} / Push ${values.filter((v) => v === 225.5).length}`,
    );
    await prop.screenshot({ path: info.outputPath('real-player-prop.png') });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(w.store.snapshot().predictionRecords ?? []).toEqual([]);
    expect(w.adviceCalls).toHaveLength(0);
    expect(w.sends).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await w.close();
  }
});
