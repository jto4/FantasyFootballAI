import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './mcp-server.js';

const api = process.env.SIDEKICK_API_URL ?? 'http://127.0.0.1:4173';
const handle = serveStdio(() => createMcpServer(api));
process.once('SIGINT', () => {
  void handle.close();
});
process.once('SIGTERM', () => {
  void handle.close();
});
