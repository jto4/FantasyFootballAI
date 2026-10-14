import { Router } from 'express';
import type { AppSettings, SavedReport } from '@sidekick/core';
import { ImsgClient, resolveImsgExecutable } from '@sidekick/integrations';

export function createImsgRouter({
  settingsSnapshot,
  resolve = resolveImsgExecutable,
  client = (path) => new ImsgClient(path),
  reports = () => [],
}: {
  settingsSnapshot: () => AppSettings;
  resolve?: (path?: string) => Promise<string>;
  client?: (
    path: string,
  ) => Pick<ImsgClient, 'version' | 'chats'> & Partial<Pick<ImsgClient, 'history'>>;
  reports?: () => SavedReport[];
}) {
  const router = Router();
  router.post('/api/imsg/read-test', async (req, res) => {
    const before = settingsSnapshot();
    if (
      !req.body ||
      typeof req.body !== 'object' ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some((k) => !['chatGuid', 'chatId', 'executablePath'].includes(k)) ||
      before.imessageProvider !== 'imsg' ||
      !before.imessageChatGuid ||
      !before.imsgChatId ||
      req.body.chatGuid !== before.imessageChatGuid ||
      req.body.chatId !== before.imsgChatId ||
      (req.body.executablePath || undefined) !== before.imsgExecutablePath
    )
      return res.status(409).json({
        error: 'Save the selected local chat and executable before verifying read access.',
      });
    try {
      const executable = await resolve(before.imsgExecutablePath);
      const unchanged = () => {
        const current = settingsSnapshot();
        return (
          current.imessageProvider === before.imessageProvider &&
          current.imessageChatGuid === before.imessageChatGuid &&
          current.imsgChatId === before.imsgChatId &&
          current.imsgExecutablePath === before.imsgExecutablePath
        );
      };
      if (!unchanged())
        return res.status(409).json({ error: 'The selected chat changed during verification.' });
      const provider = client(executable);
      await provider.version();
      if (!unchanged())
        return res.status(409).json({ error: 'The selected chat changed during verification.' });
      if (!provider.history) throw new Error('Read access is unavailable.');
      // Explicit permission probe: discard message content; no import, AI or delivery is performed.
      await provider.history(before.imessageChatGuid, before.imsgChatId);
      const current = settingsSnapshot();
      if (
        current.imessageProvider !== before.imessageProvider ||
        current.imessageChatGuid !== before.imessageChatGuid ||
        current.imsgChatId !== before.imsgChatId ||
        current.imsgExecutablePath !== before.imsgExecutablePath
      )
        return res.status(409).json({
          error:
            'The selected chat changed during verification. Check the saved configuration again.',
        });
      const acceptedAt = reports()
        .filter(
          (r) =>
            r.deliveryEnvelope?.destination === before.imessageChatGuid &&
            r.deliveryEnvelope?.providerIdentity === `imsg:${executable}`,
        )
        .flatMap((r) => r.deliveryAttempts ?? [])
        .filter(
          (a) =>
            a.channel === 'imessage' &&
            a.status === 'sent' &&
            a.providerMessageId?.startsWith('imsg:'),
        )
        .map((a) => a.finishedAt)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1);
      return res.json({ ok: true, ...(acceptedAt ? { acceptedAt } : {}) });
    } catch {
      return res.status(503).json({
        error:
          'Read access could not be verified. Check Full Disk Access for the actual app or service. No messages were imported or sent.',
      });
    }
  });
  for (const operation of ['status', 'chats'] as const)
    router.post(`/api/imsg/${operation}`, async (req, res) => {
      const input: unknown = req.body;
      if (!input || typeof input !== 'object' || Array.isArray(input))
        return res.status(400).json({ error: 'Provide an imsg configuration object.' });
      const path = (input as { executablePath?: unknown }).executablePath;
      if (
        path !== undefined &&
        (typeof path !== 'string' || path.length > 2000 || /[\u0000-\u001f]/.test(path))
      )
        return res.status(400).json({ error: 'Invalid imsg executable path.' });
      try {
        const executable = await resolve(
          typeof path === 'string' ? path || undefined : settingsSnapshot().imsgExecutablePath,
        );
        const provider = client(executable);
        const version = await provider.version();
        if (operation === 'status') return res.json({ available: true, version });
        // Explicit metadata discovery; no message history is fetched or persisted here.
        return res.json({ chats: await provider.chats() });
      } catch {
        return res.status(503).json({
          available: false,
          error:
            'Local imsg is unavailable. Use macOS with imsg 0.15.10 or later; history needs Full Disk Access for the app or service, and sends need Messages Automation permission.',
        });
      }
    });
  return router;
}
