import type { Ref } from 'react';
import { KeyRound } from 'lucide-react';
import type { AppSettings } from '@sidekick/core';

type AIRuntime = NonNullable<AppSettings['aiRuntime']>;
type RuntimeChange = <K extends keyof AIRuntime>(key: K, value: AIRuntime[K]) => void;

type AIRuntimeSectionProps = {
  headingRef: Ref<HTMLHeadingElement>;
  runtime: AIRuntime;
  availableModels: string[];
  appleCliPlatform: boolean;
  apiKeyConfigured: boolean | null;
  busy: boolean;
  onChange: RuntimeChange;
  onOpenCredentials: () => void;
  onDiscoverModels: () => void;
  onTestRuntime: () => void;
};

/** Render provider-specific controls while the parent retains persistence and runtime effects. */
export function AIRuntimeSection({
  headingRef,
  runtime,
  availableModels,
  appleCliPlatform,
  apiKeyConfigured,
  busy,
  onChange,
  onOpenCredentials,
  onDiscoverModels,
  onTestRuntime,
}: AIRuntimeSectionProps) {
  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            AI runtime
          </h2>
          <p>
            API mode sends the league report context to your configured provider. A local CLI
            receives that context and runs with this app’s operating-system permissions; use a tool
            you trust.
          </p>
        </div>
        <KeyRound size={18} />
      </div>
      <div className="settings-fields two">
        <label>
          RUNTIME
          <select
            value={runtime.mode}
            onChange={(event) => onChange('mode', event.target.value as AIRuntime['mode'])}
          >
            <option value="api">OpenAI-compatible API</option>
            <option value="cli">Local AI CLI</option>
            <option value="apple-cli" disabled={!appleCliPlatform}>
              Apple Foundation Models CLI (macOS 27+)
            </option>
          </select>
        </label>
        {runtime.mode === 'api' ? (
          <>
            <label>
              MODEL
              <input
                value={runtime.model}
                onChange={(event) => onChange('model', event.target.value)}
                placeholder="gpt-4o-mini"
                list="sidekick-ai-models"
              />
              <datalist id="sidekick-ai-models">
                {availableModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
            <label className="wide">
              API BASE URL
              <input
                value={runtime.baseUrl}
                onChange={(event) => onChange('baseUrl', event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              TEMPERATURE
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={runtime.temperature ?? 0.8}
                onChange={(event) =>
                  onChange(
                    'temperature',
                    event.target.value === '' ? 0.8 : Number(event.target.value),
                  )
                }
              />
              <small>Lower is steadier; higher is more varied. Range: 0–2.</small>
            </label>
            <label>
              MAXIMUM OUTPUT TOKENS
              <input
                type="number"
                min={128}
                max={16_384}
                step={128}
                value={runtime.maxOutputTokens ?? 1200}
                onChange={(event) =>
                  onChange(
                    'maxOutputTokens',
                    event.target.value === '' ? 1200 : Number(event.target.value),
                  )
                }
              />
              <small>Caps response size for supported OpenAI-compatible models.</small>
            </label>
            <label>
              INPUT PRICE (USD / 1M TOKENS)
              <input
                type="number"
                min={0}
                max={1000}
                step={0.0001}
                value={runtime.inputUsdPerMillionTokens ?? ''}
                onChange={(event) =>
                  onChange(
                    'inputUsdPerMillionTokens',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  )
                }
                placeholder="Enter current input rate"
              />
            </label>
            <label>
              OUTPUT PRICE (USD / 1M TOKENS)
              <input
                type="number"
                min={0}
                max={1000}
                step={0.0001}
                value={runtime.outputUsdPerMillionTokens ?? ''}
                onChange={(event) =>
                  onChange(
                    'outputUsdPerMillionTokens',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  )
                }
                placeholder="Enter current output rate"
              />
            </label>
            <p className="schedule-explainer">
              Cost estimates use these owner-entered rates and the token counts returned by the
              provider. Enter both current rates to see a dollar estimate; discounts and other
              provider billing adjustments are not included.
            </p>
          </>
        ) : runtime.mode === 'cli' ? (
          <>
            <label>
              EXECUTABLE
              <input
                value={runtime.command}
                onChange={(event) => onChange('command', event.target.value)}
                placeholder="your-ai-cli"
              />
            </label>
            <label>
              ARGUMENTS
              <input
                value={runtime.args}
                onChange={(event) => onChange('args', event.target.value)}
                placeholder="--non-interactive"
              />
              <small>
                Quote values that contain spaces. Arguments run directly without a shell.
              </small>
            </label>
          </>
        ) : (
          <p className="schedule-explainer">
            Uses Apple’s `fm respond` command with the on-device Foundation Model. Requires a
            supported Mac running macOS 27 or later. The CLI receives report content in its process
            arguments, which may be visible to local process-inspection tools while it runs. Test
            runtime verifies that `fm` is available.
          </p>
        )}
      </div>
      <div className="settings-fields two">
        {runtime.mode === 'api' && (
          <button type="button" className="small-button" onClick={onDiscoverModels} disabled={busy}>
            {busy ? 'Checking…' : 'Discover models'}
          </button>
        )}
        <button type="button" className="small-button" onClick={onTestRuntime} disabled={busy}>
          {busy ? 'Testing…' : 'Save and test runtime'}
        </button>
      </div>
      {runtime.mode === 'api' && (
        <div className="schedule-explainer">
          <p role="status">
            {apiKeyConfigured === true
              ? 'An API key is saved in the operating-system credential store.'
              : apiKeyConfigured === false
                ? 'An API key is required for API mode. Add it in credentials before testing this runtime.'
                : 'API credential status is unavailable. Check the credential store in Credentials before testing.'}
          </p>
          <button type="button" className="small-button" onClick={onOpenCredentials}>
            Manage API credentials <span>→</span>
          </button>
        </div>
      )}
      <small>
        Model discovery sends an authenticated request to your configured API endpoint and sends no
        league data. Runtime testing uses a fixed, data-free prompt. Settings are saved first.
      </small>
    </section>
  );
}
