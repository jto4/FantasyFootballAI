import { resolve } from 'node:path';
import {
  createLocalCLIProvider,
  SignedInCodexConnection,
} from '../packages/integrations/dist/index.js';
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

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const nativeCodex = option('--connection') === 'codex-cli';
if (option('--connection') && !nativeCodex) {
  console.error('Choose --connection codex-cli or an explicit CLI command.');
  process.exit(2);
}
const command = option('--cli-command');
if (!command && !nativeCodex) {
  console.error(
    'Provide --cli-command and --cli-args (a JSON string array) for an existing authenticated AI CLI. No saved settings or credentials are read or changed. See docs/advice.md.',
  );
  process.exit(2);
}
let cliArgs;
try {
  cliArgs = JSON.parse(option('--cli-args') ?? '[]');
  if (
    !Array.isArray(cliArgs) ||
    cliArgs.some((arg) => typeof arg !== 'string') ||
    cliArgs.length > 64
  )
    throw new Error();
} catch {
  console.error('CLI arguments must be a JSON string array with at most 64 arguments.');
  process.exit(2);
}
const selected = option('--case');
const cases = adviceEvaluationCases.filter(
  (testCase) => !selected || selected.split(',').includes(testCase.id),
);
if (!cases.length) {
  console.error('Unknown evaluation case.');
  process.exit(2);
}
const provider = nativeCodex
  ? await new SignedInCodexConnection().provider()
  : createLocalCLIProvider(resolve(command), cliArgs);
const cancellation = new AbortController();
const stop = () => cancellation.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
let passed = 0;
let attempted = 0;
for (const testCase of cases) {
  if (cancellation.signal.aborted) break;
  attempted++;
  const workspace = evaluationWorkspace(testCase);
  const passes = [];
  if (nativeCodex)
    workspace.request = { ...workspace.request, connection: 'codex-cli', model: 'gpt-6.1-sol' };
  else workspace.state.settings.aiRuntime.mode = 'cli';
  const evaluationAI = {
    id: 'existing-cli-evaluation',
    generate: async (request) => {
      const context = adviceContext(request.prompt);
      console.error(
        JSON.stringify({ case: testCase.id, stage: 'generating', pass: passes.length + 1 }),
      );
      const response = await provider.generate(request);
      let answer;
      let validationFailure;
      try {
        answer = validatedEvaluationAnswer(response, context);
      } catch (error) {
        /* Grade invalid output without printing provider text. */
        validationFailure = evaluationValidationFailure(error);
      }
      passes.push({ answer, validationFailure });
      console.error(
        JSON.stringify({
          case: testCase.id,
          stage: 'received',
          pass: passes.length,
          valid: Boolean(answer),
        }),
      );
      return response;
    },
  };
  const service = createAdviceService({
    store: workspace.store,
    data: { get: async () => structuredClone(workspace.data) },
    catalog: async () => structuredClone(workspace.catalog),
    news: { get: async () => structuredClone(workspace.news) },
    injuries: { get: async () => structuredClone(workspace.injuries) },
    now: () => evaluationTime,
    configuredAI: async () => (nativeCodex ? null : evaluationAI),
    ...(nativeCodex
      ? { signedInCodex: { status: async () => 'signed-in', provider: async () => evaluationAI } }
      : {}),
  });
  const started = performance.now();
  try {
    const result = await service.analyze(
      workspace.request,
      AbortSignal.any([cancellation.signal, AbortSignal.timeout(300_000)]),
      `evaluation-${testCase.id}`,
    );
    const grade = gradeAdviceEvaluation(testCase, result, passes);
    if (grade.passed) passed++;
    if (
      args.includes('--explain-reviewed') ||
      (!grade.passed && args.includes('--explain-failures'))
    )
      console.log(
        JSON.stringify({ case: testCase.id, validatedReviewedDecision: passes[1]?.answer ?? null }),
      );
    console.log(
      JSON.stringify({
        case: testCase.id,
        ...grade,
        verdict: result.assessment.verdict,
        selectedPlayers: result.assessment.recommendedPlayerIds,
        confidence: result.confidence.score,
        perception: {
          tone: result.assessment.perception.tone,
          sourceIds: result.assessment.perception.sourceIds,
          feedStatus: result.perceptionEvidence?.feedStatus,
        },
        modelPasses: passes.length,
        validationFailures: passes.flatMap((pass, index) =>
          pass.validationFailure ? [{ pass: index + 1, code: pass.validationFailure }] : [],
        ),
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
  } catch (error) {
    // External CLI errors/output can carry machine paths or private provider data.
    console.log(
      JSON.stringify({
        case: testCase.id,
        passed: false,
        failures: [evaluationProviderFailure(error)],
        modelPasses: passes.length,
        validationFailures: passes.flatMap((pass, index) =>
          pass.validationFailure ? [{ pass: index + 1, code: pass.validationFailure }] : [],
        ),
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
  }
}
console.log(
  JSON.stringify({
    passed,
    cases: cases.length,
    attempted,
    cancelled: cancellation.signal.aborted,
    scope:
      'Fictional decision-process evaluation; not prospective football accuracy or betting profit.',
  }),
);
process.removeListener('SIGINT', stop);
process.removeListener('SIGTERM', stop);
if (cancellation.signal.aborted) process.exitCode = 130;
else if (passed !== cases.length) process.exitCode = 1;
