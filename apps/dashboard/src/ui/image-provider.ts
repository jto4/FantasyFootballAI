export type ImageProvider = 'openai' | 'stability';

const preferenceKey = 'sidekick.imageProvider';

export function readImageProviderPreference(storage?: Pick<Storage, 'getItem'>): ImageProvider {
  try {
    return (storage ?? window.localStorage).getItem(preferenceKey) === 'stability'
      ? 'stability'
      : 'openai';
  } catch {
    return 'openai';
  }
}

export function writeImageProviderPreference(
  provider: ImageProvider,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    (storage ?? window.localStorage).setItem(preferenceKey, provider);
  } catch {
    // Provider choice remains usable when browser storage is unavailable.
  }
}
