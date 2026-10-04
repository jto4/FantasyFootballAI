# Fantasy Football AI Companion: Implementation Plan

## Scope and readiness

This document defines the product direction. [Release status](release-status.md) owns current readiness and release gates; [tasks](tasks.md) owns active implementation work; [support matrix](support-matrix.md) retains provider and operating-system verification evidence. Historical implementation evidence is retained in [the archived task record](reviews/2026-09-28-task-history.md).

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

## Dashboard design direction

The dashboard now applies the linked post's visual direction:
[Bakers Studio, “wave + gradient”](https://x.com/studiobakers/status/2101998189889122451?s=46).
Visible frames show a warm cream canvas, soft pastel gradients, quiet floating surfaces,
and editorial serif type. The implementation adapts that mood without copying the layout.
See `docs/design/dashboard-visual-direction.md`.

The result is a warm editorial fantasy-football league desk that keeps core tasks,
matchups, rankings, reports, and news fast to scan. The linked reference is inspiration,
not a layout to copy. Generated hero background artwork is bundled locally.

Design goals:

- Establish a cohesive visual system for the dashboard shell and league views, with a
  warm off-white base, editorial display type, neutral surfaces, thin rules, and restrained
  clay and pastel accents.
- Keep scores, controls, and dense league information stable and legible; respect reduced
  motion in remaining animated controls.
- Make the next league event, this week's matchups, recent reports, and news easy to find.
- Keep draft, matchup, ranking, and news pages related in style while making their
  purpose and hierarchy distinct.
- Design responsive layouts and consistent empty, loading, error, connected, and
  disconnected states.
- Respect reduced-motion preferences, keyboard navigation, and contrast requirements.

Design acceptance criteria:

- The redesign follows visible frames from the reference and records its adaptation.
- The finished dashboard has a cohesive warm identity without harming text contrast or
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
  sizes. The 2026-09-28 public-catalog smoke measured a 14,661,302-byte decoded response and
  12,229 normalized players; the 20 MB cap now accommodates this current catalog, and known
  player IDs/names/positions passed. Standings combine `fpts` with the documented two-digit
  `fpts_decimal` component, so
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
  NFL, PFF, FOX Sports NFL, CBS Sports NFL, and Pro Football Talk feeds independently; clearing all prevents external news
  requests. FOX Sports requires attribution and limits free feed use to individual or nonprofit
  noncommercial use; Settings shows that condition before it is enabled. Feed information is
  available from [ESPN](https://www.espn.com/espn/news/story?page=rssinfo), the
  [PFF RSS feed list](https://www.pff.com/pff-rss), and the
  [FOX Sports RSS directory](https://www.foxsports.com/rss-feeds), the [CBS Sports NFL RSS feed](https://www.cbssports.com/rss/headlines/nfl/), and [NBC Sports' Pro Football Talk RSS feed](https://www.nbcsports.com/profootballtalk.rss). CBS and Pro Football Talk stories are presented as attributed headline links; the app does not fetch article text.
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
  explain which reviewed profile notes are sent for each use. Conversation-import AI analysis
  rechecks consent after provider setup, before each participant prompt, after each model
  response, and when committing notes so revocation stops subsequent disclosures and prevents
  stale analysis from being saved. Report generation also revalidates the exact member context
  before model use, after inference, and at draft persistence.
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
- [x] Add owner-triggered Resend inbox polling and per-message local import. The loopback-only
      dashboard lists at most 50 bounded message headers, fetches a selected body only after an owner
      action, strips quoted history, deduplicates by Resend message ID, merges into a sender profile,
      honors per-message retention, and never derives an outbound recipient or sends a reply. Focused
      router tests cover local-only import, duplicate detection, memory and AI opt-ins, consent
      revocation during runtime setup, inference, and persistence, and sanitized credential/provider
      failures; provider adapter tests cover response bounds and malformed data.
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
  parsing. Treat imported conversation text as data, never as executable instructions; AI prompts
  now place imported, live chat, report, and league evidence inside 96 KB-limited JSON data blocks with
  escaped markup delimiters and system guidance not to follow embedded instructions. Adversarial
  input cases cover imported and chat prompts; generated text still requires owner review.
- Provide a security policy and release checklist. Keep CI focused on type checks, lint,
  formatting, tests, and builds; perform documented manual code and security reviews before
  releases. Do not add or run automated security scans. `.github/workflows/quarterly-maintenance.yml` opens one checklist issue on January, April, July, and October 7, deduplicating an already-open issue for that quarter; `scripts/quarterly-maintenance.mjs` tests quarter naming, duplicate suppression, issue creation, and repository validation. Maintainers record findings and complete manual review items in the issue.
- Review refactoring opportunities quarterly and before each release to reduce duplication and maintain clear package
  boundaries; record architecture changes in decision notes. The first refactoring pass moved the platform adapters behind the integrations barrel
  (decision 009); a follow-up separated Sleeper, Yahoo, and ESPN into focused modules with
  shared parsing helpers (decision 011). Continue this review during every release cycle.

## Quality and delivery standards

- Keep platform and provider behavior behind typed interfaces; keep shared business
  rules in the core package.
- Use formatting, linting, type checks, and tests in CI. Add contract tests for provider
  boundaries and realistic fixtures for connector data.
- Test onboarding, connection failures, schedule execution, report citations, draft
  review, duplicate-send prevention, data export/deletion, source-message retention,
  and upgrade recovery.
- `npm run perf:smoke` records cold API startup, API working set, health and full-state
  latency, and built dashboard asset transfer time against a synthetic local fixture. Hosted
  run `36376672913` uploaded comparable JSON samples on macOS, Windows, Linux, and the minimum
  Node.js runtime; the cross-platform results and owner-machine macOS ARM repeats are recorded
  in `docs/performance.md`. Measure live provider sync duration, real model inference,
  browser paint/interaction responsiveness, scheduler resource use, and lower-powered hardware
  before releases.
- Keep `AGENTS.md`, setup, architecture, decisions, tasks, and memory docs current.
  Separate durable project guidance from temporary implementation notes.

## Implementation and release

See [architecture](architecture.md) and [decisions](decisions.md) for implementation boundaries. Track changes in [tasks](tasks.md), and complete the gates in [release status](release-status.md) before publication.
