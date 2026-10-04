export function LoadingStatus({ message }: { message: string }) {
  return <p role="status">{message}</p>;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="notice" role="alert">
      {message}{' '}
      <button className="small-button" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyStatus({ message }: { message: string }) {
  return <p className="schedule-explainer">{message}</p>;
}
