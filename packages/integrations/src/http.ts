/** Read a remote response incrementally and stop once it exceeds the caller's byte budget. */
export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error('Provider response exceeded the size limit.');
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('Provider response exceeded the size limit.');
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function readBoundedJson<T>(response: Response, maxBytes: number): Promise<T> {
  return JSON.parse(await readBoundedText(response, maxBytes)) as T;
}

export interface RetryingJsonRequestOptions {
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** Retry only idempotent reads; bounded attempts and response sizes cap outage cost. */
export async function fetchRetryingJson<T>(
  url: string,
  init: RequestInit = {},
  options: RetryingJsonRequestOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));
  const maxDelay = Math.max(0, Math.min(10_000, options.maxRetryDelayMs ?? 2_000));
  const method = (init.method ?? 'GET').toUpperCase();
  const retrySafe = method === 'GET' || method === 'HEAD';
  const maxAttempts = retrySafe ? attempts : 1;
  const fetcher = options.fetcher ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(options.timeoutMs ?? 8_000),
        headers: { accept: 'application/json', ...init.headers },
      });
    } catch (error) {
      if (!retrySafe || init.signal?.aborted || attempt === maxAttempts - 1) throw error;
      await sleep(retryDelay(null, attempt, maxDelay));
      continue;
    }

    if (response.ok) return readBoundedJson<T>(response, options.maxResponseBytes ?? 2_000_000);
    const retryable = retrySafe && (response.status === 429 || response.status >= 500);
    if (!retryable || attempt === maxAttempts - 1)
      throw new Error(`Provider request failed (${response.status})`);
    const delay = retryDelay(response.headers.get('retry-after'), attempt, maxDelay);
    await response.body?.cancel().catch(() => undefined);
    if (delay > 0) await sleep(delay);
  }
  throw new Error('Provider request failed after retrying.');
}

function retryDelay(retryAfter: string | null, attempt: number, maximum: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const requestedMs = Number.isFinite(seconds)
      ? seconds * 1_000
      : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(requestedMs)) return Math.min(maximum, Math.max(0, requestedMs));
  }
  return Math.min(maximum, 250 * 2 ** attempt);
}
