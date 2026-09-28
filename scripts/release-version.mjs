import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateReleaseVersion(tag, version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('The app version must use three numeric release components.');
  }
  if (tag !== `v${version}`) {
    throw new Error(`Release tag must match the app version: expected v${version}.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const packageFile = new URL('../package.json', import.meta.url);
  const packageInfo = JSON.parse(await readFile(packageFile, 'utf8'));
  try {
    validateReleaseVersion(process.env.GITHUB_REF_NAME, packageInfo.version);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'The release version is invalid.');
    process.exitCode = 1;
  }
}
