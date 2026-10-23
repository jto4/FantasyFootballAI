import { expect, it } from 'vitest';
import express from 'express';
import { devFaults, parseFaults } from './dev-faults.js';

it('parses only well-formed fault rules', () => {
  expect(
    parseFaults('fail:/api/alerts=503; slow:/api/advice=10; drop:/api/live; flaky:/api/props=0.5'),
  ).toEqual([
    { kind: 'fail', path: '/api/alerts', value: 503 },
    { kind: 'slow', path: '/api/advice', value: 10 },
    { kind: 'drop', path: '/api/live' },
    { kind: 'flaky', path: '/api/props', value: 0.5 },
  ]);
  expect(
    parseFaults('fail:/etc/passwd; fail:/api/x=200; slow:/api/x; flaky:/api/x=2; nope'),
  ).toEqual([]);
  expect(parseFaults(undefined)).toEqual([]);
});

it('fails, delays and can be switched at runtime', async () => {
  const faults = devFaults('fail:/api/alerts=502;slow:/api/slow=50');
  const app = express();
  app.use(express.json());
  app.use(faults.router);
  app.use(faults.middleware);
  app.get('/api/alerts', (_req, res) => res.json({ ok: true }));
  app.get('/api/slow', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const failed = await fetch(`${url}/api/alerts`);
    expect(failed.status).toBe(502);
    expect((await failed.json()).code).toBe('simulated_fault');
    const started = Date.now();
    expect((await fetch(`${url}/api/slow`)).status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    await fetch(`${url}/api/dev/faults`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec: '' }),
    });
    expect((await fetch(`${url}/api/alerts`)).status).toBe(200);
  } finally {
    server.close();
  }
});
