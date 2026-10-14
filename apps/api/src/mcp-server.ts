import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { isGenerationJob, isReportPage } from '@sidekick/core';
import { readBoundedJson } from '@sidekick/integrations';

export function createMcpServer(api: string | URL): McpServer {
  const parsedApi = new URL(api);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsedApi.hostname))
    throw new Error('MCP may only connect to the local Sidekick API.');

  const server = new McpServer({ name: 'sunday-sidekick', version: '0.1.0' });
  server.registerTool(
    'list_leagues',
    {
      description: 'List fantasy leagues connected to the local Sunday Sidekick workspace.',
      inputSchema: z.object({}),
    },
    async () => {
      const leagues = await apiFetch('/api/leagues');
      return { content: [{ type: 'text', text: JSON.stringify(leagues, null, 2) }] };
    },
  );
  server.registerTool(
    'get_league',
    {
      description:
        'Read one connected league, including its roster, standings, draft, and matchup snapshot.',
      inputSchema: z.object({ leagueId: z.string().min(1) }),
    },
    async ({ leagueId }) => {
      const league = await apiFetch(`/api/leagues/${encodeURIComponent(leagueId)}`);
      return { content: [{ type: 'text', text: JSON.stringify(league, null, 2) }] };
    },
  );
  server.registerTool(
    'list_reports',
    {
      description:
        'List recent local report drafts and delivery status without returning report bodies.',
      inputSchema: z.object({
        leagueId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async ({ leagueId, limit }) => {
      const query = new URLSearchParams();
      if (leagueId) query.set('leagueId', leagueId);
      if (limit !== undefined) query.set('limit', String(limit));
      const suffix = query.size ? `?${query.toString()}` : '';
      const reports = await apiFetch(`/api/reports${suffix}`);
      return { content: [{ type: 'text', text: JSON.stringify(reports, null, 2) }] };
    },
  );
  server.registerTool(
    'get_report',
    {
      description:
        'Read one saved fantasy report draft and its citations. This tool does not send it.',
      inputSchema: z.object({ reportId: z.string().min(1) }),
    },
    async ({ reportId }) => {
      const report = await apiFetch(`/api/reports/${encodeURIComponent(reportId)}`);
      return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
    },
  );
  server.registerTool(
    'get_football_news',
    { description: 'Fetch current NFL news stories with source links.', inputSchema: z.object({}) },
    async () => {
      const news = await apiFetch('/api/news');
      return { content: [{ type: 'text', text: JSON.stringify(news, null, 2) }] };
    },
  );
  server.registerTool(
    'create_report_draft',
    {
      description:
        'Queue a review-only report and return its saved job immediately. Supply a unique requestId for a new report, reuse that ID after a timeout, and poll get_generation_job. This tool never sends messages.',
      inputSchema: z.object({
        requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
        leagueId: z.string().min(1),
        kind: z.enum([
          'offseason-update',
          'draft-hype',
          'draft-review',
          'power-rankings',
          'matchup-preview',
        ]),
      }),
    },
    async ({ requestId, leagueId, kind }) => {
      const job = await apiFetch('/api/generation-jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, leagueId, kind }),
      });
      if (!isGenerationJob(job))
        throw new Error('The local API returned an invalid generation job.');
      return { content: [{ type: 'text', text: JSON.stringify(job, null, 2) }] };
    },
  );
  for (const cancel of [false, true])
    server.registerTool(
      cancel ? 'cancel_generation_job' : 'get_generation_job',
      {
        description: cancel
          ? 'Cancel an unfinished report request. A completed report is preserved; cancelling does not refund provider work already performed.'
          : 'Read durable generation status by the original requestId, including older jobs. When completed, use get_report with reportId.',
        inputSchema: z.object({ requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/) }),
      },
      async ({ requestId }) => {
        const job = await apiFetch(
          `/api/generation-jobs/${encodeURIComponent(requestId)}${cancel ? '/cancel' : ''}`,
          cancel ? { method: 'POST' } : undefined,
        );
        if (!isGenerationJob(job))
          throw new Error('The local API returned an invalid generation job.');
        return { content: [{ type: 'text', text: JSON.stringify(job, null, 2) }] };
      },
    );
  server.registerTool(
    'list_report_history',
    {
      description:
        'Read a cursor page of report summaries, without report bodies. Pass nextCursor to continue.',
      inputSchema: z.object({
        leagueId: z.string().min(1).max(256).optional(),
        status: z.enum(['draft', 'sent', 'sending', 'failed', 'uncertain']).optional(),
        cursor: z.string().max(512).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async (input) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(input))
        if (value !== undefined) query.set(key, String(value));
      const page = await apiFetch(`/api/report-history?${query}`);
      if (!isReportPage(page)) throw new Error('The local API returned an invalid report page.');
      return { content: [{ type: 'text', text: JSON.stringify(page, null, 2) }] };
    },
  );
  server.registerTool(
    'send_report_draft',
    {
      description:
        'Send one existing draft through its configured channel. This is disabled until the owner enables MCP sending in Settings. Never call this merely to create a draft. Uncertain delivery retries must be confirmed in the dashboard.',
      inputSchema: z.object({ reportId: z.string().min(1) }),
    },
    async ({ reportId }) => {
      const result = await apiFetch(`/api/mcp/reports/${encodeURIComponent(reportId)}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(new URL(path, parsedApi), {
      ...init,
      signal: AbortSignal.timeout(45_000),
    });
    const body: unknown = await readBoundedJson(response, 4_000_000);
    if (!response.ok)
      throw new Error((body as { error?: string }).error ?? `Local API error (${response.status})`);
    return body;
  }

  return server;
}
