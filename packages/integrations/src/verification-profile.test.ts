import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { resolveVerificationProfile } from './verification-profile.js';
it('keeps default credentials unchanged and separates canonical private verification profiles', () => {
  expect(resolveVerificationProfile(undefined)).toBeUndefined();
  const first = resolveVerificationProfile(resolve('fixture-profile'))!;
  expect(first.credentialService).not.toBe('SundaySidekick');
  expect(first.credentialService).toBe(
    resolveVerificationProfile(resolve('fixture-profile', '.'))?.credentialService,
  );
  expect(first.credentialService).not.toBe(
    resolveVerificationProfile(resolve('other-fixture-profile'))?.credentialService,
  );
  expect(() =>
    resolveVerificationProfile(resolve('fixture-profile'), resolve('other-profile')),
  ).toThrow('private profile');
  expect(
    resolveVerificationProfile(
      resolve('fixture-profile'),
      resolve('fixture-profile', 'custom-data'),
    )?.dataDirectory,
  ).toBe(resolve('fixture-profile', 'custom-data'));
  for (const input of ['', 'relative', '/tmp/bad\0profile'])
    expect(() => resolveVerificationProfile(input)).toThrow('absolute private profile');
});
