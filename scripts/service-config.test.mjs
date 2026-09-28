import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createServer } from 'node:net';
import {
  renderLaunchAgent,
  renderSystemdUnit,
  serviceEnvironment,
  servicePaths,
  windowsTaskCommand,
} from './service-config.mjs';
import { assertPortAvailable } from './port-check.mjs';
import { assertSupportedNodeVersion, isSupportedNodeVersion } from './runtime-check.mjs';

describe('background service configuration', () => {
  const paths = servicePaths('/Users/League Owner', '/Users/League Owner/app');

  it('creates an isolated launch agent with a sign-in start and failure recovery', () => {
    const config = renderLaunchAgent({
      nodePath: '/usr/local/bin/node',
      repositoryRoot: '/Users/League Owner/app',
      serviceScript: paths.serviceScript,
      stdoutLog: paths.stdoutLog,
      stderrLog: paths.stderrLog,
    });
    assert.match(config, /<key>RunAtLoad<\/key><true\/>/);
    assert.match(config, /<key>SuccessfulExit<\/key><false\/>/);
    assert.ok(config.includes('/Users/League Owner/app'));
  });

  it('escapes systemd paths and runs in the user scope', () => {
    const config = renderSystemdUnit({
      nodePath: '/opt/Node $RUNTIME/node',
      repositoryRoot: '/home/league/100% ready/app',
      serviceScript: '/home/league/100% ready/app/scripts/service-runner.mjs',
    });
    assert.match(config, /Restart=on-failure/);
    assert.match(config, /UMask=0077/);
    assert.match(config, /WantedBy=default.target/);
    assert.match(config, /ExecStart="\/opt\/Node \$\$RUNTIME\/node"/);
    assert.match(config, /WorkingDirectory="\/home\/league\/100%% ready\/app"/);
  });

  it('quotes Windows executable and runner paths for Task Scheduler', () => {
    assert.equal(
      windowsTaskCommand('C:\\Program Files\\nodejs\\node.exe', 'C:\\Sidekick\\service.mjs'),
      '"C:\\Program Files\\nodejs\\node.exe" "C:\\Sidekick\\service.mjs"',
    );
  });

  it('stores the service data folder and runtime logs under a private user directory', () => {
    assert.equal(paths.dataDirectory, '/Users/League Owner/.sidekick');
    assert.equal(paths.logDirectory, '/Users/League Owner/.sidekick/logs');
    assert.equal(paths.stdoutLog, '/Users/League Owner/.sidekick/logs/service.log');
  });

  it('sets a stable data directory for the background service without changing unrelated environment', () => {
    assert.deepEqual(
      serviceEnvironment({ PATH: '/bin', SIDEKICK_SERVICE: '0' }, paths.dataDirectory),
      {
        PATH: '/bin',
        SIDEKICK_SERVICE: '1',
        SIDEKICK_USER_DATA_DIR: paths.dataDirectory,
      },
    );
  });
});

describe('production launcher port check', () => {
  it('reports a clear error when another local process owns the API port', async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    try {
      await assert.rejects(
        assertPortAvailable('127.0.0.1', address.port),
        /already in use.*Stop the app using it.*npm start again/s,
      );
    } finally {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe('Node.js runtime requirement', () => {
  it('accepts supported releases and gives an actionable error for older versions', () => {
    assert.equal(isSupportedNodeVersion('22.12.0'), false);
    assert.equal(isSupportedNodeVersion('22.13.0'), true);
    assert.equal(isSupportedNodeVersion('23.0.0'), true);
    assert.equal(isSupportedNodeVersion('not-a-version'), false);
    assert.throws(() => assertSupportedNodeVersion('20.11.1'), /Node.js 22.13 or newer/);
  });
});
