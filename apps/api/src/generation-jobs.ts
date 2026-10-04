import { logEvent, errorName } from './logger.js';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { isGenerationRequest, type GenerationJob, type GenerationRequest } from '@sidekick/core';
import type { LocalStore } from './store.js';
import type { createReportService } from './report-service.js';

export class JobConflict extends Error {
  constructor(
    public readonly code: 'request_conflict' | 'queue_full' | 'not_found' | 'service_unavailable',
    message: string,
  ) {
    super(message);
  }
}
/** One provider request at a time; persisted request IDs survive reloads and restarts. */
export function createGenerationQueue(
  store: LocalStore,
  generate: ReturnType<typeof createReportService>['generateAndSaveReport'],
) {
  let accepting = true;
  let pumping: Promise<void> | undefined;
  const waiters = new Map<
    string,
    Array<{ resolve: (job: GenerationJob) => void; reject: (error: Error) => void }>
  >();
  function notify(requestId: string) {
    const job = store.generationJobByRequest(requestId);
    if (job && !['queued', 'running'].includes(job.status)) {
      for (const done of waiters.get(requestId) ?? []) done.resolve(job);
      waiters.delete(requestId);
    }
  }
  function wait(requestId: string): Promise<GenerationJob> {
    const job = store.generationJobByRequest(requestId);
    if (!job) return Promise.reject(new JobConflict('not_found', 'Generation request not found.'));
    if (!['queued', 'running'].includes(job.status)) return Promise.resolve(job);
    return new Promise((resolve, reject) => {
      const pending = waiters.get(requestId) ?? [];
      pending.push({ resolve, reject });
      waiters.set(requestId, pending);
    });
  }
  async function enqueue(
    request: GenerationRequest,
    automaticDelivery = false,
  ): Promise<GenerationJob> {
    let result: GenerationJob | undefined;
    await store.update((state) => {
      const jobs = (state.generationJobs ??= []);
      const existing = jobs.find((job) => job.requestId === request.requestId);
      if (existing) {
        if (
          existing.leagueId !== request.leagueId ||
          existing.kind !== request.kind ||
          (existing.automaticDelivery ?? false) !== automaticDelivery
        )
          throw new JobConflict(
            'request_conflict',
            'This request ID belongs to different report details.',
          );
        result = structuredClone(existing);
        return;
      }
      if (!accepting) throw new JobConflict('service_unavailable', 'The app is stopping.');
      if (!state.leagues.some((league) => league.id === request.leagueId))
        throw new JobConflict('not_found', 'Connect a league first.');
      if (jobs.filter((job) => job.status === 'queued' || job.status === 'running').length >= 20)
        throw new JobConflict(
          'queue_full',
          'The generation queue is full. Wait for an existing job to finish.',
        );
      result = {
        ...request,
        id: randomUUID(),
        ...(automaticDelivery ? { automaticDelivery: true } : {}),
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
      jobs.push(result);
    });
    start();
    return result!;
  }
  function start() {
    if (!pumping && accepting) {
      pumping = pump()
        .catch((error) => {
          accepting = false;
          logEvent('error', 'generation.queue.failed', {
            component: 'generation',
            errorName: errorName(error),
          });
          const failure = new JobConflict(
            'service_unavailable',
            'The local database could not record generation progress. Restart the app and review Reports.',
          );
          for (const pending of waiters.values())
            for (const waiter of pending) waiter.reject(failure);
          waiters.clear();
        })
        .finally(() => {
          pumping = undefined;
          if (accepting && store.snapshot().generationJobs?.some((job) => job.status === 'queued'))
            start();
        });
    }
  }
  async function pump() {
    while (accepting) {
      let job: GenerationJob | undefined;
      await store.update((state) => {
        const next = state.generationJobs?.find((item) => item.status === 'queued');
        if (!next) return;
        next.status = 'running';
        next.startedAt = new Date().toISOString();
        job = structuredClone(next);
      });
      if (!job) return;
      try {
        const state = store.reportSnapshot();
        const league = state.leagues.find((item) => item.id === job!.leagueId);
        if (!league) throw new Error('League disconnected.');
        const channel =
          state.settings.actions.find((action) => action.kind === job!.kind)?.channel ??
          'dashboard';
        await generate(league, state, job.kind, job.automaticDelivery === true, channel, job.id);
      } catch (error) {
        await store.update((state) => {
          const failed = state.generationJobs?.find((item) => item.id === job!.id);
          if (failed?.status !== 'running') return;
          failed.status = 'failed';
          failed.finishedAt = new Date().toISOString();
          const known = new Set([
            'Report member-memory sharing changed during generation. Review Settings and try again.',
            'Configure an AI API key to generate personalized reports.',
            'Configure the local AI CLI command in Settings.',
            'Apple Foundation Models CLI requires a supported Mac running macOS 27 or later.',
          ]);
          failed.error =
            error instanceof Error && known.has(error.message)
              ? error.message
              : 'Generation failed. Check the AI connection and league, then start a new request.';
        });
      } finally {
        notify(job.requestId);
      }
    }
  }
  async function stop() {
    accepting = false;
    await store.update((state) => {
      for (const job of state.generationJobs ?? []) {
        if (job.status !== 'queued' && job.status !== 'running') continue;
        job.status = 'interrupted';
        job.finishedAt = new Date().toISOString();
        job.error =
          'Generation was interrupted. Review saved reports before starting a new request.';
      }
    });
    for (const requestId of waiters.keys()) notify(requestId);
  }
  return { enqueue, wait, stop, idle: () => pumping ?? Promise.resolve() };
}
export function createGenerationRouter(
  store: LocalStore,
  queue: ReturnType<typeof createGenerationQueue>,
) {
  const router = Router();
  router.post('/api/generation-jobs', async (req, res) => {
    if (!isGenerationRequest(req.body))
      return res.status(400).json({
        error: 'Enter a valid request ID, league, and report type.',
        code: 'invalid_request',
      });
    try {
      return res.status(202).json(await queue.enqueue(req.body));
    } catch (error) {
      if (error instanceof JobConflict)
        return res
          .status(
            error.code === 'not_found'
              ? 404
              : error.code === 'service_unavailable'
                ? 503
                : error.code === 'queue_full'
                  ? 429
                  : 409,
          )
          .json({ error: error.message, code: error.code });
      throw error;
    }
  });
  router.get('/api/generation-jobs/:requestId', (req, res) => {
    const job = store
      .snapshot()
      .generationJobs?.find((item) => item.requestId === req.params.requestId);
    return job
      ? res.json(job)
      : res.status(404).json({ error: 'Generation request not found.', code: 'not_found' });
  });
  return router;
}
