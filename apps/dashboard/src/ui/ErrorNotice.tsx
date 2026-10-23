import { describeError } from './error-text';

/**
 * The app's one error presentation: a plain message, an optional retry, and support details
 * (request reference, code, raw text) folded away. `compact` drops the box for inline use.
 */
export function ErrorNotice({
  error,
  onRetry,
  retryLabel = 'Try again',
  fallback,
  compact = false,
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
  retryLabel?: string;
  fallback?: string;
  compact?: boolean;
}) {
  const { message, detail } = describeError(error, fallback);
  return (
    <div className={compact ? 'error-notice compact' : 'error-notice'} role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="small-button" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
      {detail && (
        <details>
          <summary>Details for support</summary>
          <p>{detail}</p>
        </details>
      )}
    </div>
  );
}
