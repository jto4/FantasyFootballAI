import { useState } from 'react';
import type { AdviceSummary } from './advice-data';

const storageKey = 'sidekick.betWeeklyLimit';

function readLimit(): number | undefined {
  try {
    const value = Number(localStorage.getItem(storageKey));
    return Number.isInteger(value) && value > 0 && value <= 100 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A self-set weekly limit on bets analyzed. It counts saved bet analyses from the last seven days
 * on this computer; the app never places bets, so this is a reminder, not an enforcement.
 */
export function BetLimit({
  history,
  now = Date.now(),
}: {
  history: AdviceSummary[];
  now?: number;
}) {
  const [limit, setLimit] = useState(readLimit);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(limit ?? ''));
  const recent = history.filter(
    (item) => item.mode === 'betting' && now - Date.parse(item.createdAt) < 7 * 86_400_000,
  ).length;
  const over = limit !== undefined && recent >= limit;
  function save(value: number | undefined) {
    setLimit(value);
    setEditing(false);
    try {
      if (value === undefined) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(value));
    } catch {
      /* The limit still applies for this session when storage is unavailable. */
    }
  }
  return (
    <section className={`bet-limit${over ? ' over' : ''}`} aria-label="Weekly bet limit">
      <p role={over ? 'status' : undefined}>
        {recent} bet {recent === 1 ? 'analysis' : 'analyses'} in the last 7 days
        {limit !== undefined ? ` · your limit is ${limit}` : ''}.
        {over && ' You’ve reached the limit you set.'}
      </p>
      {editing ? (
        // A group, not a form: this sits inside the Advice form and must not submit it.
        <div className="bet-limit-form" role="group" aria-label="Set weekly limit">
          <label>
            Bets per week
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="small-button"
            onClick={() => {
              const value = Number(draft);
              save(Number.isInteger(value) && value > 0 && value <= 100 ? value : undefined);
            }}
          >
            Save limit
          </button>
          {limit !== undefined && (
            <button type="button" className="text-button" onClick={() => save(undefined)}>
              Remove limit
            </button>
          )}
        </div>
      ) : (
        <button type="button" className="text-button" onClick={() => setEditing(true)}>
          {limit === undefined ? 'Set a weekly limit' : 'Change limit'}
        </button>
      )}
    </section>
  );
}
