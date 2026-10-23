import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson } from '../api-client';
import { withReference } from '../error-text';

export type ApiState<T> = { data?: T; error: string; loading: boolean };
export type ApiResource<T> = ApiState<T> & { reload: () => void };

/**
 * Loads a validated JSON resource and cancels the request when the URL changes or the component
 * unmounts, so a slow earlier response can never overwrite a newer one. No URL means idle. Pass
 * `revision` (or call `reload`) to load the same URL again; its current data stays visible while
 * it reloads.
 */
export function useApi<T>(
  url: string | undefined,
  validate: (value: unknown) => value is T,
  options: { timeoutMs?: number; errorMessage?: string; revision?: number } = {},
): ApiResource<T> {
  const { timeoutMs = 15_000, errorMessage, revision = 0 } = options;
  const [state, setState] = useState<ApiState<T>>({ error: '', loading: Boolean(url) });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const loadedUrl = useRef<string>(undefined);
  useEffect(() => {
    const sameUrl = loadedUrl.current === url;
    loadedUrl.current = url;
    if (!url) {
      setState({ error: '', loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({
      ...(sameUrl && previous.data !== undefined ? { data: previous.data } : {}),
      error: '',
      loading: true,
    }));
    requestJson(url, validate, { signal: controller.signal }, timeoutMs)
      .then((data) => !controller.signal.aborted && setState({ data, error: '', loading: false }))
      .catch(
        (failure: unknown) =>
          !controller.signal.aborted &&
          setState({
            error: errorMessage
              ? withReference(errorMessage, failure)
              : failure instanceof Error
                ? failure.message
                : 'This could not be loaded.',
            loading: false,
          }),
      );
    return () => controller.abort();
    // The validator and messages are fixed per call site; only the URL and revision reload.
  }, [url, revision, attempt]);
  return { ...state, reload };
}
