import { resolveVerificationProfile } from '@sidekick/integrations';

const service = 'SundaySidekick';
const knownProviders = [
  'openai',
  'image-generation',
  'stability-image-generation',
  'espn',
  'yahoo',
  'yahoo-oauth-client',
  'resend',
  'twilio',
  'bluebubbles',
  'bluebubbles-webhook-token',
  'backup-encryption',
] as const;
export type CredentialProvider = (typeof knownProviders)[number];

export class CredentialValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialValidationError';
  }
}

export class CredentialStoreUnavailableError extends Error {
  constructor() {
    super('The operating system credential store is unavailable.');
    this.name = 'CredentialStoreUnavailableError';
  }
}

export interface CredentialBackend {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export function createCredentialManager(backend: CredentialBackend, serviceName = service) {
  function validateProvider(provider: string): asserts provider is CredentialProvider {
    if (!knownProviders.includes(provider as CredentialProvider))
      throw new CredentialValidationError('Unsupported credential provider.');
  }

  async function accessStore<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      // Native credential APIs can include platform paths or backend details in errors.
      throw new CredentialStoreUnavailableError();
    }
  }

  return {
    async listCredentialProviders(): Promise<
      { provider: CredentialProvider; configured: boolean }[]
    > {
      return Promise.all(
        knownProviders.map(async (provider) => ({
          provider,
          configured: Boolean(await accessStore(() => backend.getPassword(serviceName, provider))),
        })),
      );
    },

    async saveCredential(provider: string, value: string): Promise<void> {
      validateProvider(provider);
      if (provider === 'backup-encryption' && (value.length < 12 || value.length > 200))
        throw new CredentialValidationError(
          'Backup passphrase must be between 12 and 200 characters.',
        );
      if (!value.trim() || value.length > 8_000)
        throw new CredentialValidationError('Credential must be between 1 and 8,000 characters.');
      await accessStore(() =>
        backend.setPassword(
          serviceName,
          provider,
          provider === 'backup-encryption' ? value : value.trim(),
        ),
      );
    },

    async readCredential(provider: CredentialProvider): Promise<string | null> {
      validateProvider(provider);
      return accessStore(() => backend.getPassword(serviceName, provider));
    },

    async removeCredential(provider: string): Promise<void> {
      validateProvider(provider);
      await accessStore(() => backend.deletePassword(serviceName, provider));
    },
  };
}

const verificationProfile = resolveVerificationProfile(
  process.env.SIDEKICK_VERIFICATION_ROOT,
  process.env.SIDEKICK_USER_DATA_DIR,
);
if (verificationProfile) process.env.SIDEKICK_USER_DATA_DIR = verificationProfile.dataDirectory;

/** Test profiles never open the native vault or retain credentials across API restarts. */
export function createRuntimeCredentialManager(
  nativeBackend: CredentialBackend | undefined,
  verificationRoot?: string,
  dataDirectory?: string,
) {
  const profile = resolveVerificationProfile(verificationRoot, dataDirectory);
  if (!profile) {
    if (!nativeBackend) throw new CredentialStoreUnavailableError();
    return createCredentialManager(nativeBackend);
  }
  const entries = new Map<string, string>();
  const checkService = (name: string) => {
    if (name !== profile.credentialService) throw new CredentialStoreUnavailableError();
  };
  return createCredentialManager(
    {
      async getPassword(name, account) {
        checkService(name);
        return entries.get(account) ?? null;
      },
      async setPassword(name, account, password) {
        checkService(name);
        entries.set(account, password);
      },
      async deletePassword(name, account) {
        checkService(name);
        return entries.delete(account);
      },
    },
    profile.credentialService,
  );
}

// Do not even load the native vault binding during isolated desktop verification.
const nativeBackend = verificationProfile ? undefined : (await import('keytar')).default;
const manager = createRuntimeCredentialManager(
  nativeBackend,
  process.env.SIDEKICK_VERIFICATION_ROOT,
  process.env.SIDEKICK_USER_DATA_DIR,
);
export const listCredentialProviders = manager.listCredentialProviders;
export const saveCredential = manager.saveCredential;
export const readCredential = manager.readCredential;
export const removeCredential = manager.removeCredential;
