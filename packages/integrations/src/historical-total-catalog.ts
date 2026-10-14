/** Some Week 4 archives prefix the literal threshold question with team codes.
 * Strip only a verified identity prefix; keep ARCH and all other title variants unavailable.
 * Original question remains in the evidence catalog. Settlement rules are still validated
 * by the frozen historical adapter against both scheduled teams and kickoff time.
 */
export function normalizeHistoricalTotalCatalog(events: unknown[]): unknown[] {
  const names: Record<string, string> = {
    ATL: 'Falcons',
    NO: 'Saints',
    HOU: 'Texans',
    JAX: 'Jaguars',
    CLE: 'Browns',
    LV: 'Raiders',
    BAL: 'Ravens',
    BUF: 'Bills',
    ARI: 'Cardinals',
    CAR: 'Panthers',
    CHI: 'Bears',
    CIN: 'Bengals',
    DAL: 'Cowboys',
    DEN: 'Broncos',
    DET: 'Lions',
    GB: 'Packers',
    IND: 'Colts',
    KC: 'Chiefs',
    LA: 'Rams',
    LAR: 'Rams',
    LAC: 'Chargers',
    LAS: 'Raiders',
    MIA: 'Dolphins',
    MIN: 'Vikings',
    NE: 'Patriots',
    NYG: 'Giants',
    NYJ: 'Jets',
    PHI: 'Eagles',
    PIT: 'Steelers',
    SEA: 'Seahawks',
    SF: '49ers',
    TB: 'Buccaneers',
    TEN: 'Titans',
    WAS: 'Commanders',
    WSH: 'Commanders',
  };
  if (events.length > 5000) throw new Error('Oversized historical catalog.');
  return events.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid historical event.');
    const event = value as Record<string, unknown>;
    if (!Array.isArray(event.markets) || event.markets.length > 1000)
      throw new Error('Invalid historical markets.');
    return {
      ...event,
      markets: event.markets.map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('Invalid historical market.');
        const r = value as Record<string, unknown>,
          m =
            typeof r.question === 'string'
              ? r.question.match(
                  /^([A-Z]{2,3}) vs\. ([A-Z]{2,3}): (Will there be \d{1,3} or more combined points scored\?)$/,
                )
              : undefined;
        if (
          !m ||
          typeof r.description !== 'string' ||
          !names[m[1]!] ||
          !names[m[2]!] ||
          !r.description.includes(names[m[1]!]!) ||
          !r.description.includes(names[m[2]!]!)
        )
          return r;
        return { ...r, question: m[3], originalQuestion: r.question };
      }),
    };
  });
}
