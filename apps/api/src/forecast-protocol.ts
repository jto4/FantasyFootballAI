import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PredictionRecord } from '@sidekick/core';
let digest: Promise<string> | undefined;
/** Fingerprint the installed numerical core; a rebuild creates a separate prospective cohort. */
export async function freezeForecastProtocol(
  method: string,
  registeredAt: string,
): Promise<NonNullable<PredictionRecord['protocol']> | undefined> {
  if (
    ![
      'health-weather-total-v4',
      'market-context-v3',
      'market-regularized-v2',
      'rolling-residual-v1',
    ].includes(method)
  )
    return;
  digest ??= (async () => {
    const entry = fileURLToPath(import.meta.resolve('@sidekick/core'));
    const root = dirname(entry);
    const coreExtension = entry.endsWith('.ts') ? '.ts' : '.js';
    const files = (await readdir(root))
      // Only real module names: sync conflict copies ("name 2.js") are never part of the build.
      .filter(
        (name) =>
          /^[a-z0-9-]+\.[jt]s$/.test(name) &&
          name.endsWith(coreExtension) &&
          !/\.test\.[jt]s$/.test(name),
      )
      .sort();
    if (!files.length || files.length > 300) throw new Error('Forecast code is unavailable.');
    const hash = createHash('sha256').update(
      'sidekick-prospective-v1:same-quote-no-vig:earliest:8-weeks',
    );
    for (const name of files) {
      const bytes = await readFile(join(root, name));
      if (bytes.length > 2000000) throw new Error('Forecast code is oversized.');
      hash.update(name).update(bytes);
    }
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
    for (const name of [`advice-service.${extension}`, `forecast-protocol.${extension}`]) {
      const bytes = await readFile(new URL(`./${name}`, import.meta.url));
      if (bytes.length > 2000000) throw new Error('Forecast runtime is oversized.');
      hash.update(name).update(bytes);
    }
    return hash.digest('hex');
  })();
  try {
    const sourceHash = await digest;
    return {
      id: `${method}:${sourceHash}`,
      sourceHash,
      registeredAt,
      baseline: 'same-quote-no-vig',
      minimumWeeks: 8,
    };
  } catch {
    return;
  }
}
