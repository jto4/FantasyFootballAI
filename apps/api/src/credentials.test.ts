import { describe, expect, it, vi } from 'vitest';
import {
  CredentialStoreUnavailableError,
  createCredentialManager,
  createRuntimeCredentialManager,
  type CredentialBackend,
} from './credentials.js';
import { resolve } from 'node:path';

function fakeBackend(): CredentialBackend {
  const entries = new Map<string, string>();
  return {
    getPassword: vi.fn(async (service, account) => entries.get(`${service}:${account}`) ?? null),
    setPassword: vi.fn(async (service, account, password) => {
      entries.set(`${service}:${account}`, password);
    }),
    deletePassword: vi.fn(async (service, account) => entries.delete(`${service}:${account}`)),
  };
}

describe('OS credential manager contract', () => {
  it('never touches the native vault in a valid verification profile and discards credentials on restart', async () => {
    const backend = fakeBackend();
    const root = resolve('private-verification-fixture');
    const first = createRuntimeCredentialManager(backend, root);
    await expect(first.listCredentialProviders()).resolves.toEqual(
      expect.arrayContaining([{ provider: 'backup-encryption', configured: false }]),
    );
    await first.saveCredential('backup-encryption', 'fictional-test-passphrase');
    await expect(first.readCredential('backup-encryption')).resolves.toBe(
      'fictional-test-passphrase',
    );
    await expect(first.listCredentialProviders()).resolves.toEqual(
      expect.arrayContaining([{ provider: 'backup-encryption', configured: true }]),
    );
    const restarted = createRuntimeCredentialManager(undefined, root);
    await expect(restarted.readCredential('backup-encryption')).resolves.toBeNull();
    const other = createRuntimeCredentialManager(undefined, resolve('other-verification-fixture'));
    await expect(other.readCredential('backup-encryption')).resolves.toBeNull();
    await first.removeCredential('backup-encryption');
    await expect(first.readCredential('backup-encryption')).resolves.toBeNull();
    expect(backend.getPassword).not.toHaveBeenCalled();
    expect(backend.setPassword).not.toHaveBeenCalled();
    expect(backend.deletePassword).not.toHaveBeenCalled();
  });

  it('retains the normal OS namespace and fails closed for invalid test isolation or unavailable native storage', async () => {
    const backend = fakeBackend();
    const normal = createRuntimeCredentialManager(backend);
    await normal.saveCredential('openai', 'fictional-normal-secret');
    expect(backend.setPassword).toHaveBeenCalledWith(
      'SundaySidekick',
      'openai',
      'fictional-normal-secret',
    );
    expect(() => createRuntimeCredentialManager(backend, '')).toThrow('absolute private profile');
    expect(() => createRuntimeCredentialManager(backend, 'relative')).toThrow(
      'absolute private profile',
    );
    expect(() =>
      createRuntimeCredentialManager(backend, resolve('test-profile'), resolve('outside')),
    ).toThrow('private profile');
    expect(() => createRuntimeCredentialManager(undefined)).toThrow(
      CredentialStoreUnavailableError,
    );
  });
  it('preserves backup passphrase whitespace and enforces its recovery bounds', async () => {
    const credentials = createCredentialManager(fakeBackend());
    await credentials.saveCredential('backup-encryption', ' padded-backup-passphrase ');
    expect(await credentials.readCredential('backup-encryption')).toBe(
      ' padded-backup-passphrase ',
    );
    await expect(credentials.saveCredential('backup-encryption', 'short')).rejects.toThrow(
      '12 and 200',
    );
  });
  it('trims and stores only allowlisted providers in the configured service namespace', async () => {
    const backend = fakeBackend();
    const credentials = createCredentialManager(backend, 'test-sidekick');

    await credentials.saveCredential('openai', '  api-secret  ');

    expect(backend.setPassword).toHaveBeenCalledWith('test-sidekick', 'openai', 'api-secret');
    await expect(credentials.readCredential('openai')).resolves.toBe('api-secret');
  });

  it('rejects unknown providers and invalid lengths before calling the backend', async () => {
    const backend = fakeBackend();
    const credentials = createCredentialManager(backend);

    await expect(credentials.saveCredential('unknown', 'secret')).rejects.toThrow(
      'Unsupported credential provider.',
    );
    await expect(credentials.saveCredential('openai', '  ')).rejects.toThrow(
      'Credential must be between 1 and 8,000 characters.',
    );
    await expect(credentials.saveCredential('openai', 'x'.repeat(8_001))).rejects.toThrow(
      'Credential must be between 1 and 8,000 characters.',
    );
    await credentials.saveCredential('openai', 'x'.repeat(8_000));
    await expect(
      credentials.readCredential('unknown' as Parameters<typeof credentials.readCredential>[0]),
    ).rejects.toThrow('Unsupported credential provider.');
    await expect(credentials.removeCredential('unknown')).rejects.toThrow(
      'Unsupported credential provider.',
    );
    expect(backend.getPassword).not.toHaveBeenCalled();
    expect(backend.setPassword).toHaveBeenCalledTimes(1);
    expect(backend.deletePassword).not.toHaveBeenCalled();
  });

  it('returns provider readiness without exposing credential values and supports deletion', async () => {
    const backend = fakeBackend();
    const credentials = createCredentialManager(backend);
    await credentials.saveCredential('twilio', 'twilio-secret');

    const readiness = await credentials.listCredentialProviders();
    expect(readiness.find(({ provider }) => provider === 'twilio')).toEqual({
      provider: 'twilio',
      configured: true,
    });
    expect(JSON.stringify(readiness)).not.toContain('twilio-secret');
    expect(backend.getPassword).toHaveBeenCalledWith('SundaySidekick', 'twilio');

    await credentials.removeCredential('twilio');
    await expect(credentials.readCredential('twilio')).resolves.toBeNull();
  });

  it('hides native credential backend details behind an actionable store error', async () => {
    const backend = fakeBackend();
    vi.mocked(backend.setPassword).mockRejectedValue(
      new Error('/private/path/keychain-provider: permission denied'),
    );
    const credentials = createCredentialManager(backend);

    const error = await credentials
      .saveCredential('openai', 'secret')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CredentialStoreUnavailableError);
    expect(error).toMatchObject({
      name: 'CredentialStoreUnavailableError',
      message: 'The operating system credential store is unavailable.',
    });
    expect(error).not.toMatchObject({ message: expect.stringContaining('/private/path') });
  });
});
