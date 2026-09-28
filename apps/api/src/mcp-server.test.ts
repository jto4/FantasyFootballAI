import { describe, expect, it, vi } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createMcpServer } from './mcp-server.js';

describe('local MCP server', () => {
  it('accepts loopback endpoints and rejects remote API hosts', () => {
    expect(createMcpServer('http://127.0.0.1:4173')).toBeDefined();
    expect(() => createMcpServer('https://api.example.com')).toThrow(
      'MCP may only connect to the local Sidekick API.',
    );
  });

  it('exposes documented tools and keeps report creation separate from sending', async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const pathname = new URL(url).pathname;
        const method = init?.method ?? 'GET';
        requests.push({
          url,
          method,
          ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        });
        if (pathname === '/api/mcp/reports/report-1/send')
          return new Response(JSON.stringify({ error: 'MCP sending is disabled.' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          });
        return new Response(
          JSON.stringify(
            pathname === '/api/leagues'
              ? [{ id: 'league-1', displayName: 'Test League' }]
              : pathname === '/api/leagues/league-1'
                ? { id: 'league-1', name: 'Test League' }
                : pathname === '/api/reports'
                  ? [{ id: 'report-1', status: 'draft' }]
                  : pathname === '/api/reports/report-1'
                    ? { id: 'report-1', body: 'Draft body', citations: [] }
                    : pathname === '/api/news'
                      ? [{ title: 'Test headline', url: 'https://example.test/story' }]
                      : pathname === '/api/reports/power-rankings'
                        ? { id: 'report-2', status: 'draft' }
                        : { error: 'not found' },
          ),
          {
            status: method === 'POST' ? 201 : 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }),
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer('http://127.0.0.1:4173');
    const pending = new Map<number, (message: unknown) => void>();
    let requestId = 0;
    clientTransport.onmessage = (message) => {
      if (!('id' in message) || typeof message.id !== 'number') return;
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    };

    async function request(method: string, params: Record<string, unknown>): Promise<unknown> {
      const id = ++requestId;
      const response = new Promise<unknown>((resolve) => pending.set(id, resolve));
      await clientTransport.send({ jsonrpc: '2.0', id, method, params });
      return response;
    }

    async function callTool(name: string, args: Record<string, unknown> = {}) {
      const response = await request('tools/call', { name, arguments: args });
      return (response as { result: unknown }).result as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };
    }

    try {
      await server.connect(serverTransport);
      await clientTransport.start();
      const initialized = (await request('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'sidekick-test', version: '1.0.0' },
      })) as { result: { serverInfo: { name: string } } };
      expect(initialized.result.serverInfo.name).toBe('sunday-sidekick');
      await clientTransport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

      const listed = (await request('tools/list', {})) as {
        result: { tools: Array<{ name: string; description: string }> };
      };
      expect(listed.result.tools.map((tool) => tool.name)).toEqual([
        'list_leagues',
        'get_league',
        'list_reports',
        'get_report',
        'get_football_news',
        'create_report_draft',
        'send_report_draft',
      ]);
      expect(
        listed.result.tools.find((tool) => tool.name === 'send_report_draft')?.description,
      ).toContain('disabled until the owner enables MCP sending');

      expect(JSON.stringify(await callTool('list_leagues'))).toContain('Test League');
      expect(JSON.stringify(await callTool('get_league', { leagueId: 'league-1' }))).toContain(
        'Test League',
      );
      expect(
        JSON.stringify(await callTool('list_reports', { leagueId: 'league-1', limit: 5 })),
      ).toContain('report-1');
      expect(JSON.stringify(await callTool('get_report', { reportId: 'report-1' }))).toContain(
        'Draft body',
      );
      expect(JSON.stringify(await callTool('get_football_news'))).toContain('Test headline');
      expect(
        JSON.stringify(
          await callTool('create_report_draft', {
            leagueId: 'league-1',
            kind: 'power-rankings',
          }),
        ),
      ).toContain('report-2');
      const draftRequest = requests.find((entry) =>
        entry.url.endsWith('/api/reports/power-rankings'),
      );
      expect(draftRequest?.method).toBe('POST');
      expect(JSON.parse(draftRequest?.body ?? '{}')).toEqual({
        leagueId: 'league-1',
        draftOnly: true,
      });

      const sendResult = await callTool('send_report_draft', { reportId: 'report-1' });
      expect(sendResult.isError).toBe(true);
      expect(JSON.stringify(sendResult)).toContain('MCP sending is disabled');
      const sendRequest = requests.find((entry) =>
        entry.url.endsWith('/api/mcp/reports/report-1/send'),
      );
      expect(sendRequest?.method).toBe('POST');
      expect(JSON.parse(sendRequest?.body ?? '{}')).toEqual({});
    } finally {
      await server.close();
      await clientTransport.close();
      vi.unstubAllGlobals();
    }
  });
});
