import { access, mkdtemp, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import type { AIProvider, AIRequest, AICompletion, SignedInAIStatus } from '@sidekick/core';
import { ClaudeCLIProvider, runLocalAICommand } from './ai.js';

export interface SignedInAIConnection {
  status(): Promise<SignedInAIStatus>;
  provider(): Promise<AIProvider>;
}

export class SignedInAIError extends Error {
  constructor(public readonly code: 'limit-reported' | 'budget-reached' | 'invalid-response') {
    super(
      code === 'limit-reported'
        ? 'Claude reported a limit. Check availability in the installed Claude CLI before retrying.'
        : code === 'budget-reached'
          ? 'Claude reached this analysis pass’s budget. Try a smaller analysis budget or fewer players.'
          : 'The signed-in Claude response could not be verified.',
    );
  }
}

function envelope(text: string): Record<string, unknown> | undefined {
  try {
    const row: unknown = JSON.parse(text);
    return row && typeof row === 'object' && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
function responseFailure(text: string): SignedInAIError {
  const row = envelope(text);
  // Only fixed categories escape the native envelope. Its session/account fields,
  // error prose and estimated billing information are never surfaced or persisted.
  if (row?.subtype === 'error_max_budget_usd') return new SignedInAIError('budget-reached');
  if (row?.is_error === true && typeof row.result === 'string' && /\blimit\b/i.test(row.result))
    return new SignedInAIError('limit-reported');
  return new SignedInAIError('invalid-response');
}
function completion(text: string): AICompletion {
  const row = envelope(text);
  if (
    !row ||
    row.is_error !== false ||
    row.subtype !== 'success' ||
    typeof row.result !== 'string' ||
    !row.result.trim()
  )
    throw responseFailure(text);
  const result: AICompletion = { text: row.result.trim() };
  const usage = row.usage;
  if (usage && typeof usage === 'object' && !Array.isArray(usage)) {
    const counts = usage as Record<string, unknown>;
    const input = counts.input_tokens,
      output = counts.output_tokens;
    const cached = counts.cache_read_input_tokens ?? 0,
      created = counts.cache_creation_input_tokens ?? 0;
    const valid = (value: unknown): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000;
    if (
      valid(input) &&
      valid(output) &&
      valid(cached) &&
      valid(created) &&
      input + cached + created <= 10_000_000
    )
      result.usage = { inputTokens: input + cached + created, outputTokens: output };
  }
  return result;
}

function installedPaths(): string[] {
  const filename = process.platform === 'win32' ? 'claude.exe' : 'claude';
  return [
    ...new Set([
      join(homedir(), '.local', 'bin', filename),
      ...(process.env.PATH ?? '')
        .split(delimiter)
        .filter(isAbsolute)
        .slice(0, 32)
        .map((directory) => join(directory, filename)),
    ]),
  ];
}

function loginEnvironment(input: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment = { ...input };
  // This preset promises the existing Claude subscription login, not a key or
  // an inherited API/cloud-provider route. Keep changes inside the child only.
  for (const key of Object.keys(environment))
    if (
      key.startsWith('ANTHROPIC_') ||
      [
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_USE_BEDROCK',
        'CLAUDE_CODE_USE_VERTEX',
        'CLAUDE_CODE_USE_FOUNDRY',
        'CLAUDE_CODE_API_KEY_HELPER',
      ].includes(key)
    )
      delete environment[key];
  return environment;
}

async function isolated<T>(action: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-advice-cli-'));
  try {
    return await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

class SignedInClaudeProvider extends ClaudeCLIProvider {
  constructor(private readonly executable: string) {
    super(executable);
  }
  override async generate(request: AIRequest): Promise<string> {
    return (await this.generateDetailed(request)).text;
  }
  async generateDetailed(request: AIRequest): Promise<AICompletion> {
    const environment = loginEnvironment(this.requestEnvironment(request));
    const text = await isolated((directory) =>
      runLocalAICommand(
        this.executable,
        [
          '--print',
          '--output-format',
          'json',
          '--safe-mode',
          '--tools',
          '',
          '--strict-mcp-config',
          '--mcp-config',
          '{"mcpServers":{}}',
          '--setting-sources',
          '',
          '--no-session-persistence',
          '--no-chrome',
          '--disable-slash-commands',
          '--model',
          'opus',
          '--effort',
          'high',
          '--max-budget-usd',
          '1',
          '--system-prompt',
          request.system,
        ],
        request.prompt,
        request.signal,
        request.timeoutMs,
        environment,
        directory,
        200_000,
        responseFailure,
      ),
    );
    return completion(text);
  }
}

/** Read only sanitized login availability; no model call, account identifier or token escapes. */
export class SignedInClaudeConnection implements SignedInAIConnection {
  private pending: Promise<{ status: SignedInAIStatus; executable?: string }> | undefined;
  constructor(private readonly paths = installedPaths()) {}
  private lookup(): Promise<{ status: SignedInAIStatus; executable?: string }> {
    if (this.pending) return this.pending;
    const pending = this.inspect().catch(() => ({ status: 'unavailable' as const }));
    this.pending = pending;
    void pending.finally(() => {
      if (this.pending === pending) this.pending = undefined;
    });
    return pending;
  }
  async status(): Promise<SignedInAIStatus> {
    return (await this.lookup()).status;
  }
  private async inspect(): Promise<{ status: SignedInAIStatus; executable?: string }> {
    let executable: string | undefined;
    for (const path of this.paths.filter(isAbsolute).slice(0, 33)) {
      try {
        await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        if (!(await stat(path)).isFile()) continue;
      } catch {
        continue;
      }
      executable = path;
      break;
    }
    if (!executable) return { status: 'not-installed' };
    try {
      const output = await isolated((directory) =>
        runLocalAICommand(
          executable!,
          ['--safe-mode', '--setting-sources', '', 'auth', 'status'],
          undefined,
          undefined,
          5_000,
          loginEnvironment(),
          directory,
          16_384,
        ),
      );
      const status: unknown = JSON.parse(output);
      if (!status || typeof status !== 'object') return { status: 'unavailable' };
      const row = status as Record<string, unknown>;
      return row.loggedIn === true && row.authMethod === 'claude.ai'
        ? { status: 'signed-in', executable }
        : {
            status:
              row.loggedIn === false || typeof row.authMethod === 'string'
                ? 'signed-out'
                : 'unavailable',
          };
    } catch (error) {
      return {
        status:
          error instanceof Error && error.message === 'AI CLI exited with 1.'
            ? 'signed-out'
            : 'unavailable',
      };
    }
  }
  async provider(): Promise<AIProvider> {
    const found = await this.lookup();
    if (found.status !== 'signed-in' || !found.executable)
      throw new Error('Sign in to the installed Claude CLI, then reload advice connections.');
    return new SignedInClaudeProvider(found.executable);
  }
}
