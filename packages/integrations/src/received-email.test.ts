import { describe, expect, it, vi } from 'vitest';
import { getReceivedEmail, listReceivedEmails } from './received-email.js';

const email = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  from: 'League mate <mate@example.com>',
  to: ['league@example.com'],
  subject: 'Week 1',
  created_at: '2026-09-01T12:00:00.000Z',
  message_id: '<abc@example.com>',
};

describe('Resend received-email adapter', () => {
  it('lists bounded metadata from the fixed Resend origin with redirects disabled', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [email] })));
    const result = await listReceivedEmails('secret', fetcher);
    expect(result).toEqual([
      {
        id: email.id,
        from: email.from,
        to: email.to,
        subject: email.subject,
        createdAt: email.created_at,
        messageId: email.message_id,
      },
    ]);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails/receiving?limit=50');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer secret',
    );
  });

  it('retrieves plain text and strips active HTML when only HTML is available', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...email,
          html: '<html><script>ignore()</script><p>Trash talk &amp; fun</p></html>',
        }),
      ),
    );
    const result = await getReceivedEmail('secret', email.id, fetcher);
    expect(result.text).toBe('Trash talk & fun');
  });

  it('rejects invalid IDs before making a request', async () => {
    const fetcher = vi.fn();
    await expect(getReceivedEmail('secret', '../../other-host', fetcher)).rejects.toThrow(
      'Invalid received email ID',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects malformed records and oversized response bodies', async () => {
    await expect(
      listReceivedEmails(
        'secret',
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ data: [{ ...email, id: 'not-an-id' }] })),
          ),
      ),
    ).rejects.toThrow('invalid email record');
    const huge = new Response(' '.repeat(1_000_001));
    await expect(listReceivedEmails('secret', vi.fn().mockResolvedValue(huge))).rejects.toThrow(
      'size limit',
    );
  });

  it('does not retry authentication failures or include provider response details', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('credential detail', { status: 401 }));
    await expect(listReceivedEmails('secret', fetcher)).rejects.toThrow(
      'Provider request failed (401)',
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
