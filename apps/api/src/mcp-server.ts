import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

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
        'Generate a local reviewable fantasy league report draft. This tool does not send messages.',
      inputSchema: z.object({
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
    async ({ leagueId, kind }) => {
      const report = await apiFetch(`/api/reports/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leagueId, draftOnly: true }),
      });
      return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
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
    const body: unknown = await response.json();
    if (!response.ok)
      throw new Error((body as { error?: string }).error ?? `Local API error (${response.status})`);
    return body;
  }

  return server;
}
