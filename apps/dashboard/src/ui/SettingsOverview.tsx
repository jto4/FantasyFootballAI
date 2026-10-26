import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { AppSettings, LeagueConnection, SettingsSection } from '@sidekick/core';
import { requestJson } from './api-client';
import { isRoutineBackupStatus } from './operations-data';
import { platformName } from './platform-name';

type Item = {
  label: string;
  detail: string;
  ok: boolean;
  /** Settings section that fixes it, or a page hash outside Settings. */
  target: SettingsSection | `#${string}`;
};

/** At-a-glance health of the connections Settings manages; every chip links to its fix. */
export function SettingsOverview({
  settings,
  leagues,
  configured,
  credentialStoreAvailable,
  onOpen,
  aiConnectionFailed = false,
}: {
  aiConnectionFailed?: boolean;
  settings: AppSettings;
  leagues: LeagueConnection[];
  configured: (provider: string) => boolean;
  credentialStoreAvailable: boolean | null;
  onOpen: (section: SettingsSection) => void;
}) {
  const [backups, setBackups] = useState<boolean>();
  useEffect(() => {
    const controller = new AbortController();
    void requestJson('/api/backups/routine/status', isRoutineBackupStatus, {
      signal: controller.signal,
    })
      .then((status) => setBackups(status.schedule.enabled))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const runtime = settings.aiRuntime?.mode ?? 'api';
  const live = leagues.filter((league) => league.connectionMode !== 'snapshot');
  const items: Item[] = [
    {
      label: 'League',
      ok: leagues.length > 0,
      detail: !leagues.length
        ? 'Not connected'
        : live.length
          ? `${live.length} connected · refreshes automatically`
          : `Imported from ${platformName(leagues[0]!.platform)} · no auto refresh`,
      target: '#/leagues',
    },
    {
      label: 'AI writer',
      ok:
        !aiConnectionFailed &&
        (runtime === 'anthropic-api'
          ? configured('anthropic')
          : runtime !== 'api' || configured('openai')),
      detail:
        (aiConnectionFailed ? 'Connection check failed · ' : '') +
        (runtime === 'anthropic-api'
          ? configured('anthropic')
            ? `Claude API · ${settings.aiRuntime?.model ?? ''}`
            : 'Anthropic API key needed'
          : runtime === 'codex-cli'
            ? 'Signed-in Codex'
            : runtime === 'cli'
              ? 'Local command-line tool'
              : runtime === 'apple-cli'
                ? 'Apple Foundation Models'
                : configured('openai')
                  ? `API · ${settings.aiRuntime?.model ?? 'model not set'}`
                  : 'API key needed'),
      target: 'ai',
    },
    {
      label: 'Email',
      ok: configured('resend') && Boolean(settings.emailRecipient),
      detail: !configured('resend')
        ? 'Not set up · copy reports instead'
        : settings.emailRecipient
          ? 'Ready to send'
          : 'Add a recipient',
      target: 'delivery',
    },
    {
      label: 'Keychain',
      ok: credentialStoreAvailable !== false,
      detail:
        credentialStoreAvailable === null
          ? 'Checking…'
          : credentialStoreAvailable
            ? 'Keys stored securely'
            : 'Unavailable',
      target: 'delivery',
    },
    {
      label: 'Backups',
      ok: backups === true,
      detail: backups === undefined ? 'Checking…' : backups ? 'Automatic backups on' : 'Off',
      target: 'storage',
    },
  ];
  return (
    <ul className="settings-overview" aria-label="Setup status">
      {items.map((item) => {
        const Icon = item.ok ? CheckCircle2 : AlertCircle;
        const content = (
          <>
            <Icon
              size={16}
              aria-hidden="true"
              className={item.ok ? 'status-ok' : 'status-attention'}
            />
            <span>
              <strong>{item.label}</strong>
              <small>
                {item.ok ? '' : 'Needs attention · '}
                {item.detail}
              </small>
            </span>
          </>
        );
        return (
          <li key={item.label}>
            {item.target.startsWith('#') ? (
              <a href={item.target}>{content}</a>
            ) : (
              <button type="button" onClick={() => onOpen(item.target as SettingsSection)}>
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
