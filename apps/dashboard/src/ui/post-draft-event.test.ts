import { describe, expect, it } from 'vitest';
import { postDraftEventDraft } from './post-draft-event.js';

describe('post-draft calendar suggestions', () => {
  it('creates distinct review and power-ranking events at the suggested time', () => {
    const timing = { date: '2026-08-31', time: '09:00' };

    expect(postDraftEventDraft(timing, 'draft-review')).toEqual({
      title: 'Post-draft review',
      kind: 'draft-review',
      ...timing,
    });
    expect(postDraftEventDraft(timing, 'power-rankings')).toEqual({
      title: 'Post-draft power rankings',
      kind: 'power-rankings',
      ...timing,
    });
  });
});
