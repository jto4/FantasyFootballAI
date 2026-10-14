import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppSettings } from '@sidekick/core';

type Chat = { id: number; guid: string; name: string; service: 'iMessage' };
export function ImsgSetup({
  settings,
  setSettings,
}: {
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [chats, setChats] = useState<Chat[]>([]);
  const [installation, setInstallation] = useState(''),
    [readAccess, setReadAccess] = useState(''),
    [acceptedAt, setAcceptedAt] = useState('');
  const config = JSON.stringify([
    settings.imsgExecutablePath ?? '',
    settings.imsgChatId,
    settings.imessageChatGuid,
  ]);
  const verifiedConfig = useRef(config);
  const verified = verifiedConfig.current === config;
  const latestConfig = useRef(config);
  latestConfig.current = config;
  const latestPath = useRef(settings.imsgExecutablePath);
  latestPath.current = settings.imsgExecutablePath;
  async function inspect(operation: 'status' | 'chats') {
    const path = settings.imsgExecutablePath;
    setBusy(true);
    setNotice('');
    setChats([]);
    try {
      const response = await fetch(`/api/imsg/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executablePath: path ?? '' }),
        signal: AbortSignal.timeout(35000),
      });
      const value = (await response.json()) as { error?: string; version?: string; chats?: Chat[] };
      if (latestPath.current !== path) return;
      if (!response.ok) throw new Error(value.error ?? 'Could not check local imsg.');
      if (operation === 'status') {
        setInstallation(path ?? 'default');
        setNotice(
          `imsg ${value.version} is installed. This check does not read messages or send anything.`,
        );
      } else {
        setChats(value.chats ?? []);
        setNotice(
          value.chats?.length
            ? 'Choose the iMessage conversation to use, then save Delivery & access.'
            : 'No recent iMessage chats found.',
        );
      }
    } catch (error) {
      if (latestPath.current === path)
        setNotice(error instanceof Error ? error.message : 'Could not check local imsg.');
    } finally {
      setBusy(false);
    }
  }
  async function verifyReadAccess() {
    if (busy) return;
    const requested = config;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/imsg/read-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chatGuid: settings.imessageChatGuid,
          chatId: settings.imsgChatId,
          executablePath: settings.imsgExecutablePath ?? '',
        }),
        signal: AbortSignal.timeout(95000),
      });
      const value: unknown = await response.json();
      if (latestConfig.current !== requested) return;
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Read verification returned an invalid response.');
      const row = value as { ok?: unknown; error?: unknown; acceptedAt?: unknown };
      if (!response.ok || row.ok !== true)
        throw new Error(
          typeof row.error === 'string' ? row.error : 'Read access could not be verified.',
        );
      verifiedConfig.current = requested;
      setReadAccess(requested);
      setAcceptedAt(
        typeof row.acceptedAt === 'string' && Number.isFinite(Date.parse(row.acceptedAt))
          ? row.acceptedAt
          : '',
      );
      setNotice(
        'Read access verified for the saved chat. Message content was discarded; nothing was imported, sent or shared with AI.',
      );
    } catch (error) {
      if (latestConfig.current !== requested) return;
      setReadAccess('');
      setNotice(error instanceof Error ? error.message : 'Read access could not be verified.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-fields two">
      <label>
        IMSG EXECUTABLE PATH (OPTIONAL)
        <input
          value={settings.imsgExecutablePath ?? ''}
          maxLength={2000}
          placeholder="Automatic Homebrew detection"
          onChange={(event) => {
            setNotice('');
            setChats([]);
            setSettings((current) => ({ ...current, imsgExecutablePath: event.target.value }));
          }}
        />
      </label>
      <label>
        LOCAL MESSAGES CHAT ID
        <input
          type="number"
          min={1}
          step={1}
          value={settings.imsgChatId ?? ''}
          onChange={(event) => {
            const id = event.target.value ? Number(event.target.value) : undefined;
            setSettings((current) => {
              const next = { ...current, imessageAutoSyncEnabled: false };
              if (id === undefined) delete next.imsgChatId;
              else next.imsgChatId = id;
              return next;
            });
          }}
        />
        <small>
          Required for history sync. The app verifies this ID against the selected chat GUID.
        </small>
      </label>
      <section className="wide" aria-label="Local messaging readiness">
        <h3>Messaging readiness</h3>
        <ul>
          <li>
            Installation:{' '}
            {installation === (settings.imsgExecutablePath ?? 'default')
              ? 'version checked in this session'
              : 'not verified in this session'}
            .
          </li>
          <li>
            Read permission:{' '}
            {verified && readAccess === config
              ? 'verified for this saved chat'
              : 'not verified for this configuration'}
            .
          </li>
          <li>
            Delivery:{' '}
            {verified && readAccess === config && acceptedAt
              ? `local acceptance recorded ${acceptedAt}`
              : 'no verified local acceptance shown'}
            . This is not a remote delivery receipt.
          </li>
        </ul>
        <p>
          Verification explicitly reads bounded history from the saved chat and discards its
          contents. Save Delivery &amp; access first.
        </p>
        <button
          type="button"
          className="small-button"
          disabled={busy || !settings.imessageChatGuid || !settings.imsgChatId}
          onClick={() => void verifyReadAccess()}
        >
          Verify read access to saved chat
        </button>
        <p>
          To verify sending, review an intended saved report and use its existing send confirmation.
          This screen never sends a test message.
        </p>
      </section>
      <div className="button-row wide">
        <button
          type="button"
          className="small-button"
          disabled={busy}
          onClick={() => void inspect('status')}
        >
          Check imsg installation
        </button>
        <button
          type="button"
          className="small-button"
          disabled={busy}
          onClick={() => void inspect('chats')}
        >
          Find iMessage chats
        </button>
      </div>
      {busy && (
        <p className="wide" role="status">
          Checking local Messages connection…
        </p>
      )}
      {notice && (
        <p className="wide" role="status">
          {notice}
        </p>
      )}
      {chats.length > 0 && (
        <label className="wide">
          CHOOSE A LOCAL IMESSAGE CHAT
          <select
            value=""
            onChange={(event) => {
              const chat = chats.find((item) => String(item.id) === event.target.value);
              if (chat) {
                setSettings((current) => ({
                  ...current,
                  imessageChatGuid: chat.guid,
                  imsgChatId: chat.id,
                  imessageAutoSyncEnabled: false,
                }));
                setChats([]);
                setNotice('Chat selected. Save Delivery & access to use it.');
              }
            }}
          >
            <option value="">Choose a conversation</option>
            {chats.map((chat) => (
              <option key={chat.id} value={chat.id}>
                {chat.name || chat.guid} · ID {chat.id}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="schedule-explainer wide">
        Local imsg requires macOS and Messages sign-in. Install with{' '}
        <code>brew install steipete/tap/imsg</code>. Grant Full Disk Access to the app or service
        running imsg for history, and Automation permission for Messages to send. Finding chats
        reads only recent conversation names and IDs; message sync and AI analysis have separate
        controls.
      </p>
    </div>
  );
}
