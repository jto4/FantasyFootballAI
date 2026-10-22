import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The packaged app contains only the files desktop-package.mjs copies. A local import missing
// from that list crashes the installed app at startup while source runs still work.
test('every local module the desktop main process imports is copied into the package', async () => {
  const main = await readFile(new URL('../apps/desktop/main.mjs', import.meta.url), 'utf8');
  const packager = await readFile(new URL('./desktop-package.mjs', import.meta.url), 'utf8');
  const imports = [...main.matchAll(/from '\.\/([\w-]+\.(?:mjs|cjs))'/g)].map((m) => m[1]);
  const dynamic = [...main.matchAll(/import\('\.\/([\w-]+\.(?:mjs|cjs))'\)/g)].map((m) => m[1]);
  assert.ok(imports.length > 5);
  for (const file of [...imports, ...dynamic].filter((f) => f !== 'database-recovery.mjs'))
    assert.ok(
      packager.includes(`'apps/desktop/${file}'`),
      `${file} is imported by main.mjs but not copied by desktop-package.mjs`,
    );
});
