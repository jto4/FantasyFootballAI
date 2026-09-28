import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const heroAssetPath = fileURLToPath(
  new URL('../../public/images/soft-gradient-waves.webp', import.meta.url),
);
const designStylesPath = fileURLToPath(new URL('./design.css', import.meta.url));

describe('dashboard hero artwork', () => {
  it('serves the optimized local derivative within the image transfer budget', async () => {
    const [asset, styles] = await Promise.all([
      stat(heroAssetPath),
      readFile(designStylesPath, 'utf8'),
    ]);

    expect(asset.size).toBeLessThan(64 * 1024);
    expect(styles).toContain("url('/images/soft-gradient-waves.webp')");
  });
});
