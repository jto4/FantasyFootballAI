import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { LocalStore } from '../apps/api/dist/store.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const apiEntry = join(repositoryRoot, 'apps', 'api', 'dist', 'index.js');
const sampleCount = 30;
const reportSampleCount = 10;

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function processRssBytes(pid) {
  const command =
    process.platform === 'win32'
      ? [
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`],
        ]
      : ['ps', ['-o', 'rss=', '-p', String(pid)]];
  const result = spawnSync(command[0], command[1], { encoding: 'utf8', timeout: 5_000 });
  if (result.status !== 0) return undefined;
  const value = Number(result.stdout.trim());
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return process.platform === 'win32' ? value : value * 1024;
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      reject(new Error('Benchmark API did not stop in time.'));
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once('exit', onExit);
  });
}

async function seedRepresentativeState(databasePath, fakeAIPath) {
  const store = new LocalStore(databasePath);
  await store.load();
  await store.update((state) => {
    state.settings.newsSources = [];
    state.settings.aiRuntime = {
      mode: 'cli',
      model: 'synthetic-benchmark',
      command: process.execPath,
      args: JSON.stringify(fakeAIPath),
      baseUrl: 'https://api.openai.com/v1',
      temperature: 0.8,
      maxOutputTokens: 1200,
    };
    for (let leagueIndex = 0; leagueIndex < 8; leagueIndex += 1) {
      const leagueId = `benchmark-league-${leagueIndex}`;
      state.leagues.push({
        id: leagueId,
        platform: 'sleeper',
        name: `league-${leagueIndex}`,
        displayName: `Benchmark League ${leagueIndex}`,
        teamCount: 12,
        scoring: { pass_td: 4, rec: 0.5 },
        settings: { currentWeek: 8 },
        teams: Array.from({ length: 12 }, (_, teamIndex) => ({
          id: `team-${leagueIndex}-${teamIndex}`,
          name: `Team ${teamIndex}`,
          owner: `Manager ${teamIndex}`,
          wins: teamIndex % 7,
          losses: (teamIndex + 2) % 7,
          pointsFor: 800 + teamIndex * 13.7,
          roster: Array.from({ length: 16 }, (_, playerIndex) => ({
            id: `player-${leagueIndex}-${teamIndex}-${playerIndex}`,
            name: `Player ${playerIndex}`,
            position: ['QB', 'RB', 'WR', 'TE'][playerIndex % 4],
            nflTeam: 'DET',
          })),
        })),
        connectedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
      });
    }
    for (let profileIndex = 0; profileIndex < 80; profileIndex += 1) {
      state.memories.push({
        id: `benchmark-profile-${profileIndex}`,
        name: `Manager ${profileIndex}`,
        sourceName: 'benchmark-import.txt',
        importedAt: new Date().toISOString(),
        sourceText: `Example local conversation context. ${'League chat sentence. '.repeat(100)}`,
        styleNotes: 'Direct, playful, and concise.',
        contextNotes: 'Prefers fantasy football banter.',
        banterPreference: 'Keep jokes about fantasy decisions.',
        avoidTopics: 'Personal topics.',
      });
    }
    for (let reportIndex = 0; reportIndex < 300; reportIndex += 1) {
      state.reports.push({
        id: `benchmark-report-${reportIndex}`,
        leagueId: `benchmark-league-${reportIndex % 8}`,
        kind: 'power-rankings',
        createdAt: new Date().toISOString(),
        title: `Week ${reportIndex + 1} power rankings`,
        body: `Representative saved report. ${'A measured, data-backed fantasy analysis. '.repeat(20)}`,
        citations: [],
        status: 'draft',
      });
    }
  });
  store.close();
}

const dataDirectory = await mkdtemp(join(tmpdir(), 'sunday-sidekick-perf-'));
const databasePath = join(dataDirectory, 'benchmark.sqlite');
const fakeAIPath = join(dataDirectory, 'fake-ai.mjs');
await writeFile(
  fakeAIPath,
  [
    "let prompt = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => (prompt += chunk));",
    "process.stdin.on('end', () => {",
    '  if (!prompt.trim()) process.exitCode = 1;',
    "  else process.stdout.write('Synthetic benchmark report.');",
    '});',
    '',
  ].join('\n'),
  { mode: 0o600 },
);
const port = await reservePort();
await seedRepresentativeState(databasePath, fakeAIPath);

const child = spawn(process.execPath, [apiEntry], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    HOME: dataDirectory,
    USERPROFILE: dataDirectory,
    SIDEKICK_PORT: String(port),
    SIDEKICK_DATABASE_FILE: databasePath,
    SIDEKICK_USER_DATA_DIR: dataDirectory,
  },
  stdio: 'ignore',
});
const baseUrl = `http://127.0.0.1:${port}`;
const startupStartedAt = performance.now();

try {
  let ready = false;
  const startupDeadline = Date.now() + 30_000;
  while (Date.now() < startupDeadline) {
    if (child.exitCode !== null) throw new Error(`Benchmark API exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.equal(ready, true, 'benchmark API did not become healthy');
  const startupMs = performance.now() - startupStartedAt;

  const healthLatencies = [];
  const stateLatencies = [];
  const reportGenerationLatencies = [];
  let statePayloadBytes = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    let startedAt = performance.now();
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.ok, true);
    await health.arrayBuffer();
    healthLatencies.push(performance.now() - startedAt);

    startedAt = performance.now();
    const state = await fetch(`${baseUrl}/api/state`);
    assert.equal(state.ok, true);
    const payload = await state.arrayBuffer();
    statePayloadBytes = payload.byteLength;
    stateLatencies.push(performance.now() - startedAt);
  }

  for (let index = 0; index < reportSampleCount; index += 1) {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}/api/reports/power-rankings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leagueId: 'benchmark-league-0', draftOnly: true }),
    });
    const responseBody = await response.text();
    assert.equal(
      response.status,
      201,
      `synthetic report generation failed: ${responseBody.slice(0, 500)}`,
    );
    const report = JSON.parse(responseBody);
    assert.equal(report.status, 'draft');
    assert.equal(report.body, 'Synthetic benchmark report.');
    reportGenerationLatencies.push(performance.now() - startedAt);
  }

  const htmlStartedAt = performance.now();
  const htmlResponse = await fetch(`${baseUrl}/`);
  assert.equal(htmlResponse.ok, true, 'built dashboard shell was not served');
  const html = await htmlResponse.text();
  const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
    (match) => match[1],
  );
  let assetBytes = 0;
  for (const assetPath of assetPaths) {
    const asset = await fetch(new URL(assetPath, baseUrl));
    assert.equal(asset.ok, true, `dashboard asset failed to load: ${assetPath}`);
    assetBytes += (await asset.arrayBuffer()).byteLength;
  }
  const dashboardLoadMs = performance.now() - htmlStartedAt;
  const rssBytes = processRssBytes(child.pid);

  console.log(
    JSON.stringify(
      {
        benchmark: 'local-api-and-dashboard-smoke',
        os: `${process.platform}-${process.arch}`,
        node: process.version,
        fixture: { leagues: 8, teams: 96, memberProfiles: 80, reports: 300 },
        samples: sampleCount,
        startupMs: Math.round(startupMs),
        healthLatencyMs: {
          p50: Number(percentile(healthLatencies, 0.5).toFixed(2)),
          p95: Number(percentile(healthLatencies, 0.95).toFixed(2)),
        },
        stateLatencyMs: {
          p50: Number(percentile(stateLatencies, 0.5).toFixed(2)),
          p95: Number(percentile(stateLatencies, 0.95).toFixed(2)),
        },
        syntheticReportGenerationMs: {
          samples: reportSampleCount,
          p50: Number(percentile(reportGenerationLatencies, 0.5).toFixed(2)),
          p95: Number(percentile(reportGenerationLatencies, 0.95).toFixed(2)),
          note: 'Includes prompt preparation, local CLI process startup, and SQLite persistence; excludes model inference.',
        },
        statePayloadKiB: Number((statePayloadBytes / 1024).toFixed(1)),
        dashboardShellAndAssetsMs: Math.round(dashboardLoadMs),
        dashboardAssetsKiB: Number((assetBytes / 1024).toFixed(1)),
        apiWorkingSetMiB: rssBytes ? Number((rssBytes / 1024 / 1024).toFixed(1)) : null,
        note: 'Synthetic local fixture; excludes live provider sync and browser paint timing.',
      },
      null,
      2,
    ),
  );
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    try {
      await waitForExit(child, 5_000);
    } catch {
      child.kill('SIGKILL');
      await waitForExit(child, 5_000);
    }
  }
  await rm(dataDirectory, { recursive: true, force: true });
}
