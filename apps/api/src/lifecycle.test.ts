import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createShutdownAction } from './lifecycle.js';

describe('application shutdown', () => {
  it('stops scheduled work and closes the server exactly once', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const task = { stop: vi.fn() };
    const onStart = vi.fn();
    const shutdown = createShutdownAction(server, [task], onStart);
    const closed = once(server, 'close');

    shutdown();
    shutdown();
    await closed;

    expect(task.stop).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
    expect(server.listening).toBe(false);
  });
});
