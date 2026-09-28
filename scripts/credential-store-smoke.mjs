import keytar from 'keytar';
import { randomUUID } from 'node:crypto';
import { createCredentialManager } from '../apps/api/dist/credentials.js';

const service = `SundaySidekick-Smoke-${randomUUID()}`;
const value = `roundtrip-${randomUUID()}`;
const credentials = createCredentialManager(keytar, service);
let passed = false;

try {
  await credentials.saveCredential('openai', value);
  if ((await credentials.readCredential('openai')) !== value)
    throw new Error('Credential round trip did not match.');
  await credentials.removeCredential('openai');
  if ((await credentials.readCredential('openai')) !== null)
    throw new Error('Temporary credential remained after removal.');
  passed = true;
} catch {
  throw new Error(
    'OS credential-store smoke test failed; check that the current user credential manager is available.',
  );
} finally {
  // Also clean up if an assertion or backend operation fails partway through.
  await keytar.deletePassword(service, 'openai').catch(() => false);
}

if (passed) console.log(`OS credential-store round trip passed on ${process.platform}.`);
