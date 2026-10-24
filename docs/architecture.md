# Architecture

Dashboard appearance uses semantic CSS tokens with white as the default and an
optional dark palette. A versioned, validated browser preference is restored by
a local blocking `theme-init.js` before the React entry point, preserving
`script-src 'self'`. The header switch and Settings radios share a React external
store with local and cross-tab notifications. Browser-only clients use local
storage. Electron persists a private `appearance.json` outside the selected data
directory so the choice survives its changing loopback port. Its isolated preload
reads only a cached theme through trusted-dashboard IPC before paint; atomic
writes run asynchronously in request order and drain before graceful quit.
This device-local preference does not enter the API settings schema, SQLite,
provider payloads, or backups.

The repository is an npm workspaces monorepo. `apps/api` owns the localhost HTTP boundary, versioned SQLite persistence, and scheduling; feature routers such as `backup-routes.ts`, `image-routes.ts`, `league-routes.ts`, `member-memory-routes.ts`, `provider-routes.ts`, `state-routes.ts`, `projection-routes.ts`, `settings-routes.ts`, `report-routes.ts`, and `chat-sync-routes.ts` keep backup lifecycle, image generation/library, authorized league connection and lifecycle, member profile controls, credential/AI setup and health, read-only state, and projection import behavior outside the bootstrap through injected dependencies. `settings-validation.ts` holds the complete untrusted dashboard-settings boundary, including current league membership checks, separately from API route orchestration. Backup restore reconfigures schedules, news, retention, and chat polling through an explicit post-restore callback after the database and image library have been replaced. `apps/dashboard` is a React/Vite client; `app-state.ts` owns initial dashboard state and validates API state/news/credential payloads before rendering, the Leagues page owns connection-list rendering, the Schedule page owns schedules and job history, the Reports page owns draft editing and delivery review, the League desk owns next-action rendering, and reusable date and season-status presentation helpers stay in focused UI modules. `apps/desktop` hosts the Electron shell and packaging configuration. `packages/core` contains domain types, settings defaults, validation, and scoring-aware analysis. `packages/integrations` contains platform, AI, news, email, SMS, BlueBubbles iMessage, image, and MCP adapters. Betting-model research modules that only `scripts/` use live in `packages/core/src/research/` and `packages/integrations/src/research/`; they are not exported from either package index, so production code cannot depend on them. Platform adapters live in separate `platforms/sleeper.ts`, `platforms/yahoo.ts`, and `platforms/espn.ts` modules; `platforms/shared.ts` holds bounded parsing helpers, and `platforms.ts` preserves the stable connector barrel for consumers. `npm start` builds each workspace in dependency order before starting the production-style local app; `npm run dev` remains the development workflow. Operational API events are JSON lines with allowlisted metadata only. Desktop installs persist those events to a private rotating log set in the selected local data folder; unstructured API stderr is drained and discarded.

Provider secrets use a small credential-manager boundary backed by keytar and the operating system's keychain, credential vault, or Secret Service. Only known provider names are accepted for read, write, and delete operations; ordinary provider values are trimmed and limited to 8,000 characters. Backup passphrases preserve exact whitespace and are limited to 12–200 characters. The dashboard receives configured/not-configured status only, never stored secret values. The manager contract is tested with an in-memory fake backend so provider validation and value handling can be checked without reading or changing a developer's actual credential store.

`npm run desktop:make` builds those same workspaces, stages a standalone copy outside the npm workspace tree, installs regular runtime dependencies, and uses stable Electron Forge 7.11.2 with a maintained `@electron/rebuild` 4 override to package the desktop app for the current operating system. Packaging dependencies install only in the isolated staging app, keeping Forge out of a contributor's normal `npm ci`. The local macOS ARM package passed API/dashboard, MCP, and headless lifecycle smokes; Windows/Linux packaging remains unverified, and installer dependencies still report deprecations. Before copying artifacts, packaging rewrites internal absolute framework symlinks to relative links and preserves those link targets during copy. Smoke checks run against the copied final artifact before staging cleanup to catch broken package paths. The Electron main process starts the API in an isolated utility process on a reserved loopback port; the dashboard runs in a sandboxed, context-isolated window. The service uses the OS application-data directory for SQLite and the OS credential manager for secrets. Desktop Settings can choose another local data directory: it copies a consistent SQLite backup, existing safety backups, and saved generated images, stores the selection in an app-data preference, then shuts down and restarts against the new location. The old directory is intentionally retained for owner-managed rollback or deletion. Desktop Settings can register the app to open at sign-in using Electron login items on macOS/Windows and an XDG autostart entry on Linux. Closing the dashboard hides it to the system tray while the local API and scheduled jobs continue; choosing **Quit Sunday Sidekick** in the tray stops the API. Owners can opt to start hidden at sign-in. Launching the packaged executable with `--sidekick-headless` starts the same loopback API and scheduled jobs without creating a window or tray icon; a regular launch with the same user-data directory can then open the dashboard. The packaged macOS ARM headless smoke checks API health and SIGTERM shutdown. The source-checkout service manager remains the recommended managed background option.

Image generation sends only the owner-entered prompt and the selected OS-stored image API key to OpenAI or Stability AI. The selected provider preference is remembered in browser-local storage. GPT Image base64 and Stability AI binary results are saved as private files in the local data folder's `images/` directory, not in SQLite. Settings lists, previews, downloads, and deletes these images. Desktop data-folder moves copy this directory. Downloaded portable Settings backups contain the SQLite database and image files in a bounded ZIP archive encrypted with AES-256-GCM and a per-file scrypt-derived key; the owner supplies a 12–200-character passphrase that is never stored. Restore authenticates and validates the archive, stages private files, and replaces the database and image library together. Existing ZIP and SQLite-only backups remain accepted; local automatic safety copies are protected by filesystem permissions but are not encrypted. Hosted-image fallback URLs from compatible OpenAI models must use HTTPS and stay session-only rather than being fetched by the local server. Stability responses are bounded to 20 MB and accepted only as PNG, JPEG, or WebP.

The dashboard communicates with the API through same-origin HTTP requests. The API is loopback-only, validates the request host and origin, and applies a restrictive production Content Security Policy. Integration secrets use a credential-store abstraction; persistent league state contains no secret values. SQLite migrations use separate settings, leagues, reports, memories, and scheduled-runs tables; writes update the validated snapshot across those tables in one transaction. Existing `~/.sidekick/state.json` is imported once and retained as a migration copy. Owners can download a consistent SQLite backup and restore a validated file through Settings; restore retains a local pre-restore safety copy. Persisted report citations are limited to 20 credential-free HTTPS links with bounded titles and URLs, and old reports without citation arrays normalize to an empty list before dashboard rendering. The offline `npm run db:recover` utility checks database integrity and required state rows, lists recognized safety copies, validates the selected copy before restore, and preserves the previous database and SQLite journals in a private recovery folder. Packaged startup also offers an explicit selection among five recent valid safety copies when SQLite cannot open. Both recovery paths preserve the old database, reset custom AI/CLI runtimes, and pause automatic actions before retrying startup. Startup and offline salvage first attempt SQLite's `.recover --ignore-freelist` when a local CLI advertises the command, then validate and salvage recovered application rows into a labeled backup; without that CLI or when it cannot recover the file, row-level salvage retains independently readable valid records. The SQLite CLI is not bundled, so raw-page recovery availability depends on the owner's installed tools. Professional recovery without any valid safety copy remains unsupported. Adapters normalize external responses into shared domain types, with streaming response-size limits. League IDs are capped at 128 characters, platform-supplied display names and owner overrides at 120 characters, and control characters in display names fall back to a platform-derived label before report titles or email subjects are built.

Report generation passes report-specific evidence limits to the AI. Played-season power rankings require a common team metric; before standings exist, preseason rankings may use full-roster totals from the newest scoring-confirmed owner projection source only when every team has a complete, equal-size roster and every player matches unambiguously. If a player ID matches, its normalized projection name must agree with the roster name; name-only matching is allowed only when unique. Those totals include bench players and are labeled as a roster-strength signal, not a starter projection, standings result, or win forecast. With incomplete or unmatched data the report withholds rankings. Matchup guidance names connected opponent pairings and any platform-reported scores while clarifying that score status may be live or final and scores are not projections. Owners may import up to eight projection source sets per league, labeled with an owner-entered source name and optional public HTTPS URL; importing the same normalized name and URL replaces only that source set. An owner must affirm that imported values use the league scoring settings; unconfirmed and legacy sets stay local but are excluded from numeric analysis. CSV rows with a `week` value from 1–30 are treated as weekly estimates; blank `week` rows are season estimates. An optional `adp`/`averageDraftPosition` column stores owner-supplied average overall draft positions alongside season rows. Draft reviews use the median only when a player is unambiguously matched across at least three distinct imported source sets; source independence and accuracy are not verified. Team timing summaries require a platform-confirmed complete draft and multi-source ADP for every pick, while process grades also require complete positional replacement evidence. Partial data withholds these aggregates. The report prompt permits tentative team process grades only when the platform confirms completion, every pick has at least three-source ADP evidence, and per-team positional replacement totals are complete. The newest source set with season rows supplies player projections for draft evidence; for each matchup week, the newest source set containing that week supplies projection values so independent source scoring formats are not mixed. The bounded parser validates columns, row sizes, numeric ranges, duplicate player-period identities, and CSV quoting; imported rows stay in local SQLite and are excluded from the general dashboard state payload. Draft reviews match season estimates by platform player ID or a unique normalized name and compute projected points above replacement only when roster settings identify dedicated positional starter slots and the imported projection pool contains the corresponding replacement rank. Per-team projected surplus is included only when every logged pick maps to a team and player with a supported positional baseline; incomplete logs withhold team totals. Matchup previews sum weekly estimates only when both sides have a complete starter snapshot, either explicit matchup starter IDs with no empty slots or duplicates, or a complete roster whose every player has a recognized active or bench/reserve slot, and matching weekly projections. Roster-derived estimates are withheld if the platform-reported roster count differs from the received roster length, any slot is missing or unknown, or starter IDs repeat; this avoids presenting a sum over only the subset the app could recognize. Roster-derived estimates include the league's last sync time so the model can qualify how current those assignments are. Yahoo and ESPN normalize roster slots when the supplemental current-week roster responses provide them; this describes the received roster snapshot and does not independently verify that submitted lineups are final. Reports label estimates with their import date/source and cite the source URL when used; imported projection values are not guaranteed outcomes or verified injury data, and ADP medians are owner-supplied descriptive estimates rather than independently verified market rankings or proof of pick quality. Sleeper team snapshots retain roster IDs and attach bounded player names, positions, NFL teams, and status from a shared in-memory catalog refreshed at most daily. Yahoo reads team roster collections and league draft results with its owner-authorized OAuth token. ESPN uses the owner-supplied session cookie and owner-selected league season for `mRoster` and `mDraftDetail` reads; ESPN's response shapes are undocumented, and draft names are only attached when a player remains in a current roster. Optional roster/draft failures preserve the core league sync. Matchup reports include only an allowlist of platform roster availability tags, attribute them to the latest league sync, and describe them as potentially stale rather than verified injury reports; unsupported status strings are omitted. When explicitly enabled, previews can also use the nflverse CC BY 4.0 season injury CSV; a six-hour local cache and exact normalized name/team/current-week matching limit evidence to rostered players, “not injury related” practice strings are filtered, and the source CSV URL plus local retrieval time are provided for citation. The setting is disabled by default; feed failures or unmatched rows do not block reports, and matched availability labels are not medical advice.

Member memory has a master setting that gates import, AI analysis of imported text, and use of profile notes with AI. Report sharing and group-chat reply sharing use separate global opt-ins; group replies include no profile context unless the owner enables their dedicated setting. Turning the master setting off retains local records for review; the memory page can delete all profiles and their source messages or remove them individually. Profiles can apply across all leagues or only selected league IDs, preventing member context from one league appearing in another league's report or reply. AI prompts cap combined member context at 32,000 characters and mark any profiles omitted from that context. Legacy profiles without a saved scope retain the all-leagues behavior. Optional 30/90/365-day retention clears only original source text based on import age at save, startup, and daily cleanup; editable profile notes remain. SQLite secure-delete is enabled and the WAL is checkpointed after source purges; downloaded backups, pre-restore copies, and automatic pre-upgrade copies keep their own data and are not changed by source-text retention. Conversation import, Resend email learning, and group-chat analysis recheck opt-in after provider setup, before each author prompt, after each response, and before saving notes; revocation stops later prompts and discards unsaved results. Report member context is compared with current settings and profiles after runtime setup, after inference, and inside the draft-save transaction. Group-chat reply memory context is checked both before and after generation so a reply using newly revoked notes is not persisted.

Conversation imports accept JSON, CSV, EML, and labeled text. CSV headers are normalized across common spacing/case variants; Twilio's `Direction` assigns outbound messages to the configured owner name, and `Date Sent` is preserved as a message timestamp. EML imports retain the parsed sender and RFC-style `Date` timestamp while excluding quoted prior replies from the sender's style sample. Provider export fixtures cover both formats.

Packaged desktop update checks begin only from the owner's Settings action. The main process first
checks the public stable-release metadata, then uses Electron's native updater on macOS or Windows
to download architecture-matched assets. The updater status bridge exposes only fixed states,
bounded progress, and generic error text; an explicit restart confirmation applies a completed
update. Release assembly includes the signed macOS app ZIPs and Windows Squirrel files required by
the update service, with a distinct checksum manifest. Linux uses native package-manager or manual
updates because Electron does not provide a built-in Linux updater.

Settings includes an explicit save-and-test action for the selected AI runtime. It sends a fixed test prompt with no league or memory data and returns only success or sanitized troubleshooting guidance; normal report generation still sends the report context described in the privacy controls. Saved Twilio credentials can be checked through Twilio's read-only account endpoint; this does not create a message or retain returned account details. Resend setup offers a separately confirmed test email to an owner-entered address. Its fixed message contains no league or member data. The generic local CLI adapter streams the prompt over stdin; Apple's `fm respond` adapter passes system instructions and prompt as distinct argv values. Both execute without a shell, cap output and runtime, discard stderr, and return path-free guidance if the configured executable cannot start so local paths and prompt text do not reach API errors. The OpenAI-compatible API adapter accepts owner-configured temperature (0–2) and completion caps (128–16,384 tokens) with defaults of 0.8 and 1,200; local CLIs ignore those API-only settings. When an API response includes bounded input/output token usage, each saved report stores counts and the configured model. Optional owner-entered input/output prices per million tokens produce an approximate cost estimate; the UI identifies missing usage or prices, and estimates exclude discounts, cached-token billing, and other provider adjustments. Local CLI runtimes do not report token usage through the current interface. The Apple adapter is offered on macOS and requires the `fm` command from macOS 27 or later. The writing-style editor offers editable starting presets and always retains a freeform custom voice.

For source checkouts, `npm run service -- install` registers a per-user OS service: a LaunchAgent on macOS, a systemd user unit on Linux, or a Task Scheduler logon task on Windows. `npm run service -- update` rebuilds and reinstalls/restarts that service after the owner updates the checkout. It launches `scripts/service-runner.mjs`, which starts the compiled API without opening a browser and writes rotated logs in `~/.sidekick/logs`. The OS service runs with the current user's permissions; it does not enable remote access. The Electron package supplies a bundled runtime and produces a macOS ARM DMG locally. Closing its dashboard window hides it to the system tray, where the owner can reopen the window or explicitly quit and stop scheduled work. Code signing, public release publication, Windows/Linux package verification, and tray lifecycle verification on each OS remain release work.

Per-action settings control whether generated reports remain drafts or send automatically through an enabled provider. Owner-configured MCP draft generation always remains a draft. MCP has a separate send tool guarded by a local owner setting that defaults off and resets off after restore; it sends one existing draft per explicit call and does not permit uncertain retries. SQLite-backed delivery claims serialize sends across API processes sharing the local database; sent claims remain permanent for the report, while uncertain claims can be replaced only after explicit owner confirmation. The scheduler supports daily, weekly, and one-time local date/time schedules. Each action may target a fixed set of connected league IDs; legacy settings with no target list continue to include every connected league. One-time event completion is persisted before work begins so settings saves and restarts do not repeat the event; jobs catch up later on the same local date, while jobs whose date has passed are marked failed in scheduled history and completed without generating a late report. After each scheduled league refresh, the runner pauses offseason updates when the platform confirms regular-season or playoff weeks, and pauses weekly rankings/previews when the platform marks that league complete. Unknown phase metadata leaves the scheduled report eligible. Paused league outcomes are recorded as skipped and shown in Schedule history, and manual report generation is unchanged. The app stores the latest 100 run outcomes, and the Schedule page shows recent success, skip, or failure with sanitized guidance. Owner-authored league milestones share one UTC minute tick and run serially; validation rejects local times skipped by daylight-saving transitions. Broader platform-derived league calendars remain planned. Owners can retry failed league results manually; retries refresh current league data and create drafts only, never automatic sends. Shared read-only JSON requests retry transient fetch failures, HTTP 429, and 5xx responses up to two times, honoring `Retry-After` up to two seconds; authorization/client errors remain immediate, and non-idempotent methods are never retried. Manual league failures show sanitized access, rate-limit, service-outage, and timeout guidance. Football news uses owner-selectable ESPN NFL, PFF, FOX Sports NFL, CBS Sports NFL, and Pro Football Talk RSS feeds, a bounded in-memory cache, configurable refresh interval, manual refresh, concurrent request coalescing, source-change invalidation, and stale-cache fallback when every selected feed fails. Parsed headlines are limited to 500-character titles and credential-free HTTPS URLs no longer than 2,048 characters. Headlines carry source labels and credential-free HTTPS citation links; CBS article text is not fetched. FOX Sports feed use is limited to individual or nonprofit noncommercial use, and its attribution appears on each story. Clearing source selection disables external news requests. Report citations retain the headline URL and publication time. Owners can manually refresh a league and see its last successful sync or sanitized failure guidance in the Leagues page. The Leagues page uses the owner-selected 6-hour to 7-day stale threshold (24 hours by default); missing, invalid, and future sync timestamps are classified as unknown rather than fresh. Sleeper reads the current week's matchup endpoint only when the league season matches the NFL state season. Its documented draft `start_time` is normalized as an absolute timestamp and can prefill an owner-reviewed draft-hype calendar event in the chosen timezone when that time is still upcoming. Yahoo normalizes the documented league-settings `draft_time` Unix-seconds field to an absolute timestamp and offers the same owner-reviewed prefill. ESPN accepts only timezone-qualified ISO timestamps from `settings.draftSettings.date`, based on a community-maintained reference for an undocumented endpoint. Yahoo uses installed-app OAuth with the out-of-band authorization-code flow, stores app credentials and rotating tokens in the OS credential manager, and refreshes tokens before expiry; Fantasy Sports app approval remains an owner prerequisite. Its connector reads league settings, standings, scoreboard results, team rosters, and draft picks when available. ESPN uses the owner-supplied session cookie to read the owner-selected season, current-week scores, rosters, and draft picks; only normalized scoring type, season state, current week, inferred playoff start, and recognized roster slots are retained from its settings response, while unknown lineup-slot formats withhold roster-position evidence; live access still needs manual platform verification. Shared schedule date and timezone validation lives in `packages/core`; the API scheduler consumes the same validators instead of maintaining duplicate rules. The dashboard controls connection, schedule, memory, and delivery state, including a Stop app control that gracefully shuts down the API and scheduled tasks.

The optional iMessage adapter sends reviewed or explicitly scheduled messages through an owner-configured BlueBubbles server. Its HTTPS server URL and password are stored together in the OS credential manager; only loopback HTTP is accepted. The owner separately selects a chat GUID as the recipient. The adapter applies bounded response parsing and timeouts, disallows redirects so credentials cannot be forwarded to another host, and records ambiguous network outcomes as uncertain. Twilio SMS also rejects redirects and distinguishes definite rejections from uncertain network/provider failures. The standard Twilio Messages endpoint has no documented idempotency key, so an owner-confirmed retry after an uncertain SMS outcome can create a duplicate; the dashboard warns about this before retry. BlueBubbles requires a Mac signed into Messages; the companion itself may run on another supported OS. Manual sync and optional background polling read up to 200 recent messages from the configured chat. Polling is off by default, runs only while the companion is open, and supports 5, 15, 30, or 60 minute intervals. Owners can alternatively create a revocable webhook URL whose random bearer token is stored in the OS credential manager and shown once. A matching `new-message` event for the configured chat triggers that same bounded history sync; webhook text is never treated as authoritative message content. The receiver is loopback-only and JSON bodies are capped at 1 MB. All sync paths share message GUID and timestamp deduplication, author profile merge, retention purge, the memory master switch, and AI-analysis opt-in. Each opted-in profile-learning call receives only that author's messages and prior notes; it excludes other group participants' messages. Restoring a backup disables polling pending owner review. Sender phone/email labels are replaced for AI context, though message bodies are unchanged. BlueBubbles webhook delivery has not yet been verified against a live server.

Resend inbound email uses owner-triggered polling against the fixed Resend API origin, so the loopback-only service never exposes an inbound webhook. Credentials stay in the OS credential manager; redirects are rejected, responses and imported bodies are size-bounded, HTML becomes inert plain text, and attachments are not downloaded. A message is fetched only after the owner clicks Import. Stable sender addresses merge messages into a local profile, message IDs deduplicate imports, and retention prunes each stored email by its received timestamp. Email contents reach an AI provider only under the existing imported-conversation analysis opt-in. The sender is not treated as a reply recipient; outbound thread replies continue to use the owner's configured recipient and explicit Message-ID/subject confirmation.

Conversation file imports are previewed locally before storage. The owner maps each parsed author to an existing import-created profile or chooses a separate profile; the application does not infer identity from a matching display name. A merge appends a labeled source block and, only when imported-conversation AI analysis is enabled, sends only the new author's messages and that profile's existing notes to the selected AI runtime to update style/context; other participants' messages are excluded from that analysis call. Exact re-uploads are deduplicated by a SHA-256 digest of the export and author. Source blocks carry independent import dates so merging new material does not extend the retention date of older exports; profile notes and owner preferences remain intact when merging.

Scheduled actions support daily, weekly, monthly, and one-time cadences in the owner's timezone. Monthly schedules use a day from 1–28 so each month has a valid occurrence; missed-date history applies to one-time actions. Owners can apply first-of-month offseason updates, Tuesday power rankings, and Wednesday matchup previews as editable suggestions that preserve the action's league scope and delivery policy. A future platform-reported draft start can also prefill a review-only draft-hype event at the reported time or a post-draft review event for the following day at 9 AM in the selected timezone. The dashboard and report guidance label a playoff week only when a bounded current week and playoff start are both present; Yahoo/Sleeper values come from league settings, while ESPN H2H schedule-derived starts are explicitly marked as inferred. Missing platform data stays unknown. Scheduled-run history stores per-league success or sanitized failure details so an owner can see which selected league needs attention without exposing provider response bodies.

The dashboard follows the responsive warm editorial system documented in
`docs/design/dashboard-visual-direction.md`. The active league selector and local-service
state are in the top bar; navigation and the Stop app control remain available across
pages.

Twilio direct SMS continues to use the account Messages endpoint and configured sender number. When the owner enters a syntactically valid `CH…` Conversation SID as the SMS target, delivery instead posts the report body to that existing Twilio Conversations resource and stores its returned message SID as the receipt. This does not create conversations or participants. The Imports page can fetch one bounded page of up to 100 text messages at a time, in chronological order, and imports them into per-author profiles with message-SID deduplication and the normal AI opt-in and retention controls. Media attachments remain on Twilio. Owners can enable off-by-default 5/15/30/60-minute polling for that group; initial sync pages through the backfill without replying, then later polls scan from page zero until an existing message overlaps the saved latest index, so page growth does not strand new messages behind a stale cursor. The page/index cursor remains local. Live platform verification remains open. See the [Twilio Conversations Messages API](https://www.twilio.com/docs/conversations-classic/api/conversation-message-resource).

When group replies are explicitly enabled, a new direct first-line mention in Twilio Conversations or BlueBubbles history creates a `chat-reply` saved draft using the selected league and configured AI runtime. Initial history establishes a baseline so old messages do not produce replies. The provider message ID is retained for deduplication, while its text stays in the normal local conversation-memory retention path. Replies are excluded from scheduled actions. The default is owner review; a separate opt-in uses the existing persistent delivery claim and receipt path to send immediately to the originating configured group. Backup restore disables conversational reply and auto-send controls.

## Platform response bounds

Platform response normalization treats team, owner, and scoring labels as untrusted display data: values are length-bounded and control characters are rejected. Team collections above supported league bounds fail clearly instead of being partially analyzed. Yahoo and Sleeper settings are copied through explicit allowlists, and roster-position lists are bounded before they enter report context; ESPN follows the same allowlist pattern for its undocumented settings response. Sleeper season-state labels are retained only when they match a known platform state.

Desktop data-folder migration copies the database through the local API's consistent-backup endpoint and stages image and safety-backup trees before publishing them. Tree copies are built in a private staging directory, reject symbolic links and special files, and apply owner-only POSIX permissions to copied files and directories. On Windows, the staging directory disables inherited ACLs and grants full control only to the current account SID; its children inherit that ACL. A failed copy is removed without publishing a partial destination.

Settings writes use a shared core section allowlist and a serialized PATCH merge against current persisted settings. AI test/model discovery saves only AI fields. `settings-routes.ts`, `report-routes.ts`, and `chat-sync-routes.ts` accept injected dependencies; `report-service.ts` owns generation and consent checks, and `delivery-service.ts` owns provider delivery, claims, and receipts. The bootstrap configures these services and scheduling. Manual dashboard generation explicitly requests a draft; scheduled callers retain policy-driven delivery.

New reports save bounded generation evidence (league/news retrieval times and analytical limitations), never raw member context. Draft edits accept bounded title/body and an expected revision; the SQLite write transaction checks the persisted report, revision, and delivery claim before incrementing the revision. Any delivery attempt makes the content immutable. Sending verifies the saved revision and previewed channel/destination before claiming delivery, preserving retry payloads and existing idempotency behavior. Existing reports without evidence or a revision remain readable with a default revision of zero.

Source commands support Node 22 LTS only, pinned in `.nvmrc`/`.node-version` and CI, with a minimum-runtime CI lane. The runtime preflight opens only an in-memory SQLite probe. API startup classifies native binding failures separately from storage failures so desktop startup does not offer database recovery for an incompatible native binary.

## Durable workflow boundaries

`http-app.ts` owns the shared loopback host/origin and response-header boundary. Production and browser integration fixtures use it with the same feature routers; only provider interfaces and credential backends are substituted in fixtures. Provider adapters stay in `packages/integrations`.

`generation-jobs.ts` persists manual requests in `generation_jobs`, introduced in schema version 5 and indexed alongside archived receipts in schema version 6. `POST /api/generation-jobs` accepts a bounded request ID, league ID, and report kind, returns 202, and always creates drafts. Request IDs deduplicate both concurrent retries and completed requests; changing their input is a conflict. The queue allows 20 pending/running jobs and executes one at a time. Report generation itself also serializes provider work shared with scheduled callers. Completion links the job and saved draft in the same SQLite transaction. Shutdown/restart/restore marks unfinished jobs interrupted; provider calls are never replayed automatically. Legacy report creation waits on the same durable queue and keeps its 201 response; explicit legacy automatic-delivery requests retain their existing owner policy. Scheduled runs retain their existing durable history.

Settings section PATCH requests require a numeric `If-Match` revision from `settings.sectionRevisions`. SQLite checks the current revision under its write lock, merges the section, and increments every section changed by normalization, including derived privacy controls. Different sections can be saved independently. Restores invalidate existing form revisions. The legacy full-settings PUT remains available for older local clients; dashboard saves use the guarded PATCH contract.

Before the first outbound attempt, `delivery-service.ts` saves a credential-free envelope containing the channel, destination, public sender/account identity, subject, thread Message-ID, and exact rendered body. Resend retries retain the same idempotency key after any attempted send. A hash of the original Resend API key detects credential changes; the key itself remains exclusively in the OS credential store. Changed Resend credentials/from, Twilio account/from, or BlueBubbles server identity block retry. Old uncertain reports without envelopes cannot safely be retried through the app. Provider idempotency windows and SMS/iMessage duplicate uncertainty still require owner review.

The dashboard requests `/api/state?view=summary`, with at most 50 report summaries, recent jobs, and complete per-league review/issue counts. This endpoint never serializes report bodies or imported conversation source text. Visible windows poll every three seconds and refresh on focus; polling skips credential/news reads and keeps local form/editor state. `/api/report-history` returns filtered pages of up to 50 summaries using a stable date/ID cursor; full report content is fetched through `/api/reports/:id` when review opens. The default state response and MCP summary endpoints preserve their existing shapes.

`packages/core` separates domain types, league state, schedules, analysis, and workflow contracts behind its existing barrel. Shared guards validate nested Settings, league, report, schedule/job, edit/send, and error payloads. `api-errors.ts` adds stable error codes to legacy messages. Persistence separates defaults, types, SQL/migrations, validation/restore, and retention. Settings uses focused form/revision, Yahoo, and image-library hooks. Dashboard CSS uses canonical `tokens.css`, an ordered `app.css`, and focused `workflow.css`; consolidation preserves cascade order and selector specificity.

API advice code is split by responsibility: `advice-service.ts` runs the two-pass AI analysis and owns the data loader (`AdviceLoaded`/`AdviceLoader`); `weekly-service.ts` holds the deterministic team features (briefing, alerts, Waiver day, trade ideas, live) and receives that loader; `prop-evidence.ts`, `advice-context.ts` and `prediction-ledger.ts` are focused helpers. League-and-team routes share one handler table. `calendar-events.ts` runs league calendar events; `index.ts` keeps hoisted wrappers because schedulers are created before the report service. Provider parsers read untrusted JSON with core's `asObject`/`asList`/`asText`, and every season-from-date calculation uses `nflSeasonFor`. Dashboard single-resource loads use `hooks/useApi` (stale responses ignored, data kept on same-URL refresh); App-level state lives in focused hooks such as `useChatPanel`, `useTeamSelection` and `usePendingGeneration`.

## Durable operations

For operational contracts, see [local operations](operations.md). MCP draft creation uses
the same durable asynchronous queue as the dashboard. SQLite schema 6 adds indexed report
summary columns and compact archived request receipts; write helpers skip unchanged rows.
Dashboard hash routes encode page, league, and report selection and guard Back/Forward against
discarding unsaved edits. A top-level error boundary supports renderer recovery.

`routine-backups.ts` serializes configuration and capture, keeps machine-local schedule/status
beside encrypted archives, and stores the recovery passphrase only in the OS vault. Unlike
ordinary provider tokens, backup passphrases retain their exact whitespace. Capture validates
before publication/rotation; dry-run validation migrates only disposable copies. The internal
desktop database-copy endpoint returns SQLite explicitly; portable backups remain archives.
`operations-routes.ts` exposes backup lifecycle and sanitized diagnostic summaries through the
existing loopback/origin boundary. Data-folder moves preserve the routine backup folder.

## Workspace search

The dashboard's `search-catalog.ts` is the reviewed destination registry for settings and pages.
`search.ts` ranks plain-language aliases, words, prefixes, and bounded typos locally. Search
results use the existing route guard; setting URLs select the section, scroll, focus, and highlight
an explicit `data-search-target`. Accepted navigation resets dirty Settings forms, while rejected
navigation retains them. Search never executes a setting or outbound action.

`WorkspaceSearch` includes connected league metadata and current reports, with debounced,
cancellable local title/type lookup through the bounded report-history endpoint for older reports.
SQL LIKE queries bind escaped literals and return summaries only. Search query text is ephemeral
and never enters credentials, settings, persistent URLs, logs, exports, or provider requests.
See [workspace search](search.md) for behavior and matching limits.

## Guided user workflows

The dashboard keeps its stable internal hash destinations while presenting four primary
navigation choices and searchable optional tools. Guided setup reuses the existing
credential, settings-section, and data-free AI-test endpoints. A fresh section revision
is read before changing only AI settings; the trusted OpenAI configuration is saved
before a new key, and a newly discovered custom connection blocks provider replacement.
Keys remain transient password-field state and OS-vault values. Individual schedule
presets change the pending form to review mode; saving retains the existing optimistic
concurrency boundary. Report choice creates a durable generation job, review fetches a
saved report, and explicit send confirmation retains the existing revision/destination
checks and saved-envelope delivery semantics. Dialog portals isolate modal layering
from sticky navigation/save bars without changing focus trapping or restoration.

## Tasks, sample mode, and in-app help

Task search is a deterministic bounded local interpreter over owner queries, separate
from keyword/fuzzy ranking. Its typed destinations open Help, a Schedule editor, or
a delivery-policy preview; they never directly execute a mutation. Help entries and
FAQ routing share content and validate bookmark IDs. New preview/help components
load on demand; dialogs retain body portals and existing focus restoration.

Sample mode has isolated component state and fictional prewritten content; it does
not use service mutation endpoints, saved league/report state, provider generation,
or delivery. Real report sharing exports only saved title/body through clipboard,
plain-text download, or a user-initiated native share menu, with manual fallback.
Provider delivery records remain independent of manual sharing.

Inline Schedule editing pins a base schedules revision and saves through the existing
section-scoped endpoint. Automatic send previews also check the current delivery
revision before allowing stale recipients to be enabled. Section writes are not a
cross-process or cross-section transaction; partial report/chat-policy saves have
explicit recovery messaging. The shared timezone planner supplies display estimates,
not new scheduler execution logic or guaranteed sends.

Versioned browser setup progress stores only validated league IDs and safe wizard
choices; secrets remain in the OS vault. Managed outbound AI hosting has a separate
[proposed threat model and authentication design](managed-ai-design.md), with no
remote listener or hosted service added by this work.

The fantasy/betting advisor foundation keeps provider-specific public-data fetching
and parsing in integrations and pure evidence/roster/odds calculations in core.
Historical samples exclude future/target-week outcomes. Source dates survive outages,
missing values remain missing, and confidence denotes evidence quality rather than
win probability. The advice router uses the existing configured AI for analysis
and review, validates source/metric/player references, and atomically rejects late
canceled results. SQLite migration 7 stores up to 100 advice results independently
of reports, with backup/restore/salvage support and on-demand UI reads. Advice is
lazy-loaded and reachable through shared navigation/search/help definitions. No
platform-write or betting execution interface exists; see [advice.md](advice.md).

Advice model capability preferences live in integrations. Advice can override only
the model and per-pass output budget for its current request, reusing the saved
endpoint and credential. Overrides are checked against discovered supported choices
and never persist into report settings. Saved model prices cannot estimate an
override's cost. Responses requests disable storage and retain only completed final
assistant text. Core decision policy is included before prompting and enforced after
review, so missing evidence and uncalibrated betting forecasts cannot acquire a
strong verdict solely through model wording. History validation preserves previously
valid stored declarations; new generated recommendations require visible numbers.

Core football context computes descriptive role changes, recorded team shares and
opponent-position totals with identity, completeness and date cutoffs. It does not
silently adjust imported projections. API evidence budgeting preserves comparison
players, primary estimates/provenance and decision totals, shares repeated metric
metadata/caveats and indexed player warnings once in model prompts, and discloses
omitted secondary detail. Both passes receive explicit table-decoding instructions. Saved metrics retain
descriptions. Required evidence that exceeds the limits fails before generation;
source references close over retained evidence, including unavailable metadata.

Core advice perception selects bounded recent player/team news, deduplicates coverage
and records publication dates separately from retrieval dates. The API protects
coverage/activity references through evidence budgeting and enforces unknown tone
without a directly cited current headline. Saved optional coverage is validated
before rendering; old history remains compatible. Explicit catalog Sleeper IDs
enable cross-platform activity matching without conflating player-ID namespaces.

The injury integration retains validated GSIS, season type and optional explicit-
timezone report updates. Advice matching requires current regular-season week,
team/position and a verified identity. A separate report/retrieval freshness policy
and conflict check gate status overrides; undated or missing reports remain unknown.
Player warnings carry practice/update context into prompts and saved rendering.
Weekly uncertain availability limits recommendation strength outside the model.

Core rolling betting forecasts separate fitted estimates, chronological probability
evaluation and empirical calibration from AI judgments and retrospective hit rates.
Only earlier weeks enter each evaluation case. A source/sample/calibration/price gate
can permit at most a tentative choice; unsupported cases remain Hold. Optional
forecast metadata is validated in saved advice and old history remains compatible.
Evidence freshness is anchored after public-context downloads finish, preventing
fresh retrievals from appearing future-dated relative to request start.

The opt-in advice evaluation uses fictional snapshots and isolated in-memory state
through the production service. Fixed expectations and raw reviewed-answer grading
separate model judgment from deterministic policy corrections. It never loads the
owner's settings/history or credentials. CLI generation honors validated per-request
deadlines with its existing cancellation, output bounds and forced termination.
Complete lineup comparisons can account for a recorded inactive bench player
without manufacturing an estimate; missing active-player estimates remain unknown.
Exact Claude CLI executable names select a provider-specific adapter for per-child
output/reasoning limits and requested zero retries. Arbitrary CLI tools retain the
generic interface; no credentials, authentication flow or owner settings are rewritten.
Betting confidence stays Low when no evaluated forecast supports a pick, including
when the model omits its optional forecast.

Lineup candidates include eligible roster alternatives rather than only the
optimizer's highest-estimate starters. Shared domain validation checks the model's
entire starting selection against the actual slots and requires visible estimate
support for replacements and displaced players. The saved selection has its own
computed total; a different highest-estimate lineup remains an explicit comparison.

Lineup requests may instead supply two to twenty candidate IDs for a single
start/sit spot. Core checks selected-team ownership and shared supported slot
eligibility, evaluates coverage only for those selected players, and stores an
optional `startSit` scope instead of whole-lineup assignments. Both model passes
must cite each eligible alternative's weekly estimate and select exactly one.
Unknown selected active estimates still withhold a pick; inactive options cannot
be selected. A contextual lower estimate receives an actual opportunity-cost
metric and the existing tentative verdict/confidence reduction. Dashboard slot
checks reuse the shared parser and fixed typed server errors reject invalid
ownership/eligibility without inference. Request/result bounds and loopback,
provider, credential and transaction boundaries remain unchanged.
Contextual departures stay tentative with a confidence cap and no borrowed optimizer
margin. Invalid first drafts receive fixed local validation feedback without raw
rejected text or provider diagnostics.

Advice can explicitly select the typed `SignedInAIConnection` integration. The
installed Claude CLI login check exposes only availability, and generation uses
the subscription-backed Opus preset in an isolated working directory. Neither
client paths nor CLI arguments are accepted by advice routes. Both passes use the
same selected provider; failure cannot invoke the saved report provider. Fixed
connection probes serialize with analyses and cancel on disconnect. Selection is
stored in the result request, with no report/schedule/settings or vault mutation.

The subscription adapter validates the native JSON result envelope, including its
error flag, and extracts only result text and bounded usage counts. Failure output,
native session/account metadata and billing estimates never leave the integration.
Fixed provider-limit/budget/invalid-response categories preserve no-fallback semantics.

Projection periods are shared validated season/week intervals. Imports and database
validation enforce their shape; advice matches the exact requested horizon. Trades
consume explicit remaining projections through the selected league final week rather
than full-season totals or historical subtraction. Scope/period remain in saved
evidence, preserving old history without relabeling its original estimates.

### Existing ChatGPT login for advice

Advisor numerical placeholders include their computed value and unit. The shared
core renderer removes only an identical immediately repeated unit in explanation
text, preserving stored assessments, metric values, different units and paragraph
boundaries. Analysis and review instructions disclose this formatting contract so
the model can write readable descriptions without adding duplicate units.

`SignedInCodexConnection` is a typed integrations adapter selected explicitly with
`connection: codex-cli`. The saved AI/report/schedule configuration is untouched.
Both passes use GPT-6.1-Sol with high reasoning; failures do not select another
provider. Login status is native, bounded and reduced to availability. No tokens
or account identifiers are opened, copied, returned or persisted by Sidekick.

Generation supports verified Codex CLI 0.162.0-alpha.2 and, on macOS,
0.162.0-alpha.17.2. It runs in an owned temporary directory
with an owned system-instructions file, stdin evidence, ephemeral/read-only execution,
ignored user config/rules, no project instructions/history/web/tools/plugins/apps and
canonical installed-skill disables. Discovery is bounded and detects symlink cycles;
incomplete discovery and unverified native versions fail closed. Child environment
removes inherited API routing and desktop/session pipes, preserving native CODEX_HOME.
Owned files are removed on success, failure and cancellation. CLI output is bounded;
only a final agent message plus terminal completion and safe usage counts are retained.
Native reasoning, session IDs, errors and stderr are not saved or exposed.
The newer macOS build additionally disables orchestrator skills/MCP, native agent
and request-input tools, and shared-daemon startup. An owned pinned model catalog
uses standard tool mode, no patch/experimental tools and no Node runtime; server
model capability metadata otherwise overrides feature disables. The selected model
and high reasoning remain unchanged. macOS `sandbox-exec` denies reads of canonical
global instruction paths without relocating or opening login credentials. This
wrapper permits normal native authentication/networking; the read-only CLI sandbox
and absent model tools provide the advice execution restrictions. Missing isolation
controls fail closed. The exact expected global-instruction read denial is tolerated
only before a turn, alongside the known Code Mode startup notice. The exact
known startup notice for disabled Code Mode is tolerated before the turn; other errors
and tool events reject the result.

The subscription route has no supported per-pass token cap. UI omits that selector and
the service rejects explicit overrides. Time/response-size limits and cancellation
remain active. This is an experimental local integration: native upgrades require a
fresh captured-request isolation proof, and Windows/native packaging remains unverified.

Advisor prompts now include explicit selected/comparison roster ownership and, for
draft decisions, the saved pick log, draft status/season and candidate eligibility
checks. These are source-snapshot facts, not live/future availability guarantees.
Draft planning is identified as a conditional comparison. Unknown future pick timing
limits timing claims; current rosters do not establish past picks. This closes the
missing roster/board context found by the live model evaluation while retaining
96 KB data-block bounds, strict numerical/reference validation and no transaction
capability. Proposed-answer review wording avoids confusing the first answer with
a fantasy draft.

Both passes define trade verdict direction relative to the specified exchange:
Recommend/Lean support accepting it, while rejection or waiting uses Hold. The
controlled evaluator retains wrong-verdict failures even when the prose correctly
rejects a harmful exchange. Current/stale fictional media cases separately grade
tone, citations and freshness; they do not model representative public opinion.

Native protocol errors carry a fixed typed category for local evaluator diagnostics,
such as missing final answer, duplicate answers or unexpected events. The evaluator
allowlists these values even when passed an adapter error instance. Public error
messages remain fixed, and raw native diagnostic text is never printed or persisted.

### Automatic fantasy interval estimates

The core prepares one chronological position-cohort model per league scoring system
and advice snapshot, reusing indexed identity, schedule, history and fitted models
across candidate players. The integrations adapter loads current/two prior weekly
stat CSVs with the existing fixed URLs, byte limits, deadlines and cache. Verified
Eastern kickoff times become optional UTC timestamps. No credentials or extra
provider keys are introduced.

The core produces conditional full/remaining-season points with a recorded/future
split, numerical model decomposition, empirical residual ranges and earlier-week
error tests. Completed weeks are predicted before any same-week outcome updates.
Incomplete scoring/opponent contributors, duplicates and unknown timing do not
become zero. Matching owner-confirmed imports retain priority. API budgeting protects
uncertainty and evaluation alongside estimates, and both model passes receive the
same source-linked facts and caveats. Saved validators accept the new method IDs
without changing legacy results. Automatic comparisons remain Lean at most with
capped evidence confidence; injury/role/availability changes and prospective season
accuracy are not established by this calculation.

The shared upcoming-game predicate handles timezone-qualified kickoff times and UTC
day rollover. Options, weekly active estimates and betting history/forecasts reject
known-started and unknown same-day games. Betting rechecks recorded kickoff after
inference and in the save transaction; a fixed typed error returns actionable guidance
without provider diagnostics. Draft review exposes current positional replacement
values as source-linked metrics with explicit draft-time/roster-gain limits. The entire
current roster accompanies saved picks so current starters and backups can be
compared. Missing contemporaneous draft evidence prevents a historical grade, not a
supported current conditional roster comparison.

The shared news cache retains at most one hundred dated feed stories for advisor
relevance selection while ordinary news remains ten and report prompts remain five.
Both views share the same bounded/coalesced refresh. Advice selects at most eight
relevant stories before inference. Invalid/missing RSS publication dates are excluded
rather than replaced by retrieval time, and decimal/hexadecimal entities are decoded
before name matching. Publisher/headline counts remain coverage, not public opinion.

Kicker scoring uses the same typed player-stat adapter and cache, with optional
numeric counts and bounded individual-distance metadata. Keep raw missed/blocked
stats separate; the core composes platform penalties and verifies blocked distances
when distance-specific miss rules need them. Made-yard-over-thirty scoring sums
individual excesses rather than deriving them from aggregate yards. Legacy offensive
schemas stay usable without inventing missing kicking values. K forms its own
chronological forecast cohort; public history cannot establish current weather,
kicking-job availability or team-defense fantasy points.

Team-defense evidence comes through a separate typed integration adapter. Bounded
filtered Sleeper weekly responses supply its own scoring semantics; bounded public
team CSV totals prove selected omitted event zeroes. Both raw resource caches retain
their actual retrieval dates through outages. Four shared request permits and one
load deadline bound remote work. Canonical team/game joins and explicit per-row
source IDs separate these records from GSIS player statistics. The fantasy model
trains D/ST separately, gates complete recent appearances and preserves remaining
versus recorded value. Advice source/metric provenance is bounded at 75 references
to accommodate three seasons of individually dated weekly evidence; prompt and
saved-byte limits remain unchanged. Unreferenced D/ST sources are budgeted out.

Unresolved positive fumble-TD totals can additionally use a bounded public ESPN
game summary, addressed only by the schedule's validated numeric event identity.
At most twelve recent unresolved games share the adapter's request permits, load
deadline and raw cache. Final game identity, scores, structured possession and unit
records establish observed offensive fumble touchdowns; only exhaustion of the
independent aggregate can prove remaining D/ST zeroes. Summary labels alone do
not classify units. Preserve all three resource dates and source references;
unavailable, conflicting and unfamiliar cases remain unknown. Remote links are
never followed and no additional credential is required.

NFL draft facts use one fixed nflverse release CSV through the existing public
football-data cache. Parse at most 20,000 rows from a six-megabyte, timed response;
retain identity, position, year, round, pick, drafting team and college only. Drop
career totals/honors to avoid hindsight entering draft decisions. Validate modern
and legacy GSIS IDs and bounded PFR IDs, including documented-name punctuation;
identifiers are metadata, never remote URL fragments or commands. Missing IDs stay
absent. Cache outages preserve the original source date.

Core joins draft profiles by explicit GSIS identity or a unique normalized name and
position when GSIS is absent. A conflicting explicit ID or ambiguous match withholds
facts. Drafting-team codes never overwrite current catalog/roster membership. A
conservative May 1 cutoff withholds current-class facts before draft completion;
the feed cannot establish the actual historical publication time. Same-position,
similar-round rookie cohorts use scoring-complete recorded appearances from two
earlier classes, equal player weights and explicit selection-bias disclosures.
They provide descriptive context only, never fill missing player estimates.
Explicit draft/waiver shortlists retain selected players without estimates so the
model and saved UI can explain gaps; incomplete comparisons cannot become picks.
Closed saved-profile schemas and source closure retain provenance through budgeting.

Weekly player projections are the app's own (`sidekick-model-v1`,
`packages/core/src/fantasy-projection.ts`). Skill players get expected values for every scoring
stat from the prop stat models (`prop-model.ts`) and are scored with the league's rules; unsupported
rules fall back to the recent average. Kickers and D/ST use a recency-weighted average of their
scored history plus the betting total. Matching owner-confirmed imports keep priority. The app no
longer downloads ESPN weekly forecasts or saves ESPN league projections; the ESPN forecast adapter
in `packages/integrations/src/player-forecasts.ts` is used only by offline benchmarks in
`scripts/research/`. See [decisions](decisions.md), "Own projections; ESPN projections removed".

### Sportsbook prices and prediction performance

Public pregame prices and final receipts pass through the typed, bounded ESPN
adapter in `packages/integrations`, separate from archived schedule reference
lines. Advice verifies a selected quote before inference and before saving.
The `prediction_records` SQLite table stores newly saved pre-kickoff forecasts
independently of advice history. Explicit outcome refresh freezes no prediction
inputs and never infers missing appearances as zero. Shared core calculates
settlement, error/calibration and one-unit paper returns; HTTP routes and the
Advice disclosure expose them without delivery or wager adapters. Archived-market
replay runs in a bounded, cancellable worker, with fixed parameters, paired prices
and no secrets/inherited environment. See [advice.md](advice.md) for contracts and
methodological limits.

The v2 game forecast combines typed paired prices with deterministic, regularized
opponent offense/defense and neutral-aware home effects. Separate prequential
windows fit rating residuals and a book-anchored correction; historical evaluation
uses each game's own prices. Strict earlier-week/issuance boundaries avoid target
and future outcomes. Four exact-content model contexts and bounded LRU correction
origins reuse public data only. New/legacy forecast methods and their stated
baselines are validated separately, preserved in saved history and tracked in
separate prospective groups. See [advice.md](advice.md) and the
[betting model history](reviews/2026-10-betting-model-history.md).

### V3 game-market context

The shared core derives bounded context from validated earlier regular-season
games; it does not import archive QB/weather columns or add a provider endpoint.
V3's eight-feature ridge logistic correction retains the book probability as an
explicit offset. Moneyline uses a past-only Brier blend, evaluated with candidate
fits preceding every earlier outcome. Live context includes three nested
four-season market/blend windows plus residual and rating warmup (seventeen
seasons); a four-context cache and bounded LRU origins prevent unbounded retention.
Current quote thresholds override target archive line fields. V2 adjustment remains
available only for matched upgrade measurement. Numeric forecasts, schemas,
prompts, UI and the forward ledger retain explicit method identities. The API
worker remains bounded/cancellable with no tuning inputs or inherited app state.

## Typed pregame evidence

`PublicPregameEvidence` in integrations enriches game snapshots with validated
publication/capture times, earlier completed quarterback identities and fixed
regional forecast records. Current event-linked ESPN injury labels are a dated
team-level alternative when NFLverse reports lack dates; no IR-to-Out conversion
is made. Current chart observations use actual retrieval times. The core accepts
only context available by issuance and before kickoff, bounds report/chart age,
and verifies forecast venue, units, lead and valid hour. Unknown data stays absent.
History enrichment has a combined deadline, bounded provider responses and two
six-hour cache contexts; clones prevent mutation of retained evidence. It passes
only public game data into the historical worker.

Totals use the regularized joint health/weather correction when enough earlier
eligible cases exist, otherwise v3; moneyline/spread remain v3. Fits exclude the
entire target week. Method identities, source coverage and paired book tests are
retained in results; existing qualification gates are unchanged. See the
[betting model history](reviews/2026-10-betting-model-history.md) for source timing assumptions.

## Personnel source observations and research isolation

Integrations validates bounded same-origin official NFL article discovery, latest
modification dates, recognized team/status lists and precise source links. Weekly
QB/snap adapters validate signed units and strict game/season/week/team identity.
Indexed, cloned evidence rejects conflicting duplicates and future/current-week
statistics. Current roles require only two source seasons; full historical
personnel loading is an opt-in research constructor option. Production avoids
downloading a corpus for rejected numerical corrections.

The core preserves descriptive official reports and role/efficiency context but
masks the rejected official injury feature class in production. The explicit
research flag is confined to local model construction and never enabled by HTTP
request bodies. No new v5 ledger method is deployed; v3/v4 dispatch and all
qualification gates remain. [Evidence](reviews/2026-10-betting-model-history.md).

## Betting model research (v6–v18, not in production)

Research models live in separate core modules (`rich-personnel-model`, boosted-market,
seasonal-hybrid, expert-totals, matchup-totals and the external/drive totals adapters) and are run
only by local scripts in `scripts/research/`. They have no HTTP option, ledger method or production
dispatch: live forecasts stay on v3 (moneyline/spread) and v4 (totals). Prediction-market reads
(Kalshi, Polymarket) use a typed, keyless, bounded integrations adapter; settled-market resolution
points are rejected because they can masquerade as old prices, and wallet addresses are hashed.
Frozen settings and audits are hash-checked. None of these versions beat the sportsbook; see the
[betting model history](reviews/2026-10-betting-model-history.md).

Advice calculation review: `draft-replacement.ts` uses bounded min-cost flow for
joint league-wide starting demand, with at most 384 starting assignments and
2,000 input players. Optional waiver `dropPlayerId` is validated at the HTTP
boundary and against selected-team ownership before inference; the core planner
rechecks ownership and recomputes all starting slots. Source-linked before/drop/
after/gain metrics survive prompt budgeting and final explanation validation.
Explicit identity conflicts withhold scoring/workload history. Forecast error
reporting separates selected baseline from rejected adjustment candidate; betting
action gates require a sportsbook baseline. No new provider or storage schema is
introduced; old saved requests remain valid without the optional drop field.

## Local Messages through imsg

`ImsgClient`/`ImsgChannel` implement bounded CLI integration on macOS, selected by
`imessageProvider: imsg`; absent/legacy settings retain BlueBubbles. Native paths
are ordinary local settings, not new credentials. Dedicated loopback endpoints
check the version or explicitly discover safe recent chat metadata. History uses
`imsgChatId` only after matching the stable `imessageChatGuid`; each message is
validated against both. Only selected text, author handles, timestamps and GUIDs
enter the shared memory workflow; native account/attachment metadata is discarded.
Existing polling invokes the same guarded sync route and storage/analysis/reply
consent remains separate. Native history uses a provider namespace and the same
retention representation/pruner. Provider/path/row-ID changes revoke in-flight sync
before additional AI work or saving; provider switches require renewed automation
consent. BlueBubbles webhook events cannot trigger native reads.

Native report delivery sends text to the stable GUID, pins the resolved executable
in the immutable envelope and rejects backend changes on retry. Missing receipt or
post-spawn failure is uncertain. Processes use no shell, scrub inherited AI/session
variables, bound time/output, discard stderr and terminate their process group on
cancellation/deadline. The trusted CLI retains its native account/OS permissions;
no background watcher or private-framework injection is used. Full Disk Access and
Messages Automation depend on the actual source-service/Electron parent identity.

## Weekly readiness and prospective journal

The local advice router exposes read-only weekly summaries and the existing-request
readiness POST without invoking a model. Core computes validated readiness and
journal views; integrations expose dated injury evidence and typed verification
profile isolation. New optional prediction-record metadata keeps old archives
readable while recording workflow, fixed numerical-code protocol and complete
hypothetical decision sets. The existing settlement service supplies final
outcomes. Installed-code fingerprinting stays in the API filesystem boundary.

Desktop team preferences use guarded IPC and atomic private preference files,
independent of the service's changing loopback port. Optional imsg read probes
verify only the saved target and discard history without using the memory, AI or
delivery pipeline. See the dated weekly-decision review for verification limits.

When the desktop uses `SIDEKICK_VERIFICATION_ROOT`, its API utility process receives
the same root and a confined legacy `state.json` path as well as the private SQLite
and data-directory paths. Verification uses a bounded process-memory credential
backend without importing the native vault binding; restart discards credentials.
Normal launches retain the OS vault and never fall back to memory. The private
test browser session is nonpersistent and uses the macOS mock-Keychain switch,
avoiding Chromium cookie-encryption prompts independently of API credentials.
A trusted read-only preload flag identifies this profile. Only these launches
skip Stop and before-unload close confirmations; navigation and send guards
remain. Test startup/API failures report diagnostics and exit nonzero without a
modal. HOME and ordinary profiles remain unchanged.
Validated advice results are sorted by descending creation time when SQLite state
is read. Upsert insertion order cannot preserve the newest-first in-memory list;
normalizing it protects weekly recents and subsequent bounded history retention
after restart or backup restore.

Advice evidence records a weekly bye only from a complete unambiguous NFL team
schedule; planners can exclude that bench slot without inventing zero points or
relaxing unknown-active-player gates. Shared reserve-status checks exclude PUP/NFI
from active choices. Public projection identity matching permits only unique
optional suffix variants with consistent provider/position/team identity, keeping
explicit-ID conflicts blocked. Both reasoning passes receive saved current-week
starter identities, while platform slot assignments and transaction eligibility
remain unverified. Real-data evaluation uses isolated public snapshots and small
synthetic PPR scenarios with a separate exhaustive arithmetic oracle.

## Report library and numeric charts

The Reports library exposes the five supported report kinds through the existing durable generation queue and report scheduler. Its weekly-plan preview captures the schedule revision and proposes Tuesday 09:00 rankings and Wednesday 09:00 matchup previews in each action’s existing timezone, scoped to the active league, with `mode: draft` and `channel: dashboard`. Saving patches only the schedules section; conflicting updates fail closed. Other schedules, voice, credentials and recipients remain as configured. Individual draft event automation starts as one-time, review-only setup. Service/awake requirements, AI context sharing and usage charges remain visible.

`reportVisuals` in core selects the current platform week (or latest available week when unknown) before bounding matchup rows and captures at most 64 teams and 32 two-sided matchups. API generation freezes this minimal evidence before waiting on providers and persists it under `SavedReport.evidence.visuals`; numbers come from the platform, not parsing AI prose. Shared and backup-import validators bound numeric values and collections. The renderer uses accessible SVG bars, explicit missing values, zero-based scales that handle negative scores, expandable raw data and platform sync dates. Current league charts and saved-report charts are separate; legacy reports have no synthetic historical chart. This adds no dependencies, provider requests or changes to numerical advice models.

## Real report quality checks and season boundaries

The production scheduled runner is a typed, dependency-injected API module. `saveSyncedLeague` persists a connector result while preserving the latest owner label/connection date and stamping sync time; the exact result is passed into inference. Recurring jobs recheck enabled state, cadence and selected league after awaited sync. Calendar drafts use the same persisted evidence. The existing credential/connector boundary, occurrence claims, duplicate handling, season pauses, delivery policy and loopback service remain intact.

Report prompts include the season, generation time and league sync time. News publication dates must be valid, nonfuture and within the league season (including the following January/February); old/future setups omit current catalog status and legacy undated estimates. Explicitly dated owner projection periods remain usable for the matching season. This prevents a newly retrieved archive from borrowing current availability/news as historical evidence. Availability guidance uses both status and injuryStatus. A recorded inactive starter invalidates an active matchup sum; it does not create zero points or invent a substitute.

Numeric chart snapshots include an optional season for backwards compatibility. Recorded scores use two decimals; wins use integer counts. Sleeper commissioner `custom_points` values take precedence over calculated points, including zero. Plain-text report instructions avoid unsupported Markdown rendering. No numerical advice model or provider dependency changes are introduced.

## App-wide Codex account connection

The saved `codex-cli` runtime uses the existing typed, isolated signed-in Codex adapter with fixed `gpt-6.1-sol` and high reasoning. Reports, advice and other configured text generation share this resolution path. It does not load or fall back to an API key. Native version/protocol checks and tool/instruction isolation remain unchanged. Validators require the fixed model and empty executable/argument fields; backup restores reset it for owner review. Advice options disclose unsupported token budgets, and subscription usage never borrows API prices. The Settings preset can be saved and tested without a key.

## Separate Market Signals research

`market-research-routes.ts` exposes public-data capture, server-snapshot freezing,
result checks and export under `/api/market-signals`. It reuses the typed, bounded
Kalshi/Polymarket totals adapter, current two-sided ESPN-displayed sportsbook
prices and the configured NFL news cache. A 90-second capture deadline and
single-flight guard bound remote work. Only exact upcoming regular-season game,
kickoff and half-point total matches are eligible. Capture sends no owner league,
AI credentials, wagers or wallet addresses to providers.

The lazy Advice → Market signals panel displays prices, hourly executed cash in
trades of at least $500 and dated relevant headline counts. Trade direction uses
the existing corrected taker semantics; cash is shares times paid outcome price.
Large trades are anonymous activity, not verified whale identities/skill. NFL-feed
context permits nickname matching only in this research view; production media
matching retains its default context checks. No synthetic sentiment score or
missing-as-zero observations are generated. Numeric SVG charts have accessible
labels, expandable data, zero-based axes, units and source/coverage details.

`MarketResearchStore` uses a separate private `market-research.sqlite` beside the
main database, capped at 500 immutable first game/provider records. It is excluded
from application snapshots, AI prompts, reports, prediction history and existing
Settings backups; its dedicated JSON export must be archived separately. The
fixed `external-price-v1` policy freezes the latest verified Over contract price
and matched no-vig sportsbook probability before kickoff. Complete pagination,
price age ≤60 minutes, quote/capture age ≤5 minutes and exact identities are
required. POST accepts a server snapshot ID, never user probabilities/outcomes.
Only independently matched final scores resolve records. Brier summaries remain
separate by provider/season; manually selected small samples cannot prove an edge.
There is no automatic promotion, tuning or probability-dispatch connection.

`player-prop-research.ts` provides recent completed-game logs independently from
market signals. Prop research and betting player choices can recover a missing
catalog GSIS ID only with a unique historical name/position identity and matching
current-season team; explicit IDs never fall back to names. Logs exclude missing,
duplicate, wrong-team/opponent and uncompleted games, with a 24-hour availability
allowance. The existing prop analysis, frequency comparison and outcome ledger
remain in use; model formulas and game-market dispatch are unchanged. Live prop
quotes are not supplied by the current feed; exact lines/prices remain manual.

## Side stores for props and chat

Like `market-research.sqlite`, these SQLite files sit beside the main database and outside app
state: `prop-lines.sqlite` (first, daily and last-before-kickoff prop lines and prices per book),
`prop-leans.sqlite` (pre-kickoff prop leans and their grades) and `chat.sqlite` (Ask Sidekick
conversations, newest 50, deletable from the panel and kept out of exports and report prompts).
Chat lookups go through the API's own loopback GET routes; see [decisions](decisions.md).
`download-cache/` holds public downloads only (nflverse files, the Sleeper player list, injury
reports), revalidated with conditional requests, private to the user and capped at 300 MB; it
can be deleted at any time and is rebuilt on the next refresh. See [performance](performance.md).

## Authorized ESPN browser snapshots

The league router can accept a bounded owner-saved ESPN JSON response through a
route-local binary parser. The typed integrations normalizer is shared with direct
provider reads; account/member payloads never enter stored state. A snapshot has
`connectionMode: snapshot` and an import timestamp, without a fabricated sync time.
Provider-refresh paths require reimport or provider authorization. An explicitly selected saved-data report schedule can instead create a dashboard draft from an age-bounded saved copy; it does not refresh the provider or fabricate a sync time. A
separate typed parser retains only current-week publisher forecasts whose applied
components and exact league/position rules reproduce their totals. It does not map
undocumented ESPN numeric stat IDs into historical model scoring or invent seasonal
forecasts. Existing projection storage/import validation and clean HTTPS source
metadata apply.

Native imsg may return `any;` stable GUIDs. These are permitted for sends only after
matching exactly one current chat whose explicit service is iMessage; service must
never be inferred from the prefix. Forced iMessage/no-SMS fallback remains required.

## Explicit saved-data scheduled drafts

`ActionSetting.dataMode: saved` is a scoped dashboard/draft policy; omission keeps
provider refresh. A shared core policy validates IDs and the existing stale-age
threshold, using import time for manual snapshots and actual sync time otherwise.
This tests saved-data age only, not publisher freshness. The scheduler skips
credentials/provider refresh and passes automatic delivery false. Report source
provenance is deterministic in body/evidence and model context. Backup restoration
pauses these schedules. Home/Reports/Schedule use the same readiness policy;
calendar events continue to require provider refresh. See the saved-data review.
