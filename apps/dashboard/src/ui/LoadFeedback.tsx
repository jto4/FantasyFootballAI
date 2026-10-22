const quips = [
  'Checking the injury report twice.',
  'Bribing the projections.',
  'Asking the kicker for an opinion.',
  'Reviewing the tape in slow motion.',
  'Recounting your bench points.',
  'Consulting the group chat (not really).',
];
/** Same quip for the same message, so a reload doesn't shuffle it mid-glance. */
function quip(message: string) {
  let hash = 0;
  for (const char of message) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return quips[hash % quips.length];
}

/** Placeholder blocks shaped like the content on its way, with the message kept as a caption. */
export function LoadingStatus({
  message,
  shape = 'lines',
}: {
  message: string;
  shape?: 'lines' | 'rows' | 'cards';
}) {
  const count = shape === 'lines' ? 3 : shape === 'rows' ? 4 : 3;
  return (
    <div className={`loading-skeleton ${shape}`} role="status">
      <div aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <p>
        {message}
        <span className="loading-quip"> {quip(message)}</span>
      </p>
    </div>
  );
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
