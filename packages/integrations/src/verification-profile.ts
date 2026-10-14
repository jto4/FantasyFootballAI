import { createHash } from 'node:crypto';
import { isAbsolute, resolve, sep } from 'node:path';
/** Explicit test-only isolation; normal profiles and their OS credentials keep their existing identities. */
export function resolveVerificationProfile(
  root: string | undefined,
  dataDirectory?: string,
): { root: string; dataDirectory: string; credentialService: string } | undefined {
  if (root === undefined) return;
  if (!root || root.length > 2000 || !isAbsolute(root) || /[\u0000-\u001f]/.test(root))
    throw new Error('Verification requires an absolute private profile directory.');
  const directory = resolve(root);
  const data = dataDirectory === undefined ? resolve(directory, 'data') : resolve(dataDirectory);
  if (
    dataDirectory !== undefined &&
    (!isAbsolute(dataDirectory) ||
      dataDirectory.length > 2000 ||
      /[\u0000-\u001f]/.test(dataDirectory))
  )
    throw new Error('Verification data must stay in its private profile.');
  if (data !== directory && !data.startsWith(directory + sep))
    throw new Error('Verification data must stay in its private profile.');
  return {
    root: directory,
    dataDirectory: data,
    credentialService: `SundaySidekickVerification-${createHash('sha256').update(directory).digest('hex').slice(0, 24)}`,
  };
}
