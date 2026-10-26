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
