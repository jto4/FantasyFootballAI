import { nflTeamKey, type FootballGame } from '@sidekick/core';
import { csvRecords } from './football-csv.js';
import { readBoundedJson } from './http.js';
import { parseQuarterbackObservations, type QuarterbackObservation } from './game-availability.js';
const ids: Record<string, string> = {
  ARI: '22',
  ATL: '1',
  BAL: '33',
  BUF: '2',
  CAR: '29',
  CHI: '3',
  CIN: '4',
  CLE: '5',
  DAL: '6',
  DEN: '7',
  DET: '8',
  GB: '9',
  HOU: '34',
  IND: '11',
  JAX: '30',
  KC: '12',
  LA: '14',
  LAC: '24',
  LV: '13',
  MIA: '15',
  MIN: '16',
  NE: '17',
  NO: '18',
  NYG: '19',
  NYJ: '20',
  PHI: '21',
  PIT: '23',
  SEA: '26',
  SF: '25',
  TB: '27',
  TEN: '10',
  WAS: '28',
};
const object = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
/** Fixed team endpoint; private provider refs and links are never followed. Current capture is not reconstructed historical evidence. */
export async function fetchCurrentQuarterbacks(
  game: FootballGame,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<QuarterbackObservation[]> {
  const results = await Promise.allSettled(
    [game.home, game.away].map(async (team) => {
      const key = nflTeamKey(team),
        id = ids[key];
      if (!id) return [];
      const r = await fetcher(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/depthcharts`,
        { signal: AbortSignal.timeout(10000), redirect: 'error' },
      );
      if (!r.ok) {
        await r.body?.cancel();
        return [];
      }
      const body = object(await readBoundedJson(r, 750000)),
        observedAt = new Date(now()).toISOString(),
        sourceTeam = object(body.team),
        season = object(body.season);
      if (
        sourceTeam.id !== id ||
        nflTeamKey(String(sourceTeam.abbreviation)) !== key ||
        season.year !== game.season ||
        season.type !== 2 ||
        body.status !== 'success' ||
        !Array.isArray(body.depthchart) ||
        body.depthchart.length > 10
      )
        return [];
      const candidates = body.depthchart.flatMap((raw) => {
        const positions = object(object(raw).positions),
          qb = object(positions.qb),
          position = object(qb.position);
        if (
          position.abbreviation !== 'QB' ||
          !Array.isArray(qb.athletes) ||
          qb.athletes.length < 1 ||
          qb.athletes.length > 10
        )
          return [];
        const a = object(qb.athletes[0]);
        return typeof a.id === 'string' &&
          /^\d{1,10}$/.test(a.id) &&
          typeof a.displayName === 'string' &&
          a.displayName.length <= 120 &&
          a.displayName.length > 0
          ? [{ team: key, name: a.displayName, observedAt }]
          : [];
      });
      return new Set(candidates.map((q) => q.name)).size === 1 ? [candidates[0]!] : [];
    }),
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
/** Stream/filter the large dated depth archive. Retention is bounded independently from transfer; only validated rank-one QB rows survive. */
export async function fetchHistoricalQuarterbacks(
  season: number,
  fetcher: typeof fetch = fetch,
): Promise<QuarterbackObservation[]> {
  if (!Number.isInteger(season) || season < 2025 || season > 2099)
    throw new Error('Dated quarterback archives start in 2025.');
  const r = await fetcher(
    `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_${season}.csv`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error('Dated quarterback archive unavailable.');
  }
  if (Number(r.headers.get('content-length')) > 100_000_000) {
    await r.body?.cancel();
    throw new Error('Quarterback archive exceeds transfer limit.');
  }
  if (!r.body) return [];
  const reader = r.body.getReader(),
    decoder = new TextDecoder(),
    rows: string[] = [];
  let bytes = 0,
    buffer = '',
    record = '',
    header = '';
  const line = (s: string) => {
    record += s + '\n';
    if (record.length > 8192) throw new Error('Quarterback archive record exceeds limit.');
    if ((record.replace(/""/g, '').match(/"/g)?.length ?? 0) % 2) return;
    if (!header) {
      header = record.trimEnd();
      csvRecords(header, ['dt', 'team', 'player_name', 'gsis_id', 'pos_abb', 'pos_rank']);
    } else if (record.includes(',QB,')) {
      const value = csvRecords(header + '\n' + record, [
        'dt',
        'team',
        'player_name',
        'gsis_id',
        'pos_abb',
        'pos_rank',
      ])[0];
      if (value?.pos_abb === 'QB' && value.pos_rank === '1') rows.push(record.trimEnd());
      if (rows.length > 20000) throw new Error('Quarterback archive exceeds row limit.');
    }
    record = '';
  };
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 100_000_000) throw new Error('Quarterback archive exceeds transfer limit.');
      buffer += decoder.decode(part.value, { stream: true });
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, i).replace(/\r$/, ''));
        buffer = buffer.slice(i + 1);
      }
      if (buffer.length > 8192) throw new Error('Quarterback archive line exceeds limit.');
    }
    buffer += decoder.decode();
    if (buffer) line(buffer);
    if (record) throw new Error('Unclosed quarterback archive record.');
    return parseQuarterbackObservations([header, ...rows].join('\n'));
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e;
  } finally {
    reader.releaseLock();
  }
}
