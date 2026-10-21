import type { NewsItem } from './domain-types.js';
import type {
  AdviceAssessment,
  AdviceMetric,
  AdvicePerceptionEvidence,
  FootballDataSource,
  PlayerAdviceEvidence,
} from './advice-types.js';
import { nflTeamKey } from './advice-math.js';

// Current full names from the NFL team directory. Nicknames alone need football context.
const teamNames: Record<string, string> = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LA: 'Los Angeles Rams',
  LAC: 'Los Angeles Chargers',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
};
const words = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f.'’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const includesPhrase = (text: string, phrase: string) =>
  phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
const freshAt = (date: string | undefined, asOf: number, hours: number) => {
  const time = date ? Date.parse(date) : NaN;
  return Number.isFinite(time) && time <= asOf && asOf - time <= hours * 3_600_000;
};

/** Select current attributed media evidence; never manufacture an overall public sentiment score. */
export function buildAdvicePerception(
  snapshot: { items: NewsItem[]; stale: boolean; refreshedAt?: string; error?: string } | undefined,
  players: PlayerAdviceEvidence[],
  teamCodes: string[],
  sources: FootballDataSource[],
  asOf: string,
  footballFeedContext = false,
) {
  const now = Date.parse(asOf),
    windowHours = 168;
  const checkedAt =
    snapshot?.refreshedAt &&
    snapshot.refreshedAt.length <= 40 &&
    Number.isFinite(Date.parse(snapshot.refreshedAt))
      ? snapshot.refreshedAt
      : undefined;
  const feedStatus = !snapshot
    ? 'unavailable'
    : snapshot.stale || !freshAt(snapshot.refreshedAt, now, 1)
      ? 'stale'
      : 'current';
  const teams = [...new Set(teamCodes.map(nflTeamKey))].filter((team) => teamNames[team]);
  const seen = new Set<string>();
  const news = (snapshot?.items ?? [])
    .flatMap((item) => {
      if (!freshAt(item.publishedAt, now, windowHours)) return [];
      let url: URL;
      try {
        url = new URL(item.url);
      } catch {
        return [];
      }
      if (item.url.length > 2_000 || url.protocol !== 'https:' || url.username || url.password)
        return [];
      url.hash = '';
      for (const name of [...url.searchParams.keys()])
        if (/^utm_|^(fbclid|gclid)$/i.test(name)) url.searchParams.delete(name);
      const text = words(`${item.title} ${item.summary ?? ''}`);
      const playerIds = players
        .filter((player) => {
          const name = words(player.name);
          return name.includes(' ') && includesPhrase(text, name);
        })
        .map((player) => player.id);
      const footballContext =
        footballFeedContext ||
        /\b(?:nfl|football|fantasy|quarterback|receiver|running back|touchdown|practice|injur\w*|roster|coach|defense|offense|kickoff|qb|rb|wr|te)\b/.test(
          text,
        );
      const matchedTeams = teams.filter((team) => {
        const full = words(teamNames[team]!);
        return (
          includesPhrase(text, full) ||
          (footballContext && includesPhrase(text, full.split(' ').at(-1)!))
        );
      });
      if (!playerIds.length && !matchedTeams.length) return [];
      return [{ ...item, canonicalUrl: url.href, playerIds, teamCodes: matchedTeams }];
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.playerIds.length)) - Number(Boolean(a.playerIds.length)) ||
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    )
    .filter((item) => {
      // Retain the newest matching version; syndication does not add independent evidence.
      const titleKey = words(item.title);
      if (seen.has(item.canonicalUrl) || seen.has(titleKey)) return false;
      seen.add(item.canonicalUrl);
      seen.add(titleKey);
      return true;
    })
    .slice(0, 8)
    .map(({ canonicalUrl: _canonicalUrl, ...item }, index) => ({ ...item, id: `news-${index}` }));
  const newsSources: FootballDataSource[] = news.map((item) => ({
    id: item.id,
    name: `${item.source}: ${item.title}`.slice(0, 300),
    url: item.url,
    ...(checkedAt ? { retrievedAt: checkedAt } : {}),
    status: feedStatus === 'current' ? 'available' : 'unavailable',
  }));
  const currentActivity = players.flatMap((player) =>
    player.metrics.filter(
      (metric) =>
        /:market-(adds|drops)$/.test(metric.id) &&
        metric.sourceIds.length > 0 &&
        metric.sourceIds.every((id) =>
          sources.some(
            (source) =>
              source.id === id &&
              source.status === 'available' &&
              freshAt(source.retrievedAt, now, 24),
          ),
        ),
    ),
  );
  const evidence: AdvicePerceptionEvidence = {
    windowHours,
    feedStatus,
    ...(checkedAt ? { checkedAt } : {}),
    headlines: news.map((item) => ({
      sourceId: item.id,
      publishedAt: item.publishedAt,
      playerIds: item.playerIds,
      teamCodes: item.teamCodes,
    })),
    activityMetricIds: currentActivity.map((metric) => metric.id),
  };
  const metrics: AdviceMetric[] = news.length
    ? [
        {
          id: 'perception-headlines',
          label: 'Relevant recent headlines in the selected feeds',
          value: news.length,
          unit: 'headlines',
          sourceIds: news.map((item) => item.id),
          description:
            'Selected recent player/team mentions, limited to eight stories. Deduplicated titles/URLs; publisher count does not prove editorial independence. Not an overall public opinion sample.',
        },
        {
          id: 'perception-publishers',
          label: 'Named publishers among selected relevant headlines',
          value: new Set(news.map((item) => item.source.trim().toLowerCase())).size,
          unit: 'publishers',
          sourceIds: news.map((item) => item.id),
          description:
            'Counts distinct reported publisher names, not independent samples or a representative survey.',
        },
      ]
    : [];
  const warnings = [
    ...(snapshot?.error
      ? [
          'Some configured news feeds failed; available headlines may provide incomplete publisher coverage.',
        ]
      : []),
    ...(feedStatus === 'current'
      ? []
      : [
          'News retrieval is stale or unavailable; cached headlines cannot establish current media tone.',
        ]),
    ...(news.length
      ? []
      : [
          'No recent relevant player/team headlines were found in the selected feed sample. Missing coverage is not neutral or negative sentiment.',
        ]),
  ];
  return { news, sources: newsSources, metrics, evidence, warnings };
}

/** A model must cite current relevant media before assigning a non-unknown media tone. */
export function enforceAdvicePerception(
  assessment: AdviceAssessment,
  evidence: AdvicePerceptionEvidence,
  metrics: AdviceMetric[],
) {
  const answer = structuredClone(assessment);
  const newsIds =
    evidence.feedStatus === 'current'
      ? new Set(evidence.headlines.map((item) => item.sourceId))
      : new Set<string>();
  if (answer.perception.sourceIds.some((id) => newsIds.has(id))) return answer;
  const activities = evidence.activityMetricIds.filter((id) =>
    metrics.some((metric) => metric.id === id),
  );
  answer.perception = {
    tone: 'unknown',
    text: activities.length
      ? 'Current matched Sleeper activity is available, but no current relevant headline was cited. Platform adds and drops are limited behavior proxies; broader public sentiment is unknown.'
      : 'No current relevant media was cited and no current matched platform activity supports this perception claim. Broader public sentiment is unknown.',
    metricIds: activities.slice(0, 12),
    sourceIds: [
      ...new Set(activities.flatMap((id) => metrics.find((metric) => metric.id === id)!.sourceIds)),
    ].slice(0, 12),
  };
  return answer;
}
