import { describe, expect, it } from 'vitest';
import { createMcpServer } from './mcp-server.js';

describe('local MCP server', () => {
  it('accepts loopback endpoints and rejects remote API hosts', () => {
    expect(createMcpServer('http://127.0.0.1:4173')).toBeDefined();
    expect(() => createMcpServer('https://api.example.com')).toThrow(
      'MCP may only connect to the local Sidekick API.',
    );
  });
});
