import {
  type FootballDataSnapshot,
  type FootballGame,
  usablePregameContext,
  nflTeamKey,
} from '@sidekick/core';
import {
  fetchNFLInjuryReports,
  type NFLInjuryReportRow,
  type NFLInjuryReportSnapshot,
} from './injuries.js';
import { fetchDatedGameInjuries } from './game-injuries.js';
import { fetchCurrentQuarterbacks, fetchHistoricalQuarterbacks } from './game-quarterbacks.js';
import { buildPregameAvailability, type QuarterbackObservation } from './game-availability.js';
import { fetchGameWeather, parseGameWeather, weatherVenue } from './game-weather.js';
import {
  fetchPersonnelSeason,
  addPregamePersonnel,
  preparePersonnelEvidence,
  type PersonnelPerformance,
  type PersonnelSnaps,
} from './game-personnel.js';
import { fetchOfficialGameInjuries, officialInjuriesForGame } from './official-game-injuries.js';
export interface PregameEvidenceProvider {
  history(
    data: FootballDataSnapshot,
    asOf: string,
    signal?: AbortSignal,
  ): Promise<FootballDataSnapshot>;
  current(
    game: FootballGame,
    data: FootballDataSnapshot,
    injuries: NFLInjuryReportSnapshot | undefined,
    signal?: AbortSignal,
  ): Promise<FootballGame>;
}
export class PublicPregameEvidence implements PregameEvidenceProvider {
  private readonly researchPersonnelHistory: boolean;
  private cache = new Map<
    string,
    {
      until: number;
      builtAt: number;
      contexts: Map<string, NonNullable<FootballGame['pregame']>>;
      sources: FootballDataSnapshot['sources'];
      warnings: string[];
    }
  >();
  private pending = new Map<string, Promise<FootballDataSnapshot>>();
  private personnel = new Map<
    number,
    { until: number; builtAt: number; performance: PersonnelPerformance[]; snaps: PersonnelSnaps[] }
  >();
  constructor(
    private fetcher: typeof fetch = fetch,
    private now: () => number = Date.now,
    options: { researchPersonnelHistory?: boolean } = {},
  ) {
    this.researchPersonnelHistory = options.researchPersonnelHistory === true;
  }
  private boundedFetcher(signal?: AbortSignal): typeof fetch {
    const deadline = AbortSignal.timeout(60000);
    return (input, init) =>
      this.fetcher(input, {
        ...init,
        signal: AbortSignal.any([
          deadline,
          ...(signal ? [signal] : []),
          ...(init?.signal ? [init.signal] : []),
        ]),
      });
  }
  private async personnelSeason(season: number, fetcher: typeof fetch) {
    const cached = this.personnel.get(season);
    if (cached && cached.until > this.now() && cached.builtAt <= this.now()) return cached;
    const loaded = await fetchPersonnelSeason(season, fetcher);
    if (loaded.performance.length || loaded.snaps.length) {
      this.personnel.set(season, {
        ...loaded,
        until: this.now() + 6 * 3600000,
        builtAt: this.now(),
      });
      while (this.personnel.size > 3) this.personnel.delete(this.personnel.keys().next().value!);
    }
    return loaded;
  }
  private officialMonths(season: number, asOf: string) {
    return [9, 10, 11, 12, 1].filter(
      (month) => Date.UTC(month === 1 ? season + 1 : season, month - 1, 1) <= Date.parse(asOf),
    );
  }
  async history(
    data: FootballDataSnapshot,
    asOf: string,
    signal?: AbortSignal,
  ): Promise<FootballDataSnapshot> {
    signal?.throwIfAborted();
    if (
      !Number.isInteger(data.season) ||
      data.season < 2016 ||
      data.season > 2099 ||
      data.games.length > 10000
    )
      throw new Error('Bounded NFL history required.');
    const key = JSON.stringify([
      data.season,
      asOf.slice(0, 10),
      data.games.map((g) => [
        g.id,
        g.season,
        g.week,
        g.date,
        g.kickoffAt,
        g.home,
        g.away,
        g.homeScore,
        g.awayScore,
        g.homeQuarterbackId,
        g.awayQuarterbackId,
        g.homeQuarterbackName,
        g.awayQuarterbackName,
        g.stadiumId,
        g.stadiumName,
      ]),
    ]);
    const cached = this.cache.get(key);
    if (cached && cached.until > this.now() && cached.builtAt <= this.now())
      return {
        ...data,
        games: data.games.map((g) => ({
          ...g,
          ...(cached.contexts.has(g.id)
            ? { pregame: structuredClone(cached.contexts.get(g.id)!) }
            : {}),
        })),
        sources: [...data.sources, ...cached.sources],
        warnings: [...data.warnings, ...cached.warnings],
      };
    const pending = this.pending.get(key);
    if (pending) {
      await pending;
      signal?.throwIfAborted();
      return this.history(data, asOf, signal);
    }
    const request = this.loadHistory(data, asOf, this.boundedFetcher(signal))
      .then((result) => {
        signal?.throwIfAborted();
        this.cache.set(key, {
          until: this.now() + 6 * 3600000,
          builtAt: this.now(),
          contexts: new Map(
            result.games.flatMap((g) => (g.pregame ? [[g.id, g.pregame] as const] : [])),
          ),
          sources: result.sources.filter((s) => s.id.startsWith('game-context-')),
          warnings: result.warnings.slice(data.warnings.length),
        });
        while (this.cache.size > 2) this.cache.delete(this.cache.keys().next().value!);
        return structuredClone(result);
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
  private async loadHistory(data: FootballDataSnapshot, asOf: string, fetcher: typeof fetch) {
    const result = {
        ...data,
        games: data.games.map((g) => ({ ...g })),
        sources: [...data.sources],
        warnings: [...data.warnings],
      },
      reports: NFLInjuryReportRow[] = [],
      qbs: QuarterbackObservation[] = [],
      performance: PersonnelPerformance[] = [],
      snaps: PersonnelSnaps[] = [];
    const years = Array.from(
      { length: Math.min(12, Math.max(0, data.season - 2016 + 1)) },
      (_, i) => data.season - i,
    );
    const loads = await Promise.allSettled(
      years.map((year) => fetchNFLInjuryReports(year, fetcher)),
    );
    loads.forEach((r, i) => {
      if (r.status === 'fulfilled') reports.push(...r.value);
      result.sources.push({
        id: `game-context-injuries-${years[i]}`,
        name: `NFL injury archive ${years[i]} (date coverage varies)`,
        status: r.status === 'fulfilled' ? 'available' : 'unavailable',
        ...(r.status === 'fulfilled' ? { retrievedAt: new Date(this.now()).toISOString() } : {}),
        url: `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${years[i]}.csv`,
      });
    });
    let personnelIndex = 0;
    const loadPersonnel = async () => {
      for (;;) {
        const year = [...years].reverse()[personnelIndex++];
        if (year === undefined) return;
        try {
          const loaded = await this.personnelSeason(year, fetcher);
          performance.push(...loaded.performance);
          snaps.push(...loaded.snaps);
          result.sources.push({
            id: `game-context-personnel-${year}`,
            name: `Earlier-game QB performance and snap roles ${year}`,
            status: loaded.performance.length && loaded.snaps.length ? 'available' : 'unavailable',
            retrievedAt: new Date(this.now()).toISOString(),
            url: 'https://github.com/nflverse/nflverse-data',
          });
        } catch {
          result.warnings.push(`Personnel performance/snap history ${year} is unavailable.`);
        }
      }
    };
    // Rejected historical role corrections do not justify bulk downloads on live requests.
    // Current descriptive roles load only the two relevant seasons in current().
    if (this.researchPersonnelHistory) await Promise.all([loadPersonnel(), loadPersonnel()]);
    const official = [];
    for (const year of years.filter((y) => y >= 2025).reverse()) {
      const loaded = await fetchOfficialGameInjuries(
        year,
        this.officialMonths(year, asOf),
        fetcher,
      ).catch(() => {
        result.warnings.push(`Official NFL injury history ${year} is unavailable.`);
        return [];
      });
      official.push(...loaded);
      result.sources.push({
        id: `game-context-official-injuries-${year}`,
        name: `Dated official NFL injury articles ${year} (partial pregame coverage)`,
        status: loaded.length ? 'available' : 'unavailable',
        retrievedAt: new Date(this.now()).toISOString(),
        url: 'https://www.nfl.com/news/',
      });
    }
    for (const year of years.filter((y) => y >= 2025)) {
      try {
        qbs.push(...(await fetchHistoricalQuarterbacks(year, fetcher)));
        result.sources.push({
          id: `game-context-quarterbacks-${year}`,
          name: `Dated NFL quarterback charts ${year}`,
          status: 'available',
          retrievedAt: new Date(this.now()).toISOString(),
          url: `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_${year}.csv`,
        });
      } catch {
        result.sources.push({
          id: `game-context-quarterbacks-${year}`,
          name: `Dated NFL quarterback charts ${year}`,
          status: 'unavailable',
          url: `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_${year}.csv`,
        });
        result.warnings.push(
          `Dated ${year} quarterback changes are unavailable; they were not reconstructed from target starters.`,
        );
      }
    }
    const targets = result.games.filter(
      (g) =>
        g.season >= 2016 &&
        g.season <= data.season &&
        g.date < asOf.slice(0, 10) &&
        g.seasonType === 'REG' &&
        g.kickoffAt &&
        Date.parse(g.kickoffAt) < Date.parse(asOf),
    );
    const personnelEvidence = this.researchPersonnelHistory
      ? preparePersonnelEvidence(result.games, performance, snaps)
      : undefined;
    for (const g of targets) {
      const officialRows = officialInjuriesForGame(
        official,
        g,
        new Date(Date.parse(g.kickoffAt!) - 1000).toISOString(),
      );
      const selectedReports = [
        ...reports.filter(
          (r) =>
            r.season === g.season &&
            r.week === g.week &&
            !officialRows.some((o) => o.team === nflTeamKey(r.team)),
        ),
        ...officialRows,
      ];
      g.pregame = buildPregameAvailability(
        g,
        result.games,
        selectedReports,
        qbs,
        new Date(Date.parse(g.kickoffAt!) - 1000).toISOString(),
      );
      for (const side of ['home', 'away'] as const) {
        const provenance = officialRows.find(
          (r) => r.team === nflTeamKey(g[side]) && r.updatedAt === g.pregame![side].reportUpdatedAt,
        );
        if (provenance) {
          g.pregame[side].reportSource = 'nfl-official';
          if (provenance.sourceUrl) g.pregame[side].reportUrl = provenance.sourceUrl;
        }
      }
      const updated = personnelEvidence
        ? addPregamePersonnel(
            g,
            result.games,
            selectedReports,
            performance,
            snaps,
            personnelEvidence,
          )
        : g;
      g.pregame = updated.pregame!;
    }
    const seen = new Set<string>(),
      venues = targets.filter(
        (g) =>
          g.season >= 2018 && weatherVenue(g) && !seen.has(g.stadiumId!) && seen.add(g.stadiumId!),
      );
    let index = 0,
      weatherGames = 0;
    const work = async () => {
      for (;;) {
        const game = venues[index++];
        if (!game) return;
        try {
          const raw = await fetchGameWeather(
            game,
            `${Math.max(2018, data.season - 8)}-09-01`,
            asOf.slice(0, 10),
            fetcher,
          );
          for (const g of targets.filter(
            (g) => g.stadiumId === game.stadiumId && g.season >= 2018,
          )) {
            const weather = parseGameWeather(raw, g, g.pregame!.asOf);
            if (weather) {
              g.pregame!.weather = weather;
              weatherGames++;
            }
          }
        } catch {
          result.warnings.push(`Weather forecast history for ${game.stadiumId} is unavailable.`);
        }
      }
    };
    await Promise.all([work(), work()]);
    result.sources.push({
      id: 'game-context-weather',
      name: 'Open-Meteo JMA GSM 48-hour-lead regional forecasts',
      status: weatherGames ? 'available' : 'unavailable',
      url: 'https://open-meteo.com/en/docs/previous-runs-api',
      ...(weatherGames ? { retrievedAt: new Date(this.now()).toISOString() } : {}),
    });
    return result;
  }
  async current(
    game: FootballGame,
    data: FootballDataSnapshot,
    injuries: NFLInjuryReportSnapshot | undefined,
    signal?: AbortSignal,
  ): Promise<FootballGame> {
    const fetcher = this.boundedFetcher(signal);
    const utcDay = game.kickoffAt ? new Date(game.kickoffAt).toISOString().slice(0, 10) : game.date;
    const [qbs, weather, datedInjuries, official, personnel] = await Promise.allSettled([
      fetchCurrentQuarterbacks(game, fetcher, this.now),
      fetchGameWeather(game, utcDay, utcDay, fetcher),
      fetchDatedGameInjuries(game, fetcher, this.now),
      fetchOfficialGameInjuries(
        game.season,
        this.officialMonths(game.season, new Date(this.now()).toISOString()).slice(-2),
        fetcher,
      ),
      Promise.all(
        [game.season - 1, game.season].map((year) => this.personnelSeason(year, fetcher)),
      ),
    ]);
    signal?.throwIfAborted();
    const retrieved = Date.parse(injuries?.retrievedAt ?? '');
    const currentReports =
      Number.isFinite(retrieved) && retrieved <= this.now() && this.now() - retrieved <= 86400000
        ? injuries!.rows
        : [];
    const selections = [game.home, game.away].map((team) => {
      const key = nflTeamKey(team),
        officialRows =
          official.status === 'fulfilled'
            ? officialInjuriesForGame(
                official.value,
                game,
                new Date(this.now()).toISOString(),
              ).filter((r) => r.team === key)
            : [],
        rows = currentReports.filter(
          (r) =>
            r.season === game.season &&
            r.week === game.week &&
            r.seasonType === 'REG' &&
            nflTeamKey(r.team) === key &&
            r.updatedAt &&
            Date.parse(r.updatedAt) <= this.now() &&
            Date.parse(r.updatedAt) >= Date.parse(game.kickoffAt!) - 7 * 86400000,
        );
      return officialRows.length
        ? { rows: officialRows, source: 'nfl-official' as const }
        : rows.length
          ? { rows, source: 'nflverse' as const }
          : {
              rows:
                datedInjuries.status === 'fulfilled'
                  ? datedInjuries.value.filter((r) => nflTeamKey(r.team) === key)
                  : [],
              source: 'espn' as const,
            };
    });
    const asOf = new Date(this.now()).toISOString(),
      p = buildPregameAvailability(
        game,
        data.games,
        selections.flatMap((s) => s.rows),
        qbs.status === 'fulfilled' ? qbs.value : [],
        asOf,
      );
    if (p.home.reportUpdatedAt) p.home.reportSource = selections[0]!.source;
    if (p.away.reportUpdatedAt) p.away.reportSource = selections[1]!.source;
    for (const [side, selection] of [
      ['home', selections[0]!],
      ['away', selections[1]!],
    ] as const) {
      const url = selection.rows.find((r) => r.updatedAt === p[side].reportUpdatedAt)?.sourceUrl;
      if (selection.source === 'nfl-official' && url) p[side].reportUrl = url;
    }
    if (weather.status === 'fulfilled') {
      const w = parseGameWeather(weather.value, game, asOf);
      if (w) p.weather = w;
    }
    let target = { ...game, pregame: p };
    if (personnel.status === 'fulfilled')
      target = addPregamePersonnel(
        target,
        data.games,
        selections.flatMap((s) => s.rows),
        personnel.value.flatMap((s) => s.performance),
        personnel.value.flatMap((s) => s.snaps),
      ) as typeof target;
    return usablePregameContext(target, asOf) ? target : game;
  }
}
