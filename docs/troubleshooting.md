# Troubleshooting

This guide covers common local setup and integration problems. For current platform support
and known verification limits, see the [support matrix](support-matrix.md). For background
service details, see the [setup guide](setup.md).

## Install and open the dashboard

- **A command says Node.js is too old:** install Node.js 22.13 or newer, then reopen the
  terminal and check `node --version`.
- **`npm ci` fails on Linux while building the credential-store dependency:** install the
  distribution's `libsecret` development package first. Debian and Ubuntu use
  `libsecret-1-dev`; KWallet or another Secret Service implementation must also be available
  in the user's D-Bus session at runtime.
- **The app reports that a port is already in use:** production uses `127.0.0.1:4173` and
  Vite development uses `127.0.0.1:5173`. Stop the other process or Sidekick instance, then
  try again. Sidekick does not share a port or bind to a network interface.
- **The browser did not open:** after `npm start`, open `http://127.0.0.1:4173` manually.
  During development, use `http://127.0.0.1:5173` after `npm run dev`.

## Credentials and provider connections

- **Settings says the credential store is unavailable:** check the operating system's
  credential manager. On Linux, make sure a Secret Service provider is unlocked in the
  current user's D-Bus session. `npm run credentials:smoke` checks save/read/delete using a
  random value in a separate namespace; it does not test or alter saved Sidekick keys.
- **A private ESPN league cannot connect:** confirm the owner supplied current session
  credentials and has access to that league in ESPN. ESPN private access uses an undocumented
  compatibility path; it does not bypass ESPN authentication or access controls.
- **Yahoo authorization fails:** confirm the Yahoo Fantasy Sports application is approved,
  complete the browser authorization flow, and retry. The owner must obtain the API access.
- **An AI runtime test fails:** confirm the endpoint, model, executable, and arguments in
  Settings. For an AI CLI, use a command available to the same user that runs Sidekick;
  background services may have a shorter `PATH` than an interactive terminal. The test sends
  a fixed data-free prompt. It does not verify report quality or model billing.
- **Apple Foundation Models CLI is missing:** that option is available only on supported
  macOS versions with Apple's `fm respond` command installed. Choose another configured AI
  runtime when it is unavailable.

## Reports and scheduled jobs

- **A scheduled report did not run:** keep the desktop app open or install the source
  checkout's per-user background service. Check Schedule history for a failure or skipped
  league, verify the action is enabled and targets the intended league, and confirm the
  selected timezone. One-time events missed earlier dates are shown in history instead of
  being sent late; same-day missed events can catch up.
- **A league is missing or looks stale:** open the Leagues page and refresh it. Check the
  connector's authentication, sync timestamp, and reported error. Unknown or stale data is
  labeled; the report does not silently treat unavailable evidence as current.
- **A report has no projections or lineup estimate:** confirm a compatible, current
  projection source is imported and that the league's scoring and starter data are recognized.
  Estimates are withheld when required player, scoring, or lineup evidence is incomplete.

## News, email, SMS, and iMessage

- **News is unavailable or only some feeds load:** open the news status and refresh again
  later. Feed publishers can change availability or formats. Existing cache is used only as
  indicated in the dashboard; citations link to the source story.
- **A delivery is marked uncertain:** check the provider's sent messages or delivery log
  before retrying. Do not assume that a timeout means nothing was sent. Resend retries reuse
  an idempotency key for the supported window; Twilio SMS has no documented idempotency key,
  so an owner-confirmed retry can duplicate a message.
- **An email is not in the expected thread:** use the dashboard's email reply action and
  verify the imported message has a valid Message-ID. Thread replies use the `In-Reply-To`
  header and a `Re:` subject; provider acceptance does not guarantee recipient delivery.
- **BlueBubbles cannot send or sync:** check that the Mac bridge is online, the configured
  server URL and password are current, and the selected chat GUID is correct. Non-loopback
  servers require HTTPS. Confirm that history polling or webhook sync is enabled if automatic
  history updates are expected.

## Data, backups, and recovery

- **The database cannot open:** do not delete or replace `state.sqlite` manually. Use the
  desktop recovery prompt or the documented offline recovery command; both preserve the
  original database and journals before replacing data. If recovery cannot validate a copy,
  preserve the damaged files and consult the [recovery section in Setup](setup.md#desktop-installer).
- **An encrypted `.ssb` backup will not restore:** enter the original backup passphrase.
  There is no password reset for a per-file encrypted backup. Confirm the file is intact and
  keep a separate copy before retrying restore.
- **A restore removed automatic delivery or a custom CLI:** restore intentionally resets
  automatic-send settings and custom AI/CLI runtimes to review-required defaults. Recheck
  credentials and policies in Settings before enabling sends.
- **You moved the desktop data folder:** use the app's data-folder controls and let the
  migration finish before launching a second instance. The active data directory is shown in
  desktop Settings; credentials remain in the operating system credential manager.

## Background service and logs

From a source checkout, use `npm run service -- status`, `start`, `stop`, `update`, or
`uninstall`. `update` rebuilds the app and reinstalls the service. Keep the repository and
Node.js installation in place. The source service writes private logs under
`~/.sidekick/logs`; Settings can show a filtered recent log tail. Desktop Settings also has a
filtered API log view in its selected data directory.

## MCP clients

For the packaged app, start Sunday Sidekick before connecting an MCP client. For a source
checkout, use the MCP command and environment shown in the [MCP setup guide](mcp.md). If a
client cannot reach the API, confirm it uses the same local user and, when customized, the
same `SIDEKICK_USER_DATA_DIR`. MCP send tools remain unavailable until explicitly enabled in
Settings; uncertain deliveries cannot be retried through MCP.

## Installation warnings

The current packages are unsigned and there is no public stable release yet. Do not bypass
operating-system publisher warnings to install an unsigned build. See the
[desktop installation guide](release-install.md) for current release status and platform
limits.
