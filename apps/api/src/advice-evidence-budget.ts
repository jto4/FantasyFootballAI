import { maximumAdviceSources } from '@sidekick/core';
import type { AdviceMetric, FootballDataSource, PlayerAdviceEvidence } from '@sidekick/core';

/** Share repeated metadata and caveats in prompts; saved evidence stays self-describing. */
export function compactAdviceEvidence(
  players: PlayerAdviceEvidence[],
  metrics: AdviceMetric[],
  sources: FootballDataSource[],
) {
  const metricNotes: string[] = [];
  const noteIds = new Map<string, number>();
  const metricProfiles: Omit<AdviceMetric, 'id' | 'value' | 'description'>[] = [];
  const profileIds = new Map<string, number>();
  const playerWarningNotes: string[] = [];
  const warningIds = new Map<string, number>();
  const compact = ({ description, id, value, ...metadata }: AdviceMetric) => {
    const key = JSON.stringify(metadata);
    let profile = profileIds.get(key);
    if (profile === undefined) {
      profile = metricProfiles.length;
      profileIds.set(key, profile);
      metricProfiles.push(metadata);
    }
    if (!description) return { id, value, profile };
    let note = noteIds.get(description);
    if (note === undefined) {
      note = metricNotes.length;
      noteIds.set(description, note);
      metricNotes.push(description);
    }
    return { id, value, profile, note };
  };
  return {
    players: players.map(({ warnings, ...player }) => ({
      ...player,
      metrics: player.metrics.map(compact),
      warningNotes: warnings.map((warning) => {
        let note = warningIds.get(warning);
        if (note === undefined) {
          note = playerWarningNotes.length;
          warningIds.set(warning, note);
          playerWarningNotes.push(warning);
        }
        return note;
      }),
    })),
    metrics: metrics.map(compact),
    sources,
    metricNotes,
    metricProfiles,
    playerWarningNotes,
  };
}

/** Decode our own compact prompt for controlled provider fixtures and evaluator checks. */
export function expandCompactAdviceEvidence(input: ReturnType<typeof compactAdviceEvidence>) {
  const expand = ({ profile, note, ...metric }: (typeof input.metrics)[number]): AdviceMetric => ({
    ...metric,
    ...input.metricProfiles[profile]!,
    ...(note === undefined ? {} : { description: input.metricNotes[note]! }),
  });
  return {
    ...input,
    players: input.players.map(({ warningNotes, ...player }) => ({
      ...player,
      metrics: player.metrics.map(expand),
      warnings: warningNotes.map((note) => input.playerWarningNotes[note]!),
    })),
    metrics: input.metrics.map(expand),
  };
}

/** Budget optional detail fairly across players, preserving decision totals and estimate provenance. */
export function budgetAdviceEvidence(
  inputPlayers: PlayerAdviceEvidence[],
  inputMetrics: AdviceMetric[],
  inputSources: FootballDataSource[],
  requiredMetricIds: Set<string>,
) {
  const players = structuredClone(inputPlayers),
    metrics = structuredClone(inputMetrics);
  const playerMetricIds = new Set(
    inputPlayers.flatMap((player) => player.metrics.map((metric) => metric.id)),
  );
  const sourceMap = new Map(inputSources.map((source) => [source.id, source]));
  const fixedSources = inputSources
    .filter(
      (source) =>
        !source.id.startsWith('projection:') &&
        !source.id.startsWith('dst-') &&
        !source.id.startsWith('espn-forecasts-'),
    )
    .map((source) => source.id);
  const sourceClosure = () => {
    const ids = new Set([
      ...fixedSources,
      ...metrics.flatMap((metric) => metric.sourceIds),
      ...players.flatMap((player) => [
        ...(player.draftProfile ? [player.draftProfile.sourceId] : []),
        ...player.projectionSourceIds,
        ...player.metrics.flatMap((metric) => metric.sourceIds),
      ]),
    ]);
    return [...ids].map(
      (id) =>
        sourceMap.get(id) ?? {
          id,
          name: `Unavailable evidence metadata: ${id}`,
          status: 'unavailable' as const,
        },
    );
  };
  const bytes = (value: unknown) =>
    Buffer.byteLength(
      JSON.stringify(value).replace(/[<>&]/g, (character) =>
        character === '<' ? '\\u003c' : character === '>' ? '\\u003e' : '\\u0026',
      ),
      'utf8',
    );
  let omitted = 0;
  const fits = () => {
    const sources = sourceClosure();
    return (
      players.length <= 100 &&
      players.every((player) => player.metrics.length <= 30) &&
      metrics.length <= 500 &&
      sources.length <= maximumAdviceSources &&
      bytes(compactAdviceEvidence(players, metrics, sources)) <= 72_000 &&
      // Include the returned omission count even when optional pruning lands near the limit.
      bytes({ players, metrics, sources, omitted }) <= 145_000
    );
  };
  const protectedMetric = (metric: AdviceMetric) =>
    requiredMetricIds.has(metric.id) ||
    (playerMetricIds.has(metric.id) &&
      /:(sample|projected|baseline|points-mean|source-spread|adp|nfl-draft-(year|round|pick|age)|forecast-(baseline|form|workload|opponent|games|recorded|future|issued-week|passing_yards|passing_tds|carries|rushing_yards|rushing_tds|targets|receptions|receiving_yards|receiving_tds|lower|upper|mae|test-weeks|baseline-mae|candidate-mae))$/.test(
        metric.id,
      ));
  const priority = (metric: AdviceMetric) => {
    if (/:(recent-|change-|recorded-|opponent-)/.test(metric.id)) return 4;
    if (/:(points-sd|baseline-backtest-mae)$/.test(metric.id)) return 3;
    if (metric.id.startsWith('nfl-position:') || metric.id.startsWith('nfl-game:')) return 2;
    return 1;
  };
  if (!fits()) {
    // Remove lowest-value detail in rounds, rather than stripping one player's entire evidence.
    for (const rank of [1, 2, 3, 4]) {
      let changed = true;
      while (changed && !fits()) {
        changed = false;
        for (const list of [metrics, ...players.map((player) => player.metrics)]) {
          let index = list.length - 1;
          while (index >= 0 && (protectedMetric(list[index]!) || priority(list[index]!) !== rank))
            index--;
          if (index < 0) continue;
          list.splice(index, 1);
          omitted++;
          changed = true;
          if (fits()) break;
        }
      }
      if (fits()) break;
    }
  }
  if (!fits())
    throw new Error(
      'Required comparison evidence exceeds the analysis limit. Compare a smaller shortlist or fewer trade players before generating advice.',
    );
  return { players, metrics, sources: sourceClosure(), omitted };
}
