import { Router, type RequestHandler } from 'express';

/**
 * Development-only fault injection, for seeing error, slow and offline states in the real app.
 * Never installed unless the API runs in development mode (npm run dev / SIDEKICK_DEV_MODE=1);
 * the packaged app and the background service ignore it entirely.
 *
 * Spec: semicolon-separated rules `kind:path[=value]`, where path is a prefix of the request path:
 *   fail:/api/alerts=502      answer with that status and a simulated error body
 *   slow:/api/advice=8000     wait that many milliseconds before handling
 *   drop:/api/live            close the connection (the browser sees a network failure)
 *   flaky:/api/props=0.5      fail with 502 on that share of requests
 */
export interface FaultRule {
  kind: 'fail' | 'slow' | 'drop' | 'flaky';
  path: string;
  value?: number;
}

export function parseFaults(spec: string | undefined): FaultRule[] {
  if (!spec) return [];
  return spec
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20)
    .flatMap((part): FaultRule[] => {
      const match = /^(fail|slow|drop|flaky):(\/api\/[\w/.-]*)(?:=([\d.]+))?$/.exec(part);
      if (!match) return [];
      const value = match[3] === undefined ? undefined : Number(match[3]);
      const kind = match[1] as FaultRule['kind'];
      if (kind === 'fail' && value !== undefined && (value < 400 || value > 599)) return [];
      if (kind === 'slow' && (value === undefined || value < 0 || value > 300_000)) return [];
      if (kind === 'flaky' && (value === undefined || value <= 0 || value > 1)) return [];
      return [{ kind, path: match[2]!, ...(value !== undefined ? { value } : {}) }];
    });
}

export function devFaults(initial: string | undefined, random: () => number = Math.random) {
  let rules = parseFaults(initial);
  const middleware: RequestHandler = (req, res, next) => {
    // The control endpoint itself is never faulted, so faults can always be turned off.
    if (req.path.startsWith('/api/dev/faults')) return next();
    const rule = rules.find((r) => req.path.startsWith(r.path));
    if (!rule) return next();
    res.setHeader('x-sidekick-simulated-fault', rule.kind);
    const fail = (status: number) =>
      res.status(status).json({
        error: `Simulated failure for testing (${rule.kind} ${rule.path}).`,
        code: 'simulated_fault',
      });
    if (rule.kind === 'fail') return void fail(rule.value ?? 502);
    if (rule.kind === 'flaky') return random() < rule.value! ? void fail(502) : next();
    if (rule.kind === 'drop') return void req.socket.destroy();
    const timer = setTimeout(next, rule.value);
    res.once('close', () => clearTimeout(timer));
  };
  const router = Router();
  router.get('/api/dev/faults', (_req, res) => res.json({ rules }));
  router.put('/api/dev/faults', (req, res) => {
    const spec = typeof req.body?.spec === 'string' ? req.body.spec.slice(0, 2_000) : '';
    rules = parseFaults(spec);
    res.json({ rules });
  });
  return { middleware, router, rules: () => rules };
}
