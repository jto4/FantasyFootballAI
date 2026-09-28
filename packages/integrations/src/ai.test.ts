import { afterEach, describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AppleFoundationModelCLIProvider,
  LocalCLIProvider,
  OpenAICompatibleProvider,
  parseCLIArguments,
} from './ai.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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

describe('LocalCLIProvider', () => {
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
