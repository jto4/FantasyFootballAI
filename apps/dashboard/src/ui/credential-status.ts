export type CredentialStatus = { provider: string; configured: boolean };

export function parseCredentialStatuses(value: unknown): CredentialStatus[] | null {
  if (!Array.isArray(value)) return null;
  const statuses = value.filter(isCredentialStatus);
  return statuses.length === value.length ? statuses : null;
}

export function credentialStatusLabel(
  storeAvailable: boolean | null,
  configured: boolean | undefined,
): string {
  if (storeAvailable === null) return 'Checking';
  if (!storeAvailable) return 'Keychain unavailable';
  return configured ? 'Saved' : 'Not set';
}

function isCredentialStatus(value: unknown): value is CredentialStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'provider' in value &&
    typeof value.provider === 'string' &&
    'configured' in value &&
    typeof value.configured === 'boolean'
  );
}
