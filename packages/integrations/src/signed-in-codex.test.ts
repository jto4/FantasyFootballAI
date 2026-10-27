import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isolatedCodexLaunch,
  SignedInCodexConnection,
  SignedInCodexError,
} from './signed-in-codex.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sidekick-codex-test-'));
  directories.push(directory);
  const command = join(directory, 'codex'),
    config = join(directory, 'config.json'),
    audit = join(directory, 'audit.jsonl');
  const set = (row: Record<string, unknown>) => writeFile(config, JSON.stringify(row));
  await set({});
  await writeFile(
    command,
    String.raw`#!${process.execPath}
const fs=require('node:fs');const row=JSON.parse(fs.readFileSync(${JSON.stringify(config)},'utf8'));
const args=process.argv.slice(2);let input='';
function finish(){
const instructions=args.find(a=>a.startsWith('model_instructions_file='));
let globalBlocked; if(row.probeGlobal){try{fs.readFileSync(process.env.CODEX_HOME+'/AGENTS.md','utf8');globalBlocked=false;}catch(e){globalBlocked=e.code==='EPERM'||e.code==='EACCES';}}
fs.appendFileSync(${JSON.stringify(audit)},JSON.stringify({globalBlocked,args,input,cwd:process.cwd(),entries:fs.readdirSync('.'),system:instructions?fs.readFileSync(JSON.parse(instructions.split('=').slice(1).join('=')),'utf8'):undefined,env:{apiKey:process.env.OPENAI_API_KEY,pipe:process.env.CODEX_APP_TOOLS_PIPE_PATH,thread:process.env.CODEX_THREAD_ID,home:process.env.CODEX_HOME}})+'\n');
if(args.includes('--version')){process.stdout.write(row.version??'codex-cli 0.162.0-alpha.2');return;}
if(args.includes('login')){process.stderr.write(row.auth??'Logged in using ChatGPT');process.exitCode=row.authExit??0;return;}
if(row.hang){setInterval(()=>{},1000);return;}
if(row.stderr)process.stderr.write(row.stderr);
process.stdout.write(row.output??[
...(row.denialNotice?[{type:'item.completed',item:{type:'error',message:'Failed to read global AGENTS.md instructions from '+String.fromCharCode(96)+fs.realpathSync(process.env.CODEX_HOME)+'/AGENTS.md'+String.fromCharCode(96)+': Operation not permitted (os error 1)'}}]:[]),
{type:'thread.started',thread_id:'private-session'},
{type:'turn.started'},
{type:'item.completed',item:{type:'reasoning',text:'private-reasoning'}},
{type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}},
{type:'turn.completed',usage:{input_tokens:10,output_tokens:20,cached_input_tokens:5}}
].map(e=>JSON.stringify(e)).join('\n'));
process.exitCode=row.exit??0;
}
process.stdin.setEncoding('utf8');process.stdin.on('data',c=>input+=c);process.stdin.on('end',finish);
`,
    { mode: 0o700 },
  );
  const home = join(directory, 'native-home');
  await mkdir(join(home, 'skills'), { recursive: true });
  vi.stubEnv('CODEX_HOME', home);
  return {
    directory,
    command,
    home,
    set,
    rows: async () =>
      (await readFile(audit, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
  };
}
it('rejects relative executables and missing installs', async () => {
  expect(await new SignedInCodexConnection(['codex']).status()).toBe('not-installed');
  await expect(new SignedInCodexConnection([]).provider()).rejects.toThrow('supported Codex');
});
describe.skipIf(process.platform === 'win32')('signed-in Codex native protocol', () => {
  it('coalesces availability checks, requires the verified version and existing ChatGPT login', async () => {
    const f = await fixture(),
      connection = new SignedInCodexConnection([f.command]);
    expect(await Promise.all([connection.status(), connection.status()])).toEqual([
      'signed-in',
      'signed-in',
    ]);
    expect(await f.rows()).toHaveLength(2);
    for (const row of [
      { auth: 'Not logged in', authExit: 1 },
      { auth: 'Logged in using an API key - private-key' },
      { auth: 'private-account detail' },
      { auth: 'x'.repeat(17000) },
      { version: 'codex-cli future-version' },
      { version: 'codex-cli 0.162.0-alpha.17.1' },
      { version: 'codex-cli 0.162.0-alpha.17.3' },
      { version: 'codex-cli 0.162.0-alpha.18' },
    ]) {
      await f.set(row);
      expect(await connection.status()).toBe(
        row.auth?.startsWith('Not logged') || row.auth?.startsWith('Logged in using an API key')
          ? 'signed-out'
          : 'unavailable',
      );
    }
    await f.set({ version: 'codex-cli 0.162.0-alpha.18' });
    await expect(connection.provider()).rejects.toMatchObject({
      code: 'unsupported-cli',
      installedVersion: 'codex-cli 0.162.0-alpha.18',
      message: expect.stringContaining('ChatGPT updated its Codex to 0.162.0-alpha.18'),
    });
    await f.set({});
    expect(await connection.status()).toBe('signed-in');
    for (const row of await f.rows())
      await expect(stat(row.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('isolates canonical skills, tools, environment and system instructions; retains only final text and safe usage', async () => {
    const f = await fixture();
    const skill = join(f.directory, 'external-skill');
    await mkdir(skill);
    await writeFile(join(skill, 'SKILL.md'), 'Private instructions that must not be opened');
    await symlink(skill, join(f.home, 'skills', 'alias'));
    await symlink(skill, join(skill, 'cycle'));
    vi.stubEnv('OPENAI_API_KEY', 'parent-secret');
    vi.stubEnv('CODEX_APP_TOOLS_PIPE_PATH', 'parent-pipe');
    vi.stubEnv('CODEX_THREAD_ID', 'parent-thread');
    const provider = await new SignedInCodexConnection([f.command]).provider();
    expect(
      await provider.generateDetailed!({
        system: 'Football rules',
        prompt: 'Fictional evidence',
        timeoutMs: 2000,
      }),
    ).toEqual({ text: '{"ok":true}', usage: { inputTokens: 10, outputTokens: 20 } });
    const generation = (await f.rows()).find((row) => row.args.includes('exec'));
    expect(generation.input).toBe('Fictional evidence');
    expect(generation.system).toBe('Football rules');
    expect(generation.entries).toEqual(['instructions.txt']);
    expect(generation.env).toEqual({ home: f.home });
    expect(generation.args).toEqual(
      expect.arrayContaining([
        '--ignore-user-config',
        '--ignore-rules',
        '--ephemeral',
        '--skip-git-repo-check',
        'read-only',
        'gpt-6.1-sol',
        '--json',
        'model_reasoning_effort="high"',
        'web_search="disabled"',
        'project_doc_max_bytes=0',
        'history.persistence="none"',
        'features.skip_host_skill_discovery=true',
      ]),
    );
    const skills = generation.args.find((arg: string) => arg.startsWith('skills.config='));
    expect(skills).toContain(`{path=${JSON.stringify(await realpath(skill))},enabled=false}`);
    expect(skills).toContain(JSON.stringify(await realpath(join(skill, 'SKILL.md'))));
    for (const flag of [
      'apps',
      'shell_tool',
      'unified_exec',
      'browser_use',
      'computer_use',
      'plugins',
      'hooks',
      'skill_search',
      'code_mode_host',
      'multi_agent',
      'memories',
    ]) {
      const index = generation.args.indexOf(flag);
      expect(generation.args[index - 1]).toBe('--disable');
    }
    await expect(stat(generation.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(process.env.OPENAI_API_KEY).toBe('parent-secret');
  });
  it.skipIf(process.platform !== 'darwin')(
    'supports the captured new protocol while blocking global instructions at the OS boundary',
    async () => {
      const f = await fixture();
      const target = join(f.directory, 'private-instructions.md');
      await writeFile(target, 'Private instructions that must never reach the model');
      await symlink(target, join(f.home, 'AGENTS.md'));
      await f.set({
        version: 'codex-cli 0.162.0-alpha.17.2',
        probeGlobal: true,
        denialNotice: true,
      });
      const connection = new SignedInCodexConnection([f.command]);
      expect(await connection.status()).toBe('signed-in');
      const provider = await connection.provider();
      expect(await provider.generate({ system: 'Rules', prompt: 'Fictional' })).toBe('{"ok":true}');
      const generation = (await f.rows()).find((row) => row.args.includes('exec'));
      expect(generation.globalBlocked).toBe(true);
      expect(generation.env.home).toBe(f.home);
      expect(generation.entries.sort()).toEqual(['instructions.txt', 'model-catalog.json']);
      expect(generation.system).toBe('Rules');
      expect(generation.args).toEqual(
        expect.arrayContaining([
          '--no-daemon',
          'skills.include_instructions=false',
          'orchestrator.mcp.enabled=false',
          'orchestrator.skills.enabled=false',
          'agents.enabled=false',
          'tools.experimental_request_user_input.enabled=false',
          'include_environment_context=false',
          'include_apps_instructions=false',
          'include_collaboration_mode_instructions=false',
        ]),
      );
      expect(await readFile(target, 'utf8')).toBe(
        'Private instructions that must never reach the model',
      );
      await expect(stat(generation.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
      const notice = `Failed to read global AGENTS.md instructions from \`${await realpath(f.home)}/AGENTS.md\`: Operation not permitted (os error 1)`;
      for (const events of [
        [
          {
            type: 'item.completed',
            item: { type: 'error', message: notice.replace('AGENTS.md`:', 'other.md`:') },
          },
        ],
        [
          { type: 'turn.started' },
          { type: 'item.completed', item: { type: 'error', message: notice } },
        ],
      ]) {
        await f.set({
          version: 'codex-cli 0.162.0-alpha.17.2',
          output: events.map((e) => JSON.stringify(e)).join('\n'),
        });
        await expect(
          provider.generate({ system: 'Rules', prompt: 'Fictional' }),
        ).rejects.toMatchObject({ code: 'invalid-response', protocolFailure: 'native-item-error' });
      }
      vi.stubEnv('CODEX_HOME', 'relative-home');
      await expect(
        isolatedCodexLaunch(f.command, [], 'codex-cli 0.162.0-alpha.17.2'),
      ).rejects.toMatchObject({ code: 'isolation-unavailable' });
      await expect(
        isolatedCodexLaunch(f.command, [], 'codex-cli future-version'),
      ).rejects.toMatchObject({ code: 'unsupported-cli' });
    },
  );
  it('fails closed when skill isolation is incomplete or the executable changes version', async () => {
    const f = await fixture(),
      provider = await new SignedInCodexConnection([f.command]).provider();
    await symlink(join(f.directory, 'missing'), join(f.home, 'skills', 'broken'));
    await expect(provider.generate({ system: 'Rules', prompt: 'Fictional' })).rejects.toMatchObject(
      { code: 'isolation-unavailable' },
    );
    expect((await f.rows()).filter((row) => row.args.includes('exec'))).toHaveLength(0);
    await f.set({ version: 'codex-cli future-version' });
    // The message names the installed version and the way out, without paths or output.
    await expect(provider.generate({ system: 'Rules', prompt: 'Fictional' })).rejects.toMatchObject(
      {
        code: 'unsupported-cli',
        installedVersion: 'codex-cli future-version',
        message: expect.stringContaining('ChatGPT updated its Codex to future-version'),
      },
    );
  });
  it('rejects missing completion, duplicate answers, tool execution, native failure and malformed streams without private output', async () => {
    const f = await fixture(),
      provider = await new SignedInCodexConnection([f.command]).provider();
    const start = { type: 'turn.started' },
      answer = { type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true}' } },
      end = { type: 'turn.completed' };
    for (const [events, protocolFailure] of [
      [[start, answer], 'missing-final'],
      [[start, answer, answer, end], 'multiple-answers'],
      [
        [start, { type: 'item.completed', item: { type: 'command_execution' } }, answer, end],
        'unexpected-item',
      ],
      [
        [
          { type: 'item.completed', item: { type: 'error', message: 'private account error' } },
          start,
          answer,
          end,
        ],
        'native-item-error',
      ],
    ] as const) {
      await f.set({ output: events.map((e) => JSON.stringify(e)).join('\n') });
      await expect(
        provider.generate({ system: 'Rules', prompt: 'Fictional' }),
      ).rejects.toMatchObject({ code: 'invalid-response', protocolFailure });
    }
    for (const output of [
      'private output',
      'x'.repeat(201000),
      JSON.stringify({ type: 'turn.failed', error: { message: 'private account limit reached' } }),
    ]) {
      await f.set({ output, exit: 1, stderr: 'private-account-token' });
      const error = await provider
        .generate({ system: 'Rules', prompt: 'Fictional' })
        .catch((error) => error);
      expect(error.message).not.toContain('private');
      expect(error.message).not.toContain('token');
    }
    await f.set({
      output: JSON.stringify({ type: 'turn.failed', error: { message: 'private limit reached' } }),
      exit: 1,
    });
    await expect(provider.generate({ system: 'Rules', prompt: 'Fictional' })).rejects.toEqual(
      new SignedInCodexError('limit-reported'),
    );
  });
  it.each([
    'codex-cli 0.162.0-alpha.2',
    ...(process.platform === 'darwin' ? ['codex-cli 0.162.0-alpha.17.2'] : []),
  ])('honors cancellation and deadlines and cleans up owned files for %s', async (version) => {
    const f = await fixture(),
      provider = await new SignedInCodexConnection([f.command]).provider();
    await f.set({ version, hang: true });
    const controller = new AbortController();
    const pending = provider.generate({
      system: 'Rules',
      prompt: 'Fictional',
      signal: controller.signal,
      timeoutMs: 2000,
    });
    setTimeout(() => controller.abort(), 150);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      provider.generate({ system: 'Rules', prompt: 'Fictional', timeoutMs: 1000 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    for (const row of await f.rows())
      await expect(stat(row.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
