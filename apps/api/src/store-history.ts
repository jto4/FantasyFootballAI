import type { Database as DatabaseHandle } from 'better-sqlite3';
import {
  isGenerationJob,
  type GenerationJob,
  type ReportPage,
  type ReportSummary,
} from '@sidekick/core';
import type { AppState } from './store-types.js';

const summaryColumns = `id, league_id AS leagueId, created_at AS createdAt,
  json_extract(payload, '$.kind') AS kind, json_extract(payload, '$.title') AS title,
  report_status AS status, delivery_state AS deliveryState,
  json_extract(payload, '$.revision') AS revision, json_extract(payload, '$.editedAt') AS editedAt`;

export function queryReportPage(
  database: DatabaseHandle,
  leagueId?: string,
  status?: string,
  cursor?: string,
  limit = 20,
  search?: string,
): ReportPage {
  const filters: string[] = [],
    values: string[] = [];
  if (search?.trim()) {
    // Search public metadata only; escape LIKE syntax so punctuation is treated literally.
    for (const token of search.trim().split(/\s+/).slice(0, 12)) {
      filters.push(
        "(json_extract(payload, '$.title') LIKE ? ESCAPE '\\' OR replace(json_extract(payload, '$.kind'), '-', ' ') LIKE ? ESCAPE '\\')",
      );
      const match = `%${token.replace(/[\\%_]/g, '\\$&')}%`;
      values.push(match, match);
    }
  }
  if (leagueId) {
    filters.push('league_id = ?');
    values.push(leagueId);
  }
  if (status === 'draft') filters.push("report_status = 'draft' AND delivery_state IS NULL");
  else if (status === 'sent') filters.push("report_status = 'sent'");
  else if (status) {
    filters.push('delivery_state = ?');
    values.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const total = (
    database.prepare(`SELECT COUNT(*) AS count FROM reports ${where}`).get(...values) as {
      count: number;
    }
  ).count;
  if (cursor) {
    const separator = cursor.indexOf('|');
    if (separator < 1) return { items: [], total };
    filters.push('(created_at, id) < (?, ?)');
    values.push(cursor.slice(0, separator), cursor.slice(separator + 1));
  }
  const rows = database
    .prepare(
      `SELECT ${summaryColumns} FROM reports ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(...values, limit + 1) as Array<Record<string, unknown>>;
  const items = rows
    .slice(0, limit)
    .map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).filter(([, value]) => value !== null),
        ) as unknown as ReportSummary,
    );
  const last = items.at(-1);
  return {
    items,
    total,
    ...(rows.length > limit && last ? { nextCursor: `${last.createdAt}|${last.id}` } : {}),
  };
}

/** Keep full recent jobs in memory; old receipts retain request identity and terminal outcome. */
export function archiveGenerationJobs(database: DatabaseHandle, state: AppState): void {
  const jobs = state.generationJobs ?? [];
  const terminal = jobs
    .filter((job) => !['queued', 'running'].includes(job.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const expired = new Set(terminal.slice(200).map((job) => job.id));
  const insert = database.prepare(
    'INSERT INTO archived_generation_jobs(id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
  );
  const remove = database.prepare('DELETE FROM generation_jobs WHERE id = ?');
  for (const job of jobs)
    if (expired.has(job.id)) {
      const { error: _error, startedAt: _started, ...receipt } = job;
      void _error;
      void _started;
      insert.run(job.id, JSON.stringify(receipt));
      remove.run(job.id);
    }
  state.generationJobs = jobs.filter((job) => !expired.has(job.id));
}

export function jobByRequest(
  database: DatabaseHandle,
  requestId: string,
): GenerationJob | undefined {
  const row = database
    .prepare(
      `SELECT payload FROM generation_jobs WHERE json_extract(payload, '$.requestId') = ? UNION ALL SELECT payload FROM archived_generation_jobs WHERE json_extract(payload, '$.requestId') = ? LIMIT 1`,
    )
    .get(requestId, requestId) as { payload: string } | undefined;
  if (!row) return undefined;
  const job: unknown = JSON.parse(row.payload);
  if (!isGenerationJob(job)) throw new Error('Invalid saved generation receipt.');
  return job;
}

export function validateGenerationArchive(database: DatabaseHandle): void {
  for (const row of database
    .prepare('SELECT payload FROM archived_generation_jobs')
    .iterate() as Iterable<{ payload: string }>) {
    const job: unknown = JSON.parse(row.payload);
    if (!isGenerationJob(job) || ['queued', 'running'].includes(job.status))
      throw new Error('Invalid archived generation receipt.');
  }
  if (
    database
      .prepare(
        `SELECT json_extract(payload, '$.requestId') AS request_id FROM (SELECT payload FROM generation_jobs UNION ALL SELECT payload FROM archived_generation_jobs) GROUP BY request_id HAVING COUNT(*) > 1 LIMIT 1`,
      )
      .get()
  )
    throw new Error('Duplicate generation request ID.');
}
