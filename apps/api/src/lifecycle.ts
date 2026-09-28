import type { Server } from 'node:http';

export interface ScheduledTask {
  stop(): void;
}

/** Build an idempotent shutdown action so API and OS signal paths share cleanup. */
export function createShutdownAction(
  server: Server,
  scheduledTasks: Iterable<ScheduledTask>,
  onStart: () => void = () => undefined,
): () => void {
  let started = false;

  return () => {
    if (started) return;
    started = true;
    onStart();
    for (const task of scheduledTasks) task.stop();
    server.close();
    // Avoid waiting forever on keep-alive clients after the shutdown response is sent.
    server.closeAllConnections();
  };
}
