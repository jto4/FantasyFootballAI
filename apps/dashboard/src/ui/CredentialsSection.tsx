import type { RefObject } from 'react';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { credentialStatusLabel } from './credential-status.js';
import { EmptyStatus, LoadError, LoadingStatus } from './LoadFeedback.js';

export type SecretState = { provider: string; configured: boolean }[];
export type LocalImage = { id: string; createdAt: string; size: number; mimeType: string };

type SecretDefinition = { id: string; name: string; help: string };
const secrets: SecretDefinition[] = [
  { id: 'openai', name: 'AI API key', help: 'Used only when API mode is selected.' },
  {
    id: 'image-generation',
    name: 'OpenAI image generation key',
    help: 'Used for GPT Image. Saved in the operating system credential store.',
  },
  {
    id: 'stability-image-generation',
    name: 'Stability AI image generation key',
    help: 'Used for Stable Image Core. Saved in the operating system credential store.',
  },
  {
    id: 'espn',
    name: 'ESPN session cookie',
    help: 'Owner-authorized ESPN session cookie for private league access.',
  },
  {
    id: 'resend',
    name: 'Resend delivery settings',
    help: 'JSON with apiKey and from fields. A test email can verify the key and sender.',
  },
  {
    id: 'twilio',
    name: 'Twilio delivery settings',
    help: 'JSON with accountSid and authToken; direct SMS also needs a from number.',
  },
  {
    id: 'bluebubbles',
    name: 'BlueBubbles iMessage bridge',
    help: 'JSON with serverUrl and serverPassword. The BlueBubbles server must run on a Mac.',
  },
];

type Props = {
  allowedProviders?: string[];
  showImages?: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  credentialStoreAvailable: boolean | null;
  secretState: SecretState;
  secretValues: Record<string, string>;
  onSecretValueChange: (provider: string, value: string) => void;
  onSaveSecret: (provider: string) => void;
  onRemoveSecret: (provider: string) => void;
  espnTestAvailable: boolean;
  credentialTestBusy: boolean;
  onTestEspn: () => void;
  resendTestRecipient: string;
  onResendTestRecipientChange: (recipient: string) => void;
  onTestTwilio: () => void;
  onTestResend: () => void;
  imageProvider: 'openai' | 'stability';
  onImageProviderChange: (provider: 'openai' | 'stability') => void;
  imageProviderConfigured: boolean;
  imageGenerationConfigured: boolean;
  imagePrompt: string;
  onImagePromptChange: (prompt: string) => void;
  generatedImage: string;
  imageGenerationBusy: boolean;
  onCreateImage: () => void;
  localImages: LocalImage[];
  imageLibraryLoading: boolean;
  imageLibraryError: string;
  onRefreshImages: () => void;
  onRemoveImage: (id: string) => void;
};

export function CredentialsSection({
  allowedProviders,
  showImages = true,
  headingRef,
  credentialStoreAvailable,
  secretState,
  secretValues,
  onSecretValueChange,
  onSaveSecret,
  onRemoveSecret,
  espnTestAvailable,
  credentialTestBusy,
  onTestEspn,
  resendTestRecipient,
  onResendTestRecipientChange,
  onTestTwilio,
  onTestResend,
  imageProvider,
  onImageProviderChange,
  imageProviderConfigured,
  imageGenerationConfigured,
  imagePrompt,
  onImagePromptChange,
  generatedImage,
  imageGenerationBusy,
  onCreateImage,
  localImages,
  imageLibraryLoading,
  imageLibraryError,
  onRefreshImages,
  onRemoveImage,
}: Props) {
  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            Credentials
          </h2>
          <p>
            Secret values are stored in the OS credential manager and never returned to the browser.
          </p>
        </div>
        <ShieldCheck size={18} />
      </div>
      {credentialStoreAvailable === false && (
        <p className="schedule-explainer" role="alert">
          Credential status cannot be read because the operating system credential store is
          unavailable. On Linux, start a Secret Service such as GNOME Keyring or KWallet in this
          user’s D-Bus session, then reload Settings.
        </p>
      )}
      <div className="credentials-grid">
        {secrets
          .filter((secret) => !allowedProviders || allowedProviders.includes(secret.id))
          .map((secret) => {
            const configured = secretState.find((item) => item.provider === secret.id)?.configured;
            return (
              <div className="credential-row" key={secret.id}>
                <div>
                  <strong>{secret.name}</strong>
                  <p>{secret.help}</p>
                  <span className={configured ? 'credential-status ready' : 'credential-status'}>
                    {credentialStatusLabel(credentialStoreAvailable, configured)}
                  </span>
                </div>
                <div className="credential-edit">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={secretValues[secret.id] ?? ''}
                    onChange={(event) => onSecretValueChange(secret.id, event.target.value)}
                    placeholder={configured ? 'Enter to replace' : 'Paste value locally'}
                    aria-label={secret.name}
                  />
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => onSaveSecret(secret.id)}
                  >
                    Save
                  </button>
                  {secret.id === 'twilio' && configured && (
                    <button
                      type="button"
                      className="small-button"
                      disabled={credentialTestBusy}
                      onClick={onTestTwilio}
                    >
                      {credentialTestBusy ? 'Testing…' : 'Test credentials'}
                    </button>
                  )}
                  {secret.id === 'espn' && configured && espnTestAvailable && (
                    <button
                      type="button"
                      className="small-button"
                      disabled={credentialTestBusy}
                      onClick={onTestEspn}
                    >
                      {credentialTestBusy ? 'Testing…' : 'Test access'}
                    </button>
                  )}
                  {configured && (
                    <button
                      type="button"
                      className="small-button danger"
                      onClick={() => onRemoveSecret(secret.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {secret.id === 'resend' && configured && (
                  <div className="credential-test">
                    <input
                      type="email"
                      autoComplete="email"
                      value={resendTestRecipient}
                      onChange={(event) => onResendTestRecipientChange(event.target.value)}
                      placeholder="Your email for a test"
                      aria-label="Resend test email recipient"
                    />
                    <button
                      type="button"
                      className="small-button"
                      disabled={credentialTestBusy || !resendTestRecipient.trim()}
                      onClick={onTestResend}
                    >
                      {credentialTestBusy ? 'Testing…' : 'Send test email'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
      </div>
      {showImages &&
        (imageProviderConfigured ||
          localImages.length > 0 ||
          imageLibraryLoading ||
          imageLibraryError) && (
          <div className="image-generation-tool">
            {imageLibraryLoading && <LoadingStatus message="Loading saved images…" />}
            {imageLibraryError && (
              <LoadError message={imageLibraryError} onRetry={onRefreshImages} />
            )}
            {imageProviderConfigured && (
              <>
                <label htmlFor="image-generation-provider">Image provider</label>
                <select
                  id="image-generation-provider"
                  value={imageProvider}
                  onChange={(event) =>
                    onImageProviderChange(
                      event.target.value === 'stability' ? 'stability' : 'openai',
                    )
                  }
                >
                  <option value="openai">OpenAI · GPT Image</option>
                  <option value="stability">Stability AI · Stable Image Core</option>
                </select>
                {!imageGenerationConfigured && (
                  <p>Save the selected provider’s key above to enable image generation.</p>
                )}
              </>
            )}
            {imageGenerationConfigured && (
              <>
                <label htmlFor="image-generation-prompt">Generate a league image</label>
                <p>
                  The prompt is sent to {imageProvider === 'openai' ? 'OpenAI' : 'Stability AI'} for
                  generation. Returned image data is saved in your local data folder; generation may
                  incur API charges.
                </p>
                <textarea
                  id="image-generation-prompt"
                  value={imagePrompt}
                  maxLength={4_000}
                  onChange={(event) => onImagePromptChange(event.target.value)}
                  placeholder="Describe a draft-night poster, trophy, or team image…"
                />
                <button
                  type="button"
                  className="small-button"
                  disabled={imageGenerationBusy || !imagePrompt.trim()}
                  onClick={onCreateImage}
                >
                  {imageGenerationBusy ? 'Generating…' : 'Generate image'}
                </button>
                {generatedImage && (
                  <div className="generated-image-preview">
                    <img src={generatedImage} alt="Generated fantasy football image" />
                    <a
                      className="small-button"
                      href={
                        generatedImage.startsWith('/api/images/')
                          ? `${generatedImage}?download=1`
                          : generatedImage
                      }
                      download="sunday-sidekick-image"
                    >
                      <Download size={13} /> Download image
                    </a>
                  </div>
                )}
              </>
            )}
            {localImages.length > 0 && (
              <div className="local-image-library" aria-label="Saved local images">
                <strong>Saved images</strong>
                {localImages.map((image) => (
                  <div className="local-image-row" key={image.id}>
                    <img src={`/api/images/${image.id}`} alt="Saved fantasy football image" />
                    <span>
                      {new Date(image.createdAt).toLocaleString()} ·{' '}
                      {(image.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <a
                      className="small-button"
                      href={`/api/images/${image.id}?download=1`}
                      download={`sunday-sidekick-${image.id}`}
                    >
                      <Download size={13} /> Download
                    </a>
                    <button
                      type="button"
                      className="small-button danger"
                      onClick={() => onRemoveImage(image.id)}
                      aria-label={`Delete saved image from ${new Date(image.createdAt).toLocaleString()}`}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
            {imageGenerationConfigured &&
              !imageLibraryLoading &&
              !imageLibraryError &&
              localImages.length === 0 && <EmptyStatus message="No saved images yet." />}
          </div>
        )}
    </section>
  );
}
