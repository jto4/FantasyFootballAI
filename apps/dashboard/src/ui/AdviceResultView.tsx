import {
  renderAdviceStatement,
  type AdviceMetric,
  type AdviceResult,
  type AdviceStatement,
  type LineupEstimate,
} from '@sidekick/core';
import { formatDateTime } from './date-format';
import { adviceTitle } from './advice-navigation';
import { DataReadiness } from './DataReadiness';

const verdictNames = {
  recommend: 'Recommended',
  lean: 'Tentative choice',
  hold: 'Hold off',
  insufficient: 'More evidence needed',
};
const number = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

export function AdviceResultView({ result }: { result: AdviceResult }) {
  const metrics = [...result.metrics, ...result.players.flatMap((player) => player.metrics)];
  const sources = new Map(result.sources.map((source) => [source.id, source]));
  const playerNames = new Map(result.players.map((player) => [player.id, player.name]));
  const changeIds =
    result.request.mode === 'lineup'
      ? [result.startSit ? 'start-sit-selection-change' : 'lineup-selection-change', 'lineup-gain']
      : result.request.mode === 'trade'
        ? ['trade-gain']
        : result.request.mode === 'waivers'
          ? (result.assessment.recommendedPlayerIds.length
              ? result.assessment.recommendedPlayerIds
              : result.request.candidateIds?.length === 1
                ? result.request.candidateIds
                : []
            ).map((id) => `${id}:waiver-gain`)
          : [];
  const recordedStarters = result.metrics.find((m) => m.id === 'lineup-current');
  const comparedWaiverGains =
    result.request.mode === 'waivers' &&
    result.request.dropPlayerId &&
    result.assessment.verdict === 'hold'
      ? (result.request.candidateIds ?? []).flatMap((id) => {
          const metric = result.metrics.find((m) => m.id === `${id}:waiver-gain`);
          return metric ? [metric] : [];
        })
      : [];
  const bestComparedWaiverGain = comparedWaiverGains.reduce<AdviceMetric | undefined>(
    (best, metric) => (!best || metric.value > best.value ? metric : best),
    undefined,
  );
  const chosenSpotPlayer =
    result.startSit && result.assessment.recommendedPlayerIds.length === 1
      ? result.players.find((p) => p.id === result.assessment.recommendedPlayerIds[0])
      : undefined;
  const spotAlternatives = result.startSit
    ? result.players.filter(
        (p) =>
          p.id !== chosenSpotPlayer?.id &&
          result.startSit!.candidateIds.includes(p.id) &&
          p.projectionScope === 'week' &&
          p.projectedPoints !== undefined,
      )
    : [];
  const spotChange =
    chosenSpotPlayer?.projectionScope === 'week' &&
    chosenSpotPlayer.projectedPoints !== undefined &&
    spotAlternatives.length
      ? {
          label: 'Chosen weekly estimate compared with the highest alternative',
          value:
            chosenSpotPlayer.projectedPoints -
            Math.max(...spotAlternatives.map((p) => p.projectedPoints!)),
          unit: 'points',
        }
      : undefined;
  const change =
    result.request.mode === 'lineup' &&
    !result.startSit &&
    result.lineup?.complete &&
    result.lineup.points !== undefined &&
    recordedStarters
      ? {
          label: 'Selected lineup compared with recorded starters',
          value: result.lineup.points - recordedStarters.value,
          unit: 'points',
        }
      : spotChange
        ? spotChange
        : bestComparedWaiverGain
          ? {
              ...bestComparedWaiverGain,
              label: 'Best quantified compared add/drop change',
            }
          : changeIds.map((id) => result.metrics.find((m) => m.id === id)).find(Boolean);
  return (
    <article className="advice-result" aria-label="Advice result">
      <header>
        <p className="section-overline">{adviceTitle(result.request.mode)}</p>
        <h2 tabIndex={-1} id="advice-result-title">
          {result.assessment.headline}
        </h2>
        <p className="advice-verdict-line">
          <span className={`verdict-chip ${result.assessment.verdict}`}>
            {verdictNames[result.assessment.verdict]}
          </span>
        </p>
        <p>
          {result.season} · Week {result.week} · Saved {formatDateTime(result.createdAt)}
        </p>
        {!!result.assessment.recommendedPlayerIds.length &&
          !(result.request.mode === 'lineup' && result.lineup) && (
            <p>
              <strong>{result.startSit ? 'Start for this spot: ' : 'Players to consider: '}</strong>
              {result.assessment.recommendedPlayerIds
                .map((id) => playerNames.get(id) ?? 'Unknown player')
                .join(', ')}
            </p>
          )}
      </header>
      {result.assessment.reasons.length > 0 && (
        <section className="advice-verdict" aria-label="Verdict">
          <ul>
            {result.assessment.reasons.slice(0, 3).map((statement, index) => (
              <li key={index}>{renderAdviceStatement(statement, metrics)}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="decision-summary" aria-label="Decision in brief">
        <h3>Decision in brief</h3>
        <div className="decision-summary-grid">
          <div>
            <h4>Expected change</h4>
            <p>
              {change
                ? `${change.label}: ${number(change.value)} ${change.unit}. Conditional on supplied estimates; not a realized gain.`
                : 'No complete decision-level improvement is quantified. Compare the supported estimates below.'}
            </p>
          </div>
          <div>
            <h4>Evidence confidence</h4>
            <p>
              <strong>{result.confidence.label}</strong> · not a win probability
            </p>
          </div>
        </div>
      </section>
      <div className="result-availability" aria-label="Availability to check">
        {result.players
          .filter(
            (p) =>
              p.weeklyGameStatus === 'bye' ||
              (p.status && !['active', 'healthy'].includes(p.status.toLowerCase())),
          )
          .map((p) => (
            <span key={p.id} className="availability-flag">
              {p.name} · {p.weeklyGameStatus === 'bye' ? 'Bye' : p.status}
            </span>
          ))}
        {!!result.readiness?.injuryPlayers && unverifiedInjuries(result.readiness) > 0 && (
          <span>Availability unverified for {unverifiedInjuries(result.readiness)} players.</span>
        )}
      </div>
      {result.marketQuote && (
        <section aria-label="Fetched price analyzed">
          <h3>Price analyzed</h3>
          <p>
            {result.marketQuote.sportsbook} via ESPN · {result.marketQuote.kind} ·{' '}
            {result.marketQuote.side}
            {result.marketQuote.line === undefined ? '' : ` · line ${result.marketQuote.line}`} ·
            American odds {result.marketQuote.americanOdds > 0 ? '+' : ''}
            {result.marketQuote.americanOdds}.
          </p>
          <p>
            Fetched {formatDateTime(result.marketQuote.observedAt)}. This saved analysis uses that
            snapshot; the current price may differ.
          </p>
        </section>
      )}
      {result.startSit && (
        <section aria-label="One starting spot comparison">
          <h3>One starting spot</h3>
          <p>
            Compared: {result.startSit.candidateIds.map((id) => playerNames.get(id)).join(', ')}.
          </p>
          <p>
            Shared spots:{' '}
            {result.startSit.eligibleSlots.map((slot) => lineupSlotNames[slot] ?? slot).join(', ')}.
          </p>
          <p>
            This checks one spot. Keep the chosen player out of other starting slots and check the
            rest of your lineup separately.
          </p>
        </section>
      )}
      {result.request.mode === 'lineup' && result.lineup && (
        <Lineup
          title={
            ['hold', 'insufficient'].includes(result.assessment.verdict)
              ? 'Highest estimate for comparison'
              : 'Supported starting lineup'
          }
          lineup={result.lineup}
          names={playerNames}
        />
      )}
      {/* The verdict bullets above repeat the reasons as plain text; sources live in here. */}
      <details className="result-disclosure advice-evidence">
        <summary>Show the evidence</summary>
        <h3>Why this choice</h3>
        <ul>
          {result.assessment.reasons.map((statement, index) => (
            <li key={index}>
              <Statement statement={statement} metrics={metrics} sources={sources} />
            </li>
          ))}
        </ul>
        <h3>Another option</h3>
        <Statement statement={result.assessment.alternative} metrics={metrics} sources={sources} />
        {result.readiness && (
          <>
            <h3>Evidence readiness when this advice was created</h3>
            <DataReadiness report={result.readiness} />
          </>
        )}
      </details>
      <details className="advice-confidence" role="region" aria-label="Evidence confidence">
        <summary>What affects confidence?</summary>
        <strong>{result.confidence.label} evidence confidence</strong>
        <p>{result.confidence.meaning}</p>
        <p>{result.confidence.score}/100 evidence quality score. This is not a win probability.</p>
        <ul>
          {result.confidence.factors.map((factor) => (
            <li key={factor.label}>
              {factor.label}: {factor.score}/{factor.maximum}
            </li>
          ))}
        </ul>
      </details>
      <details className="result-disclosure">
        <summary>
          <h3>What could change the decision</h3> ({result.assessment.risks.length})
        </summary>
        <ul>
          {result.assessment.risks.map((statement, index) => (
            <li key={index}>
              <Statement statement={statement} metrics={metrics} sources={sources} />
            </li>
          ))}
        </ul>
      </details>
      <details className="result-disclosure result-numbers">
        <summary>Numbers & comparisons</summary>
        {result.betHistory?.forecast && (
          <section
            className="advice-forecast"
            aria-label={
              result.betHistory.forecast.method !== 'rolling-residual-v1'
                ? 'Market-aware betting forecast'
                : 'Rolling betting forecast'
            }
          >
            <h3>
              {result.betHistory.forecast.method !== 'rolling-residual-v1'
                ? 'Market-aware opponent-adjusted forecast'
                : 'Rolling statistical forecast'}{' '}
              · experimental
            </h3>
            <p role="status">
              {result.assessment.verdict === 'lean'
                ? 'This model supports only a tentative comparison. Confirm the entered price and current conditions.'
                : 'This analysis does not support placing a bet. The estimate is shown for comparison.'}
            </p>
            <p>
              <strong>{number(result.betHistory.forecast.probability * 100)}%</strong> estimated win
              chance among non-push outcomes. Earlier similar estimates have a calibration band of{' '}
              {number(result.betHistory.forecast.lower * 100)}–
              {number(result.betHistory.forecast.upper * 100)}%.
            </p>
            <p>
              Evaluated chronologically on {result.betHistory.forecast.evaluation.games} games
              across {result.betHistory.forecast.evaluation.weeks} weeks;{' '}
              {result.betHistory.forecast.evaluation.calibrationSamples} earlier outcomes in this
              estimate’s probability group. The band uses{' '}
              {result.betHistory.forecast.evaluation.calibrationWeeks} weeks to avoid treating games
              in one week as independent evidence.
            </p>
            {result.betHistory.forecast.method === 'health-weather-total-v4' ? (
              <p>
                Uses both sportsbook prices, opponent-adjusted scoring, dated injury designations,
                captured quarterback depth-chart changes and regional weather forecasts. Corrections
                are learned from earlier games, with no fixed injury points penalty. Only totals use
                the added variables because older tests favored retaining v3 for moneylines and
                spreads. Missing reports do not prove health; listed quarterbacks do not confirm
                participation. Weather coverage is limited to supported outdoor venues. This does
                not establish a sportsbook edge or betting profit.
              </p>
            ) : result.betHistory.forecast.method !== 'rolling-residual-v1' ? (
              <p>
                Uses both sportsbook prices as an input, with opponent-adjusted recent scoring and a
                learned home effect. Small corrections are tested against sportsbook probabilities
                on the same earlier games at their own archived prices. Lower error than the old
                model does not establish an independent market edge. Current injuries, quarterback
                changes and weather are not quantified. This is separate from the AI’s judgment.
                {result.betHistory.forecast.method === 'market-context-v3' &&
                  ' V3 also learns from schedule rest, season phase and earlier team results against the line. Moneyline corrections shrink toward the book when earlier evaluation does not support them.'}
              </p>
            ) : (
              <p>
                The model uses prior scoring or player production. Your entered threshold is a
                retrospective evaluation scenario, not a historical sportsbook-profit test. Current
                injuries, weather and changing roles can invalidate the estimate. This is separate
                from the AI’s judgment.
              </p>
            )}
            {result.metrics.some((m) => m.id.includes('-personnel-matches')) ? (
              <p>
                Official injury articles, prior snap roles and recent quarterback efficiency are
                shown as supporting context. Their tested numerical corrections performed worse and
                remain disabled; these values do not increase the model’s reported accuracy or
                betting edge.
              </p>
            ) : null}
          </section>
        )}
        {result.request.mode !== 'lineup' && result.lineup && (
          <Lineup
            title={
              result.request.mode === 'trade' ? 'Before the trade' : 'Supported starting lineup'
            }
            lineup={result.lineup}
            names={playerNames}
            season={result.request.mode === 'trade'}
            remaining={
              result.request.mode === 'trade' &&
              result.players.some((player) => player.projectionScope === 'remaining-season')
            }
          />
        )}
        {result.alternativeLineup && (
          <Lineup
            title={
              result.request.mode === 'lineup'
                ? 'Highest estimate for comparison'
                : 'After the trade'
            }
            lineup={result.alternativeLineup}
            names={playerNames}
            season={result.request.mode === 'trade'}
            remaining={
              result.request.mode === 'trade' &&
              result.players.some((player) => player.projectionScope === 'remaining-season')
            }
          />
        )}
        <h3>Supporting numbers</h3>
        {/* The AI's own win probability is kept for research records but not shown: it is
            uncalibrated and a percentage reads as more certain than the evidence supports. */}
        <MetricTable
          metrics={result.metrics.filter((m) => !m.id.startsWith('bet-model-'))}
          sources={sources}
        />
        {!result.metrics.length && (
          <p>
            No complete decision-level estimate is available. Check the player evidence and
            missing-data notes.
          </p>
        )}
        <div className="advice-player-evidence">
          {result.players.map((player) => (
            <details key={player.id}>
              <summary>
                {player.name} · {player.position}
                {player.team ? ` · ${player.team}` : ''}
                {player.status ? ` · ${player.status}` : ''}
              </summary>
              {player.draftProfile && (
                <section aria-label={`${player.name} NFL draft background`}>
                  <p>
                    NFL draft: {player.draftProfile.season} · Round {player.draftProfile.round} ·
                    Overall pick {player.draftProfile.pick}
                    {player.draftProfile.college ? ` · ${player.draftProfile.college}` : ''}
                  </p>
                  <p>
                    NFL draft slot shows how much a team invested, not this player’s current role or
                    fantasy value.
                  </p>
                </section>
              )}
              {player.matchup && (
                <p>
                  {player.matchup.home ? 'Home vs' : 'Away at'} {player.matchup.opponent} ·{' '}
                  {new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(player.matchup.date))}
                </p>
              )}
              {player.projectedPoints !== undefined && (
                <p>
                  Estimate: {number(player.projectedPoints)}{' '}
                  {player.projectionScope === 'season'
                    ? 'full-season points'
                    : player.projectionScope === 'remaining-season'
                      ? 'remaining points'
                      : 'weekly points'}{' '}
                  ·{' '}
                  {player.projectionPeriod &&
                    `Weeks ${player.projectionPeriod.fromWeek}–${player.projectionPeriod.throughWeek}, ${player.projectionPeriod.season} · `}
                  {player.projectionMethod === 'imported'
                    ? 'scoring-confirmed import'
                    : player.projectionMethod === 'public-projection-v1'
                      ? 'public weekly forecast · your league scoring'
                      : player.projectionMethod === 'rolling-form-v1'
                        ? 'automatic form, workload & opponent estimate'
                        : player.projectionMethod === 'rolling-baseline-v1'
                          ? 'automatic historical scoring estimate'
                          : 'simple historical baseline'}
                </p>
              )}
              <MetricTable metrics={player.metrics} sources={sources} />
              {!!player.warnings.length && (
                <ul>
                  {player.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
        <h3>News & fantasy-market perception</h3>
        {result.perceptionEvidence && (
          <section className="advice-perception-coverage" aria-label="Perception evidence coverage">
            <p>
              {result.perceptionEvidence.headlines.length} relevant{' '}
              {result.perceptionEvidence.headlines.length === 1 ? 'headline' : 'headlines'} in the
              past {number(result.perceptionEvidence.windowHours / 24)} days ·{' '}
              {result.perceptionEvidence.feedStatus === 'current'
                ? 'Current feed retrieval'
                : result.perceptionEvidence.feedStatus === 'stale'
                  ? 'Stale feed retrieval'
                  : 'Feeds unavailable'}
            </p>
            <p>
              Selected media tone: {result.assessment.perception.tone}.{' '}
              {result.perceptionEvidence.activityMetricIds.length
                ? 'Matched Sleeper activity is available.'
                : 'No current matched Sleeper activity is available.'}
            </p>
            {result.perceptionEvidence.checkedAt && (
              <small>
                Feeds last retrieved {formatDateTime(result.perceptionEvidence.checkedAt)}
              </small>
            )}
            {!!result.perceptionEvidence.headlines.length && (
              <details>
                <summary>Headlines used in this analysis</summary>
                <ul>
                  {result.perceptionEvidence.headlines.map((headline) => {
                    const source = sources.get(headline.sourceId)!;
                    return (
                      <li key={headline.sourceId}>
                        {source.url ? (
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.name}
                          </a>
                        ) : (
                          source.name
                        )}
                        <small>
                          Published {formatDateTime(headline.publishedAt)} ·{' '}
                          {headline.playerIds.length
                            ? `Player mention: ${headline.playerIds.map((id) => playerNames.get(id)).join(', ')}`
                            : `Team context: ${headline.teamCodes.join(', ')}`}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </section>
        )}
        <Statement statement={result.assessment.perception} metrics={metrics} sources={sources} />
        <p>Headlines and Sleeper add/drop trends are a rough read on buzz, not a forecast.</p>
      </details>
      {!!result.warnings.length && (
        <details className="advice-warnings">
          <summary>Data gaps & limitations ({result.warnings.length})</summary>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <details className="advice-sources">
        <summary>Sources, model & usage</summary>
        <p>
          Analyzed and reviewed by {result.model} using{' '}
          {result.request.connection === 'claude-cli' || result.request.connection === 'codex-cli'
            ? `the signed-in ${result.request.connection === 'codex-cli' ? 'Codex' : 'Claude'} connection selected for this analysis`
            : 'your saved AI connection'}
          .
        </p>
        <p>
          {result.usage
            ? `${number(result.usage.inputTokens)} input tokens · ${number(result.usage.outputTokens)} output tokens across both passes.`
            : 'This provider did not report token usage.'}
        </p>
        <p>
          {result.usage?.estimatedCostUsd === undefined
            ? 'Cost unavailable. Enter the model’s rates in AI settings to estimate future requests.'
            : `Estimated cost: $${result.usage.estimatedCostUsd.toFixed(4)} using your saved model rates.`}
        </p>
        <ul>
          {result.sources.map((source) => (
            <li key={source.id} id={`advice-source-${source.id}`}>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.name}
                </a>
              ) : (
                source.name
              )}
              <small>
                {source.status === 'available' ? 'Available' : 'Unavailable'} ·{' '}
                {source.retrievedAt ? formatDateTime(source.retrievedAt) : 'Date not recorded'}
              </small>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
type Sources = Map<string, AdviceResult['sources'][number]>;
function Statement({
  statement,
  metrics,
  sources,
}: {
  statement: AdviceStatement;
  metrics: AdviceMetric[];
  sources: Sources;
}) {
  const ids = [
    ...new Set([
      ...statement.sourceIds,
      ...statement.metricIds.flatMap(
        (id) => metrics.find((metric) => metric.id === id)?.sourceIds ?? [],
      ),
    ]),
  ];
  return (
    <div className="advice-statement">
      <p>{renderAdviceStatement(statement, metrics)}</p>
      {!!ids.length && (
        <small>
          Evidence: {ids.map((id) => sources.get(id)?.name ?? 'Source unavailable').join(' · ')}
        </small>
      )}
    </div>
  );
}
function MetricTable({ metrics, sources }: { metrics: AdviceMetric[]; sources: Sources }) {
  if (!metrics.length) return null;
  return (
    <div className="advice-table-scroll">
      <table className="advice-metrics" role="table">
        <caption className="visually-hidden">Computed supporting evidence</caption>
        <thead>
          <tr role="row">
            <th scope="col" role="columnheader">
              Evidence
            </th>
            <th scope="col" role="columnheader">
              Value
            </th>
            <th scope="col" role="columnheader">
              Source & sample
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.id} role="row">
              <th scope="row" role="rowheader">
                {metric.label}
                {metric.description && <small>{metric.description}</small>}
              </th>
              <td role="cell">
                <span className="advice-metric-cell-label" aria-hidden="true">
                  Value:{' '}
                </span>
                {metric.unit === 'year' ? metric.value : `${number(metric.value)} ${metric.unit}`}
              </td>
              <td role="cell">
                <span className="advice-metric-cell-label" aria-hidden="true">
                  Source & sample:{' '}
                </span>
                {metric.sourceIds
                  .map((id) => sources.get(id)?.name ?? 'Source unavailable')
                  .join(' · ') || 'No matched source'}
                {metric.sampleSize !== undefined && <small>{metric.sampleSize} observations</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const lineupSlotNames: Record<string, string> = {
  QB: 'Quarterback',
  RB: 'Running back',
  WR: 'Wide receiver',
  TE: 'Tight end',
  K: 'Kicker',
  DST: 'Team defense',
  DEF: 'Team defense',
  FLEX: 'Flex',
  FLX: 'Flex',
  WRT: 'Flex',
  RECFLEX: 'Receiver flex',
  WRRBFLEX: 'Running back / receiver flex',
  SUPERFLEX: 'Superflex',
  OP: 'Superflex',
  WRTQB: 'Superflex',
  QBRBWRTE: 'Superflex',
};
function Lineup({
  title,
  lineup,
  names,
  season = false,
  remaining = false,
}: {
  title: string;
  lineup: LineupEstimate;
  names: Map<string, string>;
  season?: boolean;
  remaining?: boolean;
}) {
  const slotName = (slot: string) => {
    const position = slot.replace(/ \d+$/, '');
    return Object.hasOwn(lineupSlotNames, position) ? lineupSlotNames[position]! : position;
  };
  const assignments = [...lineup.assignments].sort(
    (a, b) => Number(a.slot.match(/ (\d+)$/)?.[1] ?? 0) - Number(b.slot.match(/ (\d+)$/)?.[1] ?? 0),
  );
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const assignment of assignments) {
    const name = slotName(assignment.slot);
    totals.set(name, (totals.get(name) ?? 0) + 1);
  }
  return (
    <section className="lineup-estimate">
      <h3>{title}</h3>
      <p>
        {lineup.complete && lineup.points !== undefined
          ? `${number(lineup.points)} estimated ${remaining ? 'remaining' : season ? 'full-season' : 'weekly'} points`
          : 'Incomplete estimate; missing slots are not counted as zero.'}
      </p>
      <ul>
        {assignments.map((assignment, index) => {
          const name = slotName(assignment.slot);
          const occurrence = (seen.get(name) ?? 0) + 1;
          seen.set(name, occurrence);
          return (
            <li key={`${assignment.slot}:${index}`}>
              {name}
              {totals.get(name)! > 1 ? ` slot ${occurrence}` : ''}:{' '}
              {names.get(assignment.playerId) ?? 'Unknown player'} · {number(assignment.points)}{' '}
              estimated points
            </li>
          );
        })}
      </ul>
      {!!lineup.missingSlots.length && <p>Missing: {lineup.missingSlots.join(', ')}</p>}
    </section>
  );
}

/** Dated reports and this week's pre-kickoff reports both count as current availability. */
function unverifiedInjuries(readiness: NonNullable<AdviceResult['readiness']>): number {
  const weekly = readiness.injuryReports.filter((r) => r.coverage === 'week-window').length;
  return readiness.injuryPlayers - readiness.currentInjuryReports - weekly;
}
