export function FriendlyError({
  message,
  detail,
  action,
  onAction,
  compact = false,
}: {
  message: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
  /** One line with the action beside the message, for notices above a page's own content. */
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'friendly-error compact' : 'friendly-error'} role="alert">
      <p>{message}</p>
      {action && onAction && (
        <button type="button" className="small-button" onClick={onAction}>
          {action}
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

/**
 * The API returns Codex version problems as fixed, path-free sentences that already say what
 * to do, so those are shown as the message; any other AI failure keeps the generic message and
 * moves the raw text under "Details for support".
 */
export function aiProblemMessage(error: string, fallback: string) {
  return /^(ChatGPT updated its Codex|This Codex version)/.test(error) ? error : fallback;
}
