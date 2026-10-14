import { Worker } from 'node:worker_threads';
import type { FootballDataSnapshot, MarketBacktest } from '@sidekick/core';
/** The bounded CPU replay runs outside the HTTP/scheduler event loop and receives no app state or environment secrets. */
export function runMarketBacktest(
  data: FootballDataSnapshot,
  seasons: [number, number],
  asOf: string,
  signal?: AbortSignal,
): Promise<MarketBacktest> {
  return new Promise((resolve, reject) => {
    const bootstrap = `import {parentPort,workerData} from 'node:worker_threads'; import {evaluateArchivedMarkets} from ${JSON.stringify(import.meta.resolve('@sidekick/core'))}; parentPort.postMessage(evaluateArchivedMarkets(workerData.data,workerData.seasons,workerData.asOf));`;
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`), {
      env: {},
      execArgv: [],
      workerData: {
        data: {
          season: data.season,
          games: data.games,
          players: [],
          market: [],
          sources: data.sources.filter((s) => s.id === 'games' || s.id.startsWith('game-context-')),
          warnings: [],
        },
        seasons,
        asOf,
      },
    });
    const timer = setTimeout(
      () => finish(new Error('Historical replay exceeded its time limit.')),
      120000,
    );
    const cancel = () => finish(new Error('Historical replay canceled.'));
    let done = false;
    function finish(error?: Error, value?: MarketBacktest) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      void worker.terminate();
      if (error) reject(error);
      else if (value) resolve(value);
      else reject(new Error('Historical replay returned no report.'));
    }
    worker.once('message', (value: MarketBacktest) => finish(undefined, value));
    worker.once('error', () => finish(new Error('Historical replay failed.')));
    worker.once('exit', (code) => {
      if (!done) finish(new Error(`Historical replay ended (${code}).`));
    });
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}
