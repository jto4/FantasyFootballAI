import { join } from 'node:path';

export const serviceName = 'Sunday Sidekick';
export const serviceLabel = 'com.sundaysidekick.app';

export function servicePaths(home, repositoryRoot) {
  const serviceScript = join(repositoryRoot, 'scripts', 'service-runner.mjs');
  const dataDirectory = join(home, '.sidekick');
  const logDirectory = join(dataDirectory, 'logs');
  return {
    serviceScript,
    dataDirectory,
    logDirectory,
    stdoutLog: join(logDirectory, 'service.log'),
    stderrLog: join(logDirectory, 'service-error.log'),
    launchAgent: join(home, 'Library', 'LaunchAgents', `${serviceLabel}.plist`),
    systemdUnit: join(home, '.config', 'systemd', 'user', 'sunday-sidekick.service'),
  };
}

export function serviceEnvironment(environment, dataDirectory) {
  return {
    ...environment,
    SIDEKICK_SERVICE: '1',
    SIDEKICK_USER_DATA_DIR: dataDirectory,
  };
}

export function renderLaunchAgent({
  nodePath,
  repositoryRoot,
  serviceScript,
  stdoutLog,
  stderrLog,
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xmlEscape(serviceLabel)}</string>
  <key>ProgramArguments</key><array><string>${xmlEscape(nodePath)}</string><string>${xmlEscape(serviceScript)}</string></array>
  <key>WorkingDirectory</key><string>${xmlEscape(repositoryRoot)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>${xmlEscape(stdoutLog)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(stderrLog)}</string>
</dict></plist>
`;
}

export function renderSystemdUnit({ nodePath, repositoryRoot, serviceScript, servicePort = 4173 }) {
  return `[Unit]
Description=Sunday Sidekick fantasy football companion
After=default.target

[Service]
Type=simple
WorkingDirectory=${systemdPathEscape(repositoryRoot)}
ExecStart=${systemdEscape(nodePath)} ${systemdEscape(serviceScript)}
Environment=SIDEKICK_PORT=${servicePort}
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
`;
}

export function windowsTaskCommand(nodePath, serviceScript) {
  return `"${nodePath}" "${serviceScript}"`;
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function systemdEscape(value) {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('%', '%%')
    .replaceAll('$', () => '$$')}"`;
}

function systemdPathEscape(value) {
  return value.replace(/[\\"%\s]/g, (character) => {
    if (character === '%') return '%%';
    const codePoint = character.codePointAt(0).toString(16).padStart(2, '0');
    return `\\x${codePoint}`;
  });
}
