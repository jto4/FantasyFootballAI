import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Read the active desktop service endpoint without starting a second API process. */
export async function readDesktopMcpEndpoint(dataDirectory, request = fetch) {
  let portText;
  try {
    portText = (await readFile(join(dataDirectory, 'service-port'), 'utf8')).trim();
  } catch {
    throw new Error('Start Sunday Sidekick before connecting its packaged MCP server.');
  }
  if (!/^\d{1,5}$/.test(portText))
    throw new Error('Sunday Sidekick has no valid local service endpoint. Restart the app.');
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error('Sunday Sidekick has no valid local service endpoint. Restart the app.');
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    const response = await request(`${endpoint}/api/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) throw new Error('health check failed');
  } catch {
    throw new Error('Sunday Sidekick is not responding locally. Restart the app before using MCP.');
  }
  return endpoint;
}
