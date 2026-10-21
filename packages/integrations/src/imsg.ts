import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { MessageChannel, OutboundMessage } from '@sidekick/core';
import { DeliveryFailure, type BlueBubblesMessage } from './channels.js';

export interface ImsgChat {
  id: number;
  guid: string;
  name: string;
  service: 'iMessage';
}
export function isImsgChatGuid(value: unknown): value is string {
  return (
    typeof value === 'string' && /^(?:iMessage|any);[+-];[^\s\u0000-\u001f]{1,450}$/.test(value)
  );
}
export async function resolveImsgExecutable(configured?: string): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('Local imsg requires macOS.');
  const paths = configured ? [configured] : ['/opt/homebrew/bin/imsg', '/usr/local/bin/imsg'];
  for (const path of paths) {
    if (!isAbsolute(path) || path.length > 2000 || /[\u0000-\u001f]/.test(path)) continue;
    try {
      await access(path, constants.X_OK);
      if ((await stat(path)).isFile()) return await realpath(path);
    } catch {
      /* Try the next conventional install location. */
    }
  }
  throw new Error('Install imsg on this Mac or configure its absolute executable path.');
}
export type ImsgCommand = (
  executable: string,
  args: string[],
  signal?: AbortSignal,
) => Promise<string>;
/** Never retain native stderr: it may include message text, handles, or account details. */
export const runImsgCommand: ImsgCommand = (executable, args, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Cancelled.', 'AbortError'));
      return;
    }
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (/^(OPENAI_|CODEX_|CHATGPT_|ACCESS_TOKEN)/.test(key)) delete env[key];
    const child = spawn(executable, args, {
      shell: false,
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '',
      exceeded = false,
      timedOut = false,
      started = false;
    let force: ReturnType<typeof setTimeout> | undefined;
    const kill = (sig: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {
        /* Already exited. */
      }
    };
    const stop = () => {
      kill('SIGTERM');
      force ??= setTimeout(() => kill('SIGKILL'), 2000);
      force.unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, 30000);
    signal?.addEventListener('abort', stop, { once: true });
    child.once('spawn', () => {
      started = true;
    });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      if (exceeded) return;
      output += chunk;
      if (Buffer.byteLength(output) > 2_000_000) {
        exceeded = true;
        output = '';
        stop();
      }
    });
    child.stderr.resume();
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(force);
      signal?.removeEventListener('abort', stop);
    };
    child.once('error', () => {
      cleanup();
      output = '';
      reject(
        new DeliveryFailure(
          'Could not start imsg. Check its installation and macOS permissions.',
          started,
        ),
      );
    });
    child.once('close', (code) => {
      cleanup();
      if (signal?.aborted || timedOut || exceeded || code !== 0) {
        output = '';
        reject(
          new DeliveryFailure(
            'imsg did not return a verified result. Check Messages before retrying a send.',
            started,
          ),
        );
      } else resolve(output.trim());
    });
  });
function rows(output: string, maximum: number): Record<string, unknown>[] {
  try {
    const lines = output.split('\n').filter((line) => line.trim());
    if (lines.length > maximum) throw new Error();
    return lines.map((line) => {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value as Record<string, unknown>;
    });
  } catch {
    throw new Error('imsg returned invalid JSON data.');
  }
}
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max && !value.includes('\0');
const chatId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function chat(row: Record<string, unknown>): ImsgChat {
  if (
    !chatId(row.id) ||
    !isImsgChatGuid(row.guid) ||
    row.service !== 'iMessage' ||
    !text(row.name, 500)
  )
    throw new Error('imsg returned an invalid iMessage chat.');
  return { id: row.id, guid: row.guid, name: row.name, service: 'iMessage' };
}
export class ImsgClient {
  constructor(
    readonly executable: string,
    private readonly command: ImsgCommand = runImsgCommand,
  ) {
    if (!isAbsolute(executable) || /[\u0000-\u001f]/.test(executable))
      throw new Error('An absolute imsg executable is required.');
  }
  async version(): Promise<string> {
    const output = await this.command(this.executable, ['--version']);
    if (!/^\d+\.\d+\.\d+$/.test(output) || output.length > 100)
      throw new Error('The imsg version could not be verified.');
    const [major = 0, minor = 0, patch = 0] = output.split('.').map(Number);
    if (major === 0 && (minor < 15 || (minor === 15 && patch < 10)))
      throw new Error('imsg 0.15.10 or later is required.');
    return output;
  }
  async chats(): Promise<ImsgChat[]> {
    const result = rows(
      await this.command(this.executable, ['chats', '--limit', '100', '--json']),
      100,
    );
    return result.filter((row) => row.service === 'iMessage').map(chat);
  }
  async history(guid: string, id: number, signal?: AbortSignal): Promise<BlueBubblesMessage[]> {
    if (!isImsgChatGuid(guid) || !chatId(id))
      throw new Error('Choose a valid iMessage chat GUID and local chat ID.');
    const groups = rows(
      await this.command(this.executable, ['group', '--chat-id', String(id), '--json'], signal),
      1,
    );
    if (groups.length !== 1 || chat(groups[0]!).guid !== guid || groups[0]!.id !== id)
      throw new Error(
        'The local chat ID no longer matches the selected iMessage GUID. Choose the chat again.',
      );
    const result = rows(
      await this.command(
        this.executable,
        ['history', '--chat-id', String(id), '--limit', '200', '--json'],
        signal,
      ),
      200,
    );
    const seen = new Set<string>();
    return result
      .map((row) => {
        const date = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN;
        if (
          row.chat_id !== id ||
          row.chat_guid !== guid ||
          !text(row.guid, 500) ||
          !row.guid ||
          seen.has(row.guid) ||
          !text(row.text, 10000) ||
          !text(row.sender, 500) ||
          typeof row.is_from_me !== 'boolean' ||
          !Number.isFinite(date) ||
          date < 0
        )
          throw new Error('imsg returned invalid or mismatched chat history.');
        seen.add(row.guid);
        // Strip attachments, account routing, participants, reactions and other native metadata.
        return {
          guid: row.guid,
          text: row.text,
          dateCreated: date,
          isFromMe: row.is_from_me,
          isAutoReply: false,
          isSystemMessage: row.is_system_message === true,
          isServiceMessage: row.is_service_message === true,
          ...(row.sender ? { author: row.sender } : {}),
        };
      })
      .filter((message) => Boolean(message.text.trim()));
  }
}
export class ImsgChannel implements MessageChannel {
  readonly id = 'imsg';
  constructor(
    private readonly executable: string,
    private readonly command: ImsgCommand = runImsgCommand,
  ) {}
  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    if (
      !isAbsolute(this.executable) ||
      !isImsgChatGuid(message.to) ||
      !message.body.trim() ||
      message.body.length > 10000 ||
      message.body.includes('\0')
    )
      throw new DeliveryFailure(
        'A valid imsg executable, iMessage GUID and bounded message are required.',
        false,
      );
    try {
      await new ImsgClient(this.executable, this.command).version();
    } catch {
      throw new DeliveryFailure(
        'Check the imsg installation and supported version before sending.',
        false,
      );
    }
    // Unified macOS GUIDs do not encode service. Verify the current native service
    // before allowing any; routing, rather than interpreting it as an SMS-capable target.
    if (message.to.startsWith('any;')) {
      let matches: ImsgChat[];
      try {
        matches = (await new ImsgClient(this.executable, this.command).chats()).filter(
          (c) => c.guid === message.to,
        );
      } catch {
        throw new DeliveryFailure(
          'The native iMessage service could not be verified. Refresh conversations before sending.',
          false,
        );
      }
      if (matches.length !== 1)
        throw new DeliveryFailure(
          'This unified chat is not a uniquely verified iMessage conversation. No message was sent.',
          false,
        );
    }
    let output: string;
    try {
      output = await this.command(this.executable, [
        'send',
        '--chat-guid',
        message.to,
        '--text',
        message.body,
        '--service',
        'imessage',
        '--no-sms-fallback',
        '--json',
      ]);
    } catch (error) {
      if (error instanceof DeliveryFailure) throw error;
      throw new DeliveryFailure(
        'imsg send could not be verified. Check Messages before retrying.',
        true,
      );
    }
    try {
      const result = rows(output, 1);
      if (result.length !== 1 || result[0]!.status !== 'sent') throw new Error();
      const guid = result[0]!.guid ?? result[0]!.message_id;
      if (!text(guid, 500) || !guid) throw new Error();
      return { providerMessageId: `imsg:${guid}` };
    } catch {
      throw new DeliveryFailure(
        'imsg returned no verified message receipt. Check Messages before retrying.',
        true,
      );
    }
  }
}
