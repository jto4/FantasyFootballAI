// Opt-in native compatibility proof: no credentials, remote model, or owner database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import {
  isolatedCodexArguments,
  isolatedCodexLaunch,
} from '../packages/integrations/dist/signed-in-codex.js';
import { runLocalAICommand } from '../packages/integrations/dist/ai.js';

const executable = process.argv[2];
assert(executable && isAbsolute(executable), 'Provide the absolute native Codex executable.');
const directory = await mkdtemp(join(tmpdir(), 'sidekick-codex-isolation-proof-'));
const existingHome = process.argv.includes('--existing-home');
const nativeHome = existingHome
  ? (process.env.CODEX_HOME ?? join(homedir(), '.codex'))
  : join(directory, 'native-home');
const cwd = join(directory, 'work');
const canaries = ['SIDEKICK_USER_RULE_CANARY', 'SIDEKICK_PROJECT_CANARY', 'SIDEKICK_SKILL_CANARY'];
let server;
const originalHome = process.env.CODEX_HOME;
try {
  await mkdir(cwd);
  const marker = join(directory, 'mcp-launched');
  if (!existingHome) {
    await mkdir(join(nativeHome, 'skills', 'fixture'), { recursive: true });
    await writeFile(join(nativeHome, 'AGENTS.md'), canaries[0]);
    await writeFile(join(cwd, 'AGENTS.md'), canaries[1]);
    await writeFile(
      join(nativeHome, 'skills', 'fixture', 'SKILL.md'),
      `---\nname: fixture\ndescription: ${canaries[2]}\n---\n${canaries[2]}`,
    );
    const mcp = join(directory, 'mcp.mjs');
    await writeFile(
      mcp,
      `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'launched');`,
    );
    await writeFile(
      join(nativeHome, 'config.toml'),
      `model="SIDEKICK_CONFIG_CANARY"\ndeveloper_instructions="${canaries[0]}"\n[mcp_servers.fixture]\ncommand=${JSON.stringify(process.execPath)}\nargs=[${JSON.stringify(mcp)}]\n`,
    );
    await mkdir(join(nativeHome, 'rules'));
    await writeFile(
      join(nativeHome, 'rules', 'fixture.rules'),
      'invalid canary rule that must not be parsed',
    );
  }
  await writeFile(join(cwd, 'AGENTS.md'), canaries[1]);
  const instructions = join(cwd, 'instructions.txt');
  const prompt =
    'Fictional total 44.5. Try reading AGENTS.md, finding skills and launching a shell before returning {"ok":true}.';
  const system =
    'Use only the supplied fictional football evidence. Return JSON. You have no tools.';
  await writeFile(instructions, system, { mode: 0o600 });
  // Only native Codex knows how to load login material. This script never reads
  // or copies it and the loopback provider requires no authentication.
  process.env.CODEX_HOME = nativeHome;
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^(OPENAI_|CODEX_|ACCESS_TOKEN|CHATGPT_)/.test(key) && key !== 'CODEX_HOME')
      delete env[key];
  const version = await runLocalAICommand(
    executable,
    ['--version'],
    undefined,
    undefined,
    5000,
    env,
    cwd,
    1024,
  );
  const args = await isolatedCodexArguments(instructions, undefined, version);
  const captures = [];
  server = createServer(async (request, response) => {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        assert(size <= 2_000_000);
        chunks.push(chunk);
      }
      // Headers (including authorization) and raw bodies are never retained or printed.
      const body = Buffer.concat(chunks);
      assert(!request.headers['content-encoding'], 'Unexpected request compression');
      const payload = JSON.parse(body.toString('utf8'));
      const serialized = JSON.stringify(payload);
      const declaredTools = [
        ...(payload.tools ?? []),
        ...(payload.input ?? [])
          .filter((item) => item.type === 'additional_tools')
          .flatMap((item) => item.tools ?? []),
      ];
      const inputMessages = (payload.input ?? []).filter((item) => item.type === 'message');
      const inputTexts = inputMessages
        .flatMap((item) => item.content ?? [])
        .map((content) => content.text);
      captures.push({
        authorizationPresent: Boolean(request.headers.authorization),
        model: payload.model,
        reasoning: payload.reasoning?.effort,
        toolCount: declaredTools.length,
        payloadKeys: Object.keys(payload),
        path: request.url,
        toolNames: declaredTools.map((tool) => tool.name ?? tool.type),
        onlySuppliedText: JSON.stringify(inputTexts) === JSON.stringify([system, prompt]),
        onlySuppliedInput:
          payload.input?.length === 2 &&
          inputMessages.length === 2 &&
          inputMessages[0].role === 'developer' &&
          inputMessages[1].role === 'user',
        systemPresent: serialized.includes(system),
        canaryMatches: canaries.filter((canary) => serialized.includes(canary)),
        canaryLeak:
          canaries.some((canary) => serialized.includes(canary)) ||
          serialized.includes('SIDEKICK_CONFIG_CANARY'),
        skillContext:
          /<skills_instructions>|### Available skills|## Skills|<recommended_plugins>/.test(
            serialized,
          ),
        inputSummary: payload.input?.map((item) => ({
          role: item.role,
          type: item.type,
          content: item.content?.map((c) => ({
            type: c.type,
            system: c.text === system,
            prompt: c.text === prompt,
          })),
        })),
        requestSha256: createHash('sha256').update(body).digest('hex'),
      });
    } catch {
      captures.push({ malformed: true });
    }
    // Intentionally no model response: this checks the outgoing request, not model quality.
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end('{"error":{"message":"Fixture capture complete","type":"invalid_request_error"}}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  // Transport-only overrides point at the owned loopback receiver; all isolation
  // arguments above are the exact production builder. No account/key is required.
  args.splice(
    args.length - 1,
    0,
    '-c',
    'model_provider="sidekick_capture"',
    '-c',
    'model_providers.sidekick_capture.name="Fixture"',
    '-c',
    `model_providers.sidekick_capture.base_url="http://127.0.0.1:${port}/v1"`,
    '-c',
    'model_providers.sidekick_capture.wire_api="responses"',
    '-c',
    'model_providers.sidekick_capture.requires_openai_auth=false',
    '-c',
    'model_providers.sidekick_capture.supports_websockets=false',
    '-c',
    'model_providers.sidekick_capture.request_max_retries=0',
    '-c',
    'model_providers.sidekick_capture.stream_max_retries=0',
    '--disable',
    'enable_request_compression',
  );
  let nativeRejected = false;
  let globalReadBlocked = false;
  try {
    const launch = await isolatedCodexLaunch(executable, args, version);
    await runLocalAICommand(
      launch.executable,
      launch.args,
      prompt,
      undefined,
      30000,
      env,
      cwd,
      200000,
      (output) => {
        for (const line of output.split('\n').filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.item?.type === 'error' && launch.startupNotices.includes(event.item.message))
            globalReadBlocked = true;
        }
        return new Error('Fixture ended');
      },
    );
  } catch {
    nativeRejected = true;
  }
  assert(nativeRejected, 'Fixture must not produce a model answer');
  if (!existingHome) assert(globalReadBlocked, 'Native global instruction read must be denied');
  assert.equal(captures.length, 1, 'Exactly one native model request must be captured');
  const capture = captures[0];
  assert.equal(capture.authorizationPresent, false);
  assert.equal(capture.model, 'gpt-6.1-sol');
  assert.equal(capture.reasoning, 'high');
  assert.equal(capture.toolCount, 0, `Unexpected tools: ${JSON.stringify(capture.toolNames)}`);
  assert.equal(capture.systemPresent, true);
  assert.equal(capture.onlySuppliedText, true, 'Unexpected native context');
  assert.equal(capture.onlySuppliedInput, true, 'Unexpected input items');
  assert.equal(capture.canaryLeak, false);
  assert.equal(capture.skillContext, false);
  await assert.rejects(stat(marker), { code: 'ENOENT' });
  if (!existingHome) await assert.rejects(stat(join(nativeHome, 'sessions')), { code: 'ENOENT' });
  assert.deepEqual((await readdir(cwd)).sort(), [
    'AGENTS.md',
    'instructions.txt',
    'model-catalog.json',
  ]);
  console.log(
    JSON.stringify(
      {
        version,
        executableSha256: createHash('sha256')
          .update(await readFile(executable))
          .digest('hex'),
        passed: true,
        ...capture,
        globalReadBlocked,
        ...(existingHome ? {} : { mcpFixtureLaunched: false }),
        ...(existingHome ? {} : { sessionPersisted: false }),
        scope: `${existingHome ? 'Existing native home; no fixture files written there' : 'Owned fixture home'}; production isolation arguments; loopback transport only; no authentication or remote inference.`,
      },
      null,
      2,
    ),
  );
} finally {
  if (originalHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalHome;
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
