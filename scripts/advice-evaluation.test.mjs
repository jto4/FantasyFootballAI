import { isAdviceResult } from '../packages/core/dist/index.js';
import { SignedInCodexError } from '../packages/integrations/dist/index.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdviceService } from '../apps/api/dist/advice-service.js';
import {
  adviceContext,
  adviceEvaluationCases,
  evaluationTime,
  evaluationWorkspace,
  evaluationValidationFailure,
  evaluationProviderFailure,
  gradeAdviceEvaluation,
  validatedEvaluationAnswer,
} from './advice-evaluation-cases.mjs';

test('evaluation diagnostics classify failures without returning provider text', () => {
  assert.equal(evaluationValidationFailure(new SyntaxError('private output')), 'invalid-json');
  assert.equal(
    evaluationValidationFailure(new Error('Advice selected an unsupported player.')),
    'player-reference',
  );
  assert.equal(
    evaluationValidationFailure(
      new Error('Advice included an unsupported numerical claim or link.'),
    ),
    'unsupported-numeric-text-or-link',
  );
  assert.equal(
    evaluationValidationFailure(new Error('private provider output')),
    'invalid-contract',
  );
  assert.equal(
    evaluationProviderFailure(new SignedInCodexError('invalid-response')),
    'provider-native-invalid-response',
  );
  assert.equal(
    evaluationProviderFailure(new SignedInCodexError('limit-reported')),
    'provider-limit-reported',
  );
  assert.equal(
    evaluationProviderFailure(new SignedInCodexError('invalid-response', 'multiple-answers')),
    'provider-native-multiple-answers',
  );
  const forged = new SignedInCodexError('invalid-response');
  forged.protocolFailure = 'private-account-token';
  assert.equal(evaluationProviderFailure(forged), 'provider-native-invalid-response');
  assert.equal(evaluationProviderFailure(new Error('AI CLI exited with 1.')), 'provider-exit');
  assert.equal(
    evaluationProviderFailure(new Error('AI CLI returned no text.')),
    'provider-empty-response',
  );
  assert.equal(
    evaluationProviderFailure(new Error('private provider output')),
    'generation-or-validation-failed',
  );
  assert.equal(
    evaluationProviderFailure(new Error('AI CLI exited with private output.')),
    'generation-or-validation-failed',
  );
});

async function fixtureResult(testCase, dropComparison = 'complete', matchups) {
  const workspace = evaluationWorkspace(testCase);
  if (matchups) workspace.state.leagues[0].matchups = matchups;
  const prompts = [];
  const passes = [],
    contexts = [];
  const initialSettings = workspace.store.settingsSnapshot();
  const service = createAdviceService({
    store: workspace.store,
    data: { get: async () => structuredClone(workspace.data) },
    catalog: async () => structuredClone(workspace.catalog),
    news: { get: async () => structuredClone(workspace.news) },
    injuries: { get: async () => structuredClone(workspace.injuries) },
    now: () => evaluationTime,
    configuredAI: async () => ({
      id: 'fixture',
      generate: async (request) => {
        prompts.push(request.prompt);
        const context = adviceContext(request.prompt);
        contexts.push(context);
        const metrics = [...context.metrics, ...context.players.flatMap((p) => p.metrics)];
        const supportMetrics =
          testCase.expected.supportMetrics ??
          (testCase.expected.metric ? [testCase.expected.metric] : []);
        let support = supportMetrics.length
          ? metrics.filter((metric) => supportMetrics.includes(metric.id))
          : metrics.slice(0, 1);
        const metric = support[0];
        assert.ok(
          !supportMetrics.length || support.length === supportMetrics.length,
          'The expected decision metric must exist before model generation.',
        );
        if (
          testCase.request.dropPlayerId &&
          (dropComparison === 'omit-both' ||
            (dropComparison === 'omit-first' && contexts.length === 1))
        )
          support = support.filter((metric) => metric.id === testCase.expected.metric);
        const answer = {
          verdict: testCase.expected.verdicts[0],
          headline: 'Evaluate the fictional decision',
          recommendedPlayerIds: testCase.expected.picks ?? [],
          reasons: [
            {
              text: metric
                ? `The computed comparisons are ${support.map((metric) => `{{${metric.id}}}`).join(' and ')}.`
                : 'Complete estimates are unavailable.',
              metricIds: support.map((metric) => metric.id),
              sourceIds: metric?.sourceIds ?? [],
            },
          ],
          risks: [
            { text: 'Confirm current conditions before acting.', metricIds: [], sourceIds: [] },
          ],
          alternative: {
            text: 'Retain the existing roster if conditions change.',
            metricIds: [],
            sourceIds: [],
          },
          perception: {
            tone: testCase.expected.perception?.tone ?? 'unknown',
            text: testCase.expected.perception
              ? 'The selected coverage is mixed; it is not an overall public opinion sample.'
              : 'No current headline supports an opinion claim.',
            metricIds: [],
            sourceIds: testCase.expected.perception?.sourceIds ?? [],
          },
        };
        const text = JSON.stringify(answer);
        passes.push({ answer: validatedEvaluationAnswer(text, context) });
        return text;
      },
    }),
  });
  const result = await service.analyze(workspace.request, undefined, `fixture-${testCase.id}`);
  assert.deepEqual(workspace.store.settingsSnapshot(), initialSettings);
  assert.equal(workspace.state.adviceResults.length, 1);
  return { result, passes, contexts, prompts };
}

test('rookie draft capital survives both passes and persistence without becoming a missing player forecast', async () => {
  const testCase = adviceEvaluationCases.find((c) => c.id === 'rookie-missing-forecast');
  const { result, passes, contexts } = await fixtureResult(testCase);
  assert.equal(passes.length, 2);
  for (const context of contexts) {
    const rookie = context.players.find((p) => p.id === 'w3');
    assert.equal(rookie.draftProfile.pick, 20);
    assert.equal(rookie.projectedPoints, undefined);
    assert.equal(rookie.historicalPoints.length, 0);
  }
  const rookie = result.players.find((p) => p.id === 'w3');
  assert.equal(rookie.draftProfile.sourceId, 'nfl-draft-picks');
  assert.equal(rookie.projectedPoints, undefined);
  assert.equal(result.assessment.verdict, 'insufficient');
  assert.deepEqual(result.assessment.recommendedPlayerIds, []);
  assert.equal(isAdviceResult(result), true);
  const corrupt = structuredClone(result);
  corrupt.sources = corrupt.sources.filter((s) => s.id !== 'nfl-draft-picks');
  assert.equal(isAdviceResult(corrupt), false);
});

test('every fixed case reaches the production analysis/review service with correct arithmetic and persistence', async () => {
  for (const testCase of adviceEvaluationCases) {
    const { result, passes } = await fixtureResult(testCase);
    assert.deepEqual(gradeAdviceEvaluation(testCase, result, passes).failures, [], testCase.id);
  }
});
test('kicker comparison computes both baselines from history, includes blocked-kick penalties and saves source-linked evidence', async () => {
  const testCase = adviceEvaluationCases.find((c) => c.id === 'kicker-start-sit');
  const { result, contexts } = await fixtureResult(testCase);
  assert.deepEqual(result.startSit, { candidateIds: ['k1', 'k2'], eligibleSlots: ['K'] });
  assert.deepEqual(result.assessment.recommendedPlayerIds, ['k1']);
  assert.equal(contexts.length, 2);
  for (const context of contexts)
    for (const player of context.players) {
      assert.equal(player.projectionMethod, 'sidekick-model-v1');
      assert.equal(player.projectedPoints, player.id === 'k1' ? 11 : 7);
      assert.ok(player.metrics.some((m) => m.id.endsWith(':fg_blocked') && m.value === 1));
      assert.ok(player.warnings.some((warning) => warning.includes('weather')));
    }
  assert.ok(result.players.every((player) => player.projectionSourceIds.includes('stats-2026')));
});

test('focused cases retain one-spot scope, require all alternative estimates, and reject full-lineup claims', async () => {
  for (const testCase of adviceEvaluationCases.filter((c) => c.missingOtherSlots)) {
    const { result, passes, contexts } = await fixtureResult(testCase);
    assert.deepEqual(result.startSit.candidateIds, ['w1', 'w4']);
    assert.equal(result.lineup, undefined);
    for (const context of contexts) {
      assert.deepEqual(context.startSit.eligibleSlots, ['WR']);
      assert.deepEqual(
        context.players.map((player) => player.id),
        ['w1', 'w4'],
      );
      const answer = structuredClone(passes[1].answer);
      answer.recommendedPlayerIds = ['w1', 'w4'];
      assert.throws(
        () => validatedEvaluationAnswer(JSON.stringify(answer), context),
        /exactly one eligible/,
      );
      answer.recommendedPlayerIds = testCase.expected.picks;
      answer.reasons = [
        { text: 'The estimate is {{w1:projected}}.', metricIds: ['w1:projected'], sourceIds: [] },
      ];
      assert.throws(
        () => validatedEvaluationAnswer(JSON.stringify(answer), context),
        /every eligible alternative/,
      );
    }
    const forged = structuredClone(result);
    forged.startSit.eligibleSlots = ['QB'];
    assert.equal(gradeAdviceEvaluation(testCase, forged, passes).passed, false);
    if (testCase.questionable) {
      assert.equal(result.metrics.find((m) => m.id === 'start-sit-selection-change').value, -10);
      assert.ok(result.confidence.score <= 59);
    }
  }
});

test('automatic draft and trade cases retain decomposition, error bands and evaluation in both passes and fail grading when evidence is stripped', async () => {
  for (const testCase of adviceEvaluationCases.filter((c) => c.automaticForecast)) {
    const { result, passes, contexts } = await fixtureResult(testCase);
    assert.equal(contexts.length, 2);
    for (const context of contexts)
      for (const player of context.players) {
        assert.ok(player.projectionMethod.startsWith('rolling-'));
        const value = (suffix) =>
          player.metrics.find((m) => m.id === `${player.id}:forecast-${suffix}`).value;
        assert.ok(
          Math.abs(
            player.projectedPoints -
              (value('baseline') +
                value('form') +
                value('workload') +
                value('opponent') +
                value('recorded')),
          ) < 1e-8,
        );
        assert.ok(value('test-weeks') >= 8);
        assert.ok(
          value('lower') <= player.projectedPoints && value('upper') >= player.projectedPoints,
        );
        assert.equal(value('recorded') === 0, testCase.request.mode === 'trade');
      }
    const stripped = structuredClone(result);
    stripped.players[0].metrics = stripped.players[0].metrics.filter(
      (m) => !m.id.endsWith(':forecast-mae'),
    );
    assert.ok(
      gradeAdviceEvaluation(testCase, stripped, passes).failures.includes(
        'missing-automatic-forecast-evidence',
      ),
    );
  }
});

test('automatic draft planning accepts all future candidate-versus-starter comparisons, preserving the original value and rejecting partial or incorrect support', async () => {
  const testCase = adviceEvaluationCases.find((c) => c.id === 'automatic-draft-plan');
  const { result, passes } = await fixtureResult(testCase);
  const future = structuredClone(passes);
  const ids = [
    'r3:forecast-baseline',
    'r1:forecast-baseline',
    'w3:forecast-baseline',
    'w4:forecast-baseline',
    'q3:forecast-baseline',
    'q1:forecast-baseline',
  ];
  future[1].answer.reasons = [
    { text: ids.map((id) => `{{${id}}}`).join(' compared with '), metricIds: ids, sourceIds: [] },
  ];
  const saved = structuredClone(result);
  saved.assessment = structuredClone(future[1].answer);
  assert.equal(gradeAdviceEvaluation(testCase, saved, future).passed, true);
  for (const id of ids) {
    const partial = structuredClone(future);
    const remaining = ids.filter((key) => key !== id);
    partial[1].answer.reasons = [
      {
        text: remaining.map((key) => `{{${key}}}`).join(' compared with '),
        metricIds: remaining,
        sourceIds: [],
      },
    ];
    assert.ok(
      gradeAdviceEvaluation(testCase, saved, partial).failures.includes(
        'model-missing-decision-support',
      ),
    );
    const corrupted = structuredClone(saved);
    corrupted.players.flatMap((p) => p.metrics).find((m) => m.id === id).value += 1;
    assert.ok(
      gradeAdviceEvaluation(testCase, corrupted, future).failures.includes(
        'wrong-fixed-forecast-value',
      ),
    );
  }
  const corrupted = structuredClone(saved);
  corrupted.metrics.find((m) => m.id === 'r3:replacement').value += 1;
  assert.ok(
    gradeAdviceEvaluation(testCase, corrupted, future).failures.includes('wrong-computed-value'),
  );
});

test('automatic draft review accepts a complete future-only comparison while rejecting partial or incorrect numerical support', async () => {
  const testCase = adviceEvaluationCases.find((c) => c.id === 'automatic-draft-review');
  const { result, passes } = await fixtureResult(testCase);
  const future = structuredClone(passes);
  const ids = ['q1:forecast-baseline', 'w1:forecast-baseline', 'r1:forecast-baseline'];
  future[1].answer.reasons = [
    { text: ids.map((id) => `{{${id}}}`).join(' compared with '), metricIds: ids, sourceIds: [] },
  ];
  assert.equal(gradeAdviceEvaluation(testCase, result, future).passed, true);
  future[1].answer.reasons[0] = {
    text: '{{q1:forecast-baseline}}',
    metricIds: ['q1:forecast-baseline'],
    sourceIds: [],
  };
  assert.ok(
    gradeAdviceEvaluation(testCase, result, future).failures.includes(
      'model-missing-decision-support',
    ),
  );
  const corrupted = structuredClone(result);
  corrupted.players
    .find((p) => p.id === 'q1')
    .metrics.find((m) => m.id === 'q1:forecast-baseline').value = 261;
  assert.ok(
    gradeAdviceEvaluation(testCase, corrupted, passes).failures.includes(
      'wrong-fixed-forecast-value',
    ),
  );
});

test('the grader catches wrong selection, verdict, unsupported perception and missing decision support', async () => {
  const testCase = adviceEvaluationCases.find((item) => item.id === 'lineup');
  const { result, passes } = await fixtureResult(testCase);
  const incorrect = structuredClone(passes);
  incorrect[1].answer.recommendedPlayerIds = ['q1', 'w1', 'r1'];
  incorrect[1].answer.verdict = 'hold';
  incorrect[1].answer.perception.tone = 'positive';
  incorrect[1].answer.reasons = [{ text: 'Follow popularity.', metricIds: [], sourceIds: [] }];
  const grade = gradeAdviceEvaluation(testCase, result, incorrect);
  assert.equal(grade.passed, false);
  for (const failure of [
    'model-wrong-players',
    'model-wrong-verdict',
    'model-unsupported-perception',
    'model-missing-decision-support',
  ])
    assert.ok(grade.failures.includes(failure));
});

test('policy corrections cannot conceal a bad raw reviewed betting answer', async () => {
  const testCase = adviceEvaluationCases.find((item) => item.id === 'betting');
  const { result, passes } = await fixtureResult(testCase);
  const incorrect = structuredClone(passes);
  incorrect[1].answer.verdict = 'recommend';
  assert.equal(result.assessment.verdict, 'hold');
  assert.ok(
    gradeAdviceEvaluation(testCase, result, incorrect).failures.includes('model-wrong-verdict'),
  );
});

test('wrong computed evidence and invalid reviewed output fail independently', async () => {
  const testCase = adviceEvaluationCases.find((item) => item.id === 'trade');
  const { result, passes } = await fixtureResult(testCase);
  const corrupted = structuredClone(result);
  corrupted.metrics.find((metric) => metric.id === 'trade-gain').value = 102;
  assert.ok(
    gradeAdviceEvaluation(testCase, corrupted, passes).failures.includes('wrong-computed-value'),
  );
  const invalid = structuredClone(passes);
  delete invalid[1].answer;
  assert.ok(
    gradeAdviceEvaluation(testCase, result, invalid).failures.includes('invalid-reviewed-answer'),
  );
});

test('both model passes receive actual team ownership and the saved draft snapshot, without implying future availability', async () => {
  for (const id of ['draft-plan', 'draft-review']) {
    const testCase = adviceEvaluationCases.find((item) => item.id === id);
    const { contexts } = await fixtureResult(testCase);
    assert.equal(contexts.length, 2);
    for (const context of contexts) {
      assert.deepEqual(context.rosterContext.selected.playerIds, [
        'q1',
        'w1',
        'r1',
        'q4',
        'w4',
        'r4',
      ]);
      assert.equal(context.rosterContext.selected.complete, true);
      for (const id of context.rosterContext.selected.playerIds)
        assert.ok(
          context.players.some((player) => player.id === id),
          'Every current roster player needs its evidence in the draft comparison.',
        );
      assert.equal(context.draftContext.savedDraftStatus, 'complete');
      assert.deepEqual(
        context.draftContext.selectedTeamPicks.map((p) => p.playerId),
        ['q1', 'w1', 'r1'],
      );
      if (id === 'draft-plan') {
        assert.equal(context.draftContext.eligibility.checkedAgainstSavedRosters, true);
        assert.equal(context.draftContext.eligibility.checkedAgainstSavedPickLog, true);
        assert.match(
          context.draftContext.eligibility.limitation,
          /cannot guarantee live availability/,
        );
        assert.deepEqual([...context.draftContext.candidateIds].sort(), ['q3', 'r3', 'w3']);
      }
    }
  }
});

test('both lineup passes receive recorded starters for the selected week and team', async () => {
  const testCase = adviceEvaluationCases.find((item) => item.id === 'lineup');
  const { contexts } = await fixtureResult(testCase, 'complete', [
    { week: 4, teams: [{ teamId: 'mine', starters: ['q4', 'w4', 'r4'] }] },
    {
      week: 5,
      teams: [
        { teamId: 'mine', starters: ['q1', 'w1', 'r1'] },
        { teamId: 'other', starters: ['q2'] },
      ],
    },
  ]);
  assert.equal(contexts.length, 2);
  for (const context of contexts) {
    assert.deepEqual(context.rosterContext.selected.recordedStarters.playerIds, ['q1', 'w1', 'r1']);
    assert.equal(context.rosterContext.selected.recordedStarters.week, 5);
    assert.match(
      context.rosterContext.selected.recordedStarters.scope,
      /not verified platform slot/,
    );
  }
});

test('draft grading accepts a complete roster-relative comparison and rejects incomplete support or a wrong candidate', async () => {
  const testCase = adviceEvaluationCases.find((item) => item.id === 'draft-plan');
  const { result, passes } = await fixtureResult(testCase);
  const changed = structuredClone(passes);
  const ids = testCase.expected.supportMetricAlternatives[1];
  changed[1].answer.reasons = [
    {
      text: ids.map((id) => `{{${id}}}`).join(' compared with '),
      metricIds: ids,
      sourceIds: ['projection:fictional-season'],
    },
  ];
  const saved = structuredClone(result);
  saved.assessment = changed[1].answer;
  assert.equal(gradeAdviceEvaluation(testCase, saved, changed).passed, true);
  const missing = structuredClone(changed);
  missing[1].answer.reasons[0].metricIds = ids.slice(1);
  assert.ok(
    gradeAdviceEvaluation(testCase, saved, missing).failures.includes(
      'model-missing-decision-support',
    ),
  );
  const wrong = structuredClone(changed);
  wrong[1].answer.recommendedPlayerIds = ['w3'];
  assert.ok(gradeAdviceEvaluation(testCase, saved, wrong).failures.includes('model-wrong-players'));
  const wrongValue = structuredClone(saved);
  wrongValue.metrics.find((m) => m.id === 'r3:replacement').value = 0;
  assert.ok(
    gradeAdviceEvaluation(testCase, wrongValue, changed).failures.includes('wrong-computed-value'),
  );
});

test('media cases retain opposing current coverage in both passes and grade its tone, attribution and freshness independently', async () => {
  const current = adviceEvaluationCases.find((item) => item.id === 'mixed-media-waivers');
  const { result, passes, contexts } = await fixtureResult(current);
  for (const context of contexts) {
    assert.equal(context.perceptionEvidence.feedStatus, 'current');
    assert.deepEqual(
      context.perceptionEvidence.headlines.map((h) => h.playerIds),
      [['r3'], ['r3']],
    );
    assert.ok(context.sources.find((s) => s.id === 'news-0').name.includes('enthusiastic'));
    assert.ok(context.sources.find((s) => s.id === 'news-1').name.includes('overblown'));
  }
  assert.equal(gradeAdviceEvaluation(current, result, passes).passed, true);
  const wrongTone = structuredClone(passes);
  wrongTone[1].answer.perception.tone = 'positive';
  assert.ok(
    gradeAdviceEvaluation(current, result, wrongTone).failures.includes(
      'model-wrong-perception-tone',
    ),
  );
  const missingSource = structuredClone(passes);
  missingSource[1].answer.perception.sourceIds = ['news-0'];
  assert.ok(
    gradeAdviceEvaluation(current, result, missingSource).failures.includes(
      'model-missing-perception-sources',
    ),
  );
  const unavailable = structuredClone(result);
  unavailable.sources.find((s) => s.id === 'news-1').status = 'unavailable';
  assert.ok(
    gradeAdviceEvaluation(current, unavailable, passes).failures.includes(
      'unsupported-current-media',
    ),
  );
  const wrongCount = structuredClone(result);
  wrongCount.metrics.find((m) => m.id === 'perception-headlines').value = 8;
  assert.ok(
    gradeAdviceEvaluation(current, wrongCount, passes).failures.includes('wrong-computed-value'),
  );
  const stale = adviceEvaluationCases.find((item) => item.id === 'stale-media-waivers');
  const staleResult = await fixtureResult(stale);
  assert.equal(staleResult.result.perceptionEvidence.feedStatus, 'stale');
  assert.equal(staleResult.result.assessment.perception.tone, 'unknown');
  const optimistic = structuredClone(staleResult.passes);
  optimistic[1].answer.perception.tone = 'positive';
  assert.ok(
    gradeAdviceEvaluation(stale, staleResult.result, optimistic).failures.includes(
      'model-unsupported-perception',
    ),
  );
});

test('defense comparison uses team identity and carries both league-scored estimates through analysis and review', async () => {
  const testCase = adviceEvaluationCases.find((c) => c.id === 'defense-start-sit');
  const { result, contexts } = await fixtureResult(testCase);
  assert.deepEqual(result.startSit, { candidateIds: ['BUF', 'MIA'], eligibleSlots: ['DST'] });
  assert.deepEqual(result.assessment.recommendedPlayerIds, ['BUF']);
  for (const context of contexts)
    for (const player of context.players) {
      assert.equal(player.position, 'DST');
      assert.equal(player.projectedPoints, player.id === 'BUF' ? 10 : 6);
      assert.ok(player.metrics.some((m) => m.id.endsWith(':dst_points_allowed')));
      assert.ok(player.projectionSourceIds.some((id) => id.startsWith('dst-')));
    }
  assert.ok(isAdviceResult(result));
});

for (const id of ['waiver-drop-loss', 'waiver-drop-upgrade'])
  test(`${id}: both model passes receive the complete add/drop impact and saved requests retain the owned drop`, async () => {
    const testCase = adviceEvaluationCases.find((c) => c.id === id);
    const { result, contexts, passes } = await fixtureResult(testCase);
    assert.equal(passes.length, 2);
    for (const context of contexts) {
      assert.equal(context.request.dropPlayerId, testCase.request.dropPlayerId);
      const metrics = new Map(context.metrics.map((metric) => [metric.id, metric.value]));
      assert.equal(metrics.get(testCase.expected.metric), testCase.expected.value);
      for (const [metric, value] of Object.entries(testCase.expected.fixedMetrics))
        assert.equal(metrics.get(metric), value);
    }
    assert.equal(result.request.dropPlayerId, testCase.request.dropPlayerId);
    assert.equal(isAdviceResult(result), true);
    const grade = gradeAdviceEvaluation(testCase, result, passes);
    assert.equal(grade.passed, true, JSON.stringify(grade));
  });

test('the review repairs an incomplete add/drop explanation but an unsupported final explanation cannot be saved', async () => {
  const testCase = adviceEvaluationCases.find((c) => c.id === 'waiver-drop-upgrade');
  const { result, prompts } = await fixtureResult(testCase, 'omit-first');
  assert.ok(prompts[1].includes('failed the waiver add/drop comparison'));
  assert.equal(result.request.dropPlayerId, 'r4');
  await assert.rejects(
    fixtureResult(testCase, 'omit-both'),
    /did not substantiate the add\/drop comparison/,
  );
});
