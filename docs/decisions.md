# Architecture Decisions

## 001: Local-first TypeScript workspaces

Use npm workspaces and TypeScript for shared domain contracts across the service, dashboard, and integrations. Keep the API bound to loopback and persist league state on the host.

## 002: Authorized platform access

Use public/documented APIs or owner-authorized credentials. Do not bypass authentication or access controls. Expose unsupported and expired connections as actionable status.

## 003: Draft-first outbound behavior

Every generated communication is saved as a draft before delivery. An enabled provider and explicit action policy then determine whether it stays in review or is sent automatically.

## 004: Versioned local SQLite state

Use `better-sqlite3` with versioned, transactional migrations and separate settings, league, report, memory, and scheduled-run records. Preserve the existing JSON file after importing it once. Keep each domain record as validated JSON payload for now so schema migrations can be added without coupling persistence to every provider field; incremental upserts avoid rewriting unchanged records. Release packaging must validate the native SQLite module on every supported OS and Node runtime. Add backup/restore and field-level relational schemas as the product's data contracts stabilize.

Owners can export a consistent ZIP backup containing the SQLite database and generated images, and restore it through the dashboard. Restore validates archive paths, sizes, database integrity, and app schema before replacement, stages images with private permissions, and rolls the database back if image replacement fails. Legacy SQLite-only backups remain supported. Backups exclude OS credential-store secrets and should be treated as private data.

## 005: Per-user background service

Use native per-user launch mechanisms for source-checkout background operation: LaunchAgent, systemd user service, or a Task Scheduler logon task. Do not request administrator privileges or listen on a non-loopback interface. Point the service at the current repository and installed Node runtime. Keep logs in the owner's `.sidekick/logs` directory and rotate them when the service starts. The packaged Electron app includes a launch-at-sign-in setting and system-tray behavior: closing the dashboard hides the window, while explicit Quit stops scheduled actions. Cross-platform lifecycle verification remains a release gate.
The packaged app also offers an owner-controlled start-hidden preference. Windows and Linux pass a startup-only argument; macOS uses Electron's login-item launch indicator plus a local preference. Ordinary launches continue to show the dashboard.

The systemd unit renderer quotes generated executable and working-directory paths and escapes systemd's percent specifiers and dollar-variable syntax, as well as shell-significant quote and backslash characters. Unit-rendering tests cover paths containing spaces, `%`, and `$`; actual lifecycle behavior remains a per-platform verification item.

## 006: Yahoo installed-app OAuth

Use Yahoo's installed-application authorization-code flow with `redirect_uri=oob`: the owner approves access in Yahoo, copies the displayed code into Settings, and the local API exchanges it. Store client credentials plus current and rotated tokens in the OS credential manager. Do not bundle a shared Yahoo client secret; Fantasy Sports API approval and app registration belong to each owner. Yahoo's [OAuth troubleshooting guide](https://developer.yahoo.com/oauth2/guide/troubleshooting/) describes the installed-application profile, and its [Fantasy Sports access page](https://sports.yahoo.com/developer/access/) describes app approval.

## 007: Dark editorial dashboard direction

Use a near-black base, oversized white headings, neutral dark surfaces, thin dividers,
and restrained accent colors for the dashboard. Keep league data in open lists and rows
so the visual treatment does not hide dense fantasy information behind decorative cards.
The choice follows the linked Bakers Studio reference's publicly indexed description; the
original post media could not be inspected directly. Record the gap in
`docs/design/dashboard-visual-direction.md` and avoid claiming exact screenshot fidelity.
Superseded by decision 018 after the owner requested adaptation of the reference's visible
frames.

## 008: Self-contained desktop packaging

Use Electron Forge to package the existing local dashboard and API for the owner's current
operating system. Run the API in an owned utility process, keep the renderer sandboxed,
bind only to loopback, store SQLite state in the OS application-data directory, and stop
the API when the desktop app quits. Closing the main window hides it to a system tray with
reopen and explicit Quit actions. Build from a standalone temporary staging tree with
physical copies of local workspace packages because Forge's dependency crawler skips npm
workspace symlinks. Build and smoke-check locally before retaining installers; public
publication, signing, and cross-platform checks remain separate gates. Launch-at-sign-in is
handled by a user setting; closing the dashboard hides it to the tray, and explicit Quit stops
scheduled work. A separate opt-in setting starts the app hidden on the next sign-in; it does
not change ordinary launches.

## 009: Keep the integrations entry point as a public barrel

Keep provider implementations in focused modules and re-export supported adapters from
`packages/integrations/src/index.ts`. Platform-specific response parsing and connector
behavior belong in `platforms.ts`; consumers and tests continue importing through the
package entry point. This keeps provider implementation changes localized without
changing the package's public surface.

## 010: League milestones create drafts

Allow owners to enter dated milestones for each connected league. The scheduler refreshes
only the selected league, persists event completion and missed/interrupted run history, and
always saves a draft rather than following the regular action's automatic-delivery setting.
Platform-derived NFL and league event dates remain a separate future integration.

## 011: Keep fantasy platform connectors in focused modules

Separate Sleeper, Yahoo, and ESPN response parsing and connector behavior into
`platforms/sleeper.ts`, `platforms/yahoo.ts`, and `platforms/espn.ts`. Keep bounded shared
parsing helpers in `platforms/shared.ts`, and re-export the supported connectors through
`platforms.ts` and the stable integrations package entry point. This supersedes decision 009's
implementation-location sentence while preserving its public-barrel requirement.

## 012: Keep schedule suggestions draft-first

Offer a first-of-month schedule for offseason updates, Tuesday power rankings, and Wednesday
matchup previews. Applying a suggestion preserves each action's timezone, league scope, channel,
and draft-or-automatic policy. A future platform-reported draft can prefill a review-only draft-hype
event at its reported time or a post-draft review event the next day at 9 AM. Require owners to
review and add calendar events; suggestions must not silently change delivery behavior.

## 013: Electron Forge packaging dependency transition

**Superseded by decision 015.** This was a temporary tooling decision and no longer
describes the current desktop package.

Use Electron Forge `8.0.0-alpha.10` for the desktop packaging toolchain after tracing
Forge 7's rebuild chain to deprecated `tar@6` and confirming the alpha line resolves
`tar@7`. Forge 8 remains pre-release, so this is a packaging-only transitional choice
and macOS build success does not establish Windows/Linux compatibility. Keep installer
makers isolated in the desktop workspace; record remaining warnings from legacy Debian
and Windows installer dependencies and move to stable Forge 8 when it is published and
verified on the supported OS matrix.

## 014: Authorized injury-status data

Do not scrape or reverse engineer official league websites or undocumented endpoints to
obtain injury reports. The optional matchup-preview connector uses the openly published
[nflverse injuries CSV](https://github.com/nflverse/nflverse-data), distributed under CC BY 4.0.
The feed is disabled by default. It is cached locally for six hours, uses the source's current
season snapshot, and attaches data only to exact normalized player-name and NFL-team matches
on the league roster for the current week. “Not injury related” practice labels are discarded.
Reports identify the provider, local retrieval time, and exact season CSV URL; the dashboard
also attributes CC BY 4.0. Treat report labels as source-reported availability information,
never as medical advice or an independent diagnosis. If the feed is unavailable or has no exact
roster matches, report generation continues without inferred injury information. Platform
availability tags remain separately labeled as potentially stale.

## 015: Use stable Electron Forge while isolating packaging dependencies

Use stable Electron Forge 7.11.2 with an `@electron/rebuild` `^4.0.1` override until
stable Forge 8 is available. Install Forge and maker dependencies only in the temporary
desktop packaging tree rather than the root workspace, so normal development installs do
not inherit legacy installer dependency trees. The macOS ARM artifact and packaged runtime
smoke are verified locally; Windows/Linux packaging and the override need native matrix
verification. Revisit this choice when stable Forge 8 is published.

## 016: Keep the supported Node LTS line on a verified SQLite binding

Use `better-sqlite3` 12.11.1 while version 13.0.3's macOS ARM prebuild crashes when opening
a database on Node 22.13.0. The issue is reproducible with a minimal in-memory database and
is reported upstream for the Node 20/22 lines ([better-sqlite3 issue 1514](https://github.com/WiseLibs/better-sqlite3/issues/1514)); the report also records 12.11.1 working on those runtimes. The app's root recovery CLI uses the same native module, so declare it directly in the root manifest as well as the API workspace. Keep Node 22.13.0 as the minimum and exercise that version in CI; revisit the upgrade when the upstream fix is released and verified.

## 017: Encrypt downloaded portable backups

Downloaded portable backups contain private league records, reports, conversation imports,
and generated images, so encrypt them before they leave the local application. Use a
12–200-character owner passphrase, a random per-file salt and IV, scrypt key derivation, and
AES-256-GCM authentication; do not store or log the passphrase. Preserve read compatibility
for existing ZIP and SQLite backups. Automatic local safety copies remain protected by
filesystem permissions and are not encrypted because recovery must remain available without
a separately stored passphrase.

## 018: Warm editorial dashboard direction

Supersede decision 007's dark palette following the owner's request to adapt the dashboard to
the visible frames from Bakers Studio's “wave + gradient” post. Use warm cream surfaces,
editorial serif display headings, soft locally bundled gradient-wave artwork, quiet rules, and
restrained clay accents. Treat the reference as a mood source: preserve the product's existing
league workflows, controls, readable data density, responsive behavior, and accessibility.
Record the visual direction in `docs/design/dashboard-visual-direction.md`; require desktop and
narrow-width review after dashboard visual changes.

## 019: Owner-controlled desktop updates

Use Electron's native updater for packaged macOS and Windows applications, and keep Linux
updates on the distribution package or manual download path. Check for updates only after an
owner action; download in the background and require explicit approval before restarting to
install. Publish architecture-specific macOS ZIPs and Windows Squirrel metadata alongside the
manual installers, verify their checksums during release assembly, and require version tags to
match the app manifest. macOS update delivery requires signed packages; do not describe native
updates as verified until a signed public release has been installed and upgraded on supported
devices.

## 020: Publish the project under the MIT License

Use the MIT License for the public repository and distributed source and desktop packages.
Keep the standard license text in the root `LICENSE` file, declare `"license": "MIT"` in
the root package metadata, and include the license with release assets and inside each
platform archive. This license choice does not change provider terms, attribution
requirements, or restrictions on third-party data and services.
