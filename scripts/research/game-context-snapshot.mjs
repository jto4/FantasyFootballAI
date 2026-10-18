import { readFile, stat } from 'node:fs/promises';
import { usablePregameContext } from '../packages/core/dist/index.js';
const object = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const number = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const text = (x, max) =>
  typeof x === 'string' && x.length > 0 && x.length <= max && !/[\u0000-\u001f]/.test(x);
/** Research-only public snapshots; the HTTP API has no import/tuning route. */
export async function readGameContextSnapshot(path) {
  if ((await stat(path)).size > 20_000_000)
    throw new Error('Public game context snapshot exceeds 20 MB.');
  const games = JSON.parse(await readFile(path, 'utf8'));
  const fields = [
    'id',
    'season',
    'week',
    'seasonType',
    'date',
    'kickoffAt',
    'neutralSite',
    'espnId',
    'home',
    'away',
    'homeScore',
    'awayScore',
    'spreadLine',
    'totalLine',
    'archivedOdds',
    'homeQuarterbackId',
    'awayQuarterbackId',
    'homeQuarterbackName',
    'awayQuarterbackName',
    'stadiumId',
    'stadiumName',
    'pregame',
  ];
  if (
    !Array.isArray(games) ||
    games.length > 10000 ||
    !games.length ||
    games.some(
      (g) =>
        !object(g) ||
        Object.keys(g).some((k) => !fields.includes(k)) ||
        !text(g.id, 80) ||
        !number(g.season, 1990, 2099) ||
        !Number.isInteger(g.season) ||
        !Number.isInteger(g.week) ||
        !number(g.week, 1, 30) ||
        !['REG', 'POST', 'WC', 'DIV', 'CON', 'SB'].includes(g.seasonType) ||
        (g.neutralSite !== undefined && typeof g.neutralSite !== 'boolean') ||
        (g.espnId !== undefined &&
          (typeof g.espnId !== 'string' || !/^[0-9]{9}$/.test(g.espnId))) ||
        !text(g.home, 12) ||
        !text(g.away, 12) ||
        typeof g.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(g.date) ||
        !Number.isFinite(Date.parse(g.date)) ||
        new Date(g.date).toISOString().slice(0, 10) !== g.date ||
        ['homeScore', 'awayScore'].some(
          (k) => g[k] !== undefined && (!number(g[k], 0, 100) || !Number.isInteger(g[k])),
        ) ||
        (g.spreadLine !== undefined && !number(g.spreadLine, -100, 100)) ||
        (g.totalLine !== undefined && !number(g.totalLine, 0, 200)) ||
        (g.kickoffAt !== undefined &&
          (typeof g.kickoffAt !== 'string' ||
            g.kickoffAt.length > 40 ||
            !/(?:Z|[+-]\d\d:\d\d)$/.test(g.kickoffAt) ||
            !Number.isFinite(Date.parse(g.kickoffAt)))) ||
        (g.pregame !== undefined && !usablePregameContext(g)) ||
        ['homeQuarterbackName', 'awayQuarterbackName', 'stadiumName'].some(
          (k) => g[k] !== undefined && !text(g[k], 120),
        ) ||
        ['homeQuarterbackId', 'awayQuarterbackId'].some(
          (k) => g[k] !== undefined && (typeof g[k] !== 'string' || !/^\d{2}-\d{7}$/.test(g[k])),
        ) ||
        (g.stadiumId !== undefined && !text(g.stadiumId, 20)) ||
        (g.archivedOdds !== undefined &&
          (!object(g.archivedOdds) ||
            Object.entries(g.archivedOdds).some(
              ([k, v]) =>
                ![
                  'homeMoneyline',
                  'awayMoneyline',
                  'homeSpreadOdds',
                  'awaySpreadOdds',
                  'overOdds',
                  'underOdds',
                ].includes(k) ||
                !Number.isInteger(v) ||
                !number(Math.abs(v), 100, 100000),
            ))),
    )
  )
    throw new Error('Invalid public game context snapshot.');
  return games;
}
