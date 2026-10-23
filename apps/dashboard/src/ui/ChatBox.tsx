import { useEffect, useRef, useState } from 'react';
import { History, Plus, Send, Square, Trash2, X } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';
import {
  deleteChat,
  listChats,
  loadChat,
  sendChat,
  type ChatConversation,
  type ChatSummary,
} from './chat-client';
import { formatDateTime } from './date-format';
import './chat.css';
import { formatElapsed, useElapsed } from './WaitStatus';

const starters: Record<string, string[]> = {
  Live: [
    'How’s my matchup looking?',
    'Who still has to play on both sides?',
    'What do I need from my remaining starters?',
  ],
  Advice: [
    'Who should I start at FLEX this week?',
    'Is there a trade that helps both me and someone else?',
    'Which waiver pickup helps my lineup most?',
    'What are the strongest prop leans this week?',
  ],
};
const defaultStarters = [
  'Who should I start this week?',
  'Any waiver pickups worth a claim?',
  'Who’s the biggest fraud in the league?',
  'Best prices for this week’s games?',
];

/**
 * Chat about the league, NFL news and betting prices. It only reads data; actions stay on the
 * pages that already confirm them. The panel and the Ask page share this component.
 */
export function ChatBox({
  variant,
  leagueId,
  teamId,
  page,
  onClose,
}: {
  variant: 'panel' | 'page';
  leagueId: string | undefined;
  teamId: string | undefined;
  page: string;
  onClose?: () => void;
}) {
  const [conversation, setConversation] = useState<ChatConversation>();
  const [history, setHistory] = useState<ChatSummary[]>([]);
  const [showHistory, setShowHistory] = useState(variant === 'page');
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string>();
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState('');
  const controller = useRef<AbortController>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const refreshHistory = () =>
    listChats()
      .then(setHistory)
      .catch(() => undefined);
  useEffect(() => {
    void refreshHistory();
    field.current?.focus();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [conversation, pending, steps]);

  async function ask(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setPending(message);
    setSteps([]);
    setError('');
    setInput('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const next = await sendChat(
        {
          message,
          page,
          ...(conversation ? { conversationId: conversation.id } : {}),
          ...(leagueId ? { leagueId } : {}),
          ...(teamId ? { teamId } : {}),
        },
        (label) => setSteps((current) => [...current, label]),
        abort.signal,
      );
      setConversation(next);
      void refreshHistory();
    } catch (failure) {
      if (!abort.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'The AI didn’t answer.');
        setInput(message);
      }
    } finally {
      setPending(undefined);
      setSteps([]);
      field.current?.focus();
    }
  }
  function stop() {
    controller.current?.abort();
  }
  function startNew() {
    stop();
    setConversation(undefined);
    setError('');
    if (variant === 'panel') setShowHistory(false);
    field.current?.focus();
  }
  async function open(id: string) {
    try {
      setConversation(await loadChat(id));
      setError('');
      if (variant === 'panel') setShowHistory(false);
    } catch {
      setError('That conversation couldn’t be opened.');
    }
  }
  async function remove(id: string) {
    try {
      await deleteChat(id);
      if (conversation?.id === id) setConversation(undefined);
      await refreshHistory();
    } catch {
      setError('That conversation couldn’t be deleted.');
    }
  }

  const messages = conversation?.messages ?? [];
  return (
    <section className={`chat chat-${variant}`} aria-label="Ask Sidekick">
      <header className="chat-head">
        <div>
          <strong>Ask Sidekick</strong>
          <small>Your league, NFL news and betting prices</small>
        </div>
        <div className="chat-head-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="New chat"
            title="New chat"
            onClick={startNew}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
          {variant === 'panel' && (
            <button
              type="button"
              className="icon-button"
              aria-label="Chat history"
              aria-pressed={showHistory}
              title="Chat history"
              onClick={() => setShowHistory((value) => !value)}
            >
              <History size={16} aria-hidden="true" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="icon-button"
              aria-label="Close chat"
              title="Close chat (⌘J)"
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      <div className="chat-body">
        {showHistory && (
          <nav className="chat-history" aria-label="Saved chats">
            {history.length ? (
              <ul>
                {history.map((item) => (
                  <li key={item.id} className={item.id === conversation?.id ? 'active' : ''}>
                    <button type="button" onClick={() => void open(item.id)}>
                      <span>{item.title}</span>
                      <small>{formatDateTime(item.updatedAt)}</small>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete chat: ${item.title}`}
                      title="Delete chat"
                      onClick={() => void remove(item.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No saved chats yet.</p>
            )}
          </nav>
        )}
        <div className="chat-main">
          <div className="chat-log" ref={log} role="log" aria-live="polite" aria-label="Chat">
            {!messages.length && !pending && (
              <div className="chat-empty">
                <p>
                  Ask about your lineup, the standings, waiver pickups, NFL news or this week’s
                  lines. I look the numbers up before I talk trash.
                </p>
                <div className="chat-starters">
                  {(starters[page] ?? defaultStarters).map((text) => (
                    <button key={text} type="button" onClick={() => void ask(text)}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <article key={index} className={`chat-message ${message.role}`}>
                {message.role === 'assistant' ? (
                  <ChatMarkdown text={message.text} />
                ) : (
                  <p>{message.text}</p>
                )}
                {!!message.lookups?.length && (
                  <small className="chat-sources">
                    Checked:{' '}
                    {message.lookups
                      .map((l) => (l.ok ? l.label : `${l.label} (unavailable)`))
                      .join(' · ')}
                  </small>
                )}
              </article>
            ))}
            {pending && (
              <>
                <article className="chat-message user">
                  <p>{pending}</p>
                </article>
                <article className="chat-message assistant thinking" aria-busy="true">
                  <p>
                    {steps.length ? `${steps[steps.length - 1]}…` : 'Thinking…'}
                    <ThinkingTime />
                  </p>
                  {steps.length > 1 && (
                    <small className="chat-sources">{steps.slice(0, -1).join(' · ')}</small>
                  )}
                </article>
              </>
            )}
          </div>
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
          <form
            className="chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(input);
            }}
          >
            <textarea
              ref={field}
              rows={2}
              maxLength={2000}
              value={input}
              placeholder="Ask about your team, the league, news or lines…"
              aria-label="Message"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void ask(input);
                }
              }}
            />
            {pending ? (
              <button type="button" className="icon-button" aria-label="Stop" onClick={stop}>
                <Square size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                className="icon-button primary"
                aria-label="Send"
                disabled={!input.trim()}
              >
                <Send size={16} aria-hidden="true" />
              </button>
            )}
          </form>
          <small className="chat-note">
            Uses your league data and can still be wrong. Betting answers are research only.
          </small>
        </div>
      </div>
    </section>
  );
}

/** Elapsed time on the thinking bubble; signed-in CLI rounds can take tens of seconds each. */
function ThinkingTime() {
  const seconds = useElapsed();
  return seconds >= 3 ? (
    <span className="chat-elapsed" aria-hidden="true">
      {' '}
      {formatElapsed(seconds)}
    </span>
  ) : null;
}
