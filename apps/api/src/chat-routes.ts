import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { AIProvider } from '@sidekick/core';
import { SignedInAIError, SignedInCodexError } from '@sidekick/integrations';
import { answerChat, type ChatMessage } from './chat-service.js';
import { settingsForTask, styleInstructions } from './ai-preferences.js';
import type { ChatStore } from './chat-store.js';
import type { LocalStore } from './store.js';

const id = (value: unknown) => typeof value === 'string' && /^[\w:.-]{1,256}$/.test(value);

/**
 * Chat answers from read-only lookups; nothing here sends, bets or writes league data. Progress
 * streams as newline-delimited JSON so the dashboard can show which data is being checked.
 */
export function createChatRouter(deps: {
  store: Pick<LocalStore, 'snapshot'>;
  chats: ChatStore;
  configuredAI: (
    settings: ReturnType<LocalStore['snapshot']>['settings'],
  ) => Promise<AIProvider | null>;
  local: (path: string) => Promise<unknown>;
  now?: () => number;
}) {
  const router = Router();
  const now = deps.now ?? Date.now;
  let running: AbortController | undefined;

  router.get('/api/chat/conversations', (_req, res) => res.json({ items: deps.chats.list() }));
  router.get('/api/chat/conversations/:id', (req, res) => {
    const conversation = id(req.params.id) ? deps.chats.get(req.params.id) : undefined;
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    res.json(conversation);
  });
  router.delete('/api/chat/conversations/:id', (req, res) => {
    if (!id(req.params.id) || !deps.chats.delete(req.params.id))
      return res.status(404).json({ error: 'Conversation not found.' });
    res.status(204).end();
  });
  router.delete('/api/chat/conversations', (_req, res) => {
    deps.chats.clear();
    res.status(204).end();
  });

  router.post('/api/chat', async (req, res) => {
    const body: unknown = req.body;
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (
      Object.keys(input).some(
        (k) => !['conversationId', 'message', 'leagueId', 'teamId', 'page'].includes(k),
      ) ||
      !message ||
      message.length > 2_000 ||
      (input.conversationId !== undefined && !id(input.conversationId)) ||
      (input.leagueId !== undefined && !id(input.leagueId)) ||
      (input.teamId !== undefined && !id(input.teamId)) ||
      (input.page !== undefined && (typeof input.page !== 'string' || input.page.length > 40))
    )
      return res.status(400).json({ error: 'Write a question of up to 2,000 characters.' });
    if (running)
      return res
        .status(409)
        .json({ error: 'Still answering your last question. Give it a moment.' });
    const state = deps.store.snapshot();
    const league = state.leagues.find((l) => l.id === input.leagueId);
    const teamId = league?.teams.some((t) => t.id === input.teamId)
      ? (input.teamId as string)
      : undefined;
    const existing =
      typeof input.conversationId === 'string' ? deps.chats.get(input.conversationId) : undefined;
    if (input.conversationId !== undefined && !existing)
      return res.status(404).json({ error: 'Conversation not found.' });
    let provider: AIProvider | null;
    try {
      provider = await deps.configuredAI(settingsForTask(state.settings, 'chat'));
    } catch {
      provider = null;
    }
    if (!provider)
      return res
        .status(409)
        .json({ error: 'Connect an AI writer in Settings before chatting. I need a brain first.' });

    const controller = new AbortController();
    running = controller;
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    res.status(200).setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    const send = (event: Record<string, unknown>) => res.write(`${JSON.stringify(event)}\n`);
    const at = new Date(now()).toISOString();
    const question: ChatMessage = { role: 'user', text: message, at };
    try {
      const result = await answerChat({
        style: styleInstructions(state.settings.preferences),
        provider,
        question: message,
        history: existing?.messages ?? [],
        ctx: {
          league,
          teamId,
          page: input.page as string | undefined,
          projections: league
            ? state.playerProjections.filter((p) => p.leagueId === league.id)
            : [],
        },
        local: deps.local,
        now: new Date(now()),
        signal: controller.signal,
        onStep: (label) => send({ type: 'step', label }),
      });
      const reply: ChatMessage = {
        role: 'assistant',
        text: result.answer,
        at: new Date(now()).toISOString(),
        ...(result.lookups.length ? { lookups: result.lookups } : {}),
      };
      const conversation = deps.chats.save({
        id: existing?.id ?? randomUUID(),
        title: existing?.title ?? (message.length > 60 ? `${message.slice(0, 57)}…` : message),
        ...((existing?.leagueId ?? league?.id)
          ? { leagueId: existing?.leagueId ?? league!.id }
          : {}),
        createdAt: existing?.createdAt ?? at,
        updatedAt: reply.at,
        messages: [...(existing?.messages ?? []), question, reply],
      });
      send({ type: 'done', conversation });
    } catch (error) {
      if (!controller.signal.aborted)
        send({
          type: 'error',
          error:
            error instanceof SignedInCodexError || error instanceof SignedInAIError
              ? error.message
              : 'The AI didn’t answer. Check the AI connection in Settings and try again.',
        });
    } finally {
      running = undefined;
      res.end();
    }
  });
  return router;
}
