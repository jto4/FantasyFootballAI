import { describe, expect, it, vi } from 'vitest';
import {
  CredentialStoreUnavailableError,
  createCredentialManager,
  type CredentialBackend,
} from './credentials.js';

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
