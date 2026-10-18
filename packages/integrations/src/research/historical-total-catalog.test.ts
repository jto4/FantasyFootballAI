import { expect, it } from 'vitest';
import { normalizeHistoricalTotalCatalog } from './historical-total-catalog.js';
it('normalizes only team-verified literal totals questions and preserves original metadata', () => {
  const r = {
      question: 'ATL vs. NO: Will there be 42 or more combined points scored?',
      description: 'This NFL game between the Atlanta Falcons and New Orleans Saints.',
    },
    event = { slug: 'nfl-week-4-totals', markets: [r] };
  expect(normalizeHistoricalTotalCatalog([event])).toEqual([
    {
      ...event,
      markets: [
        {
          ...r,
          question: 'Will there be 42 or more combined points scored?',
          originalQuestion: r.question,
        },
      ],
    },
  ]);
  for (const changed of [
    { ...r, description: 'This NFL game between the Lions and Saints.' },
    { ...r, question: 'ARCH ' + r.question },
    { ...r, question: 'ATL vs. NO: Will the quarterback throw for 42 yards?' },
  ])
    expect(normalizeHistoricalTotalCatalog([{ ...event, markets: [changed] }])).toEqual([
      { ...event, markets: [changed] },
    ]);
});
