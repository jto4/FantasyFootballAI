export function FriendlyError({
  message,
  detail,
  action,
  onAction,
}: {
  message: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="friendly-error" role="alert">
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
