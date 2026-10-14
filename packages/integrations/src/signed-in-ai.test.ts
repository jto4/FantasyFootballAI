import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SignedInClaudeConnection, SignedInAIError } from './signed-in-ai.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-signed-in-test-'));
  directories.push(directory);
  const command = join(directory, 'claude');
  const config = join(directory, 'fixture.json');
  const audit = join(directory, 'audit.jsonl');
  const set = (value: Record<string, unknown>) => writeFile(config, JSON.stringify(value));
  await set({
    auth: {
      loggedIn: true,
      authMethod: 'claude.ai',
      email: 'private-account',
      token: 'private-token',
    },
  });
  await writeFile(
    command,
    String.raw`#!${process.execPath}
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(${JSON.stringify(config)}, 'utf8'));
const args = process.argv.slice(2);
const auth = args.includes('auth');
let input = '';
function finish() {
  fs.appendFileSync(${JSON.stringify(audit)}, JSON.stringify({args, input, cwd:process.cwd(), entries:fs.readdirSync('.'), env:{apiKey:process.env.ANTHROPIC_API_KEY, token:process.env.CLAUDE_CODE_OAUTH_TOKEN, cloud:process.env.CLAUDE_CODE_USE_VERTEX, output:process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, effort:process.env.CLAUDE_CODE_EFFORT_LEVEL, retries:process.env.CLAUDE_CODE_MAX_RETRIES}})+'\n');
  if (config.hang) return setInterval(()=>{}, 1000);
  if (auth) { process.stdout.write(config.rawAuth ?? JSON.stringify(config.auth)); process.exit(config.authExit ?? 0); }
  if (config.fail) {process.stderr.write('private provider account detail'); process.exit(2);}
  process.stdout.write(config.rawOutput ?? JSON.stringify({type:'result',subtype:'success',is_error:false,result:config.output ?? '{"ok":true}',usage:config.usage,session_id:'private-fixture-session'}));
  process.exit(config.exit ?? 0);
}
if (auth) finish(); else {process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', finish);}
`,
    { mode: 0o700 },
  );
  return {
    command,
    set,
    rows: async () =>
      (await readFile(audit, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
  };
}

it('does not accept relative executable paths or directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-signed-in-test-'));
  directories.push(directory);
  await mkdir(join(directory, 'claude'));
  expect(await new SignedInClaudeConnection(['claude', join(directory, 'claude')]).status()).toBe(
    'not-installed',
  );
  await expect(new SignedInClaudeConnection([]).provider()).rejects.toThrow('Sign in');
});

// The executable fixture uses a POSIX shebang. Windows native execution remains
// an explicit platform verification gate rather than a shell-based substitute.
describe.skipIf(process.platform === 'win32')('installed signed-in Claude subprocess', () => {
  it('coalesces only pending checks, sanitizes account fields, and rechecks changed login', async () => {
    const f = await fixture();
    const connection = new SignedInClaudeConnection([f.command]);
    expect(
      await Promise.all([connection.status(), connection.status(), connection.status()]),
    ).toEqual(['signed-in', 'signed-in', 'signed-in']);
    expect(await f.rows()).toHaveLength(1);
    await f.set({ auth: { loggedIn: false, authMethod: 'none', email: 'private-account' } });
    expect(await connection.status()).toBe('signed-out');
    await expect(connection.provider()).rejects.toThrow('Sign in');
    const rows = await f.rows();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.args).toEqual(['--safe-mode', '--setting-sources', '', 'auth', 'status']);
      expect(row.input).toBe('');
      expect(row.entries).toEqual([]);
      await expect(stat(row.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });
  it('isolates the tool-free Opus system prompt, subscription routing, budgets and working directory', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'fictional-parent-key');
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'fictional-parent-token');
    vi.stubEnv('CLAUDE_CODE_USE_VERTEX', '1');
    vi.stubEnv('CLAUDE_CODE_MAX_RETRIES', '10');
    const f = await fixture();
    const provider = await new SignedInClaudeConnection([f.command]).provider();
    expect(
      await provider.generate({
        system: 'Fixed football system',
        prompt: 'Fictional evidence',
        reasoningEffort: 'high',
        maxOutputTokens: 8192,
        timeoutMs: 2000,
      }),
    ).toBe('{"ok":true}');
    const [auth, generation] = await f.rows();
    expect(auth.env).not.toHaveProperty('apiKey');
    expect(auth.env).not.toHaveProperty('token');
    expect(generation.env).toEqual({ output: '8192', effort: 'high', retries: '0' });
    expect(generation.args).toEqual([
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
      'Fixed football system',
    ]);
    expect(generation.input).toBe('Fictional evidence');
    expect(generation.cwd).not.toBe(auth.cwd);
    expect(generation.entries).toEqual([]);
    await expect(stat(generation.cwd)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(process.env.ANTHROPIC_API_KEY).toBe('fictional-parent-key');
    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('fictional-parent-token');
    expect(process.env.CLAUDE_CODE_USE_VERTEX).toBe('1');
    expect(process.env.CLAUDE_CODE_MAX_RETRIES).toBe('10');
  });
  it('rejects key/cloud routing, malformed/oversized status and failed generation without leaking stderr', async () => {
    const f = await fixture();
    const connection = new SignedInClaudeConnection([f.command]);
    for (const auth of [
      { loggedIn: true, authMethod: 'api_key' },
      { loggedIn: true, authMethod: 'third_party' },
    ]) {
      await f.set({ auth });
      expect(await connection.status()).toBe('signed-out');
    }
    for (const rawAuth of ['not JSON', 'null', '"signed-in"', 'x'.repeat(17000)]) {
      await f.set({ rawAuth });
      expect(await connection.status()).toBe('unavailable');
    }
    await f.set({ authExit: 1, auth: { loggedIn: false } });
    expect(await connection.status()).toBe('signed-out');
    await f.set({ auth: { loggedIn: true, authMethod: 'claude.ai' }, fail: true });
    const provider = await connection.provider();
    await expect(provider.generate({ system: 'Fixed', prompt: 'Fictional' })).rejects.toThrow(
      'response could not be verified',
    );
    expect((await f.rows()).filter((row) => row.args.includes('--print'))).toHaveLength(1);
  });
  it('rejects native error results even with success subtype and exposes only fixed limit/budget categories', async () => {
    const f = await fixture();
    const provider = await new SignedInClaudeConnection([f.command]).provider();
    for (const exit of [0, 1]) {
      await f.set({
        rawOutput: JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: true,
          result: 'Account private-token reported a limit at a private path.',
          session_id: 'private-session',
        }),
        exit,
      });
      await expect(
        provider.generate({ system: 'Fixed', prompt: 'Fictional' }),
      ).rejects.toMatchObject({
        code: 'limit-reported',
        message:
          'Claude reported a limit. Check availability in the installed Claude CLI before retrying.',
      });
    }
    await f.set({
      rawOutput: JSON.stringify({
        subtype: 'error_max_budget_usd',
        is_error: true,
        errors: ['private-output'],
      }),
      exit: 1,
    });
    await expect(provider.generate({ system: 'Fixed', prompt: 'Fictional' })).rejects.toMatchObject(
      { code: 'budget-reached' },
    );
    for (const rawOutput of [
      '{}',
      'invalid',
      JSON.stringify({ subtype: 'success', result: 'unverified', is_error: 'false' }),
    ]) {
      await f.set({ rawOutput });
      await expect(
        provider.generate({ system: 'Fixed', prompt: 'Fictional' }),
      ).rejects.toBeInstanceOf(SignedInAIError);
    }
  });
  it('retains bounded token counts while discarding native session/model/cost metadata', async () => {
    const f = await fixture();
    const provider = await new SignedInClaudeConnection([f.command]).provider();
    await f.set({
      output: 'Verified fictional answer',
      usage: {
        input_tokens: 5,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 20,
        output_tokens: 30,
      },
    });
    expect(await provider.generateDetailed!({ system: 'Fixed', prompt: 'Fictional' })).toEqual({
      text: 'Verified fictional answer',
      usage: { inputTokens: 125, outputTokens: 30 },
    });
    await f.set({ usage: { input_tokens: 5, output_tokens: 30, cache_read_input_tokens: -1 } });
    expect(await provider.generateDetailed!({ system: 'Fixed', prompt: 'Fictional' })).toEqual({
      text: '{"ok":true}',
    });
  });
  it('terminates a generation at its deadline and respects cancellation', async () => {
    const f = await fixture();
    const provider = await new SignedInClaudeConnection([f.command]).provider();
    await f.set({ hang: true });
    await expect(
      provider.generate({ system: 'Fixed', prompt: 'Fictional', timeoutMs: 1000 }),
    ).rejects.toThrow('timed out');
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.generate({ system: 'Fixed', prompt: 'Fictional', signal: controller.signal }),
    ).rejects.toThrow();
    expect((await f.rows()).filter((row) => row.args.includes('--print'))).toHaveLength(1);
  });
});
