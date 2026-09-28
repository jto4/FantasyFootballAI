import keytar from 'keytar';

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
      if (!value.trim() || value.length > 8_000)
        throw new CredentialValidationError('Credential must be between 1 and 8,000 characters.');
      await accessStore(() => backend.setPassword(serviceName, provider, value.trim()));
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

const manager = createCredentialManager(keytar);
export const listCredentialProviders = manager.listCredentialProviders;
export const saveCredential = manager.saveCredential;
export const readCredential = manager.readCredential;
export const removeCredential = manager.removeCredential;
