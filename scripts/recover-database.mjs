import Database from 'better-sqlite3';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_DATABASE_BYTES = 50 * 1024 * 1024;
const MAX_RECOVERY_SCRIPT_BYTES = 100 * 1024 * 1024;
const BACKUP_NAME =
  /^before-(?:restore|upgrade)-[\dTZ.-]+(?:-page)?(?:-salvage)?-[a-f\d]{8}\.sqlite$/;
const PAGE_RECOVERY_TIMEOUT_MS = 15_000;
const SQLITE_CLI_CANDIDATES =
  process.platform === 'win32'
    ? ['sqlite3.exe', 'sqlite3']
    : ['sqlite3', '/usr/bin/sqlite3', '/bin/sqlite3'];
const DEFAULT_AI_RUNTIME = {
  mode: 'api',
  model: 'gpt-4o-mini',
  command: '',
  args: '',
  baseUrl: 'https://api.openai.com/v1',
};

export function isValidAppDatabase(path) {
  let database;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    const integrity = database.pragma('integrity_check');
    if (
      !Array.isArray(integrity) ||
      integrity.length !== 1 ||
      integrity[0]?.integrity_check !== 'ok'
    )
      return false;
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name),
    );
    if (!tables.has('app_settings') && !tables.has('app_state')) return false;
    const table = tables.has('app_settings') ? 'app_settings' : 'app_state';
    const row = database.prepare(`SELECT payload FROM ${table} WHERE id = 1`).get();
    if (typeof row?.payload !== 'string') return false;
    const stored = JSON.parse(row.payload);
    if (!stored || typeof stored !== 'object') return false;
    if (table === 'app_state') {
      const settings = stored.settings;
      return Boolean(
        settings &&
        typeof settings === 'object' &&
        !Array.isArray(settings) &&
        Array.isArray(stored.leagues) &&
        Array.isArray(stored.reports),
      );
    }
    if (Array.isArray(stored)) return false;
    for (const requiredTable of ['leagues', 'reports'])
      if (!tables.has(requiredTable)) return false;
    for (const name of ['leagues', 'reports']) {
      const rows = database.prepare(`SELECT payload FROM ${name}`).all();
      for (const item of rows) {
        if (typeof item.payload !== 'string') return false;
        const parsed = JSON.parse(item.payload);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

/** Recover raw pages only when a local SQLite CLI exposes `.recover`; never invoke a shell. */
export async function recoverSqlitePages(sourcePath, destinationPath) {
  const executable = findSqliteRecoverExecutable();
  if (!executable)
    throw new Error('A local SQLite CLI with raw-page recovery support is unavailable.');
  let lastFailure;

  let recovery;
  let importer;
  let timer;
  try {
    await rm(destinationPath, { force: true });
    // SQLite creates files using the process umask, which may make a recovery copy
    // readable by other local accounts. Pre-create it with owner-only permissions.
    const privateDestination = await open(destinationPath, 'wx', 0o600);
    await privateDestination.close();
    // --ignore-freelist avoids bringing deleted rows back into the owner's recovered library.
    recovery = spawn(executable, [sourcePath, '.recover --ignore-freelist'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    importer = spawn(executable, [destinationPath], {
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    });
    // A parser error may close stdin before `.recover` finishes writing its bounded output.
    importer.stdin.on('error', () => {});

    let scriptBytes = 0;
    let exceededLimit = false;
    recovery.stdout.on('data', (chunk) => {
      scriptBytes += chunk.length;
      if (scriptBytes <= MAX_RECOVERY_SCRIPT_BYTES) return;
      exceededLimit = true;
      recovery.kill();
      importer.kill();
    });
    recovery.stdout.pipe(importer.stdin);
    timer = setTimeout(() => {
      recovery.kill();
      importer.kill();
    }, PAGE_RECOVERY_TIMEOUT_MS);

    const [recoveryExit, importerExit] = await Promise.all([
      waitForProcess(recovery),
      waitForProcess(importer),
    ]);
    if (exceededLimit) throw new Error('SQLite page recovery exceeded its output limit.');
    if (recoveryExit.code !== 0 || importerExit.code !== 0 || scriptBytes === 0)
      throw new Error('The installed SQLite CLI could not recover this database.');

    const recovered = await stat(destinationPath);
    if (!recovered.isFile() || recovered.size === 0 || recovered.size > MAX_DATABASE_BYTES)
      throw new Error('SQLite page recovery produced an invalid or oversized database.');
    await chmod(destinationPath, 0o600).catch(() => undefined);
    return { scriptBytes, recoveredBytes: recovered.size };
  } catch (error) {
    lastFailure = error;
    recovery?.kill();
    importer?.kill();
  } finally {
    if (timer) clearTimeout(timer);
    recovery?.stdout?.destroy();
    importer?.stdin?.destroy();
  }

  throw new Error(
    lastFailure instanceof Error
      ? lastFailure.message
      : 'A SQLite CLI with raw-page recovery support is unavailable.',
  );
}

/** Resolve only a local executable that advertises the recovery command. */
export function findSqliteRecoverExecutable() {
  for (const executable of SQLITE_CLI_CANDIDATES) {
    try {
      const probe = spawnSync(executable, [':memory:', '.help recover'], {
        encoding: 'utf8',
        timeout: 2_000,
        maxBuffer: 16 * 1024,
        windowsHide: true,
      });
      if (probe.status !== 0 || !probe.stdout.includes('.recover')) continue;

      // Some packaged SQLite CLIs list `.recover` but omit its dbpage recovery module.
      const recoveryProbe = spawnSync(executable, [':memory:', '.recover --ignore-freelist'], {
        encoding: 'utf8',
        timeout: 2_000,
        maxBuffer: 16 * 1024,
        windowsHide: true,
      });
      if (supportsSqlitePageRecovery(probe, recoveryProbe)) return executable;
    } catch {
      // A missing candidate should not prevent probing later platform-specific paths.
    }
  }
  return undefined;
}

export function supportsSqlitePageRecovery(helpProbe, recoveryProbe) {
  return (
    helpProbe.status === 0 &&
    typeof helpProbe.stdout === 'string' &&
    helpProbe.stdout.includes('.recover') &&
    recoveryProbe.status === 0 &&
    typeof recoveryProbe.stdout === 'string' &&
    /\bBEGIN(?: TRANSACTION)?;/i.test(recoveryProbe.stdout)
  );
}

function waitForProcess(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

export async function inspectDataDirectory(dataDirectory) {
  const databasePath = join(dataDirectory, 'state.sqlite');
  const backupsPath = join(dataDirectory, 'backups');
  let current;
  try {
    const details = await stat(databasePath);
    current = {
      exists: true,
      size: details.size,
      valid: isValidAppDatabase(databasePath),
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    current = { exists: false, size: 0, valid: false };
  }
  const names = await readdir(backupsPath).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const backups = [];
  for (const name of names.filter((item) => BACKUP_NAME.test(item))) {
    const path = join(backupsPath, name);
    try {
      const details = await stat(path);
      if (!details.isFile() || details.size > MAX_DATABASE_BYTES) continue;
      backups.push({
        name,
        size: details.size,
        createdAt: details.mtime.toISOString(),
        valid: isValidAppDatabase(path),
      });
    } catch {
      // A backup can disappear while the inspection command is running.
    }
  }
  backups.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return { databasePath, current, backups };
}

export async function restoreFromBackup(dataDirectory, backupName) {
  if (!BACKUP_NAME.test(backupName))
    throw new Error('Choose a named restore, upgrade, or partial-salvage SQLite backup.');
  const databasePath = join(dataDirectory, 'state.sqlite');
  const backupPath = join(dataDirectory, 'backups', backupName);
  const backupStat = await stat(backupPath);
  if (
    !backupStat.isFile() ||
    backupStat.size === 0 ||
    backupStat.size > MAX_DATABASE_BYTES ||
    !isValidAppDatabase(backupPath)
  )
    throw new Error('The selected backup is not a valid Sunday Sidekick database.');

  const servicePortPath = join(dataDirectory, 'service-port');
  if (
    await stat(servicePortPath).then(
      () => true,
      () => false,
    )
  )
    throw new Error('Stop Sunday Sidekick before restoring a database.');

  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const recoveryPath = join(
    dataDirectory,
    `recovery-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`,
  );
  const incomingPath = join(dataDirectory, `.state-recovery-${randomUUID()}.sqlite`);
  await mkdir(recoveryPath, { mode: 0o700 });
  let originalMoved = false;
  let incomingInstalled = false;
  try {
    await copyFile(backupPath, incomingPath);
    await chmod(incomingPath, 0o600).catch(() => undefined);
    prepareRestoredDatabase(incomingPath);
    if (!isValidAppDatabase(incomingPath))
      throw new Error('The selected backup changed during restore validation.');

    for (const suffix of ['', '-wal', '-shm']) {
      const currentPath = `${databasePath}${suffix}`;
      try {
        await copyFile(currentPath, join(recoveryPath, `state.sqlite${suffix}`));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    for (const suffix of ['', '-wal', '-shm'])
      await chmod(join(recoveryPath, `state.sqlite${suffix}`), 0o600).catch(() => undefined);
    await writeFile(
      join(recoveryPath, 'RESTORE-NOTE.txt'),
      `Preserved before restoring ${backupName}. Keep this directory until the restored app has been reviewed.\n`,
      { mode: 0o600 },
    );

    try {
      await rename(databasePath, join(recoveryPath, 'state.sqlite'));
      originalMoved = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    for (const suffix of ['-wal', '-shm']) {
      try {
        await rename(`${databasePath}${suffix}`, join(recoveryPath, `state.sqlite${suffix}`));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    await rename(incomingPath, databasePath);
    incomingInstalled = true;
    await chmod(databasePath, 0o600).catch(() => undefined);
    return { databasePath, recoveryPath, backupName };
  } catch (error) {
    if (incomingInstalled) await rm(databasePath, { force: true });
    if (originalMoved)
      await rename(join(recoveryPath, 'state.sqlite'), databasePath).catch(() => undefined);
    for (const suffix of ['-wal', '-shm']) {
      if (
        await stat(join(recoveryPath, `state.sqlite${suffix}`)).then(
          () => true,
          () => false,
        )
      )
        await copyFile(
          join(recoveryPath, `state.sqlite${suffix}`),
          `${databasePath}${suffix}`,
        ).catch(() => undefined);
    }
    throw error;
  } finally {
    await rm(incomingPath, { force: true });
  }
}

/** Preserve an unreadable database and journals so the owner can initialize an empty store. */
export async function moveDamagedDatabaseAside(dataDirectory) {
  const servicePortPath = join(dataDirectory, 'service-port');
  if (
    await stat(servicePortPath).then(
      () => true,
      () => false,
    )
  )
    throw new Error('Stop Sunday Sidekick before starting with an empty database.');

  const databasePath = join(dataDirectory, 'state.sqlite');
  const recoveryPath = join(
    dataDirectory,
    `recovery-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  await mkdir(recoveryPath, { mode: 0o700 });
  const moved = [];
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      const source = `${databasePath}${suffix}`;
      const destination = join(recoveryPath, `state.sqlite${suffix}`);
      try {
        await rename(source, destination);
        moved.push([source, destination]);
        await chmod(destination, 0o600).catch(() => undefined);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    await writeFile(
      join(recoveryPath, 'RECOVERY-NOTE.txt'),
      'The unreadable database and SQLite journals were moved here before starting a new empty Sunday Sidekick library. Keep this folder if you may need professional data recovery.\n',
      { mode: 0o600, flag: 'wx' },
    );
    return { databasePath, recoveryPath };
  } catch (error) {
    for (const [source, destination] of moved.reverse())
      await rename(destination, source).catch(() => undefined);
    await rm(recoveryPath, { recursive: true, force: true });
    throw error;
  }
}

/** Copy every independently readable and application-valid record into a new safety backup. */
export async function salvageDamagedDatabase(dataDirectory, internalRecovery = {}) {
  const servicePortPath = join(dataDirectory, 'service-port');
  if (
    await stat(servicePortPath).then(
      () => true,
      () => false,
    )
  )
    throw new Error('Stop Sunday Sidekick before salvaging its database.');

  const databasePath = internalRecovery.sourcePath ?? join(dataDirectory, 'state.sqlite');
  try {
    const details = await stat(databasePath);
    if (!details.isFile() || details.size === 0 || details.size > MAX_DATABASE_BYTES)
      throw new Error('The damaged database is empty or exceeds the 50 MB salvage limit.');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('No local database was found to salvage.');
    throw error;
  }
  let rawPageRecoveryFailure;
  if (!internalRecovery.rawPageRecovery) {
    if (isValidAppDatabase(databasePath))
      throw new Error('The current database is valid; no partial-row salvage is needed.');

    // Try SQLite's page-aware recovery before row salvage: integrity_check can detect
    // corruption on pages that ordinary table reads never visit.
    const recoveredPath = join(dataDirectory, `.page-recovery-${randomUUID()}.sqlite`);
    try {
      const pageRecovery = await recoverSqlitePages(databasePath, recoveredPath);
      return await salvageDamagedDatabase(dataDirectory, {
        sourcePath: recoveredPath,
        rawPageRecovery: true,
        pageRecovery,
      });
    } catch (error) {
      // The local CLI may be absent or unable to recover; continue with row-level salvage.
      rawPageRecoveryFailure = error;
    } finally {
      await rm(recoveredPath, { force: true });
      await rm(`${recoveredPath}-wal`, { force: true });
      await rm(`${recoveredPath}-shm`, { force: true });
    }
  }

  let database;
  let tables;
  let legacyState;
  let rawSettings;
  const skipped = {
    settings: 0,
    leagues: 0,
    reports: 0,
    memories: 0,
    projections: 0,
    runs: 0,
    jobs: 0,
  };
  const rawRecords = {
    leagues: [],
    reports: [],
    memories: [],
    playerProjections: [],
    scheduledRuns: [],
    generationJobs: [],
  };

  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true });
    tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name),
    );
    if (tables.has('app_settings')) {
      try {
        const row = database.prepare('SELECT payload FROM app_settings WHERE id = 1').get();
        if (typeof row?.payload === 'string') rawSettings = JSON.parse(row.payload);
      } catch {
        skipped.settings += 1;
      }
    }
    if (tables.has('app_state')) {
      try {
        const row = database.prepare('SELECT payload FROM app_state WHERE id = 1').get();
        if (typeof row?.payload === 'string') legacyState = JSON.parse(row.payload);
      } catch {
        skipped.settings += 1;
      }
    }
    if (legacyState?.settings !== undefined) rawSettings = legacyState.settings;
    const legacyArrays = {
      leagues: legacyState?.leagues,
      reports: legacyState?.reports,
      memories: legacyState?.memories,
      player_projections: legacyState?.playerProjections,
      scheduled_runs: legacyState?.scheduledRuns,
      generation_jobs: legacyState?.generationJobs,
    };
    const sourceTables = {
      leagues: 'leagues',
      reports: 'reports',
      memories: 'memories',
      playerProjections: 'player_projections',
      scheduledRuns: 'scheduled_runs',
      generationJobs: 'generation_jobs',
    };
    for (const [target, table] of Object.entries(sourceTables)) {
      const skippedKey =
        { playerProjections: 'projections', scheduledRuns: 'runs', generationJobs: 'jobs' }[
          target
        ] ?? target;
      if (tables.has(table)) {
        try {
          const rows = database
            .prepare(`SELECT id, payload FROM ${table} ORDER BY rowid`)
            .iterate();
          for (const row of rows) {
            try {
              const value = JSON.parse(row.payload);
              if (
                !value ||
                typeof value !== 'object' ||
                Array.isArray(value) ||
                typeof row.id !== 'string' ||
                value.id !== row.id
              ) {
                skipped[skippedKey] += 1;
                continue;
              }
              rawRecords[target].push(value);
            } catch {
              skipped[skippedKey] += 1;
            }
          }
        } catch {
          // Keep rows read before a damaged page; a broken table must not discard other tables.
        }
      }
      if (!rawRecords[target].length && Array.isArray(legacyArrays[table])) {
        rawRecords[target] = legacyArrays[table].filter(
          (value) => value && typeof value === 'object' && !Array.isArray(value),
        );
      }
    }
  } catch (error) {
    const readError =
      'SQLite could not read the database pages. Use a valid safety copy or choose Start fresh from the app recovery prompt.';
    const pageError = internalRecovery.rawPageRecovery ? error : rawPageRecoveryFailure;
    const detail =
      pageError instanceof Error
        ? pageError.message
        : 'No local SQLite page-recovery tool could recover this file.';
    throw new Error(`${readError} Raw-page recovery was unavailable or unsuccessful: ${detail}`, {
      cause: error,
    });
  } finally {
    database?.close();
  }

  const storeModulePaths = recoveryStoreModulePaths(fileURLToPath(import.meta.url));
  let validateState;
  let LocalStore;
  for (const storeModulePath of storeModulePaths) {
    try {
      ({ validateState, LocalStore } = await import(pathToFileURL(storeModulePath).href));
      break;
    } catch {
      // Try the adjacent checkout or packaged app root before reporting a missing build.
    }
  }
  if (typeof validateState !== 'function' || typeof LocalStore !== 'function')
    throw new Error('Build the app with `npm run build` before attempting partial-row salvage.');

  let settings;
  try {
    settings = validateState({ settings: rawSettings ?? {}, leagues: [], reports: [] }).settings;
  } catch {
    settings = validateState({ settings: {}, leagues: [], reports: [] }).settings;
    skipped.settings += 1;
  }

  const state = {
    settings,
    leagues: [],
    reports: [],
    memories: [],
    playerProjections: [],
    scheduledRuns: [],
    generationJobs: [],
  };
  const uniqueLeagues = uniqueRecords(rawRecords.leagues);
  skipped.leagues += rawRecords.leagues.length - uniqueLeagues.length;
  state.leagues = uniqueLeagues.filter((record) =>
    isSalvageLeague(record, validateState, settings),
  );
  skipped.leagues += uniqueLeagues.length - state.leagues.length;
  const uniqueReports = uniqueRecords(rawRecords.reports);
  skipped.reports += rawRecords.reports.length - uniqueReports.length;
  state.reports = uniqueReports.filter((record) =>
    isSalvageReport(record, validateState, settings, state.leagues),
  );
  skipped.reports += uniqueReports.length - state.reports.length;
  const uniqueMemories = uniqueRecords(rawRecords.memories);
  skipped.memories += rawRecords.memories.length - uniqueMemories.length;
  state.memories = uniqueMemories.filter(isSalvageMemory);
  skipped.memories += uniqueMemories.length - state.memories.length;
  const uniqueRuns = uniqueRecords(rawRecords.scheduledRuns);
  skipped.runs += rawRecords.scheduledRuns.length - uniqueRuns.length;
  state.scheduledRuns = uniqueRuns.filter(isSalvageRun);
  skipped.runs += uniqueRuns.length - state.scheduledRuns.length;
  const acceptedProjections = [];
  const uniqueProjections = uniqueRecords(rawRecords.playerProjections);
  let rejectedProjectionRows = 0;
  for (const projection of uniqueProjections) {
    try {
      validateState({
        settings,
        leagues: state.leagues,
        reports: state.reports,
        memories: state.memories,
        playerProjections: [...acceptedProjections, projection],
        scheduledRuns: state.scheduledRuns,
      });
      acceptedProjections.push(projection);
    } catch {
      rejectedProjectionRows += 1;
    }
  }
  skipped.projections +=
    rawRecords.playerProjections.length - uniqueProjections.length + rejectedProjectionRows;
  state.playerProjections = acceptedProjections;
  const requests = new Set();
  const uniqueJobs = uniqueRecords(rawRecords.generationJobs);
  skipped.jobs += rawRecords.generationJobs.length - uniqueJobs.length;
  for (const job of uniqueJobs) {
    try {
      if (requests.has(job.requestId)) throw new Error('Duplicate request ID.');
      validateState({ ...state, generationJobs: [job] });
      requests.add(job.requestId);
      state.generationJobs.push(job);
    } catch {
      skipped.jobs++;
    }
  }
  const salvaged = validateState(state);
  const counts = {
    leagues: salvaged.leagues.length,
    reports: salvaged.reports.length,
    memories: salvaged.memories.length,
    projections: salvaged.playerProjections.length,
    runs: salvaged.scheduledRuns.length,
    jobs: salvaged.generationJobs.length,
    skipped: Object.values(skipped).reduce((sum, count) => sum + count, 0),
  };
  const recoveredRecords =
    counts.leagues +
    counts.reports +
    counts.memories +
    counts.projections +
    counts.runs +
    counts.jobs;
  if (recoveredRecords === 0 && (!isRecord(rawSettings) || Object.keys(rawSettings).length === 0))
    throw new Error('No independently valid Sunday Sidekick records could be salvaged.');

  const temporaryDirectory = join(dataDirectory, `.salvage-${randomUUID()}`);
  const temporaryDatabase = join(temporaryDirectory, 'state.sqlite');
  const temporaryState = join(temporaryDirectory, 'state.json');
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
  let store;
  try {
    await writeFile(temporaryState, JSON.stringify(salvaged), { mode: 0o600, flag: 'wx' });
    store = new LocalStore(temporaryDatabase, temporaryState);
    await store.load();
    store.close();
    store = undefined;
    const checkpoint = new Database(temporaryDatabase);
    checkpoint.pragma('wal_checkpoint(TRUNCATE)');
    checkpoint.close();
    prepareRestoredDatabase(temporaryDatabase);
    if (!isValidAppDatabase(temporaryDatabase))
      throw new Error('The salvaged database did not pass Sunday Sidekick validation.');
    const backupsPath = join(dataDirectory, 'backups');
    await mkdir(backupsPath, { recursive: true, mode: 0o700 });
    await chmod(backupsPath, 0o700).catch(() => undefined);
    const timestamp = new Date().toISOString().replaceAll(':', '-');
    const pageMarker = internalRecovery.rawPageRecovery ? '-page' : '';
    const backupName = `before-restore-${timestamp}${pageMarker}-salvage-${randomUUID().slice(0, 8)}.sqlite`;
    const backupPath = join(backupsPath, backupName);
    await rename(temporaryDatabase, backupPath);
    await chmod(backupPath, 0o600).catch(() => undefined);
    return {
      backupName,
      counts,
      rawPageRecovery: internalRecovery.rawPageRecovery === true,
      ...(internalRecovery.pageRecovery ? { pageRecovery: internalRecovery.pageRecovery } : {}),
    };
  } finally {
    store?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/** The recovery module lives in scripts/ in a checkout and at the app root when packaged. */
export function recoveryStoreModulePaths(recoveryScriptPath) {
  const scriptDirectory = dirname(recoveryScriptPath);
  return [
    join(scriptDirectory, 'apps', 'api', 'dist', 'store.js'),
    join(dirname(scriptDirectory), 'apps', 'api', 'dist', 'store.js'),
  ];
}

function uniqueRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (!isRecord(record) || typeof record.id !== 'string' || !record.id || record.id.length > 300)
      return false;
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

function isSalvageLeague(record, validateState, settings) {
  if (
    !isRecord(record) ||
    !['espn', 'yahoo', 'sleeper'].includes(record.platform) ||
    typeof record.name !== 'string' ||
    typeof record.displayName !== 'string' ||
    record.name.length > 200 ||
    record.displayName.length > 200 ||
    !Number.isInteger(record.teamCount) ||
    record.teamCount < 1 ||
    record.teamCount > 100 ||
    !isRecord(record.scoring) ||
    Object.values(record.scoring).some(
      (points) => typeof points !== 'number' || !Number.isFinite(points),
    ) ||
    !isRecord(record.settings) ||
    !Array.isArray(record.teams) ||
    record.teams.length > 100 ||
    record.teams.some(
      (team) => !isRecord(team) || typeof team.id !== 'string' || typeof team.name !== 'string',
    ) ||
    typeof record.connectedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.connectedAt))
  )
    return false;
  try {
    validateState({ settings, leagues: [record], reports: [] });
    return true;
  } catch {
    return false;
  }
}

function isSalvageReport(record, validateState, settings, leagues) {
  if (
    !isRecord(record) ||
    typeof record.leagueId !== 'string' ||
    ![
      'offseason-update',
      'draft-hype',
      'draft-review',
      'power-rankings',
      'matchup-preview',
    ].includes(record.kind) ||
    typeof record.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    typeof record.title !== 'string' ||
    typeof record.body !== 'string' ||
    !Array.isArray(record.citations) ||
    record.citations.some(
      (citation) =>
        !isRecord(citation) ||
        typeof citation.title !== 'string' ||
        typeof citation.url !== 'string',
    ) ||
    !['draft', 'sent'].includes(record.status)
  )
    return false;
  try {
    validateState({ settings, leagues, reports: [record] });
    return true;
  } catch {
    return false;
  }
}

function isSalvageMemory(record) {
  if (
    !isRecord(record) ||
    ['id', 'name', 'sourceName', 'importedAt', 'sourceText', 'styleNotes', 'contextNotes'].some(
      (key) => typeof record[key] !== 'string',
    ) ||
    !Number.isFinite(Date.parse(record.importedAt)) ||
    record.name.length > 200 ||
    record.sourceName.length > 200 ||
    record.sourceText.length > MAX_DATABASE_BYTES ||
    record.styleNotes.length > 20_000 ||
    record.contextNotes.length > 20_000 ||
    ['banterPreference', 'avoidTopics', 'sourceAuthorId'].some(
      (key) => record[key] !== undefined && typeof record[key] !== 'string',
    ) ||
    (record.includeInReports !== undefined && typeof record.includeInReports !== 'boolean') ||
    (record.leagueIds !== undefined &&
      (!Array.isArray(record.leagueIds) ||
        !record.leagueIds.every((leagueId) => typeof leagueId === 'string')))
  )
    return false;
  return true;
}

function isSalvageRun(record) {
  if (
    !isRecord(record) ||
    typeof record.kind !== 'string' ||
    typeof record.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.startedAt)) ||
    !['running', 'succeeded', 'failed'].includes(record.status) ||
    (record.finishedAt !== undefined && typeof record.finishedAt !== 'string') ||
    (record.detail !== undefined && typeof record.detail !== 'string') ||
    (record.leagueResults !== undefined &&
      (!Array.isArray(record.leagueResults) ||
        record.leagueResults.some(
          (result) =>
            !isRecord(result) ||
            typeof result.leagueId !== 'string' ||
            typeof result.displayName !== 'string' ||
            !['succeeded', 'failed'].includes(result.status) ||
            (result.detail !== undefined && typeof result.detail !== 'string'),
        )))
  )
    return false;
  return true;
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** A recovery restore can contain edited settings; pause sends and executable endpoints. */
function prepareRestoredDatabase(path) {
  const database = new Database(path);
  try {
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name),
    );
    const table = tables.has('app_settings') ? 'app_settings' : 'app_state';
    const row = database.prepare(`SELECT payload FROM ${table} WHERE id = 1`).get();
    const stored = JSON.parse(row.payload);
    const settings = table === 'app_state' ? stored.settings : stored;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
      throw new Error('Backup does not contain valid settings.');

    const requiresRuntimeReview =
      settings.aiRuntime?.mode === 'cli' ||
      settings.aiRuntime?.baseUrl !== DEFAULT_AI_RUNTIME.baseUrl;
    const hasAutomaticActions =
      Array.isArray(settings.actions) &&
      settings.actions.some((action) => action?.mode === 'automatic');
    const requiresReview =
      requiresRuntimeReview ||
      hasAutomaticActions ||
      settings.imessageAutoSyncEnabled === true ||
      settings.twilioConversationAutoSyncEnabled === true ||
      settings.mcpDeliveryEnabled === true;
    if (!requiresReview) return;

    const nextSettings = {
      ...settings,
      ...(requiresRuntimeReview ? { aiRuntime: DEFAULT_AI_RUNTIME } : {}),
      imessageAutoSyncEnabled: false,
      twilioConversationAutoSyncEnabled: false,
      mcpDeliveryEnabled: false,
      ...(requiresRuntimeReview || hasAutomaticActions
        ? {
            actions: Array.isArray(settings.actions)
              ? settings.actions.map((action) => ({
                  ...action,
                  mode: 'draft',
                  schedule: { ...action.schedule, enabled: false },
                }))
              : settings.actions,
          }
        : {}),
    };
    const payload =
      table === 'app_state'
        ? JSON.stringify({ ...stored, settings: nextSettings })
        : JSON.stringify(nextSettings);
    database.prepare(`UPDATE ${table} SET payload = ? WHERE id = 1`).run(payload);
  } finally {
    database.close();
  }
}

function parseArguments(args) {
  let mode;
  let dataDirectory =
    process.env.SIDEKICK_USER_DATA_DIR ??
    process.env.SIDEKICK_DATA_DIR ??
    join(homedir(), '.sidekick');
  let backupName;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check') mode = 'check';
    else if (argument === '--salvage') mode = 'salvage';
    else if (argument === '--restore-backup') {
      mode = 'restore';
      backupName = args[++index];
      if (!backupName || backupName.startsWith('--'))
        throw new Error('--restore-backup requires a backup filename.');
    } else if (argument === '--data-dir') {
      const selected = args[++index];
      if (!selected) throw new Error('--data-dir requires a path.');
      dataDirectory = selected;
    } else if (argument === '--help' || argument === '-h') mode = 'help';
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!mode) throw new Error('Choose --check, --salvage, or --restore-backup <filename>.');
  return { mode, dataDirectory: resolve(dataDirectory), backupName };
}

async function main(args) {
  const options = parseArguments(args);
  if (options.mode === 'help') {
    console.info('Usage: npm run db:recover -- --check [--data-dir PATH]');
    console.info('       npm run db:recover -- --salvage [--data-dir PATH]');
    console.info('       npm run db:recover -- --restore-backup FILE [--data-dir PATH]');
    return;
  }
  if (options.mode === 'check') {
    const report = await inspectDataDirectory(options.dataDirectory);
    console.info(`Data folder: ${options.dataDirectory}`);
    console.info(
      `Current database: ${report.current.exists ? (report.current.valid ? 'valid' : 'invalid or unreadable') : 'not found'} (${report.databasePath})`,
    );
    console.info('Backups:');
    if (report.backups.length === 0) console.info('  No recognized safety backups found.');
    for (const backup of report.backups)
      console.info(`  ${backup.valid ? 'valid' : 'invalid'}  ${backup.name}`);
    if (!report.current.valid && !report.backups.some((item) => item.valid)) process.exitCode = 2;
    return;
  }
  if (options.mode === 'salvage') {
    const result = await salvageDamagedDatabase(options.dataDirectory);
    console.info(`Created a validated partial-data recovery backup: ${result.backupName}`);
    console.info(
      `Recovered ${result.counts.leagues} leagues, ${result.counts.reports} reports, ${result.counts.memories} member profiles, ${result.counts.projections} projections, and ${result.counts.runs} scheduled runs.`,
    );
    console.info(
      `${result.counts.skipped} malformed or invalid rows/settings were omitted. The current database was not changed; restart Sunday Sidekick and choose the salvage backup in its recovery prompt.`,
    );
    return;
  }
  if (!options.backupName) throw new Error('--restore-backup requires a backup filename.');
  const result = await restoreFromBackup(options.dataDirectory, options.backupName);
  console.info(`Restored ${result.backupName} to ${result.databasePath}.`);
  console.info(
    `The previous database and any SQLite journal files were preserved in ${result.recoveryPath}.`,
  );
  console.info(
    'Start Sunday Sidekick and review your leagues, reports, memory, schedules, and delivery settings.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Database recovery failed.');
    process.exitCode = 1;
  });
}
