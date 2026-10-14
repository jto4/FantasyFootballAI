import { isApiError } from '@sidekick/core';
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super(requestId ? `${message} Reference: ${requestId}.` : message);
  }
}
export async function requestJson<T>(
  url: string,
  validate: (value: unknown) => value is T,
  options?: RequestInit,
  timeoutMs = 15000,
): Promise<T> {
  const response = await requestResponse(url, options, timeoutMs);
  return readJsonResponse(response, validate);
}
export async function requestResponse(
  url: string,
  options?: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, {
    ...options,
    signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  }).catch((error: unknown) => {
    if (options?.signal?.aborted) throw error;
    throw new ApiError(
      timeout.aborted
        ? 'The local request timed out. Check saved progress before retrying.'
        : 'Could not reach the local service. Confirm the app is running.',
      0,
      'service_unavailable',
    );
  });
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    const id = response.headers?.get('x-sidekick-request-id') ?? '';
    throw new ApiError(
      isApiError(value) ? value.error : 'The local service could not complete this request.',
      response.status,
      isApiError(value) ? value.code : 'invalid_response',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : undefined,
    );
  }
  return response;
}
export async function readJsonResponse<T>(
  response: Response,
  validate: (value: unknown) => value is T,
): Promise<T> {
  const value: unknown = await response.json().catch(() => null);
  if (!validate(value))
    throw new ApiError(
      'The local service returned an invalid response.',
      response.status,
      'invalid_response',
    );
  return value;
}
