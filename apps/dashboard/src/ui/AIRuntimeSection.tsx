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
  function changeMode(mode: AIRuntime['mode']) {
    if (mode === 'codex-cli') {
      onChange('model', 'gpt-6.1-sol');
      onChange('command', '');
      onChange('args', '');
    }
    onChange('mode', mode);
  }
  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <div>
          <h2 ref={headingRef} tabIndex={-1} data-search-target="ai-runtime-heading">
            AI connection
          </h2>
          <p>
            Reports send league data to the AI you choose here. A local command-line tool runs with
            this app’s permissions, so only use one you trust.
          </p>
        </div>
        <KeyRound size={18} />
      </div>
      <div className="settings-fields two">
        {runtime.mode === 'api' ? (
          <>
            <label>
              MODEL
              <input
                data-search-target="ai-model"
                value={runtime.model}
                onChange={(event) => onChange('model', event.target.value)}
                placeholder="gpt-6-luna"
                list="sidekick-ai-models"
              />
              <datalist id="sidekick-ai-models">
                {availableModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
            <details className="advanced-settings wide">
              <summary>Advanced AI options</summary>
              <div className="settings-fields two">
                {' '}
                <label>
                  Connection type
                  <select
                    data-search-target="ai-runtime"
                    value={runtime.mode}
                    onChange={(event) => changeMode(event.target.value as AIRuntime['mode'])}
                  >
                    <option value="api">AI service (OpenAI or compatible)</option>
                    <option value="codex-cli">Codex account · GPT-6.1-Sol</option>
                    <option value="cli">Local AI tool (advanced)</option>
                    <option value="apple-cli" disabled={!appleCliPlatform}>
                      Apple Foundation Models CLI (macOS 27+)
                    </option>
                  </select>
                </label>
                <label className="wide">
                  AI server address (API BASE URL)
                  <input
                    data-search-target="ai-endpoint"
                    value={runtime.baseUrl}
                    onChange={(event) => onChange('baseUrl', event.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label>
                  Creativity
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    data-search-target="ai-temperature"
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
                  Maximum response size (tokens)
                  <input
                    type="number"
                    min={128}
                    max={16_384}
                    step={128}
                    data-search-target="ai-output"
                    value={runtime.maxOutputTokens ?? 4000}
                    onChange={(event) =>
                      onChange(
                        'maxOutputTokens',
                        event.target.value === '' ? 4000 : Number(event.target.value),
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
                    data-search-target="ai-pricing"
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
              </div>
            </details>
          </>
        ) : runtime.mode === 'cli' ? (
          <>
            {' '}
            <label>
              Connection type
              <select
                data-search-target="ai-runtime"
                value={runtime.mode}
                onChange={(event) => changeMode(event.target.value as AIRuntime['mode'])}
              >
                <option value="api">AI service (OpenAI or compatible)</option>
                <option value="codex-cli">Codex account · GPT-6.1-Sol</option>
                <option value="cli">Local AI tool (advanced)</option>
                <option value="apple-cli" disabled={!appleCliPlatform}>
                  Apple Foundation Models CLI (macOS 27+)
                </option>
              </select>
            </label>
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
          <>
            {' '}
            <label>
              Connection type
              <select
                data-search-target="ai-runtime"
                value={runtime.mode}
                onChange={(event) => changeMode(event.target.value as AIRuntime['mode'])}
              >
                <option value="api">AI service (OpenAI or compatible)</option>
                <option value="codex-cli">Codex account · GPT-6.1-Sol</option>
                <option value="cli">Local AI tool (advanced)</option>
                <option value="apple-cli" disabled={!appleCliPlatform}>
                  Apple Foundation Models CLI (macOS 27+)
                </option>
              </select>
            </label>
            {runtime.mode === 'codex-cli' ? (
              <p className="schedule-explainer">
                Uses your existing Codex ChatGPT sign-in with GPT-6.1-Sol and high reasoning for
                reports and advice. No API key is needed. Account limits apply. Only supplied
                context is sent; tools and local instructions remain isolated.
              </p>
            ) : (
              <p className="schedule-explainer">
                Uses Apple’s `fm respond` command with the on-device Foundation Model. Requires a
                supported Mac running macOS 27 or later. The CLI receives report content in its
                process arguments, which may be visible to local process-inspection tools while it
                runs. Test runtime verifies that `fm` is available.
              </p>
            )}
          </>
        )}
      </div>
      <div className="settings-fields two">
        {runtime.mode === 'api' && (
          <button type="button" className="small-button" onClick={onDiscoverModels} disabled={busy}>
            {busy ? 'Checking…' : 'Discover models'}
          </button>
        )}
        <button type="button" className="small-button" onClick={onTestRuntime} disabled={busy}>
          {busy ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {runtime.mode === 'api' && (
        <div className="schedule-explainer">
          <p role="status">
            {apiKeyConfigured === true
              ? 'An API key is saved in the operating-system credential store.'
              : apiKeyConfigured === false
                ? 'An API key is required for API mode. Add one in Credentials, then test.'
                : 'Couldn’t read the saved key. Check Credentials, then test.'}
          </p>
          <button type="button" className="small-button" onClick={onOpenCredentials}>
            Manage API credentials <span>→</span>
          </button>
        </div>
      )}
      <small>
        Discovering models and testing the connection never send league data. Settings are saved
        first.
      </small>
    </section>
  );
}
