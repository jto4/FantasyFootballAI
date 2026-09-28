# Fantasy Football AI Companion: Implementation Plan

## Purpose and status

This document describes the target product, the current state of this repository, and
the work needed to make it a polished project people can install and run. It is a plan,
not a claim that the features below are already implemented. The dashboard stop control
has been implemented and exercised against the combined development launcher. The dashboard
now uses a responsive dark editorial design based on the linked reference's published
description; direct pixel comparison with the unavailable X media remains unverified.

The repository currently has a working local API and React dashboard, including a focused schedule/history view and tested season-status copy helper, a TypeScript npm
workspaces structure, initial integrations, SQLite state persistence, MCP tools, and
developer/security documentation. Recent foundation work includes daily/weekly/monthly per-action scheduling, post-draft calendar
suggestions, bounded provider responses, a restrictive production Content Security Policy, safer
draft-only MCP behavior, and a dashboard stop control. This is useful progress, but it
does not make the full product plan complete or release-ready. The current setup is
appropriate for contributors who already use Node.js and npm; it is not yet an easy
download-and-run experience for typical league owners.

Readiness was reviewed on 2026-09-27. Treat the snapshot below as the current baseline;
update it only after the workflows have been implemented and verified.

Since the previous snapshot, SQLite restore now validates imported settings and resets
restored custom AI endpoints, CLI runtimes, and automatic scheduled sends to
review-required defaults. A per-user background service command now creates a LaunchAgent,
systemd user unit, or Windows logon task from a source checkout. Configuration rendering
is covered by cross-platform unit tests; isolated CLI lifecycle integration tests now
exercise the macOS and Linux branches using temporary homes and fake service-manager
commands, while a Windows manager test verifies the full Task Scheduler command sequence
through an injected runner. None registers a real service. Native launchd/systemd behavior
and Task Scheduler execution still need validation on their target platforms. The packaged desktop app can now close its dashboard window to a system
tray menu while keeping scheduled work alive; explicit tray Quit shuts down the service.
Owners can also opt to start hidden at sign-in; Windows and Linux use a launch argument, and
macOS checks Electron's login-item launch signal with the private preference. Ordinary starts
stay visible. Tray behavior still needs verification on macOS, Windows, and Linux. Yahoo's installed-app OAuth flow now handles the out-of-band code grant,
stores and refreshes tokens in the OS credential store, and clearly requires approved
Fantasy Sports app access. Conversation imports now parse common JSON, CSV, EML, and
labeled-text exports into per-author profiles while keeping each profile's authored source
messages separate; the dashboard previews authors and lets owners explicitly merge them into
existing import-created profiles, which updates style/context from prior notes only when AI
analysis is opted in. Exact re-imports are skipped and merged source blocks retain independent
retention dates; common quoted EML replies are excluded from the sender's style sample.
Report settings now include owner-controlled profanity and excluded-topic boundaries; import
analysis still requires explicit opt-in. The linked X media could not be fetched, but an
indexed design archive described the dark dashboard's near-black palette, oversized type,
neutral surfaces, and restrained color accents. The responsive redesign is implemented and
reviewed against that description; see `docs/design/dashboard-visual-direction.md` and its
generated concept. Exact comparison to the original post remains unverified.
Member profiles can now be excluded individually from AI prompts or scoped to all or selected leagues, so profile context is limited to the league whose report or chat reply is being generated. Report and group-chat profile context each require a separate owner opt-in. Settings also lists,
downloads, and deletes pre-restore safety copies; downloaded backup files remain separate copies
under the owner's control. Owners can also set short, standard, or long report length targets;
older local settings default to standard. Startup now creates and integrity-checks a private
`before-upgrade` SQLite copy for recognized existing databases before applying pending schema
migrations. Upgrade copies share the Settings list and retention controls with pre-restore copies;
fresh databases and databases already at the current schema version do not create an extra copy.
Matchup previews can optionally use the openly published nflverse injuries CSV under CC BY 4.0.
The switch is off by default; the connector caches a season snapshot for six hours and includes
only exact player-name/team matches for the current week. Reports cite the feed URL and local
retrieval time. Unavailable or unmatched data is omitted, healthy rest-day labels are filtered,
and availability labels are not medical advice. Platform-provided injury tags remain explicitly
potentially stale. See decision 014 in `docs/decisions.md`.
OpenAI-compatible report calls now retain provider-returned token usage. The dashboard can
estimate cost using owner-entered input and output rates per million tokens; CLI usage and
provider billing adjustments remain unavailable. The end-to-end usage path is covered by tests.
The macOS ARM DMG was rebuilt from the current source, including passphrase-encrypted portable
backups. The mounted artifact passed its API/dashboard smoke check with an isolated data folder,
the package MCP smoke completed a stdio handshake and local API call, and `hdiutil verify`
confirmed the image checksum. This does not verify interactive tray lifecycle behavior on other
operating systems; the artifact remains unsigned and not notarized.
The earlier smoke check followed Twilio Conversations polling, season-aware scheduled-report eligibility, and opt-in MCP report sending. The polling configuration and restore behavior pass repository checks; live Twilio polling and
Windows/Linux packaged runtime verification remain open.

### Readiness snapshot

- **Can a developer clone and start it?** Yes, with Node.js 22.13 or newer and npm. After
  `npm ci`, `npm start` builds and launches the production-style local app; `npm run
dev` remains available for development.
- **Can a typical league owner download and run it without a terminal?** Not yet as a
  public release. A self-contained Electron package using stable Forge 7.11.2 and an
  `@electron/rebuild` 4 override creates a macOS ARM DMG and smoke-checks the packaged
  API/dashboard locally. Packaging dependencies install only in the isolated staging app,
  keeping Forge out of the normal workspace install. Windows/Linux package behavior, signing,
  and interactive installation remain unverified.
- **Does it run as a managed background app?** Partly. `npm run service -- install`
  registers a per-user macOS LaunchAgent, Linux systemd unit, or Windows logon task from a
  source checkout, with start, stop, status, and uninstall commands. Keep Node.js and the
  checkout installed. The desktop package includes its own runtime and a Settings control
  for launch at sign-in; closing its window now hides it to the system tray while scheduled
  tasks continue, and explicit tray Quit stops the service. Native lifecycle behavior still
  needs testing on each platform; headless desktop operation remains unimplemented.
- **Is the entire product plan implemented?** No. Several platform connectors and
  provider paths are partial. Season-aware scheduling, platform verification, recovery edge cases,
  stable packaging dependencies, release packaging, and cross-platform validation remain open.

Treat these answers as the current baseline and update them only after the relevant
workflow has been implemented and verified.

## Product goal

Build a funny, configurable fantasy football companion that feels like another member of
the league. It should keep league members engaged through the offseason, draft, and
season, while letting the league owner control what it knows, when it speaks, and where
it sends messages.

The project should be public and self-hostable. Users should be able to download it,
complete a guided setup, connect an authorized fantasy league and AI runtime, and keep it
running in the background on macOS, Windows, or Linux. League data and learned context
should remain on the owner's computer unless the owner enables an integration that needs
selected data.

## Current state and usability gap

| Area                 | Current state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Work still needed                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Download and install | Public source repository at `github.com/jto4/FantasyFootballAI` with clone-and-run instructions, npm workspaces, per-user service installer, guided setup, and self-contained Electron packages; macOS ARM DMG and bundled API/dashboard smoke check verified locally; hosted CI run `36369251567` passed source checks on all three operating systems, the Node.js 22.13 minimum check, and all three package jobs. macOS and Linux package runtime smokes passed; the Windows job confirmed the executable artifact exists because its hosted runner does not start the packaged GUI app. Interactive Windows launch remains a manual support gate. Version tags assemble matrix artifacts into a draft release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Complete interactive Windows install and launch checks, code signing, notarization, no-terminal update path, and managed desktop startup; publish a release after review                                                                                                                                                                                                                        |
| Run locally          | `npm ci` then `npm start`, `npm run dev`, or `npm run service -- install`; packaged app runs without system Node and can be configured to open visibly or hidden in the tray at sign-in; closing its window leaves scheduled work running until tray Quit; Desktop Settings can move a consistent database copy and safety backups to a user-selected folder; the macOS packaged move-and-restart flow passed an isolated manual check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Windows/Linux move flow and service lifecycle verification, headless desktop operation, and production recovery                                                                                                                                                                                                                                                                                 |
| Dashboard            | Responsive near-black dashboard with oversized typography, warm-gray open sections, ruled rows, top-bar league selection, service status, resumable guided setup, provider-specific connection flows, dark forms, shared dismissible action notices, and separately maintained league-management and schedule/history views                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Direct comparison to the unavailable reference media; improve remaining empty/error/status states and add no-terminal installation wizard                                                                                                                                                                                                                                                       |
| League platforms     | Sleeper, Yahoo, and ESPN current-week matchup scores; all three normalize roster and draft data when available; the dashboard selects an active league for desk views and report generation; Yahoo OAuth, bounded retries, per-league sync guidance, and opt-in 0–3 transient retries for scheduled league refreshes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Live account verification and cross-platform verification; Yahoo app approval is external                                                                                                                                                                                                                                                                                                       |
| Fantasy analysis     | Played-season rankings use a comparable metric; preseason rankings can use the newest scoring-confirmed owner projection source only with complete equal-size rosters and unambiguous player matches, with full-roster totals labeled as estimates rather than starter projections or win forecasts, requiring ID matches to agree on normalized name and allowing name-only matches only when unique; all three adapters can provide draft picks and roster data; owners can import up to eight source-attributed season and week-specific projection CSV sets per league; each set requires owner confirmation that point values match league scoring, and unconfirmed/legacy sets are excluded from numeric analysis; draft evidence computes per-team projected surplus only when every logged pick, team, positional starter count, and replacement baseline is available, allocating FLEX/receiver-FLEX/SUPER_FLEX slots to eligible positions by the strongest next projected replacement and withholding unsupported configurations; matchup estimates sum imported weekly values when both sides have a complete starter-ID or normalized active-roster-slot snapshot and matching projections; roster-derived estimates disclose the platform sync time; optional licensed nflverse injury evidence uses exact current-week roster matches and citations | Verified lineup semantics/freshness across platforms, independently verified market ADP, and broader league-format validation remain; owner-imported ADP now supports medians from at least three scoring-confirmed matched source sets, while team process grades still require a complete draft log and positional replacement baselines; imported estimates do not establish actual outcomes |
| Scheduled content    | Per-action daily/weekly/monthly and one-time local date/time schedules, selected league targeting, persistent one-shot completion, missed-date history, and per-league run outcomes; owners can add single-date league calendar milestones which refresh their league and always save a draft; one shared minute tick processes events serially, skipped daylight-saving local times are rejected, Sleeper, Yahoo, and ESPN draft start timestamps can prefill a draft-hype event in the owner timezone; Settings can apply monthly offseason updates plus suggested Tuesday power rankings and Wednesday matchup previews while preserving each action’s timezone, league scope, and delivery policy; each recurring run refreshes the league and reevaluates report eligibility from the latest season phase without changing the owner-configured cadence; the desk and report guidance recognize Yahoo/Sleeper playoff weeks only when current and start weeks are available, label ESPN-derived playoff status as possible, and mark completed seasons explicitly; event completion and retryable missed/interrupted runs persist across restart                                                                                                                                                                                                              | Yahoo and Sleeper playoff weeks are recognized from platform current-week and start-week fields; ESPN playoff start is estimated only for explicit H2H schedule settings and labeled as inferred; live season-phase data validation remains open                                                                                                                                                |
| Football news        | Owner-selectable ESPN NFL, PFF, and FOX Sports NFL feeds, exact allow-listed Markdown citations rendered as clickable inline links, configurable background refresh, manual refresh, request coalescing, stale-cache fallback, partial-feed status, empty successful responses treated as source failures, and FOX Sports terms shown before use; `npm run news:smoke` verified ESPN 10, PFF 10, and FOX Sports 4 parseable headlines with citation URLs on 2026-09-27 23:28 UTC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Additional source choices and ongoing repeated live-feed availability verification                                                                                                                                                                                                                                                                                                              |
| AI runtimes          | OpenAI-compatible API and local CLI adapters, with a save-and-test action using a data-free prompt; owners can explicitly discover bounded model IDs from the configured API endpoint; generic CLI stderr is discarded, stdin pipe failures are contained, and quoted argument values are passed without shell evaluation; macOS offers Apple's `fm respond` CLI with separate instructions and prompt arguments and documents argv visibility; API reports retain returned input/output token usage and show approximate cost when owners enter both token prices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Live `fm` verification requires macOS 27+ (the local host is macOS 26.6); estimates exclude provider discounts, cached-token rates, and other billing adjustments; provider-specific request parameters beyond temperature/output limit and consistent external tool interfaces                                                                                                                 |
| Image generation     | Settings accepts an image-generation API key in the OS credential manager; GPT Image base64 output is stored as private files in the local data folder with list, preview, download, delete, and desktop data-folder move support; Settings exports a bounded ZIP backup containing both SQLite state and generated images and restores it with archive path validation and a coupled rollback; legacy SQLite-only backups remain supported; secure hosted-image URLs remain session-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Additional providers and live provider verification                                                                                                                                                                                                                                                                                                                                             |
| Messaging and email  | Resend/Twilio SMS plus owner-addressed delivery and manual paginated history import for existing Twilio Conversations groups, per-action settings, manual Resend replies, persisted attempt receipts, Resend idempotency on retries, atomic SQLite delivery claims, read-only Twilio credential validation, explicitly confirmed data-free Resend test emails, BlueBubbles group delivery, owner-triggered plus opt-in 5/15/30/60-minute polling of up to 200 recent messages with a deduplication cursor, plus revocable one-time-displayed webhook URLs whose new-message events trigger the same bounded history sync; Twilio Conversations history also supports off-by-default 5/15/30/60-minute polling through the bounded page importer; owner-triggered Resend received-email import without public webhooks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Twilio SMS/Conversations send idempotency (not documented for these send endpoints), live platform verification, and runtime exercise of Twilio polling                                                                                                                                                                                                                                         |
| Memory and style     | Local JSON/CSV/EML/labeled-text, BlueBubbles history, and paginated Twilio Conversations history imports, author preview, explicit author-to-profile mapping, opted-in AI note updates from prior notes, exact re-import deduplication, and independent source retention dates; per-author editable profiles and banter preferences, per-member report-prompt exclusion, per-league profile scopes, configurable report length, source review/export/deletion, master pause, opt-in AI analysis with import-screen disclosure, email/SMS export fixtures, common EML quote separation, clearable style/context notes, message-level retention for live chat, explicit backup-copy retention guidance, and a 32,000-character aggregate report-context cap with an explicit omission note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | No known gaps in the listed import, review, deletion, and retention workflows                                                                                                                                                                                                                                                                                                                   |
| Persistence          | Versioned SQLite tables, dashboard backup/restore, private pre-restore and automatic pre-upgrade safety copies, OS-backed credential storage, an offline integrity check/validated safety-copy restore command, and packaged-app startup recovery that salvages independently valid rows into a labeled backup or preserves unreadable files before starting an empty library                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Raw-page salvage, professional recovery without a valid backup, and cross-platform verification                                                                                                                                                                                                                                                                                                 |
| Project operations   | Docs, tests, lint/format, separate manual code and security release checklists in `SECURITY.md`, contributor guide, a support matrix that separates implemented paths from verified support, an on-demand/tag-triggered OS-matrix package workflow with installation guide and license attached to release assets and included in each ZIP, and a local Settings viewer for bounded filtered desktop and installed source-service API logs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Manual publication after review, signing, upgrade path, ongoing checklist completion, owner review of support claims, and verified supported platforms                                                                                                                                                                                                                                          |

Current local setup requires Node.js 22.13 or newer and npm. Install dependencies once,
then launch the production-style app:

```sh
npm ci
npm start
```

The launcher builds the app, waits for local health, and opens the dashboard. It keeps a
terminal process running in the user's session until the dashboard's Stop app control is
used. A source checkout can also install the native per-user background service with the
commands below; this is not yet a one-click download with a bundled runtime.

```sh
npm run service -- install
npm run service -- status
```

## Dashboard design direction

The dashboard now applies the linked post's visual direction:
[Bakers Studio, “wave + gradient”](https://x.com/studiobakers/status/2101998189889122451?s=46).
The X media remains inaccessible. An [indexed reference description](https://selectedscreens.com/s/bakers-branch/)
describes the dark surface, oversized type, soft-focus imagery, and small modular accents.
The implementation uses those broad visual cues without claiming exact layout fidelity or
copying the source imagery. See `docs/design/dashboard-visual-direction.md`.

The result is a dark editorial fantasy-football league desk that keeps core tasks,
matchups, rankings, reports, and news fast to scan. The linked reference is inspiration,
not an asset or a layout to copy.

Design goals:

- Establish a cohesive visual system for the dashboard shell and league views, with a
  near-black base, oversized type, neutral surfaces, thin rules, and restrained accents.
- Keep scores, controls, and dense league information stable and legible; respect reduced
  motion in remaining animated controls.
- Make the next league event, this week's matchups, recent reports, and news easy to find.
- Keep draft, matchup, ranking, and news pages related in style while making their
  purpose and hierarchy distinct.
- Design responsive layouts and consistent empty, loading, error, connected, and
  disconnected states.
- Respect reduced-motion preferences, keyboard navigation, and contrast requirements.

Design acceptance criteria:

- The redesign follows the available reference description and records which reference
  details remain unverified.
- The finished dashboard has a cohesive dark identity without harming text contrast or
  data scanability.
- League tasks remain easy to locate on desktop and narrow screens; motion never blocks
  content or controls and respects `prefers-reduced-motion`.
- A visual review checks the implemented pages and key states against the agreed brief.

## Product capabilities

### League connections and analysis

- Support Sleeper, ESPN, and Yahoo through typed connector interfaces and authorized
  account access. Do not bypass login, access controls, or platform restrictions.
- Normalize league scoring, roster, team, schedule, and transaction data into shared
  domain types, while retaining platform-specific capabilities and limitations.
- Sleeper rosters now retain player IDs and resolve names, positions, NFL teams, and status
  through a bounded player catalog download. The catalog is shared in memory and refreshed
  no more than once per day; an outage preserves the league connection with IDs and roster
  sizes. Standings combine `fpts` with the documented two-digit `fpts_decimal` component, so
  power rankings retain fractional points. [Sleeper documents roster points fields and the
  catalog as roughly 5 MB, and requests no more than daily
  retrieval](https://docs.sleeper.com/#players).
- Sleeper draft reviews now include pick records for the league's linked draft, with pick
  number, round, roster, keeper marker, and player metadata. The connector also falls back
  to the league's season-matched most recent draft when the league record has no draft ID.
  [The documented API provides league draft discovery and per-draft pick records](https://docs.sleeper.com/#get-all-drafts-for-a-league).
- Yahoo league sync now reads the documented team roster collection and league draft-results
  resource using the owner's OAuth token. Roster snapshots include Yahoo player keys, player
  names, eligible position, NFL team, and roster slot when supplied; draft picks include pick,
  round, player key, and the normalized league team ID. These resources are supplemental: an
  unavailable roster or draft endpoint does not discard valid standings. [Yahoo Fantasy
  Sports API documentation](https://sports.yahoo.com/developer/docs/).
- ESPN league sync uses the owner's supplied session cookie and selected season for its league
  request and a supplemental `mRoster`/`mDraftDetail` request for the current matchup period.
  Roster entries normalize player ID, name, base position, lineup slot, and injury status;
  draft entries normalize round, overall/round pick, team ID, and a player name when found in
  the current roster. Supplemental failure preserves the core league connection. ESPN's
  fantasy endpoints are undocumented; the `mRoster` and `mDraftDetail` shapes are based on a
  community-maintained [ESPN Fantasy API reference](https://github.com/pseudo-r/Public-ESPN-Fantasy-API/blob/main/docs/leagues.md),
  so live verification and maintenance remain open.
- Report connection state, last successful sync, stale data, rate limits, and recovery
  instructions in the dashboard. Manual refresh and sanitized last-sync status are now
  available per league; the owner can select a warning threshold from 6 hours to 7 days, defaulting to 24 hours. Owners can enable up to three short-backoff retries for transient scheduled league refresh failures; authentication, permission, report-generation, and delivery failures are not retried.
- Shared read-only JSON requests retry transient fetch failures, HTTP 429, and 5xx responses
  up to two times, honor `Retry-After` up to two seconds, and leave authorization/client
  errors immediate. Non-idempotent methods are never retried. Manual and scheduled league
  refresh now show the same safe guidance for access, rate-limit, service-outage, and timeout
  failures without exposing provider response text. Scheduled league reads can use the owner-configured bounded retry policy; non-idempotent delivery is outside that retry boundary.
- Numeric platform fields accept finite numbers and non-empty numeric strings only. Null,
  blank, boolean, and non-finite values remain unknown instead of becoming misleading zero
  scores, records, or settings.
- Generate draft-day hype and post-draft analysis that account for league size, scoring,
  roster construction, picks, and relevant player information.
- Use a verified pick log for pick-by-pick recaps; avoid value-based grades unless player
  projections or another documented evaluation basis is available. Where only rosters exist,
  limit commentary to current roster construction.
- Generate weekly power rankings and matchup previews from current league and football
  data, with explanation and uncertainty where information is incomplete. Matchup preview
  guidance now includes known opponent names and platform-reported scores, clarifies that
  score state may be live or final, and prohibits treating scores as projections.
- Support offseason updates and configurable report cadence across a season calendar.

### AI providers, tools, and sources

- Keep a stable AI-provider interface for hosted API keys and installed command-line
  runtimes. Detect capabilities and make missing commands or unsupported platforms
  visible.
- Support Apple's `fm respond` CLI directly on macOS 27 or later; do not make it a
  requirement for Windows or Linux users.
- Allow an image-generation provider key and use it only for user-enabled features.
- Offer MCP tools and reusable skills that compatible AI clients can use without
  coupling the core product to one model or agent runtime.
- Retrieve relevant football news from the internet, summarize it with source citations,
  and make source links visible in generated reports. Owners can select the built-in ESPN
  NFL, PFF, and FOX Sports NFL feeds independently; clearing all prevents external news
  requests. FOX Sports requires attribution and limits free feed use to individual or nonprofit
  noncommercial use; Settings shows that condition before it is enabled. Feed information is
  available from [ESPN](https://www.espn.com/espn/news/story?page=rssinfo), the
  [PFF RSS feed list](https://www.pff.com/pff-rss), and the
  [FOX Sports RSS directory](https://www.foxsports.com/rss-feeds).
- Reports include a news citation only when the generated body links an exact URL from the
  bounded story list supplied to the AI; unused articles and invented URLs are not attached
  as supporting citations.
- Bound and validate remote responses; treat web pages, platform data, imported text,
  and model output as untrusted input.

### Voice, member memory, and customization

- Let the owner set a default writing voice from editable commissioner, sharp league-mate,
  dry analyst, and hype presets, then customize tone, humor, profanity, banter
  targets, excluded topics, and length. Owners can choose a short, standard, or long report
  target. Profanity and excluded-topic controls now apply to
  generated reports, and member profiles now include editable banter preferences and topics
  to avoid. Owners can add a separate topic boundary for each delivery channel; only the
  selected channel's boundary is included with that report's AI prompt. SMS and iMessage
  mention-reply prompts now apply their matching channel boundary while treating configured
  boundary text as topic exclusions, not as instructions that can override privacy or delivery
  controls.
- Let the owner import supported email and text exports. Preview parsed authors before
  storage and map each author explicitly to an existing import-created profile or create a
  separate profile; do not infer identity from display-name matches. Group structured JSON,
  CSV, and labeled text by author, keep each member's authored text in that profile, and do
  not silently infer or publish facts. Opted-in analysis combines new authored text with
  prior style/context notes to update that member's profile. Exact re-imports are skipped,
  and merged source blocks retain independent dates for retention. Unlabeled text uses the
  optional fallback member name.
- Keep profiles and learned context local, inspectable, editable, exportable, and
  deletable. Show which imported source contributed to a memory.
- Keep imported-conversation analysis and member-context sharing with AI disabled by
  default. Report sharing and group-chat reply sharing each have a separate owner opt-in;
  explain which reviewed profile notes are sent for each use.
- Support league-specific context and per-member preferences. A master switch now pauses
  imports and all AI use of member memory without erasing saved profiles; owners can delete
  all profiles and their imported source messages from the memory page. Owners can exclude
  individual profiles and their notes from future AI prompts without deleting local source
  messages; report and group-chat reply sharing each require a separate global opt-in, in
  addition to the per-profile setting, and both are separate from import analysis. Member-specific
  banter and topic boundaries are editable; owners can clear style and context notes while
  preserving source messages and banter preferences. Owners can keep source messages until
  deletion or automatically purge them after 30, 90, or 365 days while retaining the profile.
  Downloaded backups retain their own copies; reanalysis controls and deletion guarantees remain.
- Allow sharp, uncensored league banter as configured by the owner, with explicit topic
  exclusions and channel-specific send controls.

### Channels and delivery controls

- Support dashboard drafts, Resend email, and Twilio SMS with clear delivery status.
- [x] Allow reviewed Resend sends to specify a thread Message-ID and matching subject;
      validate both before creating outgoing headers.
- Add owner-triggered Resend inbox polling and per-message local import. Keep the service
  loopback-only; bound responses and bodies, strip quoted history, deduplicate by Resend
  message ID, merge by sender, honor source retention, and never derive an outbound recipient
  from inbound email.
- [~] Add iMessage through the documented BlueBubbles bridge; outbound group delivery,
  owner-triggered history sync, optional interval polling, and revocable webhook URLs are
  available with an owner-managed Mac bridge, secure credentials, HTTPS requirements, existing
  review/automatic-send controls, and existing memory/privacy controls. Webhook events are
  treated only as hints that invoke the existing bounded history sync for the configured chat.
  Live BlueBubbles verification remains.
- Let the owner configure each action independently: disabled, draft for review, or
  automatic send. Provide a preview/review mode and visible delivery history.
- Require explicit setup for recipients, sender identities, credentials, and automatic
  sending. Make retry behavior safe against duplicate messages.
- Persist each delivery attempt and provider receipt on its report. SQLite claims now
  serialize send attempts across API processes sharing the local database, retain sent claims
  against stale report snapshots, and require explicit owner confirmation to replace an
  uncertain claim. Resend email retries
  reuse the attempt's idempotency key; Resend retains keys for 24 hours and requires matching
  request parameters. Definite provider rejection is retryable; network failures, conflict
  responses, and server errors are marked uncertain. A restart converts an interrupted send
  into an uncertain outcome, and retrying requires explicit owner confirmation after checking
  the provider. SMS provider idempotency remains.

## Local-first security and privacy requirements

- Keep league state, reports, imports, and member memory on the owner's device by
  default. Document exactly what data each external provider receives.
- [x] Make raw-import AI analysis and member-note use in AI prompts explicit opt-ins;
      preserve both options as disabled for legacy installations.
- Store API keys, fantasy platform credentials, and channel credentials in the operating
  system credential manager. Never put secrets in JSON state, exports, logs, screenshots,
  or source control.
- Bind the service to loopback by default, restrict browser Origins, and do not add
  network access without authentication and a reviewed threat model.
- [~] Encrypt or otherwise protect local backups where practical: downloaded portable `.ssb`
  archives encrypt the database and generated images with AES-256-GCM and a per-file
  scrypt-derived key; older ZIP and SQLite backups remain restorable. Local pre-restore and
  pre-upgrade safety copies use private filesystem permissions but are not passphrase-encrypted.
  Preserve explicit export and deletion operations.
- Validate imported files and remote responses with size limits, timeouts, and safe
  parsing. Treat imported conversation text as data, never as executable instructions.
- Provide a security policy and release checklist. Keep CI focused on type checks, lint,
  formatting, tests, and builds; perform documented manual code and security reviews before
  releases. Do not add or run automated security scans.
- Schedule periodic refactoring to reduce duplication and maintain clear package
  boundaries; record architecture changes in decision notes. The first refactoring pass moved the platform adapters behind the integrations barrel
  (decision 009); a follow-up separated Sleeper, Yahoo, and ESPN into focused modules with
  shared parsing helpers (decision 011). Continue this review during every release cycle.

## Implementation sequence

### Phase 1: Easy setup and dashboard redesign

- [~] Resolve the dashboard reference: the X image is unavailable, so the current design
  follows its indexed public description; exact frame review remains unverified.
- [~] Apply a coherent responsive dark dashboard shell, league desk, typography, top-bar
  league selector, and open ruled sections based on the available Bakers Studio reference
  description; direct comparison with the unavailable original media remains.
- Add guided first-run setup for data directory, league source, AI runtime, and optional
  delivery providers. The dashboard now offers a resumable three-step guide that opens the
  existing league connection and AI/style settings screens, plus direct optional jumps to
  delivery credentials and the local data-folder setting in the packaged desktop app. Desktop Settings now allows a
  user-selected data directory with a consistent SQLite copy, safety-backup copy, and restart;
  the original location remains as a rollback copy. No-terminal provider setup remains.
- Check Node.js 22.13+ before the main start, dev, build, and service commands, and make
  missing runtime prerequisites and connection failures actionable.
- [x] Establish a single production-style local launch command (`npm start`) that builds,
      waits for service health, opens the dashboard, and exits after dashboard shutdown.
- [~] Add source-checkout per-user background service install/start/stop/status/uninstall
  commands for macOS, Windows, and Linux; packaged Settings registers launch at sign-in and
  can start hidden in the tray on the next sign-in. A bundled Electron runtime has a local
  macOS ARM installer path, while headless desktop operation and on-device platform
  verification remain.
- Add an obvious dashboard stop control with confirmation, graceful scheduler/API
  shutdown, and clear instructions for starting the app again.
- [x] Respect reduced-motion preferences globally for animations, transitions, scrolling,
      decorative waves, and loading indicators.

**Exit criteria:** a new developer can install and launch from clean setup documentation;
the dashboard's direction is approved and its key workflows are visually consistent.
Document separately what remains necessary for a non-developer release install, including
runtime bundling, first-run configuration, and background-service setup.

### Phase 2: Reliable local application foundation

- [x] Replace the state file with SQLite, schema migration tracking, separate domain tables, transactional persistence, and one-time import of legacy JSON state.
- [x] Save an integrity-checked private copy of a recognized existing database before schema migration; expose the copy in local backup management.
- [~] Add an offline database recovery command and packaged-app startup recovery prompt. Both inspect integrity and required state rows, validate selected safety copies, preserve the previous database and SQLite journals, and reset saved automatic sends/custom runtimes for owner review. Startup salvages independently readable and application-valid normalized rows into a labeled backup; offline `--salvage` mode does the same without replacing the damaged source. With no recoverable records or backup, owners can preserve unreadable files and start an empty library; raw-page salvage and professional recovery without a valid backup remain.
- [~] Add encrypted portable backup download and validated dashboard restore with a pre-restore safety copy; `.ssb` archives use AES-256-GCM and a 12–200-character owner passphrase with a per-file scrypt key, ZIP archives and legacy SQLite-only backups remain supported, and failed image replacement rolls the database back. Local safety copies remain private by filesystem permissions but unencrypted.
- [~] Let owners inspect, download, and delete pre-restore safety copies from Settings; downloaded copies remain under the owner's control and need separate deletion.
- [~] Add structured logs, health status, and graceful shutdown/restart behavior. The API
  emits allowlisted JSON events, desktop installs and source-installed services retain the
  output in local private log files, and Settings can display a bounded, filtered tail of the
  active API log. Direct source runs still log to the terminal. The recovery tool salvages
  valid rows where SQLite can still read them but cannot reconstruct unreadable SQLite pages
  or recover data without a valid record or backup.
- Harden settings and provider configuration validation; verify every credential stays
  in the OS credential store.
- [~] Add connector health checks, sync timestamps, bounded HTTP retries, safe manual failure
  guidance, and response bounds (idempotent provider reads retry bounded network, 429, and
  server failures and honor capped `Retry-After` delays; scheduled league refreshes support
  owner-configurable 0–3 additional exponential-backoff retries for transient failures;
  authentication/permission failures stop immediately, and report generation or delivery is
  never retried by this path. Tests cover retry bounds and failure classification. Live
  provider behavior and rate-limit policies still require account-level verification).
- [x] Stream and cap remote response bodies at provider boundaries to avoid parsing
      unbounded payloads into memory.

**Exit criteria:** upgrades preserve data; recoverable provider and storage failures are
visible; backup and restore are documented and exercised.

### Phase 3: Complete league data and core analysis

- [~] Add Yahoo installed-app OAuth and refresh; owners still need Yahoo-approved Fantasy
  Sports API access.
- Finish authorized ESPN and Sleeper connection flows.
- Build representative fixtures for league formats, scoring rules, team counts, and
  access errors. Mocked contract fixtures now cover these areas for all three adapters,
  including owner-authorized ESPN cookies, Yahoo OAuth failures, and unavailable supplemental
  data; live account verification and broader cross-platform fixtures remain.
- [~] Add comparable-metric standings rankings and per-report evidence limits so missing
  draft picks, projections, or matchups are stated; owner-imported season projections now
  support cautious per-pick/per-team replacement evidence, and imported week-specific
  projections can produce matchup sums from explicit starter lists without empty slots or duplicate IDs or a complete roster whose reported size matches and whose player slots are all recognized; incomplete or unfamiliar roster data withholds estimates;
  up to eight owner-imported source sets are retained per league; same-name/URL imports replace only that set, and the newest eligible scoring-confirmed set supplies projection values. Draft reviews now compare picks with an owner-supplied median ADP only when each player is unambiguously matched across at least three distinct scoring-confirmed source sets; team timing and tentative process grades still require complete draft coverage and positional replacement evidence. Source independence and accuracy are not verified. Optional licensed nflverse current-week injury evidence is available with exact roster matching. Verified Yahoo/ESPN starter semantics and broader league-format coverage remain.
- Display source data freshness and citations wherever relevant.

**Exit criteria:** each supported platform has a verified connection path and analysis
tests across representative league configurations.

### Phase 4: Season schedule and agent personality

- [x] Default fresh installs to monthly offseason updates, Tuesday rankings, and Wednesday
      matchup previews saved as dashboard drafts. Confirmed platform phase pauses irrelevant
      recurring reports after each league refresh; all channel and automatic-delivery settings
      remain owner-controlled.
- [x] Add owner-configurable daily/weekly/monthly report schedules with timezone selection and
      graceful scheduler shutdown.
- [x] Allow each scheduled action to target selected connected leagues; omitted selections
      continue to include all leagues for compatibility with existing settings.
- [~] Add one-time date/time schedules with timezone-aware due checks, persisted completion
  markers, and visible failed history when the app misses the scheduled local date. Jobs can
  catch up later on the same date. Owner-authored league calendar events refresh the selected
  league and always save a draft; one shared UTC minute tick processes events serially, skipped
  daylight-saving wall times are rejected, Sleeper, Yahoo, and ESPN start times can prefill draft-hype events in
  the selected timezone, and missed or interrupted events remain retryable.
- [x] Persist the most recent scheduled execution outcomes and show them on the Schedule
      dashboard page, including bounded failure details.
- [x] Add per-league run outcomes and manual retry of failed league results as review-only
      drafts, so uncertain automatic delivery is never repeated by retry.
- [~] Add per-league season-calendar events and visible recovery status; events can be created
  manually; Sleeper, Yahoo, and ESPN draft start times can prefill draft-hype events; owners can apply a first-of-month offseason update plus Tuesday rankings and Wednesday matchup
  previews without changing delivery policy. A post-draft review and a separate power-ranking event can be prefilled for the day after a platform-reported draft at 9 AM;
  playoff weeks can use the same weekly in-season cadence.
- [~] Add writing-style presets, owner-defined styles, member profiles, and reviewable
  import-based learning (Settings provides four editable starting voices plus free-form style,
  tone, humor, report length, profanity, global/channel topic boundaries, and per-member
  banter controls; imported email/text sources are previewed and explicitly mapped to
  profiles before optional AI analysis; source text retention, separate report and chat
  memory-sharing opt-ins, edits,
  export, and deletion are owner-controlled. Preset coverage is currently limited to the four
  built-in voices, and generated prose cannot be guaranteed to honor every style or boundary).
- [~] Add source-backed football news refresh and reports with citations; selectable ESPN/PFF/FOX Sports feeds, background refresh cadence, manual refresh, source-change cache invalidation, stale-cache fallback, partial-feed status, and FOX Sports attribution/usage notice are implemented; additional source choices and live feed-availability verification remain.
- [~] Add banter settings, boundaries, opt-outs, and send/review policies (per-member
  preferences, global and channel-specific excluded topics, profanity, league scope, memory
  opt-in, and per-action/per-channel review or automatic delivery controls are implemented;
  model adherence to prose boundaries and provider account behavior still need live validation).

**Exit criteria:** generated reports use current league data, follow owner settings, show
their sources, and remain drafts unless the owner explicitly enables automatic sending.

### Phase 5: Messaging, email, images, and MCP

- [~] Complete Resend delivery and reply/thread behavior, Twilio SMS plus existing Conversations group delivery/history import, setup, and delivery states;
  GPT Image generation now stores base64 results in a private local image library with Settings
  list, preview, download, and delete controls. Portable ZIP backups include generated images
  beside the database, validate archive paths and expanded sizes, and keep image replacement in
  the validated database restore transaction. Legacy SQLite files remain restorable. Additional
  image providers and live provider verification remain.
- [~] Implement supported iMessage bridge options only where platform and privacy rules
  permit; BlueBubbles outbound group delivery, owner-triggered sync, optional polling, and
  revocable webhook URLs are available with an owner-managed Mac bridge, secure credentials,
  HTTPS requirements, existing review/automatic-send controls, and existing memory/privacy
  controls. Webhook events trigger the existing bounded history sync; live server verification
  remains.
- [~] Let the agent participate in configured group chats: when explicitly enabled, a direct
  first-line name or `@name` mention in new Twilio Conversations or BlueBubbles history creates
  a local reply draft using selected league context. A sync creates at most three replies,
  retains its cursor if generation fails, and defaults to review; a separate explicit owner
  opt-in can send directly to the originating group using persisted delivery claims and receipts.
  Initial history sync establishes a baseline rather than replying to old mentions, and restore
  disables reply and automatic-reply settings. Live provider and account verification remains.
- MCP now exposes league summaries/detail, news, report listing/detail, draft generation, and
  sending a selected existing draft when the owner enables MCP delivery in Settings. Each tool
  invocation approves one send, uncertain outcomes cannot be retried through MCP, and email
  thread replies remain a dashboard action. `docs/mcp.md` documents stdio setup for Claude
  Desktop, Cursor, and VS Code, and the repo skill documents tool selection and side effects.
  Packaged desktop users can launch `--sidekick-mcp`, which attaches to the running local API
  without creating a second scheduler. The packaging smoke check now completes MCP stdio
  initialization, discovers tools, and calls `list_leagues` against a temporary loopback API;
  this passes locally for macOS ARM and in Linux CI; Windows GUI launch remains unverified because the hosted runner does not reach Electron ready state.
- [x] Add conversation exports, per-member context controls, deletion, and data portability.

**Exit criteria:** each provider has setup guidance, errors, tests, and owner-controlled
permissions; MCP tools state their side effects and never send without authorization.

### Phase 6: Cross-platform release and maintenance

- [~] Package macOS, Windows, and Linux versions; a macOS ARM DMG and packaged runtime
  smoke check are verified locally. The hosted run `36369251567` passed the macOS, Windows, and Linux package jobs: macOS/Linux completed runtime smokes, while Windows verified the executable artifact because the hosted GUI process does not reach Electron ready state. Signing and public release publication remain. A version tag assembles successful matrix
  artifacts and an adjacent SHA-256 manifest into a draft release so an owner can review and
  publish the packages; the assembly job checks out the tagged source for its documentation and
  license assets, which are also included in each platform ZIP. The shared assembly script requires
  a native installer for each OS; `npm run test:release` verifies archive contents and checksums
  on POSIX hosts with the needed utilities. Hosted run `36369251567` passed the source and package matrices. Checksums detect
  transfer corruption but do not authenticate the publisher. The desktop build now uses
  stable Electron Forge 7.11.2 and maintains an `@electron/rebuild` `^4.0.1` override, resolving
  the older Forge 7 dependency path without relying on the Forge 8 alpha release; a macOS ARM
  package smoke passes with this combination. Electron build tools now install only inside the
  isolated package staging directory, keeping them out of a contributor's normal workspace
  install; a clean root `npm ci` passed on macOS ARM. Hosted macOS, Windows, and Linux package jobs passed in run `36369251567`; the Windows job only verifies the generated executable because the GUI cannot run in that hosted session. Revisit the override when stable Forge 8 is released. Upstream describes the
  current Forge 8 alpha as not ready for general consumption ([releases](https://github.com/electron/forge/releases),
  [Forge 8 release guidance](https://github.com/electron/forge/issues/4082),
  [Forge 7 rebuild dependency discussion](https://github.com/electron/forge/issues/4228)).
- Install and manage a per-user background service with logs, start/stop controls, and
  update/uninstall behavior. The CLI exposes update as a rebuild/reinstall/restart operation;
  macOS and Linux lifecycle CLI branches are integration-tested with fake system commands and
  temporary homes, and Windows Task Scheduler command sequencing is covered through an
  injected runner. Actual launchd/systemd and Task Scheduler execution remain unverified.
- Test clean installation, upgrade, uninstall, persistence, and credential storage on
  all supported operating systems.
- Publish release notes, supported integration matrix, troubleshooting guidance, and
  supported-platform guidance for the public GitHub repository. The current integration and OS
  status is documented in `docs/support-matrix.md` but needs owner review before public release.
  A desktop installation guide and MIT license ship as standalone release assets and inside each
  OS archive; release notes and verified support claims remain. Contribution setup and PR checks
  are documented in `CONTRIBUTING.md`.
- Run manual code and security reviews, performance checks, and a refactoring review
  before each release; do not run automated security scans.

**Exit criteria:** a non-developer can download a release, follow a short setup flow,
connect a league, and keep the agent running without leaving a terminal open.

## Quality and delivery standards

- Keep platform and provider behavior behind typed interfaces; keep shared business
  rules in the core package.
- Use formatting, linting, type checks, and tests in CI. Add contract tests for provider
  boundaries and realistic fixtures for connector data.
- Test onboarding, connection failures, schedule execution, report citations, draft
  review, duplicate-send prevention, data export/deletion, source-message retention,
  and upgrade recovery.
- `npm run perf:smoke` records cold API startup, API working set, health and full-state
  latency, and built dashboard asset transfer time against a synthetic local fixture;
  one macOS ARM baseline is recorded in `docs/performance.md`. Measure live provider sync
  duration, report generation, browser paint/interaction responsiveness, scheduler resource
  use, and supported-platform baselines before releases.
- Keep `AGENTS.md`, setup, architecture, decisions, tasks, and memory docs current.
  Separate durable project guidance from temporary implementation notes.

## Settled architecture and remaining release work

The repository has selected the following architecture and initial scope; these are recorded in
`docs/decisions.md` and should change only through a new decision:

- TypeScript npm workspaces, a loopback-only local API, SQLite persistence, and portable ZIP
  backups that exclude credential-store secrets.
- Electron Forge for self-contained desktop packaging, plus an optional per-user background
  service for source checkouts. The packaged app can open at sign-in, hide to the system tray
  when its window closes, and continue scheduled actions until the owner chooses Quit. A
  headless desktop mode and cross-platform interactive lifecycle verification remain open.
- Sleeper, Yahoo, and ESPN as the initial fantasy platforms, accessed through public or
  owner-authorized paths. ESPN's session-cookie endpoint is undocumented and remains a
  compatibility risk; access controls must not be bypassed.
- ESPN NFL, PFF, and FOX Sports NFL as the initial selectable news feeds, with source-specific
  attribution and usage limits.

The remaining decisions and release gates are:

- The repository uses the MIT License. Published packages and a verified support matrix remain
  open before the project can be described as fully ready for public use.
- Windows and Linux desktop packaging, database-folder migration, background-service lifecycle,
  and support-matrix behavior need on-device verification. Signing, public release publication,
  and a no-terminal update path are also open.
- Yahoo Fantasy Sports application approval belongs to each owner. Live account verification
  across Yahoo, ESPN, and Sleeper remains necessary; ESPN response compatibility should be
  revisited when its public interface changes.
- Broader league-format fixtures, verified Yahoo/ESPN starter semantics, independently verified market ADP, additional AI/image
  providers, provider-specific pricing catalogs, and CLI token-usage support remain outside the
  verified launch scope. API cost estimates use owner-entered rates and are explicitly approximate.
- Direct comparison with the original dashboard image remains open because X blocks the media;
  current visual cues and the generated concept are documented in `docs/design`.
- Yahoo and Sleeper playoff status is recognized when both platform fields are available; ESPN
  H2H playoff start is inferred from schedule settings and labeled as uncertain. Each recurring
  schedule reevaluates report eligibility after refreshing league phase, but does not infer or
  rewrite owner schedules; live ESPN and phase-transition validation remain open. Draft and
  postseason calendar suggestions require platform-reported events or explicit owner input.
