import { spawn } from 'node:child_process';
import type { AICompletion, AIProvider, AIRequest } from '@sidekick/core';
import { readBoundedJson } from './http.js';

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
    private readonly model = 'gpt-4o-mini',
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
      if (typeof item?.id === 'string' && item.id.length > 0 && item.id.length <= 120)
        models.add(item.id);
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
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(45_000),
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0.8,
        ...(request.maxOutputTokens !== undefined ? { max_tokens: request.maxOutputTokens } : {}),
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`AI provider request failed (${response.status})`);
    const result = await readBoundedJson<{
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    }>(response, 2_000_000);
    const text = result.choices?.[0]?.message?.content;
    if (!text) throw new Error('AI provider returned no text.');
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
    return runCLI(this.command, this.args, `${request.system}\n\n${request.prompt}`);
  }
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
    return runCLI(
      this.command,
      [...this.prefixArgs, 'respond', '--instructions', request.system, request.prompt],
      undefined,
    );
  }
}

function runCLI(command: string, args: string[], input: string | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    let exceeded = false;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
      if (output.length > 200_000) {
        exceeded = true;
        child.kill();
      }
    });
    // A CLI can echo prompts, tokens, or local file paths to stderr. Do not retain it in
    // memory or surface it through API errors; this process may be connected to local secrets.
    child.stderr.resume();
    const timer = setTimeout(() => child.kill(), 60_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not start AI CLI: ${error.message}`));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (exceeded) return reject(new Error('AI CLI response exceeded the size limit.'));
      if (code !== 0) return reject(new Error(`AI CLI exited with ${code ?? 'no status'}.`));
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
