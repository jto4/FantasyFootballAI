import { spawn } from 'node:child_process';
import type { AICompletion, AIProvider, AIRequest } from '@sidekick/core';
import { readBoundedJson } from './http.js';
import { isOfficialOpenAI, isOpenAIReasoningModel } from './ai-capabilities.js';

/** Parse a settings field into argv without invoking a shell or expanding shell syntax. */
export function parseCLIArguments(input: string): string[] {
  if (input.length > 1000) throw new Error('AI CLI arguments exceed the settings limit.');
  const args: string[] = [];
  let current = '';
  let quote: "'" | '"' | undefined;
  let started = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (character === '\\' && quote !== "'") {
      const next = input[index + 1];
      if (next === undefined) throw new Error('AI CLI arguments end with an incomplete escape.');
      const escapable = quote ? next === '"' || next === '\\' : /\s|[\\'\"]/.test(next);
      if (escapable) {
        current += next;
        index += 1;
      } else {
        // Preserve ordinary backslashes so Windows paths remain valid argv values.
        current += character;
      }
      started = true;
    } else if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) args.push(current);
      current = '';
      started = false;
    } else {
      current += character;
      started = true;
    }
  }
  if (quote) throw new Error('AI CLI arguments contain an unclosed quote.');
  if (started) args.push(current);
  if (args.length > 64) throw new Error('AI CLI arguments contain too many values.');
  return args;
}

export class OpenAICompatibleProvider implements AIProvider {
  id = 'api';
  constructor(
    private readonly apiKey: string,
    private readonly model = 'gpt-6-luna',
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${this.apiKey}`, accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`AI model discovery failed (${response.status})`);
    const result = await readBoundedJson<{ data?: { id?: unknown }[] }>(response, 2_000_000);
    if (!Array.isArray(result.data)) throw new Error('AI provider returned an invalid model list.');
    const models = new Set<string>();
    for (const item of result.data.slice(0, 2_000)) {
      if (typeof item?.id === 'string' && /^[\w./:-]{1,120}$/.test(item.id)) models.add(item.id);
    }
    return [...models].sort((left, right) => left.localeCompare(right));
  }

  async generate(request: AIRequest): Promise<string> {
    return (await this.generateDetailed(request)).text;
  }

  async generateDetailed(request: AIRequest): Promise<AICompletion> {
    if (
      request.temperature !== undefined &&
      (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2)
    )
      throw new Error('AI temperature must be between 0 and 2.');
    if (
      request.maxOutputTokens !== undefined &&
      (!Number.isInteger(request.maxOutputTokens) ||
        request.maxOutputTokens < 128 ||
        request.maxOutputTokens > 16_384)
    )
      throw new Error('AI output limit must be an integer from 128 to 16,384 tokens.');
    if (
      request.reasoningEffort !== undefined &&
      !['low', 'medium', 'high'].includes(request.reasoningEffort)
    )
      throw new Error('AI reasoning effort must be low, medium, or high.');
    if (
      request.timeoutMs !== undefined &&
      (!Number.isInteger(request.timeoutMs) ||
        request.timeoutMs < 1_000 ||
        request.timeoutMs > 120_000)
    )
      throw new Error('AI request timeout must be between one and one hundred twenty seconds.');
    // OpenAI reasoning models reject legacy sampling/token parameters. Custom
    // compatible endpoints retain their existing request contract.
    const reasoning = isOfficialOpenAI(this.baseUrl) && isOpenAIReasoningModel(this.model);
    const responses =
      reasoning && (request.reasoningEffort !== undefined || /-pro(?:-|$)/.test(this.model));
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, '')}/${responses ? 'responses' : 'chat/completions'}`,
      {
        method: 'POST',
        signal: request.signal
          ? AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs ?? 45_000)])
          : AbortSignal.timeout(request.timeoutMs ?? 45_000),
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          ...(responses
            ? {
                store: false,
                instructions: request.system,
                input: request.prompt,
                reasoning: { effort: request.reasoningEffort ?? 'high' },
                ...(request.maxOutputTokens !== undefined
                  ? { max_output_tokens: request.maxOutputTokens }
                  : {}),
              }
            : {
                ...(isOfficialOpenAI(this.baseUrl) ? { store: false } : {}),
                ...(reasoning
                  ? {
                      ...(request.reasoningEffort
                        ? { reasoning_effort: request.reasoningEffort }
                        : {}),
                      ...(request.maxOutputTokens !== undefined
                        ? { max_completion_tokens: request.maxOutputTokens }
                        : {}),
                    }
                  : {
                      temperature: request.temperature ?? 0.8,
                      ...(request.maxOutputTokens !== undefined
                        ? { max_tokens: request.maxOutputTokens }
                        : {}),
                    }),
                messages: [
                  { role: 'system', content: request.system },
                  { role: 'user', content: request.prompt },
                ],
              }),
        }),
      },
    );
    if (!response.ok) throw new Error(`AI provider request failed (${response.status})`);
    // Never retry a paid request on another endpoint/model. Only final assistant
    // text is retained; opaque reasoning and refusal/tool output never become advice.
    if (responses)
      return parseResponsesCompletion(await readBoundedJson<unknown>(response, 2_000_000));
    const result = await readBoundedJson<{
      choices?: { finish_reason?: string; message?: { content?: unknown; refusal?: unknown } }[];
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    }>(response, 2_000_000);
    const text = result.choices?.[0]?.message?.content;
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      result.choices?.[0]?.message?.refusal ||
      (result.choices?.[0]?.finish_reason !== undefined &&
        result.choices[0].finish_reason !== 'stop')
    )
      throw new Error('AI provider returned no complete text.');
    const inputTokens = boundedUsageTokens(result.usage?.prompt_tokens);
    const outputTokens = boundedUsageTokens(result.usage?.completion_tokens);
    return {
      text,
      ...(inputTokens !== undefined && outputTokens !== undefined
        ? { usage: { inputTokens, outputTokens } }
        : {}),
    };
  }
}

function parseResponsesCompletion(value: unknown): AICompletion {
  const row = value as {
    status?: unknown;
    output?: unknown;
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  } | null;
  if (!row || row.status !== 'completed' || !Array.isArray(row.output))
    throw new Error('AI provider returned no complete text.');
  const parts: string[] = [];
  for (const item of row.output) {
    if (item?.type === 'reasoning') continue;
    if (item?.type === 'message' && item.role === 'assistant' && item.phase === 'commentary')
      continue;
    if (
      item?.type !== 'message' ||
      item.role !== 'assistant' ||
      item.status !== 'completed' ||
      !Array.isArray(item.content) ||
      (item.phase !== undefined && item.phase !== 'final_answer')
    )
      throw new Error('AI provider returned an unsupported response.');
    for (const part of item.content) {
      if (part?.type !== 'output_text' || typeof part.text !== 'string')
        throw new Error('AI provider returned no complete text.');
      parts.push(part.text);
    }
  }
  const text = parts.join('\n');
  if (!text.trim()) throw new Error('AI provider returned no complete text.');
  const inputTokens = boundedUsageTokens(row.usage?.input_tokens);
  const outputTokens = boundedUsageTokens(row.usage?.output_tokens);
  return {
    text,
    ...(inputTokens !== undefined && outputTokens !== undefined
      ? { usage: { inputTokens, outputTokens } }
      : {}),
  };
}

function boundedUsageTokens(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000_000
    ? value
    : undefined;
}

export class LocalCLIProvider implements AIProvider {
  id = 'cli';
  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
  ) {}
  async generate(request: AIRequest): Promise<string> {
    if (!this.command.trim()) throw new Error('Set an installed AI CLI command in Settings.');
    return runLocalAICommand(
      this.command,
      this.args,
      `${request.system}\n\n${request.prompt}`,
      request.signal,
      request.timeoutMs,
      this.requestEnvironment(request),
    );
  }
  protected requestEnvironment(_request: AIRequest): NodeJS.ProcessEnv | undefined {
    return undefined;
  }
}

/** Claude's documented process options keep advice budgets separate from owner settings. */
export class ClaudeCLIProvider extends LocalCLIProvider {
  override id = 'claude-cli';
  protected override requestEnvironment(request: AIRequest): NodeJS.ProcessEnv {
    if (
      request.maxOutputTokens !== undefined &&
      (!Number.isInteger(request.maxOutputTokens) ||
        request.maxOutputTokens < 128 ||
        request.maxOutputTokens > 16_384)
    )
      throw new Error('AI output limit must be an integer from 128 to 16,384 tokens.');
    if (
      request.reasoningEffort !== undefined &&
      !['low', 'medium', 'high'].includes(request.reasoningEffort)
    )
      throw new Error('AI reasoning effort must be low, medium, or high.');
    // Per-child overrides never modify process.env or persist an API key. Other
    // tools keep their own interface; CLI-managed policies may still take precedence.
    return {
      ...process.env,
      CLAUDE_CODE_MAX_RETRIES: '0',
      MAX_STRUCTURED_OUTPUT_RETRIES: '1',
      ...(request.maxOutputTokens !== undefined
        ? { CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(request.maxOutputTokens) }
        : {}),
      ...(request.reasoningEffort !== undefined
        ? { CLAUDE_CODE_EFFORT_LEVEL: request.reasoningEffort }
        : {}),
    };
  }
}

export function createLocalCLIProvider(command: string, args: string[] = []): AIProvider {
  return /(?:^|[\\/])claude(?:\.exe)?$/i.test(command)
    ? new ClaudeCLIProvider(command, args)
    : new LocalCLIProvider(command, args);
}

/** Invoke Apple's documented fm interface with separate instructions and prompt arguments. */
export class AppleFoundationModelCLIProvider implements AIProvider {
  id = 'apple-foundation-model';
  constructor(
    private readonly command = 'fm',
    private readonly prefixArgs: string[] = [],
  ) {}

  async generate(request: AIRequest): Promise<string> {
    if (Buffer.byteLength(request.system) + Buffer.byteLength(request.prompt) > 100_000)
      throw new Error('Apple Foundation Models prompt exceeded the safe command-line size.');
    return runLocalAICommand(
      this.command,
      [...this.prefixArgs, 'respond', '--instructions', request.system, request.prompt],
      undefined,
      request.signal,
      request.timeoutMs,
    );
  }
}

export function runLocalAICommand(
  command: string,
  args: string[],
  input: string | undefined,
  signal?: AbortSignal,
  timeoutMs = 60_000,
  environment?: NodeJS.ProcessEnv,
  cwd?: string,
  maximumOutput = 200_000,
  exitFailure?: (output: string) => Error,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
      reject(new Error('AI request timeout must be between one and one hundred twenty seconds.'));
      return;
    }
    if (signal?.aborted) {
      reject(new DOMException('Generation cancelled.', 'AbortError'));
      return;
    }
    const child = spawn(command, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      ...(environment ? { env: environment } : {}),
      ...(cwd ? { cwd } : {}),
    });
    let output = '';
    let exceeded = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const terminate = () => {
      child.kill();
      forceTimer ??= setTimeout(() => child.kill('SIGKILL'), 2_000);
      forceTimer.unref();
    };
    const abort = terminate;
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (exceeded) return;
      output += chunk;
      if (output.length > maximumOutput) {
        exceeded = true;
        output = '';
        terminate();
      }
    });
    // A CLI can echo prompts, tokens, or local file paths to stderr. Do not retain it in
    // memory or surface it through API errors; this process may be connected to local secrets.
    child.stderr.resume();
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    child.once('error', () => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      signal?.removeEventListener('abort', abort);
      reject(
        new Error('Could not start the configured AI CLI. Confirm it is installed and executable.'),
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new DOMException('Generation cancelled.', 'AbortError'));
      if (timedOut) return reject(new DOMException('AI CLI request timed out.', 'TimeoutError'));
      if (exceeded) return reject(new Error('AI CLI response exceeded the size limit.'));
      if (code !== 0) {
        let failure = new Error(`AI CLI exited with ${code ?? 'no status'}.`);
        if (exitFailure) {
          try {
            failure = exitFailure(output);
          } catch {
            /* Keep the sanitized default. */
          }
        }
        output = '';
        return reject(failure);
      }
      if (!output.trim()) return reject(new Error('AI CLI returned no text.'));
      resolve(output.trim());
    });
    if (input === undefined) child.stdin.end();
    else {
      child.stdin.on('error', () => {
        // A CLI may exit before consuming the full prompt. Its close event reports the outcome.
      });
      child.stdin.end(input);
    }
  });
}
