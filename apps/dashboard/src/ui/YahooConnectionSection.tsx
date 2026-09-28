import type { Ref } from 'react';
import { ShieldCheck } from 'lucide-react';

export type YahooOAuthStatus = {
  clientConfigured: boolean;
  authorized: boolean;
  requiresReconnect: boolean;
  redirectUri: string;
};

type YahooConnectionSectionProps = {
  headingRef: Ref<HTMLHeadingElement>;
  status: YahooOAuthStatus;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  authorizationCode: string;
  onClientIdChange: (value: string) => void;
  onClientSecretChange: (value: string) => void;
  onAuthorizationCodeChange: (value: string) => void;
  onSaveClient: () => void;
  onAuthorize: () => void;
  onDisconnect: () => void;
  onCompleteAuthorization: () => void;
};

/** Keep Yahoo's multi-step OAuth controls together and isolate them from general settings UI. */
export function YahooConnectionSection({
  headingRef,
  status,
  clientId,
  clientSecret,
  authorizationUrl,
  authorizationCode,
  onClientIdChange,
  onClientSecretChange,
  onAuthorizationCodeChange,
  onSaveClient,
  onAuthorize,
  onDisconnect,
  onCompleteAuthorization,
}: YahooConnectionSectionProps) {
  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            Yahoo Fantasy connection
          </h2>
          <p>Connect through Yahoo’s owner-authorized OAuth flow.</p>
        </div>
        <ShieldCheck size={18} />
      </div>
      <p className="schedule-explainer">
        Yahoo requires an approved installed developer app with Fantasy Sports read access. The
        authorization uses Yahoo’s out-of-band flow (<code>redirect_uri=oob</code>). Save the app’s
        client ID and secret here; they stay in the operating system credential store.
      </p>
      <p className="schedule-explainer">
        <a href="https://sports.yahoo.com/developer/access/" target="_blank" rel="noreferrer">
          Request Yahoo Fantasy API access ↗
        </a>
      </p>
      <div className="settings-fields two recipients">
        <label>
          YAHOO CLIENT ID
          <input
            autoComplete="off"
            value={clientId}
            onChange={(event) => onClientIdChange(event.target.value)}
            placeholder={status.clientConfigured ? 'Saved in credential store' : 'Client ID'}
          />
        </label>
        <label>
          YAHOO CLIENT SECRET
          <input
            type="password"
            autoComplete="new-password"
            value={clientSecret}
            onChange={(event) => onClientSecretChange(event.target.value)}
            placeholder={status.clientConfigured ? 'Enter to replace' : 'Client secret'}
          />
        </label>
      </div>
      <div className="profile-buttons">
        <button
          type="button"
          className="small-button"
          disabled={!clientId.trim() || !clientSecret.trim()}
          onClick={onSaveClient}
        >
          Save app credentials
        </button>
        <button
          type="button"
          className="small-button"
          disabled={!status.clientConfigured}
          onClick={onAuthorize}
        >
          {status.authorized || status.requiresReconnect
            ? 'Reconnect Yahoo'
            : 'Start Yahoo authorization'}
        </button>
        {(status.authorized || status.requiresReconnect) && (
          <button type="button" className="small-button danger" onClick={onDisconnect}>
            Disconnect
          </button>
        )}
      </div>
      <span
        className={
          status.authorized && !status.requiresReconnect
            ? 'credential-status ready'
            : 'credential-status'
        }
      >
        {status.requiresReconnect
          ? 'RECONNECT REQUIRED'
          : status.authorized
            ? 'AUTHORIZED'
            : 'NOT CONNECTED'}
      </span>
      {authorizationUrl && (
        <div className="settings-fields">
          <a href={authorizationUrl} target="_blank" rel="noreferrer">
            Open Yahoo authorization in a new tab ↗
          </a>
          <label>
            AUTHORIZATION CODE FROM YAHOO
            <input
              autoComplete="off"
              value={authorizationCode}
              onChange={(event) => onAuthorizationCodeChange(event.target.value)}
              placeholder="Paste the code Yahoo displays after approval"
            />
          </label>
          <button
            type="button"
            className="small-button"
            disabled={!authorizationCode.trim()}
            onClick={onCompleteAuthorization}
          >
            Complete Yahoo connection
          </button>
        </div>
      )}
    </section>
  );
}
