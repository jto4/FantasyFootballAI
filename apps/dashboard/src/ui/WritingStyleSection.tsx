import { useState, type RefObject } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  isValidWritingStylePresets,
  supportedMessageChannels,
  type AppSettings,
  type WritingStylePreset,
} from '@sidekick/core';

type MessageChannel = (typeof supportedMessageChannels)[number];
type WritingStyleSectionProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  writingStyle: string;
  customPresets: WritingStylePreset[];
  reportLength: NonNullable<AppSettings['reportLength']>;
  allowProfanity: boolean;
  excludedTopics: string;
  channelBoundaries: NonNullable<AppSettings['channelBoundaries']>;
  onWritingStyleChange: (value: string) => void;
  onSaveCustomPreset: (preset: WritingStylePreset) => void;
  onDeleteCustomPreset: (name: string) => void;
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
  customPresets,
  reportLength,
  allowProfanity,
  excludedTopics,
  channelBoundaries,
  onWritingStyleChange,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onReportLengthChange,
  onProfanityChange,
  onExcludedTopicsChange,
  onChannelBoundaryChange,
}: WritingStyleSectionProps) {
  const [presetName, setPresetName] = useState('');
  const selectedSavedPreset = customPresets.find((preset) => preset.value === writingStyle);
  const selectedBuiltInPreset = writingStylePresets.find((preset) => preset.value === writingStyle);
  const candidatePreset = { name: presetName.trim(), value: writingStyle };
  const existingPresetIndex = customPresets.findIndex(
    (preset) => preset.name.toLowerCase() === candidatePreset.name.toLowerCase(),
  );
  const candidatePresets = [...customPresets];
  if (existingPresetIndex >= 0) candidatePresets[existingPresetIndex] = candidatePreset;
  else candidatePresets.push(candidatePreset);
  const canSavePreset = isValidWritingStylePresets(candidatePresets);

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
            selectedSavedPreset
              ? `saved:${selectedSavedPreset.name}`
              : selectedBuiltInPreset
                ? `builtin:${selectedBuiltInPreset.name}`
                : 'custom'
          }
          onChange={(event) => {
            const selectedValue = event.target.value;
            const preset = selectedValue.startsWith('saved:')
              ? customPresets.find((item) => item.name === selectedValue.slice('saved:'.length))
              : selectedValue.startsWith('builtin:')
                ? writingStylePresets.find(
                    (item) => item.name === selectedValue.slice('builtin:'.length),
                  )
                : undefined;
            if (preset) onWritingStyleChange(preset.value);
          }}
        >
          <option value="custom">Custom style</option>
          {writingStylePresets.map((preset) => (
            <option key={`builtin:${preset.name}`} value={`builtin:${preset.name}`}>
              {preset.name}
            </option>
          ))}
          {customPresets.map((preset) => (
            <option key={`saved:${preset.name}`} value={`saved:${preset.name}`}>
              {preset.name} · saved
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
      <div className="custom-style-presets">
        <label>
          SAVE THIS VOICE AS
          <input
            value={presetName}
            maxLength={40}
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="e.g. Playoff chaos"
          />
        </label>
        <button
          type="button"
          className="small-button"
          disabled={!canSavePreset}
          onClick={() => {
            onSaveCustomPreset(candidatePreset);
            setPresetName('');
          }}
        >
          Save style preset
        </button>
        {customPresets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="small-button danger"
            aria-label={`Delete saved style ${preset.name}`}
            onClick={() => onDeleteCustomPreset(preset.name)}
          >
            Delete {preset.name}
          </button>
        ))}
        <small>
          Saved voices stay in local settings and are limited to 20 presets. Click Save Settings to
          keep preset changes.
        </small>
      </div>
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
