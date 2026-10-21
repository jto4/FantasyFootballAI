# Project Memory

This file keeps durable project constraints and behavior for contributors and AI tools. It is
not a claim that the repository is already public or release-ready. See
[`implementation-plan.md`](implementation-plan.md) for scope and readiness,
[`tasks.md`](tasks.md) for implementation state, and [`support-matrix.md`](support-matrix.md)
for evidence-backed platform/provider support.

## Durable facts

- Report generation carries the league season and original sync time into the AI context. Historical/future-season setups omit modern catalog availability, nonmatching headlines and legacy projections without an explicit matching season period. NFL season news may include January/February of the following year. Reports request concise plain text; draft hype uses the supplied draft date/status and a neutral draft-outlook title.
- Report matchup sums require eligible starters: recorded Out/reserve flags in either status field withhold a team-total comparison until an updated lineup is supplied; Questionable remains explicit and conditional. Graphs retain a season label, show recorded scores to two decimals and wins as counts, and honor Sleeper commissioner score overrides, including zero. Missing graph values remain unavailable with compact spacing.
- Scheduled and calendar reports use the persisted owner label, connection date and new sync timestamp after connector reads. Scheduled scope/timing/enabled state is rechecked after sync before inference. `scheduled-reports.ts` exposes production orchestration for isolated tests without importing a live API process.

- Reports includes a compact five-template library, a separate League charts view, and a previewable Tuesday/Wednesday weekly draft plan scoped to the active league. Enabling this plan replaces only those two report schedules with dashboard drafts, using revision-checked schedule updates; it never enables outbound delivery. Individual draft reports prefill one-time dates, and offseason automation prefills monthly timing.
- Report chart evidence is a bounded numeric platform snapshot captured before inference, with no roster/member data or AI-derived chart values. Stored evidence survives edits, league refresh and restart, and is validated on API reads and backup imports. Legacy reports without charts show their original text. Points-for/win comparisons require complete team coverage; missing scores stay unavailable. Charts initially show six teams and three matchups, with independent expansion and source timestamps; they do not imply forecasts or final game outcomes.

- Home keeps routine football decisions above optional report and league detail; drafts, delivery issues and generation expand report activity automatically. Unknown availability and deadlines remain explicit.
- Advice has separate decision, saved-history and tracking views. View changes retain draft inputs; accepted history navigation returns to the decision even for the same URL. Results keep the conditional change, confidence, availability and lineup visible while detailed calculations expand on demand. Settings search opens collapsed groups before focusing controls; save and delivery guards remain independent of presentation.

- `npm run db:recover -- --check` inspects SQLite integrity and recognized safety copies. A selected valid safety copy can be restored offline after stopping the app; the previous database and SQLite journals are kept under `recovery-*`. The packaged app also prompts before restoring one of five recent valid copies at startup.
- API operational logs are JSON lines with allowlisted metadata; the packaged desktop app keeps them in a private rotating `logs/api.log` set and discards unstructured API stderr. Source service process output remains under `~/.sidekick/logs/`.
- The project targets a public, self-hosted fantasy football companion for league commissioners.
- Local storage and OS-backed credential storage are required defaults.
- Linux source builds need the system `libsecret` development package; running Linux apps need a Secret Service provider on the user's D-Bus session. A failed credential-store status check must be shown as unavailable, never as an empty/unconfigured store.
- Application state is stored in versioned SQLite tables; legacy JSON is imported once and retained as a migration copy.
- Without `SIDEKICK_DATABASE_FILE`, the database lives in `SIDEKICK_USER_DATA_DIR` when set and in `~/.sidekick` only for fully unconfigured source runs. Stores opened at module load (such as market research) must create their directory first.
- Supported fantasy sources are ESPN, Yahoo, and Sleeper; access must be authorized. Their connectors live in focused modules under `packages/integrations/src/platforms/` and use shared bounded parsers. League snapshots display a stale warning after the owner-selected 6-hour to 7-day threshold (24 hours by default); missing, invalid, or future sync timestamps remain unknown.
- Yahoo uses an owner-supplied installed-app OAuth client with an out-of-band authorization code; app approval is external and tokens refresh from the OS credential store.
- Football headlines use owner-selected ESPN NFL, PFF, FOX Sports NFL, CBS Sports NFL, and Pro Football Talk RSS feeds; an empty selection disables external news requests. Headlines carry source labels and links; CBS and Pro Football Talk article text is not fetched. FOX Sports feed use is limited to individual or nonprofit noncommercial use and requires attribution. The NBC Sports PFT RSS endpoint returned 10 parseable stories in a live check on 2026-09-28.
- Yahoo playoff start week and Sleeper playoff week start are used with the current league week to label report context and the dashboard; missing values leave playoff status unknown, and ESPN H2H playoff starts are derived from its schedule settings and marked as inferred. The stdio MCP server is loopback-only, offers read-only league/news/report review tools plus draft generation; a separate send tool can send one existing draft only after the owner enables MCP delivery in Settings. Automatic actions support daily, weekly, monthly (days 1–28), and one-time schedules. Fresh installs enable first-of-month offseason updates, Tuesday power rankings, and Wednesday matchup previews as dashboard drafts; phase checks pause recurring actions when fresh league status confirms the wrong part of the season or a completed season. The settings recommendation can restore these cadences while preserving each action's channel, league scope, and draft-or-automatic policy.
- Outbound communication is controlled per channel and action.
- iMessage delivery and manual or opt-in interval history sync can use an owner-configured BlueBubbles server. Server URL/password stay in the OS credential manager, the chat GUID and 5/15/30/60-minute interval are local settings, polling runs only while the app is open, and an optional revocable loopback webhook URL triggers that same bounded sync when a new message arrives. Sync is deduplicated and retention-aware, AI analysis remains separately opt-in, and restored backups disable polling until reapproved. iMessage and Twilio history sync re-read memory consent, group target, and polling state after provider waits and before each AI phase; per-member analysis stops if memory or its separate analysis opt-in is turned off. Each opted-in analysis prompt contains only that author's messages and profile notes, never other group members' messages. Mention replies also recheck reply consent, destination, selected league, and member-context text immediately before each AI generation, after asynchronous provider setup. Resend inbox metadata refresh and explicit inbound-email import are owner-triggered, merge into sender profiles, deduplicate by message ID, and honor per-message retention. They use bounded plain-text retrieval and do not expose public webhooks or send replies automatically.
- BlueBubbles message-response JSON can be imported into local member profiles; participants are identified by handle address, and the importer's fallback name identifies owner-authored messages.
- File imports preview parsed participants and let the owner explicitly merge each author into an import-created profile or create a separate profile. On opted-in analysis, new authored messages and prior profile notes are used to update style/context; exact repeat exports are skipped, while merged source blocks keep independent retention dates.
- Generic local AI CLI prompts are written to stdin without a shell; Apple's `fm respond` adapter passes instructions and prompts as separate argv values. Both paths bound stdout and runtime and discard stderr so prompts or secrets do not reach UI errors. The Apple adapter is available on macOS 27+ and requires the `fm` command. Its argv prompt may be visible to local process-inspection tools while it runs, so the UI documents this exposure.
- Writing-style presets are starting points only; the owner can edit the resulting freeform voice.
- Report length is owner-configurable as short, standard, or long; missing values in older state normalize to standard.
- Projection CSV source sets are stored per league (up to eight); importing the same normalized source name and URL replaces that set, while other sources remain. Owners must confirm that point values match league scoring; unconfirmed and legacy sets remain local but are excluded from numeric analysis. Draft ADP uses an owner-supplied median only for players matched unambiguously across at least three scoring-confirmed source sets; source independence and scoring accuracy are not verified, and team process grades still require a complete confirmed draft and positional replacement evidence.
- Owners can set additional excluded-topic boundaries per delivery channel; report and group-chat reply prompts include only the boundary for their selected channel.
- Imported conversation source text can be retained until deletion or purged after 30, 90, or 365 days; profile notes are preserved and downloaded backups retain their own data.
- Each member profile can be excluded from AI context independently of the global memory switch. Import analysis, report context, and group-chat reply context have separate opt-ins; group replies never reuse the report-sharing switch.
- Member profiles can be assigned to all connected leagues or selected league IDs; report and group-chat reply prompts include only profiles scoped to their selected league. Profiles without a saved scope retain the prior all-leagues behavior.
- Pre-restore SQLite safety copies are managed from Settings and remain on disk until the owner deletes them; downloaded backups are separate copies.
- Before applying schema migrations to a recognized existing SQLite state database, startup writes and integrity-checks a private `before-upgrade` copy in the local backups folder. It is available with pre-restore copies in Settings and is retained until deleted.
- OpenAI GPT Image and Stability AI Stable Image Core results are stored as private files in the local data folder's `images/` directory and managed from Settings. Each provider has a separate OS-stored API key. Desktop data-folder moves copy the image folder; portable ZIP backups include it with the database. Legacy SQLite-only backup restore clears generated images.
- SQLite delivery claims coordinate API processes that share a database; sent claims persist, and an uncertain outcome requires owner confirmation before a new claim.
- The dashboard and service target macOS, Windows, and Linux.
- Sleeper draft metadata retains its documented future `start_time`, and Yahoo normalizes the documented `draft_time` from league settings (Unix seconds); Settings converts either value to the selected timezone and can prefill a draft-hype event at the reported time or a post-draft review event the following day at 9 AM; both must be reviewed and added by the owner. ESPN reads timezone-qualified ISO `settings.draftSettings.date` timestamps when available; unsupported or ambiguous values are ignored.
- Owners can schedule league-specific one-time milestones. A shared UTC minute tick processes due events serially; invalid daylight-saving wall times are rejected. A due event refreshes only its league and creates a draft; persisted completion prevents duplicate runs, missed events appear in history, and calendar events do not send automatically.
- Electron Forge creates a self-contained package for the current OS; the API runs in a sandboxed desktop shell's utility process, and the desktop app stops it on quit. Use `support-matrix.md` for current platform packaging and release verification.
- Production dashboard/API responses use a restrictive same-origin Content Security Policy; Vite development adds only the inline/eval allowances needed for hot reload.
- The dashboard uses a responsive warm editorial design informed by visible frames from Bakers Studio's “wave + gradient” reference: off-white surfaces, serif display headings, soft pastel gradients, open ruled sections, and restrained clay accents. The decorative hero image is no longer rendered; its source stays in `apps/dashboard/design-source/images/`. Review the screenshot and responsive states when changing dashboard styles.
- Packaged desktop Settings can move an app-consistent SQLite copy and existing safety backups into a selected data folder. The selection is persisted outside that folder; the original data directory is deliberately retained until the owner removes it.
- Closing a packaged desktop dashboard window hides it to the system tray while the local API and schedules continue. The tray menu can reopen the dashboard or explicitly quit and stop the API. Owners can choose to start hidden at sign-in; ordinary app launches remain visible.
- Do not scrape NFL.com injury pages or rely on undocumented injury endpoints. The optional nflverse CSV feed is CC BY 4.0, disabled by default, cached locally for six hours, and matched only by exact normalized name/team for the current week. Cite its URL and local retrieval time; discard “not injury related” rest-day labels, describe results as source-reported availability rather than medical advice, and continue gracefully when unavailable. Platform injury tags remain potentially stale.

- Manual dashboard generation always requests a draft. Reports support revision-checked edits only before any delivery attempt, followed by an explicit recipient/channel/message review. Scheduled automatic policy remains independent.
- Settings uses shared section allowlists; AI testing/discovery saves only AI fields. API and CLI onboarding readiness requires a successful test of the saved runtime, then first-draft review.
- Checkouts may live in iCloud Drive. Generated folders carry the `com.apple.fileprovider.ignore#P` attribute (set by `scripts/icloud-safe.mjs` on install and build), conflict copies (`name 2.ext`) are gitignored, and code that enumerates build output must accept only real module filenames.
- Provider-connected leagues refresh automatically (older than 12 hours, 90 minutes before a kickoff, or after a game ends since the last sync); snapshot imports never refresh silently.
- Home's weekly answer (`/api/advice/briefing`) is deterministic and AI-free, built from the same lineup and waiver plans as Advice; it never saves, sends or changes rosters.
- `matchups` always means the current week. Completed regular-season results live separately in `weeklyScores` (ESPN from its schedule, Sleeper one request per week, Yahoo not yet) and feed only the live Season trends charts, never saved report evidence.
- Source development uses the pinned Node 22 LTS runtime; native SQLite mismatch is a runtime setup failure, never grounds for database restoration. Current readiness belongs to `docs/release-status.md`; historical evidence belongs to dated reviews and the support matrix.

- Manual generation uses durable request IDs and queued/running/completed/failed/interrupted jobs. A completed job and draft commit together; unfinished work never replays automatically after stop, restart, or restore. Legacy report clients share the same queue; scheduled work shares the provider concurrency bound.
- Settings section writes require their current revision. SQLite increments revisions for changed sections and derived privacy controls; conflicts retain local edits, and restore invalidates open forms. Legacy full-settings PUT is retained for compatibility.
- Outbound attempts persist the complete rendered envelope and public routing identity. Email retries keep their saved key, and changed sender/account configuration blocks delivery. Resend-key hashes are change-detection metadata; raw credentials never enter SQLite, logs, exports, or browser state. Older uncertain attempts without envelopes cannot be retried safely through the app.
- Visible dashboards poll summary state without report bodies or imported source text. Report history is paginated; the review dialog loads the full saved content. Polls do not overwrite local Settings or draft edits.
- Keep focused core domain/contracts modules, persistence modules, and Settings hooks behind existing public imports. Dashboard theme values come from canonical tokens; preserve CSS cascade ordering when consolidating rules.

## Maintenance

Keep durable product and architecture facts here. Put current work and gaps in `docs/tasks.md`,
platform evidence in `docs/support-matrix.md`, and dated review or benchmark results in their
dedicated documents. Update `docs/decisions.md` when a durable architectural choice changes.

- MCP draft creation requires a caller-saved request UUID and returns a durable job immediately.
  Reconnects poll the same ID; deliberate retries of terminal failures use a new ID. Cancellation
  aborts bounded adapters and prevents late draft publication; completed reports are preserved.
- SQLite retains 200 recent terminal jobs plus active jobs in state, and compact indexed older
  receipts indefinitely to preserve request deduplication. Portable backups and salvage retain
  those receipts. Report summary filtering/cursors run in SQLite and omit bodies.
- Dashboard hash URLs persist page/league/report selection across reload and browser history.
  Settings/report unsaved edits remain guarded. Renderer recovery never exposes raw exception
  text in the page.
- Routine encrypted backups are opt-in, machine-local, and run only while the app/service runs.
  The exact recovery passphrase lives in the OS credential store; non-secret schedule/status and
  encrypted files live in `routine-backups/`. Rotation follows successful validation. Restore
  disables the schedule; portable exports omit its configuration, and data-folder moves copy it.
- Diagnostic exports contain safe operational metadata and UUID references only; free-form log
  strings, private domain text, credentials, and filesystem paths are excluded.

- Global search uses reviewed plain-language aliases and deterministic local ranking. Results
  navigate to explicit settings anchors/pages/leagues/reports and never execute mutations.
  Setting deep links preserve reload/history navigation; dirty forms use the existing discard guard.
- Search queries are temporary and local. Older report lookup searches bounded title/type metadata
  only; credentials, unsaved forms, report bodies, and imported conversation text are excluded.
  New settings should add their catalog destination, aliases, explicit anchor, and navigation check.

- Beginner navigation labels are presentation only; stable desk/memory hash destinations
  remain compatible. Search opens containing Advanced disclosures before focus/highlight.
- Guided AI setup must never put a new OpenAI key against an old custom endpoint. Read a
  fresh revision, block newly discovered custom connections, save trusted AI settings
  before writing the key, and test without league data. Saved keys are not read into UI.
- Existing connections get one fixed check per configuration/AI-key change per app
  session. Non-AI credential changes must not invalidate AI readiness.
- Individual schedule presets explicitly use draft review and remain unsaved form edits
  until section Save; bulk cadence suggestions keep their existing policy semantics.
- Report choice, review, and destination-specific send confirmation are separate steps.
  Preserve revision/destination validation, immutable attempted-delivery envelopes,
  and uncertain-send confirmations. Guided setup/report creation never sends a message.
- Help & FAQ has a shared searchable answer catalog and validated help bookmarks;
  action links go to actual pages/settings. Task search is local, bounded, negation-aware,
  and proposal-only until an explicit save/confirmation.
- Sample mode uses isolated transient state and fictional prewritten reports; it never
  writes real league/report state, invokes AI, schedules jobs, or sends through providers.
- Manual report copy/download/native share exports only saved title/body, requires edits
  to be saved/canceled first, and never changes provider delivery state.
- Inline Schedule edits use pinned schedules revisions; automatic previews check delivery
  revisions too. Those checks do not turn separate local writes into a global transaction.
- Setup progress in browser storage is versioned and limited to safe choices and validated
  league IDs. Arbitrary URL parameters, keys, and session credentials are excluded.

- Fantasy advice numerical evidence belongs to deterministic shared calculations,
  with provider-specific parsing behind typed integration interfaces. Never infer
  success probabilities from evidence-quality confidence or relabel historical hit
  rates/ROI as predictive edge. Historical baseline tests must train only on games
  before each held-out observation. See [advice.md](advice.md) for scope and status.
- Sleeper add/drop activity is an attributed platform proxy with separately truncated
  lists, not overall public sentiment; unlisted counts are unknown. Public schedule
  lines are reference data, not live sportsbook prices. Preserve GSIS/platform IDs
  as distinct namespaces and retain original source dates during outages.
- Advice reuses the saved AI connection for analysis and evidence review; model
  output references computed metrics and provided sources/players. Never save raw
  invalid answers or expose private chain-of-thought. Advice history is independent
  of reports and included in backups; opening saved advice never calls the model.
  Cancellation must reject late saves. Advice never executes roster changes or bets.

- Advice model selection and output budgets are request-local. Reuse the saved OS
  credential and endpoint, verify discovered choices, display the selected model
  before generation, and leave report settings intact. Discovery is metadata only;
  unavailable selections must not silently downgrade. Cost rates belong to their
  original saved model. Official reasoning uses Responses with storage disabled and
  retains completed final assistant text only, without paid fallback retries.
- Evidence policy is deterministic and enforced after model review. Missing complete
  comparisons withhold picks; stale/baseline estimates limit recommendation strength.
  Historical betting frequencies and AI intervals cannot establish predictive edge
  without calibration/evaluation. Preserve valid old history while tightening the
  new-generation numeric-support requirement.
- Opponent-position evidence totals all recorded players at that position; never
  present it as one player's projection or a strength-adjusted defensive rating.
  Role trends use current-team appearances and complete recorded denominators;
  missing/zero totals and duplicate games cannot fabricate workload shares.
- Advice context budgets preserve comparison players, primary estimate provenance
  and deterministic decision totals. Disclose optional detail omissions, retain
  caveats and source closure, and fail before paid generation if required evidence
  cannot fit. Serialized prompt limits remain enforced after budgeting.
- Advice media tone requires a directly cited selected current headline. Keep
  publication and retrieval dates separate, team context distinct from player
  mentions, and missing/stale coverage unknown. Recent feed content and matched
  Sleeper activity are limited proxies, not a representative sentiment survey.
  Join cross-platform activity only through an explicit verified Sleeper ID;
  never guess from GSIS, Yahoo or ESPN identifiers.
- Injury feed retrieval is not the report's update time. Require matched regular-
  season week/team/position and verified GSIS or unique name identity before joining.
  Only a recent explicitly dated, unambiguous report can override recorded status;
  missing/undated/conflicting reports cannot establish health. Owner-approved exception: an undated report for the requested regular-season week counts as `week-window` between the previous week's last verified kickoff and the team's own verified kickoff, labeled as lacking a source update time. Preserve practice
  context as descriptive evidence and limit uncertain weekly recommendations.
- Betting probabilities from the rolling statistical model are separate from AI
  probabilities and descriptive historical hit rates. Fit and calibrate every
  evaluation case using earlier weeks only. Preserve sample counts, baseline scores,
  weekly dependence caveats and hypothetical-return labels. Tentative choices require
  deterministic evaluation and price support; AI wording cannot bypass the gate.
  A current entered threshold used on historical games is not a historical price
  or a profit backtest. Keep real model/prospective betting quality unproven until evaluated.
- Anchor advice evidence time after news/injury refreshes finish; request-start time
  must not cause genuinely fresh provider retrievals to be labeled future/stale.
- Advice quality evaluation must grade the raw reviewed model answer as well as the
  policy-enforced saved answer. Fixed fictional cases verify decision process, not
  predictive NFL accuracy. Keep evaluations isolated from owner settings/history,
  transactions and credentials, and do not print provider output or prompts.
- CLI adapters honor bounded per-request deadlines; advice can use its longer pass
  deadline without silently retaining the ordinary CLI default. Cancellation and
  forced termination still apply. A complete replacement lineup can account for
  a recorded inactive bench player without inventing a weekly point estimate;
  missing active-player estimates remain insufficient evidence.
- Recognized Claude CLI executables use provider-specific child environment limits
  for reasoning/output and requested retries. Never mutate parent/owner configuration
  or authentication to apply an advice-only limit. Other tools retain their interface;
  managed CLI policy may override requested settings.
- Unsupported betting confidence remains Low even when the AI omits its optional
  probability forecast. Missing forecasts must not evade the evaluation/price gate.
- Lineup analysis may choose eligible bench alternatives, but must select an entire
  legal lineup and cite estimate tradeoffs for changed players. Never silently fill
  missing selected slots or display the optimizer's total as a different choice's
  total. Contextual departures remain tentative, with capped confidence and without
  the optimizer's margin. Review feedback uses only fixed trusted messages, never
  raw rejected answers, parser errors or provider diagnostics.
- Signed-in Claude is an explicit advice-only choice, never an automatic fallback
  or a rewrite of scheduled-report settings. Expose only sanitized login availability;
  recheck it before generation. The preset uses existing subscription authentication,
  Opus/high effort, no tools and isolated child configuration/working directories.
  Managed CLI policy remains applicable. Fixed connection probes share no league data
  and cannot run concurrently with an analysis. Authentication alone is not evidence
  that generation is available. Do not borrow saved API prices for subscription usage.
- Native subscription results need both a successful subtype and a false error flag.
  Extract only verified text and bounded token counts. Never return native session,
  account, error prose or billing metadata; reported limits use fixed messages and do
  not establish a particular quota or reset time.
- Remaining trade value needs an explicitly declared projection interval matching
  the analysis season/current week/final week. Keep full-season draft values separate,
  preserve legacy history and never subtract realized scoring to invent a forecast.
  Missing active-player estimates remain unknown, not zero. Forecast accuracy and
  source current-week timing are separate from interval validation.

- Advice may explicitly select the existing ChatGPT login through Signed-in Codex /
  GPT-6.1-Sol with high reasoning. The adapter supports verified CLI 0.162.0-alpha.2
  and, on macOS, 0.162.0-alpha.17.2, disables tools/config/project context/skills, bounds discovery and response,
  preserves native login without opening tokens, and uses the same connection for
  analysis/review with no fallback or saved settings changes. Codex does not support
  the analysis token cap: omit the control and reject explicit overrides. Do not
  infer model quality from login/fixed probes; use the production-path evaluator.

- Newer Codex model catalog capabilities can override feature disables and put
  tools in `input.additional_tools`; isolation proofs must inspect both that item
  and top-level tools. The macOS advice adapter pins tool-free catalog capabilities,
  disables orchestrator/agent context, and denies canonical global AGENTS file
  reads through the OS sandbox while preserving native login in place. Accept
  only exact expected pre-turn denial notices. Unverified CLI versions remain
  blocked; do not weaken this gate to recover model availability.

- Advice prompts include selected/comparison roster ownership and saved draft status,
  pick log and candidate snapshot eligibility. Without this context, the live model
  can reasonably withhold a draft comparison. Keep saved ownership separate from
  current/future availability and conditional planning separate from live drafting.
- Trade verdicts refer to accepting the proposed give/receive exchange. Recommend
  supports it, Lean tentatively supports it, and declining/waiting uses Hold. A
  "lean against" explanation must not become a Lean acceptance badge. Keep the raw
  reviewed answer in decision grading so repairs do not conceal this mismatch.
- A lineup request with two to twenty candidate IDs compares one shared starting
  spot, not an entire lineup. Check saved ownership and common slot eligibility;
  scope coverage to those players while withholding unknown selected active
  estimates. Require exactly one eligible choice and visible weekly estimate
  placeholders for every available alternative in both passes. Persist `startSit`
  separately from full-lineup assignments. Unrelated K/DST gaps must not invalidate
  a supported receiver comparison. A contextual lower-estimate choice stays Lean,
  records the estimate given up and caps confidence at 59. The owner must check
  other starters and avoid using the chosen player in another slot.
- Native Codex diagnostics use fixed allowlisted protocol categories only; never
  expose native messages, account/session metadata or reasoning. A passing retry
  does not establish the cause or repair of a prior intermittent rejection.

- Automatic fantasy season forecasts are conditional on recorded role and continued
  participation. The shared chronological model uses public stats plus scheduled
  future games, evaluates form/workload/opponent residual corrections against its
  baseline by complete earlier weeks, and retains the baseline without supported
  improvement. Matching scoring-confirmed imports take priority. Preserve numerical
  decomposition, source dates, residual ranges and test support under prompt budgets.
- Remaining trade value excludes completed/verified-started games and respects the
  selected last week. Unknown current-day kickoff timing withholds an estimate.
  Full-season totals add individually credited completed games; missing player rows
  do not imply zero. In-season totals do not measure draft-time knowledge. Forecast
  source years are one dataset, not independent prediction sources. Automatic season
  comparisons remain tentative and confidence is evidence quality, not probability.

- A scoreless game is not necessarily upcoming. Same-day weekly/betting choices need
  a verified future kickoff, including games crossing the UTC date boundary. Betting
  rechecks recorded kickoff after inference and inside persistence. Keep timing errors
  fixed and actionable, never expose arbitrary provider details. Draft-review value
  metrics describe current positional replacement; they are not draft-time grades.

- Advisor prompt metadata and player caveats may be shared through indexed tables,
  with explicit decoding instructions in both passes. Persisted results retain normal
  self-describing metrics and per-player warnings. Preserve automatic decomposition,
  bounds, evaluation metrics and decision totals when budgeting; never save only a
  point estimate. Evaluation sample counts apply to held-out tests, not availability.
- Draft review supplies the entire current roster as well as saved picks. Distinguish
  current conditional scoring comparisons from a draft-time grade; absent historical
  forecasts/ADP/available alternatives prevent the latter without erasing supported
  current evidence. Positional replacement is not actual marginal starting-roster gain.

- Keep the advisor’s bounded relevance pool separate from ordinary headline display;
  share the cached feed request and disclose failures/staleness. Missing publication
  dates must not become retrieval timestamps. Decode numeric entities before matching
  player names. Attributed headlines are limited coverage, not representative sentiment
  or verified injury designations, and do not become quantitative point adjustments.

- Kicker raw missed counts/buckets exclude blocked kicks in public stats. Sleeper
  miss penalties include blocks; require verified blocked distances for distance
  penalties whenever blocks are positive. Missing distances/counts stay unknown.
  Per-yard-over-thirty sums individual made-kick excesses, not aggregate distance
  minus thirty times all makes. Preserve unsupported-rule guards and import priority.
- Kicker season forecasts use their own earlier-week cohort and the same historical
  baseline/improvement, scope and schedule rules. Disclose unmodelled weather,
  fourth-down decisions, job changes and availability; K history is not DST scoring.

- DEF/DST history joins by verified normalized team identity and canonical completed
  schedule game, never a player's name, GSIS ID or vendor game ID. Retain explicit
  weekly and independent-total source IDs/dates through caching and saved evidence.
- Published Sleeper points allowed can differ from the final score. Opponent
  defensive touchdowns are excluded, but their conversions count. Keep defense,
  special-teams team and individual scoring distinct; support negative points.
- Sparse D/ST events stay unknown unless independent same-game totals or an
  exhaustive, noncontradictory partition prove zero. nflverse defensive TD totals
  exclude fumble-return TDs; aggregate fumble TDs can include offensive recoveries.
  Do not fill unresolved events or select older history in place of missing recent
  appearances. Keep automatic D/ST forecasts in their own chronological cohort.
- Public ESPN summaries may prove offensive fumble TDs only through matching final
  canonical game/event identities, scores and structured possession/unit records.
  Fumble-return labels alone can describe offense. Exhaust the independent same-game
  aggregate before inferring D/ST zeroes; fourth-down/special-team/ambiguous cases
  stay unknown. Retain the summary's actual source date alongside weekly/team totals,
  use fixed numeric-event URLs and bounded cached reads, and never follow remote refs.

- Merge catalog/owned DEF/DST aliases by verified NFL team, preserving the owned
  fantasy-platform ID and separate Sleeper ID. An empty catalog must not turn an
  owned defense into an apparent waiver candidate; synthetic team IDs are not GSIS.

- NFL draft facts come from a bounded fixed public nflverse CSV, with no extra key.
  Retain draft identity/year/round/pick/team/college only, excluding retrospective
  career totals. Missing IDs remain absent; explicit conflicts and ambiguous
  name/position matches withhold facts. Drafting teams are historical, not current
  membership. Current-class facts are withheld before a conservative May 1 cutoff.
- Earlier rookie scoring cohorts describe selected recorded appearances at the
  same position/round band under the league rules. Equal-player averages/quartiles
  require at least eight eligible players across two earlier classes. Missing or
  short histories are excluded, never zeroed. These selected outcomes do not supply
  a player's projection, role forecast, prediction interval or success probability.
- Explicit draft/waiver candidates without estimates must remain in the evidence
  and saved result. Missing comparison coverage lowers confidence and prevents a
  supported selection; it must not silently remove the candidate. Scoring-confirmed
  imports retain priority over automatic NFL-history estimates and draft context.
- Public ESPN individual forecasts are separate typed expected-stat rows, never
  observed history. Reconcile exact weekly source/identity and full publisher scoring
  before filling sparse mapped expectations with zero. Derived unused scoring values
  may be negative; modeled event counts cannot. Use exact verified future weeks,
  never prorate ambiguous season aggregates or subtract historical scores from them.
  Full-season recorded points require unique complete credited rows; remaining points
  exclude started games and respect the final week. Matching imports retain priority.
  Public forecasts can cover pre-NFL rookies but stay tentative; retrieval dates are
  not publisher update dates and historical rookie cohorts remain separate context.

- Current sportsbook quotes must remain separate from archived schedule odds.
  Accept only verified public pregame event/team/time identities and complete
  paired current prices; never infer default prices or follow source refs. Retain
  actual observation time and exact analyzed terms; manual edits remove provenance.
- Capture prediction performance only when newly saved before kickoff; never
  backdate historical advice. Keep its bounded independent ledger in backups and
  outside ordinary dashboard/report snapshots. Grade earliest forecasts under their
  frozen league scoring/horizon; missing or stale player outcomes remain unknown.
  Paper selections require verified fetched prices and at most one side per
  game/market. Archived-price simulations lack verified publication times/book
  identity and cannot establish future profitability or current AI accuracy.

- Game-market v2/v3 use paired sportsbook odds as a disclosed input, with earlier-week
  opponent-adjusted ratings, neutral-aware venue effects and regularized corrections.
  Grade it against matched historical book probabilities and each game's own line;
  generic frequency improvement cannot establish sportsbook support. Keep methods
  and baselines explicit in schemas, prompts, UI and the forward ledger. Missing
  prices retain legacy calculations without unsupported game-market picks.
- Choose parameter procedures using older development data before later comparisons;
  preserve negative/mixed book comparisons, paired coverage and clustered uncertainty.
  Recorded historical outcomes/previously viewed tests cannot become untouched
  holdouts. Do not tune for paper returns or backdate future validation evidence.

- Game-market v3 context and moneyline blending use earlier completed regular-season
  weeks. Current quote lines override archive fields; no target result, same-week
  outcome, postgame starter or observed weather can supply a pregame feature.
  Nested live history must cover blend validation, correction, residual and rating
  warmup. Preserve old saved methods and negative season/market evidence.

## Pregame model evidence invariants

`health-weather-total-v4` applies only to supported totals. Moneyline/spread retain
`market-context-v3`; older stored methods are never rewritten. Context fits use
earlier NFL weeks and require enough eligible paired-price examples.

Injury features require publisher dates; retrieval cannot fill missing historical
publication times. Current ESPN dated labels are a team-level fallback, with IR
excluded and vendor equivalence unverified. Prior QB comes from an earlier game;
only captured dated rank-one charts can suggest a change, never confirmed game-day
participation. Weather is a fixed-venue regional 48-hour forecast, with an explicit
12-hour availability allowance, not observed stadium weather. Covered/retractable
venues and unknown locations stay missing. Source coverage and uncertainties must
remain visible; no model changes alone establish profitable betting.

## Personnel data and model deployment gates

Official NFL article contents require the latest modification before the
prediction cutoff, not merely an early publication date. Preserve the actual
article link and partial coverage. Prior passing/snap facts require completed
earlier weeks, identity checks, explicit units and a 24-hour availability
allowance; that allowance is not exact verified historic publication metadata.
GSIS IDs take priority; name joins must be unique. Missing roles stay unknown.

New official-report, snap-role and quarterback-efficiency numerical corrections
are rejected research candidates, not production v5. Current descriptive context
is visible; production masks the new official injury source class and retains
v3/v4 and unchanged qualification gates. Full personnel history is opt-in
research work; current context loads two relevant seasons. Future numerical
records retain their original issuance, prices and probabilities and must not
be rewritten from later evidence.

Richer personnel evidence can retain earlier passing/rushing EPA and practice
roles, but incomplete practice participation is unknown, rest/personal/non-injury
absences are excluded from injury practice burden, and a chart cannot supply
new QB EPA for the previous QB ruled Out. EPA includes source spike/kneel behavior
and retrospective model/stat revisions; it is not isolated player value. Historical
adjusted ESPN QBR without contemporaneous snapshots cannot establish a pregame
opponent adjustment. Research corrections and adaptive book weights require
strictly earlier NFL weeks. Reused audits do not authorize a production change
merely because aggregate error is slightly lower; retain method/action gates until
the stated evidence requirements are satisfied.

Research models may correct paired sportsbook logits with nonlinear trees, but
all thresholds and fits require earlier NFL weeks. Blending/abstention rules must
use prior out-of-week predictions, and exact sportsbook fallback is a tie rather
than an advantage. Analyze paired Brier correction variance/alignment to distinguish
weak signals, inherited bias and excessive correction strength. Post-hoc subgroup
findings and aggregate older-data selection gains cannot establish a deployment
edge. Preserve issued numeric predictions and attach independently fetched final
outcomes in a sidecar; markets from one game remain one correlated game cluster.

Hybrid model experiments should preserve unaffected market probabilities exactly.
Seasonal calibration must use earlier out-of-week probabilities and completed
outcomes, with explicit prior-season carry rather than hidden season assumptions.
Book blending must evaluate those calibrations at their original earlier cutoffs,
not use in-sample refits. A synthetic regime-change test establishes adaptation
behavior, not real accuracy. If enabled adaptation loses older selection, keep it
as a separately frozen research comparison rather than choosing it from later
audit performance.

When average calibration is already close but game-level corrections move the
wrong way, an intercept shift cannot repair ranking. Expert mixtures can reduce
correction strength and adapt to reliability changes, but compare learned weights
with the same fixed prior to distinguish adaptive benefit from simple shrinkage.
A current-sample improvement cannot override earlier frozen selection, and slightly
lower all-market error cannot establish that the changed totals market beats book.
Keep other-market probabilities and issued prediction/outcome records unchanged.

Team-stat totals experiments must normalize historical franchise names only in
their research joins, validate reciprocal team/game identities and preserve
missing measures. Per-play efficiency, game play volume and neutral-script tempo
are different quantities. Fit each training game's matchup inputs at its original
cutoff; the target/same-week/future stats cannot contribute. A publication lag
does not certify historical data revision or EPA-model vintage. Compare added
features with an otherwise identical feature-free learner and the unchanged
mixture; improving one control or mean calibration does not establish a useful
incremental sportsbook edge.

Prediction-market totals signals require exact line/game/settlement joins and
pre-cutoff contract creation. A historical price endpoint may include a settled
payout clamped to the requested end; reject ambiguous terminal points and only
use fully completed pre-cutoff windows. Market-wide trade APIs may ignore time
filters, so locally filter executions and require a completed bounded walk for
flow. Normalize outcome/taker direction rather than interpreting all purchases
as votes for Over. Whale size is not skill: evaluate relevant earlier game
directions against the paired book, shrink small histories, and do not use current
leaderboards/holders retrospectively. Current headline text also needs a recorded
capture timestamp before its forecast cutoff. Preserve normalized public inputs
for reproducibility and seal new predictions before independent outcome scoring.

Older prediction-market sources can change endpoint, price-unit and title schemas.
Verify exact settlement semantics and outcome orientation when extending history;
never relax an exact line to gain coverage. A retained archived contract is not
proof of retained execution history. Complete bounded trade walks and separately
validated earlier windows are needed before historical wallet features can be
used. Cold-start or missing-data returns of the sportsbook probability are ties,
not edge. Preserve initial evidence when source-coverage QA revises inputs, and
keep selected model settings fixed after an audit has been inspected.

Seasonal feedback must evaluate earlier forecasts fitted before their own labels,
not in-sample fitted probabilities. A change to rolling history or seasonal carry
needs an explicit reset/decay policy and exact current-week exclusion. Report
both active forecast accuracy and exact-book fallback counts: an adapter can
reduce historical losses by abstaining without learning a better conditional
predictor. Diagnosis-informed reused seasons remain reused evidence even if the
new settings are frozen before replay.

Separate data-availability guards from predictive coverage indicators. Removing
a predictor must not relax time, identity, line or completed-history gates. Validate
the complete source vector before masking malformed removed values. Refit both
model coefficients and earlier-forecast feedback after a feature ablation;
holding old weights fixed is only diagnostic. Report the size of departures
from the book as well as counts: tiny nonzero probability changes can effectively
copy the baseline without adding predictive information.

Kalshi's canonical taker outcome-side and book-side are two vocabularies for the
same exposure: yes/bid versus no/ask. They must agree; combining them as outcome
plus BUY/SELL fabricates direction. Polymarket token/outcome plus BUY/SELL are
separate fields with different semantics. Use the versioned canonical parser for
new Kalshi research and reject unmarked legacy tapes. Old v11–v14 signed Kalshi
inputs contain this known defect; preserve issued records and disclose it rather
than retroactively rewriting predictions. A source fix needs raw identity/hash
joins and a separate corrected-only model control before claiming feature gains.

Flow magnitude is not trader skill. Aggregate before clipping or classifying
large activity so split fills cannot gain influence; use distinct temporal
coverage and an earlier same-contract baseline. Anonymous time buckets do not
identify independent traders. Report practical probability departures as well
as nominal wins, particularly when feedback makes a new model nearly copy book.

A small final correction can reflect feature scale, ridge shrinkage and feedback
regularization as well as poor incremental information. Diagnose raw and final
corrections separately; removing a gate is a new predictor requiring validation.
Scoring-margin targets preserve outcome severity but need scale calibration and
variance control. Compare a football-only model to football-plus-flow with both
fits and earlier-origin feedback recomputed. A feature can help raw forecasts
while worsening final forecasts through changed feedback.

Drive repairs can merge original possessions, so scoring-drive identity and
clock metadata identity need separate deduplication. Possession clock per play
is clock consumption, not wall-clock snap tempo; touchdown/field-goal drive
points are a scoring proxy. Preserve selected raw fields and transformation
hashes for reproducibility. Prior-week lags do not certify historical availability
of revised data, and retrospective development winners remain reused evidence.

Feedback calibration needs its own memory horizon; sharing a long model-training
window can allocate trust poorly as a season changes. Raw predictor losses and
feedback-allocation losses must be decomposed separately. Older data can dampen
trust as well as slow it, so its effective mass alone is not causal evidence of
harm. Limit prior-season seed influence and let it expire explicitly. A shorter
window and a correction cap address different risks and require separate controls.

When returning book, continue observing raw forecasts fitted at their own origins
for future feedback. Otherwise abstention can create selective feedback and block
recovery. A mixture between book and an Over-biased source cannot manufacture an
Under prediction; improved feedback is not a repair of every source-model error.
Format new research records before hashing/sealing and preserve existing byte
formats. Aggregate historical point gains remain reused evidence, especially when
full seasons lose and only a few current-season week clusters are available.

Short recent feedback can activate after one lucky week without stable evidence.
Inspect weekly alignment contributions and omission diagnostics, and distinguish
negative alignment from variance cost. Separate directional heads can prevent
evidence transfer when correction regimes differ, but sparse heads can suppress
useful forecasts. A weekly uncertainty penalty is a reliability heuristic, not
a certified probability of predictive skill.

Stricter abstention can lower weak-season loss while worsening other seasons.
Report suppressed gains, active/fallback counts and full matched samples; book
ties are not wins. New feedback selection on earlier years does not make an
inherited predictor historically untouched when its settings were selected in
later rounds. Preserve failed candidates and their frozen evidence rather than
constructing a post-hoc per-season winner.

Dashboard appearance defaults to white independently of the OS theme. Dark mode
uses a pure black canvas and neutral charcoal surfaces, without blue-tinted
backgrounds; startup chrome and Electron window backgrounds match the canvas. The header
Dark mode switch and Settings → Appearance apply a device-local choice immediately.
Only `dark` is accepted from `sidekick.theme.v1`; missing, malformed, or unavailable
storage falls back to light. The local `theme-init.js` restores appearance before
rendering without inline scripts or a relaxed CSP. Semantic CSS tokens and native
`color-scheme` must cover new UI surfaces and controls. Appearance is not an API
setting and does not require saving provider configuration. Electron uses a
separate private `appearance.json` in app data because browser storage cannot
survive a change in its localhost port. Keep the theme IPC restricted to the
trusted dashboard and `light`/`dark`; synchronous reads return cached state only.
Serialize atomic writes and await them before graceful quit.

Draft replacement must jointly allocate league-wide starting slots so overlapping
FLEX eligibility cannot depend on slot order. Missing positional supply stays
unknown. Waiver screens without a drop are tentative; explicit drops remove an
owned player before complete lineup optimization. Show before/drop/after/gain
evidence in both passes, and do not endorse a non-positive weekly starting gain.
Platform transaction permissions are separate from numerical roster consequences.
Explicit GSIS identifiers cannot fall back to another player's name in individual
scoring or workload context. Report selected-method error separately from
rejected-candidate error. Frequency-only prop tests do not meet the historical
sportsbook gate, even when they beat an unconditional hit-rate baseline.

- iMessage has an explicit local macOS `imsg` alternative; legacy settings default
  to BlueBubbles. Stable GUIDs route sends, and history verifies the selected local
  row ID/GUID/service before importing bounded text. Version checks do not read
  chats; metadata discovery is owner-triggered and omits account diagnostics.
  Native sources/cursors/authors are namespaced and message-time retention applies.
  Recheck provider/path/ID/target and memory/AI/reply consent across awaits. Switching
  providers disables polling/automatic sends. Preserve resolved executable identity,
  body and destination in delivery envelopes; ambiguous sends remain uncertain with
  no automatic retry. Do not copy native credentials, change TCC/SIP or enable private
  injected Messages features. Parent app/service macOS permissions are owner-managed.

## Weekly decisions and prospective measurement

Home puts selected-team weekly decisions ahead of reports. Team choices are ordinary
device preferences, bounded to connected IDs; native preferences survive API port
changes. They never establish platform ownership or authorize a transaction.

Advice readiness is a separate bounded, read-only operation without AI generation
or record writes. Injury publication and retrieval times stay distinct; absent
reports never imply health. New saved results preserve their original readiness.

The outcome journal freezes complete hypothetical chosen/baseline sets before
kickoff. Missing appearances are unknown. Projection summaries separate scoring,
league, position, season and horizon. Versioned prospective game comparisons need
a fresh verified quote and matching no-vig baseline, are separated by installed
code cohort/season/market, and never promote a model automatically. Do not
retroactively version old forecasts or turn fictional tests into NFL-performance
claims. Sentiment and whale corrections remain research-only.

`SIDEKICK_VERIFICATION_ROOT` is explicit test isolation for desktop preferences,
instance/browser profile, data and process-memory credentials. Test data
must remain inside that root; normal settings and credentials retain their
existing identities. No HOME override or owner connection is needed for packaged
verification.
The desktop must propagate that root into its API utility-process environment;
isolating only the Electron parent does not select the child's temporary credential backend.
Verification legacy JSON migration also points inside the private data directory.
Verification must never load the native credential binding. Its bounded credential
manager uses an empty in-memory backend, supports API round trips, and discards
values at restart. Normal launches still use `SundaySidekick` in the OS vault,
with no silent memory fallback on errors. The test browser uses a nonpersistent
session and macOS `use-mock-keychain` before readiness so Chromium cookie encryption
also avoids the real Keychain. These changes require a validated private root;
they are never a saved owner setting, query parameter or remote switch.
The trusted preload reports verification mode read-only. Test Stop skips its
confirmation and test forms omit before-unload close warnings; internal unsaved
navigation, send confirmations and ordinary app safeguards remain. Test startup
or unexpected API failure exits nonzero with private diagnostics instead of
waiting for a modal. Do not use the real OS credential smoke in routine automated
desktop testing; it remains a separate explicit native-vault check.
Saved advice loads in descending parsed creation time, independent of SQLite
insertion row IDs. Recent weekly choices and history retention must keep the
newest decisions after restart or backup restore without replaying the provider.

### Real-data advice evidence invariants

- A bench bye can satisfy weekly exclusion only when the complete, unambiguous NFL team season schedule proves no game in that week. Never treat an absent partial-schedule row or an unknown active estimate as zero.
- Recorded PUP/NFI flags exclude active choices alongside other inactive/reserve statuses; questionable remains uncertain. Unmatched or undated reports cannot clear catalog flags.
- Optional publisher name suffixes can match only unique identities with consistent position/team; conflicting explicit IDs or different explicit suffixes remain blocked. General GSIS historical matching stays strict.
- Model context includes saved starters for the selected week/team, with platform slot assignment/transaction eligibility still unverified. Compliant Hold decisions may retain specific validated headlines.
- Real-data quality tests use public captures and explicitly synthetic small PPR rosters, independently checking point/roster/price arithmetic. They do not establish future outcome accuracy, draft-time grading or betting profit.

### October 15, 2026 — saved Codex connection

App-wide `codex-cli` uses the existing isolated GPT-6.1-Sol/high subscription adapter. Reuse native sign-in, never extract/copy tokens or fall back to API credentials. Model/arguments are pinned and validated; backup restores require review. Per-pass API budgets/prices do not apply. Prediction-market/whale research remains outside production probability dispatch; this setting changes text inference only.

Market Signals has a separate read-only provider/capture API and private research
ledger, outside advice/report/state snapshots and betting prediction dispatch.
Freeze only server-captured exact pregame total matches, with fresh paired book
prices and complete pagination; preserve the first game/provider record. The
fixed external-price-v1 policy compares Over contract price with no-vig sportsbook
probability, while flow and headlines remain descriptive covariates. Never infer
skill/identity from anonymous large trades or sentiment from headline volume.
Research JSON export is separate from ordinary app backups. Player-prop game logs
may recover missing catalog GSIS IDs only through a unique name/position identity
and matching current-season team; preserve explicit conflicting IDs and missing stats.

- Authorized browser-saved ESPN snapshots are a manual data source, distinct from
  provider credentials. Store normalized league/football evidence only, preserve
  imported provenance, never set provider freshness from import time, and prevent
  silent scheduled refresh. Publisher weekly forecasts require exact identity,
  period and two independent scoring arithmetic checks; they do not make numeric
  ESPN scoring rules supported by the historical estimator. Reopen storage in
  regression tests before claiming imports persist.
- Native imsg `any;` GUIDs require an exact unique current iMessage-service match
  before send. Receipt acceptance plus outgoing-history matching does not prove
  device delivery when the CLI omits delivery status.

- A saved native AI runtime's startup readiness probe must not depend on unrelated
  API credential-list loading. Cancellation releases its checked signature so a
  valid retry can run; aborted results cannot mark a runtime ready.
- League matchup bars share the complete week's numeric domain, including negative
  scores, so proportions remain comparable across games and stable on expansion.

- Saved-data report schedules require explicit league IDs, dashboard drafts and a
  recent import/sync under the existing stale threshold. They are opt-in, never a
  refresh-error fallback. Skip provider credentials, retain provenance, never set a
  new sync timestamp and never auto-deliver. Restores pause them. Calendar events
  keep their provider-refresh contract. Home and Schedule share the API data policy.
