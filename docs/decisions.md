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

## 021: Explicit report review and independent settings saves

Manual dashboard generation always requests a draft. Keep scheduled automatic delivery as a separate owner policy. Store generation evidence with new reports and support optimistic revision-checked edits only before any delivery attempt; check the persisted delivery claim in the same SQLite write transaction. Sending accepts the reviewed revision and destination so another window cannot silently change the content or target. Attempted content remains immutable for provider retries.

Split Settings into shared allowlisted sections and merge each PATCH inside serialized persistence. AI tests and model discovery save only AI configuration. Keep the legacy full-settings API for existing clients. Extract report, delivery, and chat orchestration behind injected services, and verify the user journeys with isolated desktop/mobile Chromium tests.

Use `release-status.md` for current release gates, `tasks.md` for active work, the support matrix for verification detail, and dated reviews for historical evidence. Pin the verified Node 22 LTS runtime and test the minimum separately; a native SQLite load failure must not trigger database recovery.

## 022: Durable requests, frozen delivery, and revisioned settings

Keep report generation independent of HTTP/browser lifetimes. Persist caller request IDs and terminal states, bound pending work, and commit the generated report and completed job together. Reconnect to the same request ID; an interrupted request requires a new explicit owner action. Keep backward-compatible report responses through the same queue, and serialize provider generation with scheduled callers.

Treat every attempted report as immutable outbound content. Freeze its entire rendered envelope, preserve its email request key across retries, and refuse changed sender/account configuration. Retain only routing identity and a Resend-key hash in SQLite; credentials stay in the OS vault. Do not infer the original payload for older uncertain attempts.

Use independent Settings section revisions checked against SQLite, including background/derived changes. Preserve pending edits on conflict and reload one section only after an owner action. Keep the legacy full-settings API for compatibility, while the dashboard requires revisioned section writes.

Use lightweight live state and cursor-paged report summaries, fetching bodies for review. Keep provider-boundary browser substitutes while exercising production routers and real temporary SQLite. Preserve package public imports while splitting domain/persistence modules and focused Settings hooks. Consolidate CSS tokens and remove superseded exact-selector declarations without changing cascade order.

## Durable local operations

Use one saved request contract for dashboard and MCP generation. A retry after a lost response
must resolve the original request rather than starting paid inference again. Compact terminal
receipts have no automatic expiry; failed/interrupted/cancelled jobs require a new ID for a
deliberate retry. Cancellation aborts adapters and guards the save transaction, preserving
completed reports and refusing late publication. Schema 6 indexes report summaries and skips
unrelated row serialization/writes while preserving the existing domain-cache API.

Use hash URLs for pages, leagues, and report review because the desktop serves a static Vite
bundle. Guard browser history as well as menu navigation against unsaved Settings/report loss.

Keep routine backup scheduling machine-local, separate from portable restored settings. Store
only non-secret schedule/status on disk and the exact recovery passphrase in the OS credential
store. Authenticate, parse, and validate every new encrypted archive before rotation. Do not
expire safety copies through routine rotation. Dry-run restore validation operates on a private
disposable database, preserving current data. Diagnostic downloads omit free-form log strings
and sensitive domain text; correlation IDs are independently generated UUIDs.

## Plain-language local navigation search

For users who do not know the app's technical labels, settings search uses a reviewed catalog of
natural aliases and typed destinations. Deterministic local ranking gives immediate results,
works without an AI account, and avoids sending queries or private settings to a model. A result
opens and highlights a control; it never changes it. Explicit anchors and bookmarkable setting
URLs are shared by mouse, keyboard, reload, and history navigation.

Saved report search is metadata-only and uses bounded local SQL lookup beyond the dashboard's
recent report window. Full-text message/body search, natural-language account changes, and
remote/AI-assisted search are outside this scope. Small typo tolerance is available for catalog
and recent metadata matching; historical SQL lookup treats title/type words literally.

## Guide everyday tasks while keeping advanced control

Present Home, Reports, Schedule, and Settings as the main workflow; secondary tools
remain searchable and available through More tools. Preserve route keys and stored
writing-style values to avoid breaking existing bookmarks and customization. Guided AI
setup offers one starting connection with billing and data-sharing guidance, tests
existing connections without replacing them, and keeps alternative providers available.
Individual schedule presets always return to draft review. Sending is a distinct
confirmation after the exact destination and saved text are shown. Failure details
stay expandable, and sticky settings feedback stays visible without covering dialogs.

## Task-first discovery without silent execution

Use bounded local task interpretation plus exact settings/help destinations rather
than sending search queries to a remote AI. Preserve negation, named report/channel
scope, and explicit save/confirmation. Schedule proposals start in draft mode, and
a changed delivery revision requires a new recipient preview. Keep sample examples
fictional and isolated from real data and jobs. Manual sharing must not change
provider delivery state. Human usability validation and managed account infrastructure
remain separate from automated local workflow checks.

Reject compound delivery channels and unsupported schedule cadence rather than
silently selecting a channel or converting the request to weekly. Bind manual
sharing feedback to its text snapshot, including late browser API completions.
When a dialog replaces a focused control, restore focus to its container instead
of letting subsequent keyboard events reach the background page.

Use friendly timezone labels only at the presentation boundary, preserving stored
IANA identifiers and configured custom choices. Non-weekly search guidance is a
non-mutating Schedule page destination, not a prefilled or saved cadence. Expose
delivery channel and policy labels with full-width phone controls so review policy
is readable before a user saves.

Keep keyboard search closed while another dialog is active, preserving unfinished
work and focus. Shared dialogs (including guided setup) lock background scrolling
until the last dialog closes and restore the prior body styles. Report refreshes
are scoped to the selected report and editing session; cancel background refreshes
when either changes and ignore stale retry/post-send results. Wrap long titles and
league names inside the review rather than allowing horizontal scrolling.

Give saved report reviews a sticky title/status and Close control, with metadata
behind a native Details disclosure. Keep missing data dates visible in its summary
and evidence guidance separately reachable. Deduplicate only when the literal saved
body equals the delivery text and the reading view has no citation-link conversion.
Keep separate exact previews while editing, after channel truncation, or when a saved
retry envelope differs. Recipient, subject, retry warnings, and explicit confirmation
remain visible; this presentation change does not alter sending or revision checks.

Scope draft-save responses and status feedback to the editing session that submitted
them, including failures and completion after navigation. Lock title/body and cancel
editing during a save; explicitly explain that closing leaves the pending save
running. Refresh persisted state after completion without replacing another review.

Share one delivery-text policy between browser previews, newly captured delivery
envelopes, and direct sends. Retain existing UTF-16 size caps (1500 direct SMS, 1600
for a valid Twilio Conversation SID, 10000 iMessage) but shorten only at grapheme
boundaries so emoji, combining accents, and joined characters remain intact. Retry
with the existing immutable envelope without shortening it again.

Retain dialog keyboard focus when its current control becomes disabled, as well as
when that control is removed. Observe disabled-attribute changes and move focus to
the dialog only if the browser has dropped it to the background body.

Use one explicit draft-edit path for the top Edit button and the shortening shortcut.
The shortcut focuses the full saved body rather than changing or saving text. Keep
its visibility tied to editable drafts and its disabled state tied to sending/saving.
Render friendly delivery labels only at the presentation boundary, preserving channel
IDs, destinations, envelopes, revision checks, and explicit send confirmation.

## Public price snapshots and independent prospective ledger

Use keyless public ESPN structured current pregame prices for the initial
moneyline/spread/total coverage. Preserve source and retrieval time, require an
explicit choice and exact-term verification, and retain manual entry for coverage
gaps/props. Public coverage and executable fills are not guaranteed. Keep archived
prices separate; they have no verified publication timestamps or book identity.

Persist pre-kickoff predictions in an independent bounded SQLite table rather
than rebuilding performance from retained advice. Never backdate forecasts or
choose a retry after seeing its outcome. Grade against verified final games and
complete supported scoring; missing appearances stay unknown. Paper results are
hypothetical one-unit selections, not wagers. A fixed chronological archived-price
simulation is supplementary evidence; historical outcomes existed during method
development, so its later season is not called an untouched holdout. Preserve
negative findings and require future outcomes before claiming prospective quality.

## Book-anchored corrections instead of unsupported scores-only market confidence

The paired-price game model uses the sportsbook as an explicit input and learns
small penalized adjustments from earlier opponents/scoring and book calibration.
Choose parameter procedures on older development seasons before viewing later
comparison results. Compare each historical game at its own line with the matched
book probability and prior model, reporting missing coverage and weekly
uncertainty. Do not call a reused historical comparison untouched or prospective.
Generic frequency improvement alone cannot support a current game-market edge.
Keep legacy/prop numerical paths and saved method identities without regrading
old predictions. The independent scores-only candidate is documented research;
large improvement from book inputs is not independent market prediction.

## Past-only context corrections and adaptive moneyline blending

V3 adds schedule rest, season phase, selected line context and earlier team errors
against their own archived lines to the book-anchored correction. Exclude same
week/target/future outcomes, including when computing context and blending weights.
Learn moneyline correction strength from earlier out-of-week probability losses,
with a fixed penalty toward the book and weights restricted to zero through one.
Choose the prediction rule using older development probability error, never later
paper returns. Preserve the previous market-aware method for matched comparisons
and keep all saved methods separate. A pooled small improvement with mixed
season/market findings and an interval spanning zero does not satisfy consistent
sportsbook superiority. Require future pre-kickoff evidence before such a claim.

## Health, quarterback and weather corrections

Choose additional market corrections using older-season probability error and
retain prior procedures where they perform better. The health/weather joint
correction is enabled only for totals; moneyline/spread retain v3. Learn bounded
regularized effects rather than assigning guessed injury point penalties.

Require publication/capture evidence before kickoff. Retrieval never repairs an
undated historical report. Previous QB identity must come from an earlier completed
game; a captured chart listing is not a confirmed starter. Regional forecast lead
and an explicit availability allowance must be disclosed; observed game weather
is not a historical pregame feature. Exclude covered/retractable venues.

Current dated ESPN labels can supply missing team-level injury context, excluding
IR, with the unverified historical vendor bridge disclosed. Missing inputs stay
unknown and do not establish health or market advantage. Preserve old saved model
methods and unchanged action gates. [Evidence](reviews/2026-10-12-model-v4-comparison.md).

## Preserve prediction quality when better sources do not improve it

Prefer dated official injury articles as descriptive current evidence, but do not
authorize their later edits using an early original publication date. New source
coverage and richer player metrics do not imply a measured prediction advantage.
The snap-role and QB-efficiency candidates lose to the existing procedures on
older development; the official-count counterfactual raises later measured error.
Keep these numerical effects disabled and retain v3/v4. Expose the source and
research limits in Advice/Help. Avoid bulk historical downloads for disabled
features; capture only relevant current-season/previous-season descriptive roles.
Keep explicit research replay separate from HTTP/live dispatch, and preserve
future pre-kickoff numerical records unchanged for later grading.

## Where Sunday Sidekick runs (proposed, owner decision pending)

The app is local-first: scheduled reports, game-day league refresh and Advice warm-up run only
while the desktop app (or source service) is running on the owner's computer, and the
dashboard is reachable only from that computer. That protects league data and credentials but
means a sleeping laptop misses Tuesday drafts and the owner cannot check Home from a phone on
Sunday.

Options, smallest first:

1. **Stay local, lean in (current).** Launch at sign-in, start hidden in the tray, refresh
   around games, and record missed scheduled runs so the owner can re-run them after
   waking. No new exposure.
2. **Read-only view on the home network.** Serve Home and saved reports to a phone on the same
   Wi-Fi. Requires, per `AGENTS.md`, a written threat model and authentication design first:
   pairing with a one-time code, per-device tokens stored in the OS credential store, TLS or a
   pinned local certificate, read-only routes only, no credential or delivery endpoints, and
   an owner switch that defaults off.
3. **Managed service.** Move scheduling and AI calls to the hosted design sketched in
   `managed-ai-design.md`. Largest change; needs accounts, billing and a data policy.

Recommendation: keep option 1 now and decide on option 2 only with that threat model written
and reviewed. Do not add any non-loopback listener until then.

## Price checking over new betting models (October 22, 2026)

Eighteen forecast versions were evaluated against sportsbook prices; none beat the books
consistently (see `docs/advice.md` and `docs/reviews/`). New model versions are paused until a
data source the books don't already price is available. Betting work now favors tools that are
measurable today: published prop lines, other books' prices with the margin removed, a
closing-price record for each saved selection (closing line value), weekly running paper results
and a self-set weekly bet limit. The AI's own win probability stays in research records but is
not shown in results; no stake sizing is offered because no edge has been shown.

Advice keeps its two-pass flow (answer, then review). Skipping the review for Hold answers was
tried and reverted: the evaluation suite grades the raw reviewed answer separately, and the
review is part of that safety design. Cost is controlled by model choice instead.

## Chat runs its own lookup loop (October 22, 2026)

Ask Sidekick (the Ask page and the ⌘J panel) answers from the same data as the rest of the app.
The model never gets provider-native tools: it replies in JSON asking for named, read-only
lookups, and the API fetches them from its own loopback GET routes (standings, rosters, lineup
check, waivers, trades, live, alerts, news, games, odds, props, book prices, betting record and
reports). This keeps the isolated Codex connection's no-tools guarantee and works the same on
every AI connection. Lookup results enter the prompt as escaped `<lookup_result>` data blocks,
are capped in size, and are limited to three rounds of up to three lookups.

Chat cannot send, bet, or change settings or lineups; it points to the page that does. Betting
answers quote prices only and never give the AI's own probability or "edge", matching the advice
decision above. Conversations live in `chat.sqlite` beside the main store (newest 50, 80 messages
each), outside app state, exports and report prompts, and can be deleted from the panel. Answers
arrive whole, with progress lines while lookups run: the reply format decides between "look up"
and "answer" only once the model finishes, so token-by-token streaming is not offered.

## Props board: projection leans that grade themselves (October 23, 2026)

Player props get their own Advice tab instead of sitting inside the bet form. Each published line
is compared with ESPN's weekly projection for that stat. Because ESPN projects an average game
and most players finish below their own average in most games, the projection is first scaled to
a typical game with ratios measured from 2025 (for example receiving yards 0.87, rushing yards
0.93, passing yards 1.0). The gap to the line is divided by the player's usual game-to-game swing:
the measured 2025 spread for that stat, shrunk toward the player's own history as games
accumulate. Gaps under 0.15 swings get no lean; 0.3 and 0.5 mark moderate and strong.

This is a transparent comparison, not a calibrated probability, and it is not shown as one. Every
lean is saved before kickoff (`prop-leans.sqlite`, the last line seen before kickoff wins) and
graded from nflverse stats afterwards; the board shows the record by strength against the 52.4%
break-even at −110. The record, not the lean's size, decides whether it deserves trust. Bet
analysis for a prop receives the same three numbers as evidence so the AI and the board agree.
