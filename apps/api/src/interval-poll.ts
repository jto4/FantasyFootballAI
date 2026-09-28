export interface IntervalPollStatus {
  lastCheckedAt?: string;
  lastAddedMessages?: number;
  lastError?: string;
}

export type IntervalPollOutcome = { addedMessages: number } | { error: string } | undefined;

interface IntervalPollOptions {
  enabled: boolean;
  intervalMinutes: number;
  status: IntervalPollStatus;
  failureMessage: string;
  run: () => Promise<IntervalPollOutcome>;
  now?: () => Date;
}

/** Run a bounded background poll without overlapping work or updating status after shutdown. */
export function startIntervalPoll(options: IntervalPollOptions): () => void {
  if (!options.enabled || ![5, 15, 30, 60].includes(options.intervalMinutes)) return () => {};

  let active = true;
  let inFlight = false;
  const timer = setInterval(() => {
    if (!active || inFlight) return;
    inFlight = true;
    void Promise.resolve()
      .then(() => options.run())
      .then((outcome) => {
        if (!active || !outcome) return;
        options.status.lastCheckedAt = (options.now ?? (() => new Date()))().toISOString();
        if ('error' in outcome) {
          options.status.lastError = outcome.error;
          return;
        }
        options.status.lastAddedMessages = outcome.addedMessages;
        delete options.status.lastError;
      })
      .catch(() => {
        if (!active) return;
        options.status.lastCheckedAt = (options.now ?? (() => new Date()))().toISOString();
        options.status.lastError = options.failureMessage;
      })
      .finally(() => {
        inFlight = false;
      });
  }, options.intervalMinutes * 60_000);
  timer.unref();

  return () => {
    active = false;
    clearInterval(timer);
  };
}
