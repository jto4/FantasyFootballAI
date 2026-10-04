import { isApiError } from '@sidekick/core';
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}
export async function requestJson<T>(
  url: string,
  validate: (value: unknown) => value is T,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(15000),
  });
  const value: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(
      isApiError(value) ? value.error : 'The local service could not complete this request.',
      response.status,
      isApiError(value) ? value.code : 'invalid_response',
    );
  if (!validate(value))
    throw new ApiError(
      'The local service returned an invalid response.',
      response.status,
      'invalid_response',
    );
  return value;
}
