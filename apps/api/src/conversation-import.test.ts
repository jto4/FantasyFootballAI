import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  mergeConversationImport,
  parseConversation,
  pruneConversationImports,
} from './conversation-import.js';

describe('conversation imports', () => {
  it('merges explicit profile source blocks idempotently and prunes each block by import date', () => {
    const input = {
      digest: 'a'.repeat(64),
      importedAt: '2026-09-01T00:00:00.000Z',
      sourceName: 'thread.eml',
      memberName: 'Alex',
      messages: 'I am starting the rookie over my first round pick.',
    };
    const first = mergeConversationImport('', input);
    expect(first.added).toBe(true);
    expect(mergeConversationImport(first.sourceText, input)).toEqual({
      sourceText: first.sourceText,
      added: false,
    });
    const newer = mergeConversationImport(first.sourceText, {
      ...input,
      digest: 'b'.repeat(64),
      importedAt: '2026-09-25T00:00:00.000Z',
      sourceName: 'follow-up.txt',
    });
    const pruned = pruneConversationImports(
      newer.sourceText,
      input.importedAt,
      Date.parse('2026-09-20T00:00:00.000Z'),
    );
    expect(pruned.removed).toBe(1);
    expect(pruned.sourceText).toContain('follow-up.txt');
    expect(pruned.sourceText).not.toContain('thread.eml');
  });

  it('groups structured JSON messages by author and keeps only each author’s messages', () => {
    expect(
      parseConversation(
        JSON.stringify([
          { author: { username: 'Alex' }, content: 'First message', timestamp: '2026-09-01' },
          { author: 'Blair', text: 'Second message' },
          { author: 'Alex', text: 'Third message' },
        ]),
        'Fallback',
      ),
    ).toEqual([
      {
        name: 'Alex',
        messages: [
          { author: 'Alex', text: 'First message', timestamp: '2026-09-01' },
          { author: 'Alex', text: 'Third message' },
        ],
      },
      { name: 'Blair', messages: [{ author: 'Blair', text: 'Second message' }] },
    ]);
  });

  it('parses quoted CSV fields and ignores incomplete message rows', () => {
    expect(
      parseConversation(
        'sender,message,date\nAlex,"Trade, anyone?",today\n,missing name,today',
        'Fallback',
      ),
    ).toEqual([
      { name: 'Alex', messages: [{ author: 'Alex', text: 'Trade, anyone?', timestamp: 'today' }] },
    ]);
  });

  it('groups labeled text and uses the fallback name for an unlabeled archive', () => {
    expect(
      parseConversation('Alex: Go Lions\nBlair: No chance', 'Fallback').map((m) => m.name),
    ).toEqual(['Alex', 'Blair']);
    expect(parseConversation('A plain conversation export', 'Fallback')).toEqual([
      { name: 'Fallback', messages: [{ author: 'Fallback', text: 'A plain conversation export' }] },
    ]);
  });

  it('keeps an email reply and excludes quoted history from the sender profile', () => {
    const email = [
      'From: Alex Manager <alex@example.test>',
      'To: league@example.test',
      'Subject: Sunday trade',
      '',
      'I accept the trade. My roster is unstoppable now.',
      '',
      'On Tuesday, Blair wrote:',
      '> You offered me a backup kicker for my RB1.',
    ].join('\r\n');
    expect(parseConversation(email, 'Fallback')).toEqual([
      {
        name: 'Alex Manager',
        messages: [
          { author: 'Alex Manager', text: 'I accept the trade. My roster is unstoppable now.' },
        ],
      },
    ]);
  });

  it('imports an email thread export with its sender and sent time', () => {
    const email = readFileSync(
      new URL('./fixtures/email-client-thread.eml', import.meta.url),
      'utf8',
    );
    expect(parseConversation(email, 'Fallback')).toEqual([
      {
        name: 'Alex Manager',
        messages: [
          {
            author: 'Alex Manager',
            text: 'I accept the trade. My roster is unstoppable now.',
            timestamp: '2026-09-24T19:30:00.000Z',
          },
        ],
      },
    ]);
  });

  it('imports Twilio CSV history without learning the service number as a member', () => {
    const csv = readFileSync(new URL('./fixtures/twilio-messages.csv', import.meta.url), 'utf8');
    expect(parseConversation(csv, 'My League Team')).toEqual([
      {
        name: '+15555550111',
        messages: [
          {
            author: '+15555550111',
            text: 'That lineup decision is bold.',
            timestamp: '2026-09-20T14:15:00Z',
          },
        ],
      },
      {
        name: 'My League Team',
        messages: [
          {
            author: 'My League Team',
            text: 'I trust the process.',
            timestamp: '2026-09-20T14:18:00Z',
          },
        ],
      },
      {
        name: '+15555550112',
        messages: [
          {
            author: '+15555550112',
            text: 'You trusted it last week too.',
            timestamp: '2026-09-20T14:22:00Z',
          },
        ],
      },
    ]);
  });

  it('imports BlueBubbles message responses using participant addresses and the owner fallback', () => {
    const exportData = {
      status: 200,
      data: [
        {
          guid: 'message-1',
          text: 'I am starting the rookie over my first round pick.',
          handle: { address: '+15555550123' },
          isFromMe: false,
          dateCreated: 1_758_000_000_000,
        },
        {
          guid: 'message-2',
          text: 'Bold move for a Tuesday.',
          handle: null,
          isFromMe: true,
          dateCreated: 1_758_000_060_000,
        },
      ],
    };
    expect(parseConversation(JSON.stringify(exportData), 'My League Team')).toEqual([
      {
        name: '+15555550123',
        messages: [
          {
            author: '+15555550123',
            text: 'I am starting the rookie over my first round pick.',
            timestamp: '1758000000000',
          },
        ],
      },
      {
        name: 'My League Team',
        messages: [
          {
            author: 'My League Team',
            text: 'Bold move for a Tuesday.',
            timestamp: '1758000060000',
          },
        ],
      },
    ]);
  });

  it('does not produce a profile for empty or non-message JSON input', () => {
    expect(parseConversation('{"unrelated":true}', 'Fallback')).toEqual([]);
    expect(parseConversation('  ', 'Fallback')).toEqual([]);
  });
});
