import { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';

type Guide = { title: string; steps: string[]; helpId?: string };

/** A short "how to use this page" for each main page, keyed by its section name. */
export const pageGuides: Record<string, Guide> = {
  'League desk': {
    title: 'Start here each week',
    steps: [
      'Check “What needs your attention?” for injuries, empty spots and pickups.',
      'Open your matchup to see your win chance and compare starting lineups.',
      'Click any player’s name for their card: projection, range and news.',
    ],
    helpId: 'getting-started',
  },
  Advice: {
    title: 'Getting advice',
    steps: [
      'Pick the decision: your lineup, a pickup, a trade, a bet or your draft.',
      'Choose the players or bets, then read the evidence behind the call.',
      'Saved advice is graded after the games, so you can see how often it was right.',
    ],
    helpId: 'advice',
  },
  Ask: {
    title: 'Asking questions',
    steps: [
      'Ask in plain words, for example “Who should I start at flex this week?”',
      'Answers come from your league data and show where each fact came from.',
      'Open Ask from any page with ⌘J (Ctrl+J on Windows).',
    ],
  },
  Reports: {
    title: 'Making a report',
    steps: [
      'Create a draft, such as power rankings or a matchup preview.',
      'Read and edit it in review before anything goes out.',
      'Choose where it goes and confirm. Nothing is ever sent on its own.',
    ],
    helpId: 'share',
  },
  Live: {
    title: 'Following games',
    steps: [
      'Scores and your win chance update every minute while games are on.',
      'A starter who is Out or inactive counts as zero points.',
      'Click a player’s name for their card and latest news.',
    ],
  },
  Props: {
    title: 'Reading props',
    steps: [
      'Each row puts a sportsbook line next to our projection and this season’s games.',
      'Filter by game or stat to find the players you care about.',
      'A lean is a comparison, not a promise; check the lean record before trusting it.',
    ],
    helpId: 'advice-live-prices',
  },
  Schedule: {
    title: 'Scheduling reports',
    steps: [
      'Pick a report and when it should be made each week.',
      'Choose whether you review it first or it sends once ready.',
      'Schedules run only while the app or its background service is running.',
    ],
    helpId: 'schedule',
  },
  Settings: {
    title: 'Finding a setting',
    steps: [
      'Press ⌘K (Ctrl+K on Windows) and type what you want to change.',
      'AI chooses which service writes reports and answers questions.',
      'Delivery & access connects email or a group chat for sending reports.',
    ],
    helpId: 'privacy',
  },
};

const storageKey = 'sidekick.dismissedPageGuides';

// A per-viewer convenience only: the guides render normally when storage is unavailable.
function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
function writeDismissed(sections: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(sections));
  } catch {
    // Ignore: the guide simply shows again next time.
  }
}

export function usePageGuides() {
  const [dismissed, setDismissed] = useState(readDismissed);
  function update(next: string[]) {
    setDismissed(next);
    writeDismissed(next);
  }
  return {
    hidden: (section: string) => dismissed.includes(section),
    dismiss: (section: string) => update([...new Set([...dismissed, section])]),
    show: (section: string) => update(dismissed.filter((item) => item !== section)),
    reset: () => update([]),
    anyHidden: dismissed.length > 0,
  };
}

export function PageGuide({
  section,
  onDismiss,
  onHelp,
}: {
  section: string;
  onDismiss: () => void;
  onHelp: (helpId: string) => void;
}) {
  const guide = pageGuides[section];
  if (!guide) return null;
  return (
    <aside className="page-guide" aria-label={`Tips: ${guide.title}`}>
      <Lightbulb size={18} aria-hidden="true" className="page-guide-icon" />
      <div>
        <strong>{guide.title}</strong>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>
          {guide.helpId && (
            <button type="button" className="text-button" onClick={() => onHelp(guide.helpId!)}>
              Learn more
            </button>
          )}
          <span>Press ? for keyboard shortcuts.</span>
        </p>
      </div>
      <button
        type="button"
        className="page-guide-close"
        aria-label="Hide tips for this page"
        title="Hide tips (bring them back with the lightbulb at the top)"
        onClick={onDismiss}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
