import type { RefObject } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supportedMessageChannels, type AppSettings } from '@sidekick/core';

type MessageChannel = (typeof supportedMessageChannels)[number];
type WritingStyleSectionProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  writingStyle: string;
  reportLength: NonNullable<AppSettings['reportLength']>;
  allowProfanity: boolean;
  excludedTopics: string;
  channelBoundaries: NonNullable<AppSettings['channelBoundaries']>;
  onWritingStyleChange: (value: string) => void;
  onReportLengthChange: (value: NonNullable<AppSettings['reportLength']>) => void;
  onProfanityChange: (value: boolean) => void;
  onExcludedTopicsChange: (value: string) => void;
  onChannelBoundaryChange: (channel: MessageChannel, value: string) => void;
};

const channelNames = {
  dashboard: 'Dashboard drafts',
  email: 'Email',
  sms: 'SMS',
  imessage: 'iMessage',
} as const;

const writingStylePresets = [
  { name: 'Commissioner clean', value: 'Clear, concise league updates with light humor.' },
  {
    name: 'Sharp league-mate',
    value:
      'Funny, sharp fantasy-football banter. Tease roster choices and predictions, then back it up with league data.',
  },
  {
    name: 'Dry analyst',
    value: 'Wry, understated commentary with concise analysis. Let the stats make the joke.',
  },
  {
    name: 'Hype crew',
    value:
      'High-energy, celebratory football commentary. Build anticipation and make every matchup feel big.',
  },
];

/** Keep writing voice, profanity, and topic boundaries together for easier review. */
export function WritingStyleSection({
  headingRef,
  writingStyle,
  reportLength,
  allowProfanity,
  excludedTopics,
  channelBoundaries,
  onWritingStyleChange,
  onReportLengthChange,
  onProfanityChange,
  onExcludedTopicsChange,
  onChannelBoundaryChange,
}: WritingStyleSectionProps) {
  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            Writing style
          </h2>
          <p>Set the personality and boundaries for league updates.</p>
        </div>
        <ShieldCheck size={18} />
      </div>
      <label>
        STARTING STYLE
        <select
          value={
            writingStylePresets.find((preset) => preset.value === writingStyle)?.name ?? 'Custom'
          }
          onChange={(event) => {
            const preset = writingStylePresets.find((item) => item.name === event.target.value);
            if (preset) onWritingStyleChange(preset.value);
          }}
        >
          <option value="Custom">Custom style</option>
          {writingStylePresets.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={writingStyle}
        maxLength={1000}
        onChange={(event) => onWritingStyleChange(event.target.value)}
        placeholder="Funny, sharp, stats-aware, never mean about family or health…"
      />
      <small>
        Choose a starting voice, then edit every word. Use fantasy decisions as the target of jokes.
        Excluded topics are passed to the AI as boundaries for every generated report.
      </small>
      <label className="report-length-setting">
        REPORT LENGTH
        <select
          value={reportLength}
          onChange={(event) =>
            onReportLengthChange(event.target.value as NonNullable<AppSettings['reportLength']>)
          }
        >
          <option value="short">Short · 120–180 words</option>
          <option value="standard">Standard · 250–400 words</option>
          <option value="long">Long · 450–650 words</option>
        </select>
      </label>
      <label className="switch-label">
        <input
          type="checkbox"
          checked={allowProfanity}
          onChange={(event) => onProfanityChange(event.target.checked)}
        />
        Allow profanity
      </label>
      <div className="settings-fields">
        <label>
          TOPICS TO AVOID
          <textarea
            value={excludedTopics}
            maxLength={2000}
            onChange={(event) => onExcludedTopicsChange(event.target.value)}
            placeholder="Family, health, work, politics…"
          />
        </label>
      </div>
      <div className="channel-boundaries">
        <h3>Additional channel boundaries</h3>
        <p>
          Add subjects to avoid for each destination. Only the selected destination’s boundary is
          included in that report’s AI prompt.
        </p>
        <div className="settings-fields two">
          {supportedMessageChannels.map((channel) => (
            <label key={channel}>
              {channelNames[channel].toUpperCase()} · EXTRA TOPICS TO AVOID
              <textarea
                value={channelBoundaries[channel] ?? ''}
                maxLength={2000}
                onChange={(event) => onChannelBoundaryChange(channel, event.target.value)}
                placeholder="No additional limits"
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
