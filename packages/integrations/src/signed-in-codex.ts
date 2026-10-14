import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import type { AICompletion, AIProvider, AIRequest, SignedInAIStatus } from '@sidekick/core';
import { runLocalAICommand } from './ai.js';
import type { SignedInAIConnection } from './signed-in-ai.js';

export const signedInCodexModel = 'gpt-6.1-sol';
// Tool/skill isolation was verified against this native protocol. New versions
// must pass the same captured-request proof before this allowlist is expanded.
const legacyVersion = 'codex-cli 0.162.0-alpha.2';
const currentVersion = 'codex-cli 0.162.0-alpha.17.2';
function verifiedVersion(version: string): boolean {
  return version === legacyVersion || (process.platform === 'darwin' && version === currentVersion);
}
// Public native catalog capability metadata, pinned to the verified new protocol.
// The same model/effort is used; standard tool mode prevents model metadata from
// re-enabling Code Mode after feature disables. Our owned system file replaces
// these fallback instructions. No owner catalog or credential content is opened.
const isolatedModelCatalog = {
  models: [
    {
      slug: 'gpt-6.1-sol',
      display_name: 'GPT-6.1-Sol',
      description: 'Latest workhorse model for coding and everyday work.',
      default_reasoning_level: 'high',
      supported_reasoning_levels: [
        {
          effort: 'high',
          description: 'Advice analysis and review',
        },
      ],
      shell_type: 'unified_exec',
      visibility: 'list',
      supported_in_api: true,
      priority: 1,
      include_skills_usage_instructions: false,
      include_plugin_usage_instructions: false,
      include_apps_usage_instructions: false,
      default_reasoning_summary: 'none',
      support_verbosity: true,
      default_verbosity: 'low',
      apply_patch_tool_type: null,
      web_search_tool_type: 'text_and_image',
      truncation_policy: {
        mode: 'tokens',
        limit: 10000,
      },
      supports_image_detail_original: true,
      context_window: 500000,
      max_context_window: 872000,
      comp_hash: '3000',
      effective_context_window_percent: 95,
      experimental_supported_tools: [],
      input_modalities: ['text', 'image'],
      supports_search_tool: false,
      supports_experimental_context: false,
      use_responses_lite: true,
      supports_reasoning_effort_updates: true,
      node_repl_auto_review_required: true,
      node_repl_disabled: true,
      tool_mode: 'standard',
      multi_agent_version: 'v1',
      multi_agent_reasoning_effort: 'xhigh',
      base_instructions: 'Use only supplied advice instructions and evidence.',
    },
  ],
};
const disabledFeatures = [
  'shell_tool',
  'unified_exec',
  'shell_snapshot',
  'apps',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'multi_agent',
  'memories',
  'view_image',
  'remote_plugin',
  'hooks',
  'workspace_dependencies',
  'code_mode_host',
  'code_mode',
  'code_mode_only',
  'code_mode_prewarm',
  'skill_search',
  'plugins',
  'image_generation',
  'in_app_browser',
  'skill_mcp_dependency_install',
  'unbounded_connection_retries',
];
const disabledCodeModeNotice =
  'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.';

export type SignedInCodexProtocolFailure =
  | 'malformed-event'
  | 'event-limit'
  | 'after-completion'
  | 'unexpected-event'
  | 'unexpected-item'
  | 'native-item-error'
  | 'answer-before-turn'
  | 'multiple-answers'
  | 'empty-answer'
  | 'native-failure'
  | 'missing-final'
  | 'nonzero-exit';

export class SignedInCodexError extends Error {
  constructor(
    public readonly code:
      'limit-reported' | 'invalid-response' | 'unsupported-cli' | 'isolation-unavailable',
    public readonly protocolFailure?: SignedInCodexProtocolFailure,
  ) {
    super(
      code === 'limit-reported'
        ? 'Codex reported a limit. Check availability in the installed Codex CLI before retrying.'
        : code === 'unsupported-cli'
          ? 'This Codex CLI version has not been verified for isolated advice. Use the saved AI connection or check the supported version in Help.'
          : code === 'isolation-unavailable'
            ? 'Codex advice could not isolate local instructions and skills. Use the saved AI connection or check the installed skills before retrying.'
            : 'The signed-in Codex response could not be verified.',
    );
  }
}
function environment(): NodeJS.ProcessEnv {
  const result = { ...process.env };
  // Native login stays in its original location. Remove inherited API routes and
  // desktop/session pipes rather than copying or opening credential material.
  for (const key of Object.keys(result))
    if (/^(OPENAI_|CODEX_|ACCESS_TOKEN|CHATGPT_)/.test(key) && key !== 'CODEX_HOME')
      delete result[key];
  return result;
}
function installedPaths(): string[] {
  const filename = process.platform === 'win32' ? 'codex.exe' : 'codex';
  return [
    ...new Set([
      ...(process.env.PATH ?? '')
        .split(delimiter)
        .filter(isAbsolute)
        .slice(0, 32)
        .map((dir) => join(dir, filename)),
      ...(process.platform === 'darwin'
        ? [
            '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
          ]
        : []),
    ]),
  ];
}
async function isolated<T>(action: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-codex-advice-'));
  try {
    return await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Only native login status uses stderr; bounded bytes are parsed and discarded locally. */
function loginStatus(executable: string, cwd: string): Promise<SignedInAIStatus> {
  return new Promise((resolve) => {
    const child = spawn(executable, ['login', 'status'], {
      cwd,
      env: environment(),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '',
      exceeded = false,
      timedOut = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = () => {
      child.kill();
      forceTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000);
      forceTimer.unref();
    };
    const capture = (chunk: string) => {
      if (exceeded) return;
      output += chunk;
      if (output.length > 16384) {
        exceeded = true;
        output = '';
        terminate();
      }
    };
    child.stdout.setEncoding('utf8').on('data', capture);
    child.stderr.setEncoding('utf8').on('data', capture);
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, 5000);
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
    };
    child.once('error', () => {
      cleanup();
      output = '';
      resolve('unavailable');
    });
    child.once('close', (code) => {
      cleanup();
      const result =
        exceeded || timedOut
          ? 'unavailable'
          : code === 0 && output.trim() === 'Logged in using ChatGPT'
            ? 'signed-in'
            : /^(?:Not logged in|Logged in using an API key[^\n]*)$/.test(output.trim())
              ? 'signed-out'
              : 'unavailable';
      output = '';
      resolve(result);
    });
  });
}

async function disabledSkills(signal?: AbortSignal): Promise<string[]> {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  if (!isAbsolute(codexHome)) throw new SignedInCodexError('isolation-unavailable');
  const roots = [join(codexHome, 'skills'), join(homedir(), '.agents', 'skills')];
  const queue: string[] = [];
  const visited = new Set<string>(),
    paths = new Set<string>();
  const deadline = Date.now() + 5000;
  let entriesSeen = 0;
  try {
    for (const root of roots) {
      try {
        await stat(root);
        queue.push(root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    while (queue.length) {
      signal?.throwIfAborted();
      if (Date.now() > deadline || visited.size >= 1024) throw new Error();
      const directory = await realpath(queue.shift()!);
      if (visited.has(directory)) continue;
      visited.add(directory);
      const entries = await readdir(directory, { withFileTypes: true });
      entriesSeen += entries.length;
      if (entriesSeen > 30000) throw new Error();
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.name === 'SKILL.md' && (entry.isFile() || entry.isSymbolicLink())) {
          paths.add(directory);
          paths.add(await realpath(path));
        } else if (entry.isDirectory()) queue.push(path);
        else if (entry.isSymbolicLink() && (await stat(path)).isDirectory()) queue.push(path);
      }
      if (paths.size > 1024 || queue.length > 1024) throw new Error();
    }
    if (JSON.stringify([...paths]).length > 60000) throw new Error();
    return [...paths].sort();
  } catch {
    signal?.throwIfAborted();
    throw new SignedInCodexError('isolation-unavailable');
  }
}
function completion(output: string, startupNotices: string[] = []): AICompletion {
  let text: string | undefined,
    usage: AICompletion['usage'],
    started = false,
    completed = false;
  function invalid(reason: SignedInCodexProtocolFailure): never {
    throw new SignedInCodexError('invalid-response', reason);
  }
  try {
    const lines = output.split('\n');
    if (lines.length > 1000) invalid('event-limit');
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (completed) invalid('after-completion');
      if (!event || typeof event !== 'object' || Array.isArray(event)) invalid('malformed-event');
      if (event.type === 'thread.started') continue;
      if (event.type === 'turn.started' && !started) {
        started = true;
        continue;
      }
      if (event.type === 'item.completed') {
        const item = event.item;
        if (
          !started &&
          item?.type === 'error' &&
          (item.message === disabledCodeModeNotice || startupNotices.includes(item.message))
        )
          continue;
        if (started && item?.type === 'reasoning') continue;
        if (item?.type === 'error') {
          if (/\blimit\b/i.test(String(item.message ?? '')))
            throw new SignedInCodexError('limit-reported');
          invalid('native-item-error');
        }
        if (item?.type !== 'agent_message') invalid('unexpected-item');
        if (!started) invalid('answer-before-turn');
        if (text !== undefined) invalid('multiple-answers');
        if (typeof item.text !== 'string' || !item.text.trim()) invalid('empty-answer');
        text = item.text.trim();
        continue;
      }
      if (event.type === 'turn.completed' && started) {
        if (text === undefined) invalid('missing-final');
        completed = true;
        const input = event.usage?.input_tokens,
          answer = event.usage?.output_tokens;
        const valid = (n: unknown): n is number =>
          typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 10000000;
        if (valid(input) && valid(answer)) usage = { inputTokens: input, outputTokens: answer };
        continue;
      }
      if (['error', 'turn.failed'].includes(event.type)) {
        if (/\blimit\b/i.test(String(event.message ?? event.error?.message ?? '')))
          throw new SignedInCodexError('limit-reported');
        invalid('native-failure');
      }
      invalid('unexpected-event');
    }
    if (!completed || !text) invalid('missing-final');
    return { text, ...(usage ? { usage } : {}) };
  } catch (error) {
    if (error instanceof SignedInCodexError) throw error;
    throw new SignedInCodexError('invalid-response', 'malformed-event');
  }
}
/** Shared by generation and the opt-in native request-capture proof. */
export async function isolatedCodexArguments(
  instructions: string,
  signal?: AbortSignal,
  version = currentVersion,
): Promise<string[]> {
  const skills = await disabledSkills(signal);
  const args = [
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--model',
    signedInCodexModel,
    '--json',
  ];
  if (version === currentVersion) args.unshift('--no-daemon');
  const settings = {
    model_reasoning_effort: 'high',
    model_instructions_file: instructions,
    project_doc_max_bytes: 0,
    web_search: 'disabled',
    'history.persistence': 'none',
    'features.skip_host_skill_discovery': true,
    suppress_unstable_features_warning: true,
  };
  if (version === currentVersion) {
    const catalog = join(dirname(instructions), 'model-catalog.json');
    await writeFile(catalog, JSON.stringify(isolatedModelCatalog), { mode: 0o600 });
    Object.assign(settings, {
      model_catalog_json: catalog,
      'skills.include_instructions': false,
      'orchestrator.mcp.enabled': false,
      'orchestrator.skills.enabled': false,
      'agents.enabled': false,
      'tools.experimental_request_user_input.enabled': false,
      include_permissions_instructions: false,
      include_apps_instructions: false,
      include_collaboration_mode_instructions: false,
      include_environment_context: false,
    });
  }
  for (const [key, value] of Object.entries(settings))
    args.push('-c', `${key}=${JSON.stringify(value)}`);
  args.push(
    '-c',
    `skills.config=[${skills.map((path) => `{path=${JSON.stringify(path)},enabled=false}`).join(',')}]`,
  );
  for (const feature of disabledFeatures) args.push('--disable', feature);
  if (version === currentVersion)
    for (const feature of [
      'goals',
      'sleep_tool',
      'tool_suggest',
      'multi_agent_v2',
      'daemon_auto_start',
    ])
      args.push('--disable', feature);
  args.push('-');
  return args;
}

/** The newer native CLI always reads global AGENTS, even with config/docs disabled. */
export async function isolatedCodexLaunch(
  executable: string,
  args: string[],
  version: string,
): Promise<{ executable: string; args: string[]; startupNotices: string[] }> {
  if (version === legacyVersion) return { executable, args, startupNotices: [] };
  if (!verifiedVersion(version)) throw new SignedInCodexError('unsupported-cli');
  try {
    await access('/usr/bin/sandbox-exec', constants.X_OK);
    const configuredHome = process.env.CODEX_HOME;
    if (configuredHome && !isAbsolute(configuredHome)) throw new Error();
    const home = await realpath(configuredHome ?? join(homedir(), '.codex'));
    const paths = new Set<string>();
    for (const name of ['AGENTS.md', 'AGENTS.override.md']) {
      const path = join(home, name);
      paths.add(path);
      try {
        paths.add(await realpath(path));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    // Canonical paths matter on macOS (/var aliases /private/var). Deny the
    // native instruction reads without relocating, opening or copying login data.
    const policy = `(version 1)(allow default)(deny file-read-data ${[...paths]
      .map((path) => `(literal ${JSON.stringify(path)})`)
      .join(' ')})`;
    return {
      executable: '/usr/bin/sandbox-exec',
      args: ['-p', policy, executable, ...args],
      startupNotices: [...paths].map(
        (path) =>
          `Failed to read global AGENTS.md instructions from \`${path}\`: Operation not permitted (os error 1)`,
      ),
    };
  } catch {
    throw new SignedInCodexError('isolation-unavailable');
  }
}

class SignedInCodexProvider implements AIProvider {
  readonly id = 'codex-cli';
  constructor(private readonly executable: string) {}
  async generate(request: AIRequest): Promise<string> {
    return (await this.generateDetailed(request)).text;
  }
  async generateDetailed(request: AIRequest): Promise<AICompletion> {
    request.signal?.throwIfAborted();
    if (request.system.length > 64000 || request.prompt.length > 200000)
      throw new SignedInCodexError('invalid-response');
    return isolated(async (directory) => {
      const version = await runLocalAICommand(
        this.executable,
        ['--version'],
        undefined,
        request.signal,
        5000,
        environment(),
        directory,
        1024,
      );
      if (!verifiedVersion(version)) throw new SignedInCodexError('unsupported-cli');
      const instructions = join(directory, 'instructions.txt');
      const args = await isolatedCodexArguments(instructions, request.signal, version);
      await writeFile(instructions, request.system, { mode: 0o600 });
      const launch = await isolatedCodexLaunch(this.executable, args, version);
      const output = await runLocalAICommand(
        launch.executable,
        launch.args,
        request.prompt,
        request.signal,
        request.timeoutMs,
        environment(),
        directory,
        200000,
        (text) => {
          try {
            completion(text, launch.startupNotices);
          } catch (error) {
            if (error instanceof SignedInCodexError) return error;
          }
          return new SignedInCodexError('invalid-response', 'nonzero-exit');
        },
      );
      return completion(output, launch.startupNotices);
    });
  }
}

export class SignedInCodexConnection implements SignedInAIConnection {
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
  private async inspect(): Promise<{ status: SignedInAIStatus; executable?: string }> {
    for (const path of this.paths.filter(isAbsolute).slice(0, 33)) {
      try {
        await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        if (!(await stat(path)).isFile()) continue;
      } catch {
        continue;
      }
      return isolated(async (directory) => {
        const version = await runLocalAICommand(
          path,
          ['--version'],
          undefined,
          undefined,
          5000,
          environment(),
          directory,
          1024,
        );
        if (!verifiedVersion(version)) return { status: 'unavailable' };
        await isolatedCodexLaunch(path, [], version);
        const status = await loginStatus(path, directory);
        return { status, ...(status === 'signed-in' ? { executable: path } : {}) };
      });
    }
    return { status: 'not-installed' };
  }
  async status(): Promise<SignedInAIStatus> {
    return (await this.lookup()).status;
  }
  async provider(): Promise<AIProvider> {
    const found = await this.lookup();
    if (found.status !== 'signed-in' || !found.executable)
      throw new Error(
        'Check the supported Codex CLI version and ChatGPT sign-in, then reload advice connections.',
      );
    return new SignedInCodexProvider(found.executable);
  }
}
