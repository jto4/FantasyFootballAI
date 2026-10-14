import { afterEach, describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AppleFoundationModelCLIProvider,
  LocalCLIProvider,
  ClaudeCLIProvider,
  createLocalCLIProvider,
  OpenAICompatibleProvider,
  parseCLIArguments,
} from './ai.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe('Claude CLI budgets', () => {
  it('sets per-child reasoning/output/retry bounds without changing the parent environment', async () => {
    vi.stubEnv('CLAUDE_CODE_MAX_OUTPUT_TOKENS', '99999');
    vi.stubEnv('CLAUDE_CODE_EFFORT_LEVEL', 'max');
    vi.stubEnv('CLAUDE_CODE_MAX_RETRIES', '10');
    const provider = new ClaudeCLIProvider(process.execPath, [
      '-e',
      'process.stdout.write(JSON.stringify({output:process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,effort:process.env.CLAUDE_CODE_EFFORT_LEVEL,retries:process.env.CLAUDE_CODE_MAX_RETRIES,structured:process.env.MAX_STRUCTURED_OUTPUT_RETRIES}));',
    ]);
    const result = JSON.parse(
      await provider.generate({
        system: 'fictional',
        prompt: 'fictional',
        maxOutputTokens: 8192,
        reasoningEffort: 'high',
      }),
    );
    expect(result).toEqual({ output: '8192', effort: 'high', retries: '0', structured: '1' });
    expect(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('99999');
    expect(process.env.CLAUDE_CODE_EFFORT_LEVEL).toBe('max');
    expect(process.env.CLAUDE_CODE_MAX_RETRIES).toBe('10');
  });
  it('rejects invalid Claude budgets before spawning and limits provider detection to an exact executable name', async () => {
    const provider = new ClaudeCLIProvider('/missing-cli');
    for (const maxOutputTokens of [127, 16385, NaN, 128.5])
      await expect(provider.generate({ system: '', prompt: '', maxOutputTokens })).rejects.toThrow(
        'output limit',
      );
    expect(createLocalCLIProvider('/usr/local/bin/claude').id).toBe('claude-cli');
    expect(createLocalCLIProvider('C:\\Tools\\claude.exe').id).toBe('claude-cli');
    expect(createLocalCLIProvider('claude-wrapper').id).toBe('cli');
    expect(createLocalCLIProvider('codex').id).toBe('cli');
  });
});

describe('parseCLIArguments', () => {
  it('supports quoted paths and empty arguments without shell expansion', () => {
    expect(
      parseCLIArguments(
        '--config "Library/Application Support/ai config.json" --prompt=\'football league\' ""',
      ),
    ).toEqual([
      '--config',
      'Library/Application Support/ai config.json',
      '--prompt=football league',
      '',
    ]);
    expect(parseCLIArguments('$(touch /tmp/should-not-execute) *.json')).toEqual([
      '$(touch',
      '/tmp/should-not-execute)',
      '*.json',
    ]);
    expect(parseCLIArguments('--path "C:\\Program Files\\My AI\\cli.exe"')).toEqual([
      '--path',
      'C:\\Program Files\\My AI\\cli.exe',
    ]);
  });

  it('rejects incomplete quoting and excessive argument counts', () => {
    expect(() => parseCLIArguments('"unterminated')).toThrow('unclosed quote');
    expect(() => parseCLIArguments('argument\\')).toThrow('incomplete escape');
    expect(() => parseCLIArguments(Array.from({ length: 65 }, () => 'x').join(' '))).toThrow(
      'too many values',
    );
  });
});

describe('reasoning requests on the existing connection', () => {
  it('uses compatible reasoning parameters for official models without creating credentials', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'analysis' }],
          },
        ],
      });
    });
    for (const model of ['o3', 'gpt-5-mini', 'gpt-5.4', 'gpt-6.1-sol']) {
      await new OpenAICompatibleProvider('fixture-only', model).generate({
        system: 'system',
        prompt: 'data',
        temperature: 0,
        maxOutputTokens: 16_384,
        reasoningEffort: 'high',
      });
    }
    expect(bodies).toHaveLength(4);
    for (const body of bodies) {
      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(body.max_output_tokens).toBe(16_384);
      expect(body.store).toBe(false);
      expect(body.instructions).toBe('system');
      expect(body.input).toBe('data');
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('max_tokens');
    }
  });
  it('preserves custom endpoint and ordinary-model contracts', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({ choices: [{ message: { content: 'analysis' } }] });
    });
    for (const provider of [
      new OpenAICompatibleProvider('fixture', 'gpt-5.4', 'https://ai.example/v1'),
      new OpenAICompatibleProvider('fixture', 'gpt-4o-mini'),
    ])
      await provider.generate({
        system: 'system',
        prompt: 'data',
        temperature: 0,
        maxOutputTokens: 2_000,
        reasoningEffort: 'high',
      });
    expect(
      bodies.every(
        (body) =>
          body.temperature === 0 && body.max_tokens === 2_000 && !('reasoning_effort' in body),
      ),
    ).toBe(true);
  });
});

describe('Responses API trust boundary', () => {
  const request = {
    system: 'system',
    prompt: 'football evidence',
    reasoningEffort: 'high' as const,
  };
  const message = {
    type: 'message',
    role: 'assistant',
    status: 'completed',
    phase: 'final_answer',
    content: [{ type: 'output_text', text: 'verified final text' }],
  };
  it('retains only final assistant text and bounded usage, including Responses-only models', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) =>
      Response.json({
        status: 'completed',
        output: [
          { type: 'reasoning', summary: [{ text: 'private reasoning' }] },
          {
            ...message,
            phase: 'commentary',
            content: [{ type: 'output_text', text: 'intermediate commentary' }],
          },
          message,
        ],
        usage: { input_tokens: 20, output_tokens: 40 },
      }),
    );
    globalThis.fetch = fetch;
    expect(
      await new OpenAICompatibleProvider('fixture-only', 'gpt-5.4-pro').generateDetailed(request),
    ).toEqual({ text: 'verified final text', usage: { inputTokens: 20, outputTokens: 40 } });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses');
  });
  it('rejects incomplete, refused, malformed or tool-only answers without a second paid request', async () => {
    for (const value of [
      { status: 'incomplete', output: [message] },
      {
        status: 'completed',
        output: [{ ...message, content: [{ type: 'refusal', refusal: 'no' }] }],
      },
      { status: 'completed', output: [{ type: 'function_call', arguments: '{}' }] },
      {
        status: 'completed',
        output: [{ ...message, content: [{ type: 'output_text', text: { private: 'data' } }] }],
      },
      { status: 'completed', output: [{ type: 'reasoning', summary: [{ text: 'not final' }] }] },
    ]) {
      const fetch = vi.fn(async () => Response.json(value));
      globalThis.fetch = fetch;
      await expect(
        new OpenAICompatibleProvider('fixture', 'gpt-6-astra').generate(request),
      ).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
  it('rejects invalid per-call deadlines before contacting a provider', async () => {
    const fetch = vi.fn();
    globalThis.fetch = fetch;
    for (const timeoutMs of [0, 120_001, NaN, 1500.5])
      await expect(
        new OpenAICompatibleProvider('fixture').generate({ ...request, timeoutMs }),
      ).rejects.toThrow('timeout');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('generation cancellation', () => {
  it('passes owner cancellation to API requests while retaining the adapter timeout', async () => {
    const controller = new AbortController();
    let observed: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_input, options) => {
      observed = options?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) =>
        observed!.addEventListener('abort', () => reject(observed!.reason), { once: true }),
      );
    });
    const result = new OpenAICompatibleProvider('fixture-key').generate({
      system: 'private',
      prompt: 'private',
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(observed).not.toBe(controller.signal);
    expect(observed?.aborted).toBe(true);
  });
  it('stops a CLI that ignores ordinary termination and rejects without retaining output', async () => {
    const controller = new AbortController();
    const provider = new LocalCLIProvider(process.execPath, [
      '-e',
      "process.on('SIGTERM',()=>{});setInterval(()=>{},100);process.stdout.write('private-cli-output');",
    ]);
    const result = provider.generate({
      system: 'private',
      prompt: 'private',
      signal: controller.signal,
    });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    controller.abort();
    await rejection;
  }, 5000);
});

describe('LocalCLIProvider', () => {
  it('honors a per-analysis deadline and stops the CLI without exposing partial output', async () => {
    const provider = new LocalCLIProvider(process.execPath, [
      '-e',
      "process.stdout.write('private partial answer');setInterval(()=>{},100);",
    ]);
    await expect(
      provider.generate({ system: 'instructions', prompt: 'fictional data', timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ name: 'TimeoutError', message: 'AI CLI request timed out.' });
  }, 5000);
  it('rejects invalid deadlines before launching a local tool', async () => {
    const provider = new LocalCLIProvider('/nonexistent-evaluation-cli');
    for (const timeoutMs of [0, 999, 120_001, NaN, 1500.5])
      await expect(provider.generate({ system: '', prompt: '', timeoutMs })).rejects.toThrow(
        'request timeout',
      );
  });
  it('passes the prompt over stdin without invoking a shell', async () => {
    const provider = new LocalCLIProvider(process.execPath, [
      '-e',
      "let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>process.stdout.write(input));",
    ]);

    await expect(
      provider.generate({ system: 'system instructions', prompt: 'league update' }),
    ).resolves.toBe('system instructions\n\nleague update');
  });

  it('does not include CLI stderr in errors', async () => {
    const provider = new LocalCLIProvider(process.execPath, [
      '-e',
      "process.stderr.write('sensitive prompt or credential');process.exit(7);",
    ]);

    await expect(provider.generate({ system: 'private', prompt: 'private' })).rejects.toThrow(
      'AI CLI exited with 7.',
    );
    await expect(provider.generate({ system: 'private', prompt: 'private' })).rejects.not.toThrow(
      'sensitive prompt or credential',
    );
  });

  it('reports a missing CLI without disclosing its configured filesystem path', async () => {
    const executable = join(tmpdir(), `private ai runtime ${process.pid}`, 'missing cli');
    const provider = new LocalCLIProvider(executable);
    const generation = provider.generate({ system: 'private', prompt: 'private' });

    await expect(generation).rejects.toThrow(
      'Could not start the configured AI CLI. Confirm it is installed and executable.',
    );
    await expect(generation).rejects.not.toThrow(executable);
  });

  it('rejects an empty CLI response', async () => {
    const provider = new LocalCLIProvider(process.execPath, ['-e', 'process.stdin.resume();']);
    await expect(provider.generate({ system: 'system', prompt: 'prompt' })).rejects.toThrow(
      'AI CLI returned no text.',
    );
  });

  it('rejects oversized output and terminates the child', async () => {
    const provider = new LocalCLIProvider(process.execPath, [
      '-e',
      "process.stdout.write('x'.repeat(200001));",
    ]);
    await expect(provider.generate({ system: 'system', prompt: 'prompt' })).rejects.toThrow(
      'AI CLI response exceeded the size limit.',
    );
  });
});

describe('AppleFoundationModelCLIProvider', () => {
  it('passes instructions and prompt as separate argv values without shell evaluation', async () => {
    const provider = new AppleFoundationModelCLIProvider(process.execPath, [
      '-e',
      'process.stdout.write(JSON.stringify(process.argv.slice(1)))',
    ]);

    await expect(
      provider.generate({
        system: 'Use league stats; ignore $(touch /tmp/no-shell).',
        prompt: 'Write a short update about "Sunday league".',
      }),
    ).resolves.toBe(
      JSON.stringify([
        'respond',
        '--instructions',
        'Use league stats; ignore $(touch /tmp/no-shell).',
        'Write a short update about "Sunday league".',
      ]),
    );
  });
});

describe('OpenAICompatibleProvider model discovery', () => {
  it('sends the selected temperature and output cap with report requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'model-a',
        temperature: 1.2,
        max_tokens: 900,
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'prompt' },
        ],
      });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'report' } }],
          usage: { prompt_tokens: 250, completion_tokens: 80 },
        }),
        { status: 200 },
      );
    });
    globalThis.fetch = fetchMock;
    const provider = new OpenAICompatibleProvider('test-key', 'model-a', 'https://ai.example/v1');

    await expect(
      provider.generateDetailed({
        system: 'system',
        prompt: 'prompt',
        temperature: 1.2,
        maxOutputTokens: 900,
      }),
    ).resolves.toEqual({
      text: 'report',
      usage: { inputTokens: 250, outputTokens: 80 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid generation bounds before making a provider request', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const provider = new OpenAICompatibleProvider('test-key', 'model-a', 'https://ai.example/v1');

    await expect(
      provider.generate({ system: 'system', prompt: 'prompt', temperature: 2.1 }),
    ).rejects.toThrow('AI temperature must be between 0 and 2.');
    await expect(
      provider.generate({ system: 'system', prompt: 'prompt', maxOutputTokens: 17_000 }),
    ).rejects.toThrow('AI output limit must be an integer from 128 to 16,384 tokens.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists unique bounded model IDs from the configured endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'model-z' },
              { id: 'model-a' },
              { id: 'model-z' },
              { id: 'x'.repeat(121) },
            ],
          }),
          { status: 200 },
        ),
    );
    globalThis.fetch = fetchMock;
    const provider = new OpenAICompatibleProvider('test-key', 'model', 'https://ai.example/v1/');

    await expect(provider.listModels()).resolves.toEqual(['model-a', 'model-z']);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai.example/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: 'Bearer test-key', accept: 'application/json' },
      }),
    );
  });

  it('fails when the endpoint does not provide a model list', async () => {
    globalThis.fetch = vi.fn(async () => new Response('unavailable', { status: 404 }));
    const provider = new OpenAICompatibleProvider('test-key', 'model', 'https://ai.example/v1');
    await expect(provider.listModels()).rejects.toThrow('AI model discovery failed (404)');
  });
});
