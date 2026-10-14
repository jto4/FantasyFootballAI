import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { LocalStore } from './store.js';
import { createGenerationQueue } from './generation-jobs.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-history-'));
  const store = new LocalStore(join(directory, 'state.sqlite'), join(directory, 'missing.json'));
  await store.load();
  cleanup.push(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { store, directory };
}
it('archives old terminal receipts and deduplicates them after restart and backup restore', async () => {
  const { store, directory } = await fixture();
  await store.update((state) => {
    state.generationJobs = Array.from({ length: 225 }, (_, index) => ({
      id: `job-${index}`,
      requestId: `request-${index}`,
      leagueId: 'disconnected-league',
      kind: 'power-rankings',
      status: 'cancelled',
      failureCode: 'cancelled',
      createdAt: new Date(1700000000000 + index).toISOString(),
      finishedAt: new Date(1700000000001 + index).toISOString(),
    }));
  });
  expect(store.snapshot().generationJobs).toHaveLength(200);
  expect(store.generationDiagnostics().archivedReceipts).toBe(25);
  const receipt = store.generationJobByRequest('request-0')!;
  const backup = join(directory, 'archive.sqlite');
  await store.backupTo(backup);
  store.close();
  await store.load();
  expect(store.generationJobByRequest('request-0')).toEqual(receipt);
  await store.restoreFromBuffer(await readFile(backup));
  let calls = 0;
  const queue = createGenerationQueue(store, async () => {
    calls++;
    throw new Error('Must not replay.');
  });
  expect(
    await queue.enqueue({
      requestId: receipt.requestId,
      leagueId: receipt.leagueId,
      kind: receipt.kind,
    }),
  ).toEqual(receipt);
  await queue.idle();
  await queue.stop();
  expect(calls).toBe(0);
  await expect(
    queue.enqueue({ requestId: receipt.requestId, leagueId: receipt.leagueId, kind: 'draft-hype' }),
  ).rejects.toThrow('different report details');
});
it('uses indexed, body-free pages and does not rewrite reports for unrelated settings updates', async () => {
  const { store } = await fixture();
  await store.update((state) => {
    state.reports = Array.from({ length: 80 }, (_, index) => ({
      id: `report-${String(index).padStart(3, '0')}`,
      leagueId: index % 2 ? 'league-a' : 'league-b',
      kind: 'power-rankings',
      title: 'Title',
      body: 'Private body',
      citations: [],
      status: 'draft',
      revision: 0,
      createdAt: '2026-10-05T00:00:00.000Z',
    }));
  });
  const database = new Database(store.path);
  try {
    database.exec(
      'CREATE TABLE test_report_writes(count INTEGER); INSERT INTO test_report_writes VALUES(0); CREATE TRIGGER count_report_writes AFTER UPDATE ON reports BEGIN UPDATE test_report_writes SET count = count + 1; END;',
    );
    await store.update((state) => {
      state.settings.writingStyle = 'Updated voice';
    });
    expect(database.prepare('SELECT count FROM test_report_writes').get()).toEqual({ count: 0 });
    const page = store.reportsPage('league-a', 'draft', undefined, 10);
    expect(page.total).toBe(40);
    expect(page.items).toHaveLength(10);
    expect(page.items[0]?.id).toBe('report-079');
    expect(JSON.stringify(page)).not.toContain('Private body');
    const next = store.reportsPage('league-a', 'draft', page.nextCursor, 10);
    expect(next.items[0]?.id).toBe('report-059');
    expect(new Set([...page.items, ...next.items].map((item) => item.id)).size).toBe(20);
    const plan = database
      .prepare(
        'EXPLAIN QUERY PLAN SELECT id FROM reports WHERE league_id = ? ORDER BY created_at DESC, id DESC LIMIT 10',
      )
      .all('league-a');
    expect(JSON.stringify(plan)).toContain('reports_by_league_date');
  } finally {
    database.close();
  }
});

it('searches old report titles without searching bodies or treating LIKE punctuation as wildcards', async () => {
  const { store } = await fixture();
  await store.update((state) => {
    state.reports = Array.from({ length: 65 }, (_, index) => ({
      id: `search-report-${index}`,
      leagueId: index % 2 ? 'league-a' : 'league-b',
      kind: 'power-rankings',
      title: index === 0 ? 'Championship 100%_ready' : 'Weekly update',
      body: 'Secret search-only body',
      citations: [],
      status: 'draft',
      createdAt: new Date(1700000000000 + index).toISOString(),
    }));
  });
  expect(
    store.dashboardSummarySnapshot().reports.some((report) => report.id === 'search-report-0'),
  ).toBe(false);
  const match = store.reportsPage(undefined, undefined, undefined, 20, 'championship 100%_');
  expect(match.total).toBe(1);
  expect(match.items[0]?.id).toBe('search-report-0');
  expect(JSON.stringify(match)).not.toContain('Secret search-only body');
  expect(
    store.reportsPage(undefined, undefined, undefined, 20, 'Secret search-only body').total,
  ).toBe(0);
  expect(store.reportsPage('league-a', undefined, undefined, 20, 'Championship').total).toBe(0);
  expect(store.reportsPage(undefined, undefined, undefined, 20, "' OR 1=1 --").total).toBe(0);
});
