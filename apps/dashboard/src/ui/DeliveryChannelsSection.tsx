import { ImsgSetup } from './ImsgSetup.js';
import type { Dispatch, SetStateAction } from 'react';
import { Copy } from 'lucide-react';
import type { AppSettings, LeagueConnection } from '@sidekick/core';
import { LoadError, LoadingStatus } from './LoadFeedback.js';

type AutoSyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt?: string;
  lastAddedMessages?: number;
  lastError?: string;
};

type Props = {
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  leagues: LeagueConnection[];
  twilioConfigured: boolean;
  twilioAutoSyncStatus: AutoSyncStatus | null;
  blueBubblesConfigured: boolean;
  imessageAutoSyncStatus: AutoSyncStatus | null;
  blueBubblesWebhookConfigured: boolean;
  blueBubblesWebhookLoading: boolean;
  blueBubblesWebhookError: string;
  blueBubblesWebhookUrl: string;
  onCreateWebhook: () => void;
  onRevokeWebhook: () => void;
  onRetryWebhookStatus: () => void;
  onNotice: (message: string) => void;
};

export function DeliveryChannelsSection({
  settings,
  setSettings,
  leagues,
  twilioConfigured,
  twilioAutoSyncStatus,
  blueBubblesConfigured,
  imessageAutoSyncStatus,
  blueBubblesWebhookConfigured,
  blueBubblesWebhookLoading,
  blueBubblesWebhookError,
  blueBubblesWebhookUrl,
  onCreateWebhook,
  onRevokeWebhook,
  onRetryWebhookStatus,
  onNotice,
}: Props) {
  const validTwilioConversationTarget = /^CH[0-9a-fA-F]{32}$/.test(
    settings.smsRecipient?.trim() ?? '',
  );
  const localImsg = settings.imessageProvider === 'imsg';
  const macPlatform = navigator.platform.toLowerCase().startsWith('mac');
  const imessageReady = localImsg
    ? macPlatform &&
      /^(?:iMessage|any);[+-];[^\s\u0000-\u001f]{1,450}$/.test(settings.imessageChatGuid ?? '')
    : blueBubblesConfigured;
  const syncReady =
    imessageReady &&
    (!localImsg || (Number.isSafeInteger(settings.imsgChatId) && Number(settings.imsgChatId) > 0));
  const chatReplyDestinationReady =
    (validTwilioConversationTarget && twilioConfigured) ||
    (Boolean(settings.imessageChatGuid?.trim()) && imessageReady);
  return (
    <>
      <div className="settings-fields two recipients">
        <label>
          EMAIL RECIPIENT
          <input
            data-search-target="email-recipient"
            value={settings.emailRecipient ?? ''}
            onChange={(event) =>
              setSettings((current) => ({ ...current, emailRecipient: event.target.value }))
            }
            placeholder="league@example.com"
          />
        </label>
        <label>
          SMS RECIPIENT OR TWILIO GROUP SID
          <input
            data-search-target="sms-recipient"
            value={settings.smsRecipient ?? ''}
            onChange={(event) =>
              setSettings((current) => ({ ...current, smsRecipient: event.target.value }))
            }
            placeholder="+15555550123"
          />
          <small>
            Use a phone number for direct SMS or an existing Twilio Conversations SID (CH…) to send
            reports into that group. The app does not create conversations or add members.
          </small>
        </label>
        <label>
          IMESSAGE PROVIDER
          <select
            value={settings.imessageProvider ?? 'bluebubbles'}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                imessageProvider: event.target.value as 'bluebubbles' | 'imsg',
                imessageAutoSyncEnabled: false,
                chatRepliesAutoSend: false,
              }))
            }
          >
            <option value="bluebubbles">BlueBubbles server</option>
            <option value="imsg">Local Messages via imsg (macOS)</option>
          </select>
        </label>
        <label>
          IMESSAGE GROUP CHAT ID
          <input
            data-search-target="imessage-group"
            value={settings.imessageChatGuid ?? ''}
            onChange={(event) =>
              setSettings((current) => ({ ...current, imessageChatGuid: event.target.value }))
            }
            placeholder={localImsg ? 'iMessage;+;chat…' : 'iMessage chat GUID from BlueBubbles'}
          />
          {localImsg ? (
            <small>
              Use a stable iMessage GUID. Find iMessage chats below to fill both the GUID and local
              history ID.
            </small>
          ) : (
            <small>
              BlueBubbles runs on a Mac signed into Messages. Sunday Sidekick can run on macOS,
              Windows, or Linux; its local service must be able to reach that server. Use the chat
              GUID for the group you want to receive reports.
            </small>
          )}
        </label>
        <label>
          YOUR NAME IN THE GROUP CHAT
          <input
            required
            data-search-target="owner-name"
            value={settings.imessageOwnerName ?? 'League owner'}
            maxLength={100}
            onChange={(event) =>
              setSettings((current) => ({ ...current, imessageOwnerName: event.target.value }))
            }
            placeholder="The name friends use for you"
          />
          <small>Used to identify messages sent from your own iMessage account.</small>
        </label>
      </div>
      {localImsg && <ImsgSetup settings={settings} setSettings={setSettings} />}
      {localImsg && !macPlatform && (
        <p role="status">
          Local imsg is available only when the service runs on macOS. Use BlueBubbles to connect
          from Windows or Linux.
        </p>
      )}
      <label className="switch-label">
        <input
          type="checkbox"
          data-search-target="sms-sync"
          checked={settings.twilioConversationAutoSyncEnabled ?? false}
          disabled={!settings.memoryEnabled || !validTwilioConversationTarget || !twilioConfigured}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              twilioConversationAutoSyncEnabled: event.target.checked,
            }))
          }
        />
        Automatically sync this Twilio Conversations group
      </label>
      <div className="schedule-fields">
        <label>
          CHECK FOR NEW TWILIO MESSAGES
          <select
            value={settings.twilioConversationSyncIntervalMinutes ?? 15}
            disabled={!settings.twilioConversationAutoSyncEnabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                twilioConversationSyncIntervalMinutes: Number(event.target.value) as
                  5 | 15 | 30 | 60,
              }))
            }
          >
            {[5, 15, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                Every {minutes} minutes
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="schedule-explainer">
        When enabled, the running app checks only the configured Twilio group. History is imported
        page by page using the same local deduplication and retention rules as manual sync. AI
        analysis still requires its separate opt-in; memory must remain enabled.
      </p>
      {(!validTwilioConversationTarget || !twilioConfigured) && (
        <p className="schedule-explainer">
          Set an existing Twilio Conversations SID as the SMS target and save Twilio credentials
          before enabling automatic sync.
        </p>
      )}
      {twilioAutoSyncStatus?.lastCheckedAt && (
        <p className="schedule-explainer" role="status">
          Last automatic Twilio check:{' '}
          {new Date(twilioAutoSyncStatus.lastCheckedAt).toLocaleString()}.
          {twilioAutoSyncStatus.lastError
            ? ` ${twilioAutoSyncStatus.lastError}`
            : ` ${twilioAutoSyncStatus.lastAddedMessages ?? 0} new messages imported.`}
        </p>
      )}
      <label className="switch-label">
        <input
          type="checkbox"
          data-search-target="imessage-sync"
          checked={settings.imessageAutoSyncEnabled}
          disabled={!settings.memoryEnabled || !settings.imessageChatGuid?.trim() || !syncReady}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              imessageAutoSyncEnabled: event.target.checked,
            }))
          }
        />
        Automatically sync this group chat
      </label>
      <div className="schedule-fields">
        <label>
          CHECK FOR NEW MESSAGES
          <select
            value={settings.imessageSyncIntervalMinutes}
            disabled={!settings.imessageAutoSyncEnabled}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                imessageSyncIntervalMinutes: Number(event.target.value) as 5 | 15 | 30 | 60,
              }))
            }
          >
            {[5, 15, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                Every {minutes} minutes
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="schedule-explainer">
        When enabled, the running app checks only this chat on the selected interval. New message
        text stays local unless conversation analysis is separately enabled. Turning off member
        memory disables polling. Retention settings still apply.
      </p>
      {!localImsg && !blueBubblesConfigured && (
        <p className="schedule-explainer">
          Save BlueBubbles server settings in Credentials before enabling automatic sync.
        </p>
      )}
      {!localImsg && (
        <div className="schedule-fields">
          <div>
            <strong>Live message webhook</strong>
            <p className="schedule-explainer">
              Optional when BlueBubbles and Sunday Sidekick run on the same computer. Create a
              private local URL, then add it as a <code>new-message</code> webhook in BlueBubbles.
              It triggers the same bounded history sync and memory settings as polling. The URL
              contains a secret and is shown once; regenerate it if you lose it.
            </p>
            {blueBubblesWebhookLoading && (
              <LoadingStatus message="Checking BlueBubbles webhook status…" />
            )}
            {blueBubblesWebhookError && (
              <LoadError message={blueBubblesWebhookError} onRetry={onRetryWebhookStatus} />
            )}
            <div className="button-row">
              <button
                type="button"
                className="small-button"
                disabled={blueBubblesWebhookLoading || Boolean(blueBubblesWebhookError)}
                onClick={() => void onCreateWebhook()}
              >
                {blueBubblesWebhookConfigured ? 'Regenerate webhook URL' : 'Create webhook URL'}
              </button>
              {blueBubblesWebhookConfigured && (
                <button
                  type="button"
                  className="small-button danger"
                  onClick={() => void onRevokeWebhook()}
                >
                  Revoke webhook
                </button>
              )}
            </div>
            {blueBubblesWebhookUrl && (
              <div className="credential-test">
                <input
                  type="text"
                  readOnly
                  value={blueBubblesWebhookUrl}
                  aria-label="Private BlueBubbles webhook URL"
                />
                <button
                  type="button"
                  className="small-button"
                  onClick={() => {
                    void navigator.clipboard.writeText(blueBubblesWebhookUrl);
                    onNotice('Webhook URL copied. Paste it into BlueBubbles.');
                  }}
                >
                  <Copy size={13} /> Copy URL
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {imessageAutoSyncStatus?.lastCheckedAt && (
        <p className="schedule-explainer" role="status">
          Last automatic check: {new Date(imessageAutoSyncStatus.lastCheckedAt).toLocaleString()}.
          {imessageAutoSyncStatus.lastError
            ? ` ${imessageAutoSyncStatus.lastError}`
            : ` ${imessageAutoSyncStatus.lastAddedMessages ?? 0} new messages imported.`}
        </p>
      )}
      <div className="settings-fields two recipients">
        <label>
          GROUP CHAT AGENT NAME OR MENTION
          <input
            maxLength={60}
            required
            data-search-target="chat-agent-name"
            value={settings.chatAgentName ?? 'Sunday Sidekick'}
            onChange={(event) =>
              setSettings((current) => ({ ...current, chatAgentName: event.target.value }))
            }
            placeholder="Sunday Sidekick"
          />
        </label>
        <label>
          LEAGUE CONTEXT FOR CHAT REPLIES
          <select
            data-search-target="chat-reply-league"
            value={settings.chatReplyLeagueId ?? ''}
            disabled={leagues.length === 0}
            onChange={(event) =>
              setSettings((current) => ({ ...current, chatReplyLeagueId: event.target.value }))
            }
          >
            {leagues.length === 0 && <option value="">Connect a league first</option>}
            {leagues.map((league) => (
              <option value={league.id} key={league.id}>
                {league.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="switch-label">
        <input
          type="checkbox"
          data-search-target="chat-replies"
          checked={settings.chatRepliesEnabled === true}
          disabled={!settings.memoryEnabled || !chatReplyDestinationReady || leagues.length === 0}
          onChange={(event) =>
            setSettings((current) => ({ ...current, chatRepliesEnabled: event.target.checked }))
          }
        />
        Draft a reply when someone directly addresses the agent
      </label>
      <label className="switch-label">
        <input
          type="checkbox"
          data-search-target="chat-auto-send"
          checked={settings.chatRepliesAutoSend === true}
          disabled={settings.chatRepliesEnabled !== true}
          onChange={(event) => {
            const enabled = event.target.checked;
            if (
              enabled &&
              !window.confirm(
                'Enable automatic chat replies? Generated replies can be sent to the configured group conversation without your review. Confirm the selected league and group before saving.',
              )
            )
              return;
            setSettings((current) => ({ ...current, chatRepliesAutoSend: enabled }));
          }}
        />
        Send generated chat replies automatically
      </label>
      <p className="schedule-explainer">
        This is off by default. When enabled, a group sync checks new messages for a first-line “
        {settings.chatAgentName || 'Sunday Sidekick'}” or “@
        {settings.chatAgentName || 'Sunday Sidekick'}” mention, sends that message and the selected
        league context to your configured AI runtime, and saves a reply draft. By default, review
        and send from Schedule & drafts. If you separately enable automatic sending, generated
        replies go directly to the configured group. The configured group channel is used, and
        member notes are included only when their separate report-context setting is enabled.
      </p>
    </>
  );
}
