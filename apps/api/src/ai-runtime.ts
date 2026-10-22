import type { AIProvider, AppSettings } from '@sidekick/core';
import {
  AnthropicProvider,
  AppleFoundationModelCLIProvider,
  createLocalCLIProvider,
  OpenAICompatibleProvider,
  parseCLIArguments,
  SignedInCodexConnection,
  type SignedInAIConnection,
} from '@sidekick/integrations';

const codexConnection = new SignedInCodexConnection();

/** Subscription access reuses the isolated adapter; it never falls back to an API key. */
export async function resolveConfiguredAI(
  settings: AppSettings,
  readApiKey: () => Promise<string | null>,
  codex: Pick<SignedInAIConnection, 'provider'> = codexConnection,
  readAnthropicKey: () => Promise<string | null> = async () => null,
): Promise<AIProvider | null> {
  const runtime = settings.aiRuntime;
  if (runtime?.mode === 'anthropic-api') {
    const key = await readAnthropicKey();
    return key ? new AnthropicProvider(key, runtime.model) : null;
  }
  if (runtime?.mode === 'codex-cli') {
    if (runtime.model !== 'gpt-6.1-sol' || runtime.command || runtime.args)
      throw new Error('The saved Codex connection requires GPT-6.1-Sol and managed CLI options.');
    return codex.provider();
  }
  if (runtime?.mode === 'apple-cli')
    return process.platform === 'darwin' ? new AppleFoundationModelCLIProvider() : null;
  if (runtime?.mode === 'cli')
    return createLocalCLIProvider(runtime.command, parseCLIArguments(runtime.args));
  const key = await readApiKey();
  return key ? new OpenAICompatibleProvider(key, runtime?.model, runtime?.baseUrl) : null;
}
