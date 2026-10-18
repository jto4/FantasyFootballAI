import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImsgChannel, ImsgClient, isImsgChatGuid, runImsgCommand } from './imsg.js';
import { DeliveryFailure } from './channels.js';
const guid = 'iMessage;+;chat-fixture';
const metadata = {
  id: 42,
  guid,
  name: 'Fictional league',
  service: 'iMessage',
  account_login: 'private@example.test',
};
const message = {
  chat_id: 42,
  chat_guid: guid,
  guid: 'msg-1',
  text: 'Fictional hello',
  sender: '+15555550123',
  is_from_me: false,
  created_at: '2026-10-13T12:00:00Z',
  attachments: [{ filename: 'private-path' }],
};
describe('local imsg boundary', () => {
  it('returns only bounded chat metadata, excludes SMS and account information', async () => {
    const command = vi.fn(async () =>
      [metadata, { ...metadata, id: 43, service: 'SMS' }]
        .map((row) => JSON.stringify(row))
        .join('\n'),
    );
    expect(await new ImsgClient('/fixture/imsg', command).chats()).toEqual([
      { id: 42, guid, name: 'Fictional league', service: 'iMessage' },
    ]);
    expect(command.mock.calls[0]).toEqual(['/fixture/imsg', ['chats', '--limit', '100', '--json']]);
  });
  it('verifies native ID/GUID before history and rejects mismatched rows without retaining extra data', async () => {
    const command = vi.fn(async (_exe: string, args: string[]) =>
      JSON.stringify(args[0] === 'group' ? metadata : message),
    );
    expect(await new ImsgClient('/fixture/imsg', command).history(guid, 42)).toEqual([
      {
        guid: 'msg-1',
        text: 'Fictional hello',
        author: '+15555550123',
        dateCreated: Date.parse(message.created_at),
        isFromMe: false,
        isAutoReply: false,
        isSystemMessage: false,
        isServiceMessage: false,
      },
    ]);
    command.mockImplementation(async () =>
      JSON.stringify({ ...metadata, guid: 'iMessage;+;other' }),
    );
    await expect(new ImsgClient('/fixture/imsg', command).history(guid, 42)).rejects.toThrow(
      'no longer matches',
    );
    expect(command.mock.calls.at(-1)?.[1][0]).toBe('group');
    for (const row of [
      { ...message, chat_id: 99 },
      { ...message, chat_guid: 'SMS;+;other' },
      { ...message, created_at: 'invalid' },
      { ...message, is_from_me: 'yes' },
      { ...message, text: 'x'.repeat(10001) },
    ]) {
      command.mockImplementation(async (_exe, args) =>
        JSON.stringify(args[0] === 'group' ? metadata : row),
      );
      await expect(new ImsgClient('/fixture/imsg', command).history(guid, 42)).rejects.toThrow(
        'invalid or mismatched',
      );
    }
  });
  it('uses exactly one stable GUID with no SMS fallback and requires a receipt', async () => {
    const command = vi.fn(async (_exe: string, args: string[]) =>
      args[0] === '--version' ? '0.15.10' : JSON.stringify({ status: 'sent', guid: 'receipt-1' }),
    );
    expect(
      await new ImsgChannel('/fixture/imsg', command).send({
        to: guid,
        body: 'Text with $(untrusted)\nemoji 🏈',
      }),
    ).toEqual({ providerMessageId: 'imsg:receipt-1' });
    expect(command.mock.calls[1]).toEqual([
      '/fixture/imsg',
      [
        'send',
        '--chat-guid',
        guid,
        '--text',
        'Text with $(untrusted)\nemoji 🏈',
        '--service',
        'imessage',
        '--no-sms-fallback',
        '--json',
      ],
    ]);
    for (const result of [
      '{"status":"sent"}',
      'private-error',
      '{"status":"failed","guid":"receipt-1"}',
    ]) {
      command.mockImplementation(async (_exe, args) =>
        args[0] === '--version' ? '0.15.10' : result,
      );
      await expect(
        new ImsgChannel('/fixture/imsg', command).send({ to: guid, body: 'hello' }),
      ).rejects.toMatchObject({ outcomeUncertain: true });
    }
    command.mockImplementation(async (_exe, args) => {
      if (args[0] === '--version') return '0.15.10';
      throw new Error('private body and account');
    });
    await expect(
      new ImsgChannel('/fixture/imsg', command).send({ to: guid, body: 'hello' }),
    ).rejects.toMatchObject({
      outcomeUncertain: true,
      message: expect.not.stringContaining('private'),
    });
    await expect(
      new ImsgChannel('/fixture/imsg', command).send({ to: 'SMS;+;chat-fixture', body: 'hello' }),
    ).rejects.toMatchObject({ outcomeUncertain: false });
    expect(isImsgChatGuid('--to other')).toBe(false);
    const oldVersion = vi.fn(async () => '0.15.9');
    await expect(
      new ImsgChannel('/fixture/imsg', oldVersion).send({ to: guid, body: 'hello' }),
    ).rejects.toMatchObject({ outcomeUncertain: false });
    expect(oldVersion).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed, excessive, duplicate and unsupported protocol output', async () => {
    await expect(
      new ImsgClient(
        '/fixture/imsg',
        async () => JSON.stringify(metadata) + '\n'.repeat(1) + JSON.stringify(metadata),
      ).history(guid, 42),
    ).rejects.toThrow('invalid JSON');
    for (const version of ['0.14.0', '0.15.9', 'private-account', '0.15.10\nprivate'])
      await expect(
        new ImsgClient('/fixture/imsg', async () => version).version(),
      ).rejects.toThrow();
    expect(await new ImsgClient('/fixture/imsg', async () => '0.15.10').version()).toBe('0.15.10');
    await expect(
      new ImsgClient('/fixture/imsg', async () =>
        Array(101).fill(JSON.stringify(metadata)).join('\n'),
      ).chats(),
    ).rejects.toThrow('invalid JSON');
    const command = async (_exe: string, args: string[]) =>
      args[0] === 'group'
        ? JSON.stringify(metadata)
        : [message, message].map((row) => JSON.stringify(row)).join('\n');
    await expect(new ImsgClient('/fixture/imsg', command).history(guid, 42)).rejects.toThrow(
      'invalid or mismatched',
    );
  });
});
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
describe.skipIf(process.platform === 'win32')('imsg subprocess', () => {
  it('bounds output and scrubs inherited secrets; cancellation stops native work without raw errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sidekick-imsg-test-'));
    dirs.push(dir);
    const exe = join(dir, 'imsg'),
      audit = join(dir, 'audit.json');
    await writeFile(
      exe,
      `#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync(${JSON.stringify(audit)},JSON.stringify({api:process.env.OPENAI_API_KEY,pipe:process.env.CODEX_APP_TOOLS_PIPE_PATH,args:process.argv.slice(2)}));if(process.argv[2]==='hang'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}else if(process.argv[2]==='large')process.stdout.write('x'.repeat(2000001));else {process.stderr.write('private-account');process.stdout.write('{"status":"sent","guid":"fixture"}');}`,
      { mode: 0o700 },
    );
    vi.stubEnv('OPENAI_API_KEY', 'fictional-secret');
    vi.stubEnv('CODEX_APP_TOOLS_PIPE_PATH', 'fictional-pipe');
    await runImsgCommand(exe, ['send']);
    expect(JSON.parse(await readFile(audit, 'utf8'))).toEqual({ args: ['send'] });
    await expect(runImsgCommand(exe, ['large'])).rejects.toBeInstanceOf(DeliveryFailure);
    const abort = new AbortController();
    const pending = runImsgCommand(exe, ['hang'], abort.signal);
    setTimeout(() => abort.abort(), 100);
    await expect(pending).rejects.toMatchObject({
      outcomeUncertain: true,
      message: expect.not.stringContaining('private'),
    });
  }, 6000);
});

it('supports unified macOS GUIDs only after matching their current iMessage service, never SMS', async () => {
  const target = 'any;-;+15555550123';
  const command = vi.fn(async (_exe: string, args: string[]) =>
    args[0] === '--version'
      ? '0.15.10'
      : args[0] === 'chats'
        ? JSON.stringify({ ...metadata, guid: target })
        : JSON.stringify({ status: 'sent', guid: 'receipt' }),
  );
  const client = new ImsgClient('/fixture/imsg', command);
  expect((await client.chats())[0]?.guid).toBe(target);
  const channel = new ImsgChannel('/fixture/imsg', command);
  expect(await channel.send({ to: target, body: 'Fictional explicit test' })).toEqual({
    providerMessageId: 'imsg:receipt',
  });
  const sent = command.mock.calls.find((c) => c[1][0] === 'send')![1];
  expect(sent).toContain('--no-sms-fallback');
  expect(sent.slice(-4)).toContain('imessage');
  command.mockImplementation(async (_exe, args) =>
    args[0] === '--version'
      ? '0.15.10'
      : JSON.stringify({ ...metadata, guid: target, service: 'SMS' }),
  );
  const count = command.mock.calls.filter((c) => c[1][0] === 'send').length;
  await expect(channel.send({ to: target, body: 'Should not send' })).rejects.toThrow(
    'not a uniquely verified',
  );
  expect(command.mock.calls.filter((c) => c[1][0] === 'send')).toHaveLength(count);
});
