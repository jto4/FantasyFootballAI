import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
it('pins the installed core cohort in the production ESM runtime and rejects unversioned AI forecasts', async () => {
  const moduleUrl = new URL('../dist/forecast-protocol.js', import.meta.url).href;
  const script = `const { freezeForecastProtocol } = await import(${JSON.stringify(moduleUrl)});
    const a = await freezeForecastProtocol('market-context-v3','2026-10-11T00:00:00Z');
    const b = await freezeForecastProtocol('market-context-v3','2026-10-12T00:00:00Z');
    const other = await freezeForecastProtocol('health-weather-total-v4','2026-10-11T00:00:00Z');
    const unsupported = await freezeForecastProtocol('ai:unversioned','2026-10-11T00:00:00Z');
    process.stdout.write(JSON.stringify({ a, b, other, unsupported: unsupported ?? null }));`;
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', script],
    { timeout: 10000, maxBuffer: 20000 },
  );
  const { a, b, other, unsupported } = JSON.parse(stdout);
  expect(a.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(a.id).toBe(b.id);
  expect(a).toMatchObject({ baseline: 'same-quote-no-vig', minimumWeeks: 8 });
  expect(other.id).not.toBe(a.id);
  expect(unsupported).toBeNull();
});
