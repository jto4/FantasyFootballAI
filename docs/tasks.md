# Project tasks

Use [release status](release-status.md) for readiness and release gates,
[the support matrix](support-matrix.md) for provider/OS verification, and
[the product plan](implementation-plan.md) for scope. Completed tasks describe checked source
behavior, not public release readiness. Prior detailed implementation evidence is retained in
[the archived task record](reviews/2026-09-28-task-history.md).

## Real football report and automatic-generation review — October 14, 2026

- [x] Capture the sanitized public 2018 Sleeper documentation league, 180 real draft picks and six archived matchups; combine a separate current 2026 Week 6 test with real ESPN expected statistics and explicitly constructed PPR rosters.
- [x] Generate all five default report types with the isolated native model and real clock-driven one-time/weekly scheduler ticks. Review 14 responses; retain eight final cases, with no outbound delivery or owner data changes.
- [x] Preserve renamed league labels and sync timestamps through scheduled/calendar refresh; recheck schedule scope after awaited sync before AI work. Test duplicate occurrences, completed-season pauses and scope revocation.
- [x] Withhold active-lineup totals for Out/reserve starters, include separate injury labels, keep uncertain statuses conditional, and suppress modern headlines/undated projections/catalog status in archived reports.
- [x] Preserve two-decimal platform scores, show the captured season, respect commissioner score overrides including zero, avoid raw Markdown tables and false draft-day titles, and compact empty graph states.
- [x] Pass 104 independent source/arithmetic/content checks, 1,032 source checks (two platform skips), 132 distinct desktop/mobile cases and eight packaged real-report reviews. [Review and receipts](reviews/2026-10-14-real-report-quality.md).
- [x] Verify the final spacing installer, eight real-report native replays, quiet launch/restart/unsaved Stop, source/payload agreement, archives and scoped manual code/security review; preserve earlier artifacts.

## Default reports and visual league data — October 14, 2026

- [x] Add a compact five-template report library, separate League charts view, individual automation setup, and a reviewable weekly draft plan for the active league.
- [x] Use schedule revision checks; preserve unrelated actions/settings; retain draft-only delivery, season pauses and existing duplicate-run behavior.
- [x] Capture bounded numeric platform evidence before report generation, retain it through edits/refresh/restart, and validate saved chart data at HTTP and backup import boundaries. Preserve legacy report compatibility.
- [x] Add accessible season points/wins and matchup score graphs, independent top-six/three-matchup expansion, missing-data states, source timestamps and underlying data tables. Keep saved charts and seasonal templates expandable.
- [x] Verify 64 desktop/mobile browser cases, narrow 320px black mode, scheduler-driven once-per-occurrence draft generation, snapshot restart/import and zero provider delivery. Update older regression paths to open the existing collapsed Home/storage sections.
- [x] Pass 1,024 source checks (two platform skips), 130 browser cases, packaged report/quiet native verification, archive/source/private-data inspection and scoped manual code/security review. [Review and exact installer receipts](reviews/2026-10-14-report-library.md).

## Quiet automated desktop verification — October 14, 2026

- [x] Use a validated private test root and volatile credentials without loading the native vault binding; preserve normal OS storage and fail closed on invalid isolation.
- [x] Give test windows a nonpersistent session and macOS mock Keychain for Chromium cookie storage; preserve the ordinary browser profile and sandbox.
- [x] Skip Stop and unsaved close warnings only in disposable profiles; retain ordinary confirmations and test navigation/send guards. Test errors exit nonzero with diagnostics instead of waiting for modals.
- [x] Add native/browser checks for credential round trip/reset, test versus normal confirmation policy, and unsaved fixture teardown. The native verifier no longer imports or probes the real Keychain.
- [x] Pass 1,020 source checks, 38 browser cases, six native saved-advice workflows, and isolated launch/restart/unsaved Stop with the native vault binding unavailable. Corrupt private storage exits nonzero without a modal; rebuilt archives and source manifest pass. [Review and receipts](reviews/2026-10-14-quiet-verification.md).

## Shorter primary workflows — October 14, 2026

- [x] Review rendered Home, Advice form/result and Settings before implementation; inspect revised desktop and narrow-screen captures.
- [x] Prioritize weekly football actions on Home, remove duplicate entry points and expand report activity automatically for pending work.
- [x] Separate Advice decision/history/tracking views, keep draft inputs, use compact task choices and bound the first saved-history view to five results.
- [x] Keep headline, expected change, uncertainty, availability and starting lineup visible; make supporting calculations, extra reasons, risks and sources expandable without changing model math.
- [x] Focus Settings by section; move Appearance to Storage & desktop and keep deep search, independent Save and review-before-send safeguards.
- [x] Verify the new same-result history navigation, draft retention, replay, pending work and evidence disclosures on desktop and mobile. [Review and evidence](reviews/2026-10-14-compact-workflows.md).
- [x] Pass 160 browser cases, full source tests/typecheck/lint/build/formatting and scoped manual code/security review. Rebuild the macOS ARM installer and verify six saved advice workflows, native restart, mounted-DMG launch, archives and unchanged numerical runtime.
- [ ] Maintainer: perform a fresh owner usability session on the rebuilt preview; participant task completion/time is not established by browser regression checks.

## Latest installer rebuild and packaged advice — October 13, 2026

- [x] Rebuild the current macOS ARM DMG/ZIP, preserve the previous artifacts locally, compare all 184 compiled application files and verify both archives. [Exact artifact review](reviews/2026-10-13-latest-installer.md).
- [x] Fix API utility-process verification-root propagation and confine legacy migration; prove the packaged child reads an independently populated disposable OS credential namespace without changing ordinary profiles.
- [x] Complete fresh packaged public-NFL/synthetic-PPR analyses across all six workflows, including one-spot and reserve variants and all three sportsbook markets. Eleven successful analyses pass 100 independent arithmetic checks; original navigation and history failures are retained with the verified retries and fixes.
- [x] Fix newest-first advice chronology after restart and backup restore. Verify production API weekly recents/history/replay without additional model calls; preserve all eleven results in the final package's native restart check.
- [x] Verify all ten original result views again in the final artifact, plus fresh analysis, read/replay, white default, black dark-mode persistence, diagnostics/backup views, mounted-DMG launch, MCP and headless lifecycle. Zero renderer errors; public-data tests do not establish forecasting superiority.
- [x] Pass 907 workspace tests plus root suites, typecheck, lint, build, formatting and ordinary scoped code/security review. All 51 sealed numerical source files remain unchanged; no automated security scan ran.
- [ ] Maintainer: complete Developer ID/notarization, published upgrade, other-OS/Intel interactive checks and live owner messaging/TCC before expanding release claims. No owner app replacement or public release was performed.

## Commissioner workflow improvements

- [x] Always draft from dashboard generation; distinguish drafts, sends, failures, and unknown outcomes.
- [x] Split Settings into independent sections; scope AI test/discovery writes and warn on unsaved edits.
- [x] Surface review queues, upcoming scheduled/calendar work, snapshot freshness, and delivery issues.
- [x] Add Reports filters, generation evidence, durable revision-checked editing, send preview, and attempt history.
- [x] Guide first use through league connection, runtime test, generation, and draft review; parse supported league URLs.
- [x] Extract report/delivery/chat/settings services and add desktop/mobile browser interaction coverage in CI.
- [x] Pin the verified Node 22 runtime, detect native SQLite mismatch safely, and consolidate current release claims.

Validation and manual review: [2026-10-02 workflow review](reviews/2026-10-02-commissioner-workflows.md).

## Workflow reliability and repository cleanup

- [x] Freeze rendered delivery envelopes before sending; keep email retry keys and detect changed sender/account configuration without storing credentials.
- [x] Require section revisions for Settings PATCH requests; preserve unsaved edits on conflicts and explicitly reload only the affected section.
- [x] Persist idempotent generation jobs with bounded concurrency, atomic report completion, and interrupted-job recovery.
- [x] Exercise production workflow, league, and provider routers against temporary SQLite databases in desktop/mobile browser journeys; retain fast mocked journeys.
- [x] Share nested workflow request/response validation and stable API error codes between the API and dashboard.
- [x] Poll visible dashboards using body-free summaries; page report history and fetch saved bodies on review.
- [x] Split core domains, persistence, and Settings hooks; consolidate theme tokens and remove superseded CSS declarations while preserving rule order.

Validation and manual review: [2026-10-02 reliability review](reviews/2026-10-02-workflow-reliability.md).

## Remaining validation and release work

- [x] Run updated hosted OS/source/package/browser CI and the minimum-runtime lane; see [2026-10-04 integration evidence](reviews/2026-10-04-main-integration.md).
- [ ] Verify credentialed signing/notarization, owner-device lifecycle, and a signed published-release upgrade.
- [ ] Complete owner-authorized live provider/model/delivery checks and broader fantasy-format semantics.
- [ ] Repeat performance checks on slower hardware and with live providers.
- [ ] Complete the publication review and publish reviewed artifacts after owner approval.

Specific required evidence and current limitations are maintained in
[release gates](release-status.md#gates-before-publication). Continue quarterly manual code,
security, and refactoring reviews; do not run automated security scans.

## Local operations improvements

The owner requested items 2–8 from the follow-up review; item 1 (GitHub protections and CI
trigger changes) is excluded. GitHub/workflow configuration remains unchanged.

- [x] Queue MCP draft generation with caller-saved request IDs; add status, cancellation, and paginated history tools.
- [x] Add per-request cancellation with bounded adapter termination and atomic late-result rejection; recover pending requests beyond recent summaries.
- [x] Index SQLite report history, skip unrelated row writes, and archive terminal jobs while retaining deduplication receipts through restart, backup, and salvage.
- [x] Add bookmarkable page/league/report URLs, Back/Forward protection for unsaved edits, a renderer recovery boundary, and shared timed/validated import and backup requests.
- [x] Add sanitized downloadable diagnostics, independently generated UUID references, queue age, and actionable failure categories.
- [x] Add optional encrypted routine backups with OS-stored passphrase, rotation after validation, status/size warnings, and nondestructive restore validation.
- [x] Add a reusable packaged GUI verification command and a sanitized captured public Sleeper fixture; refresh the public catalog live check.
- [ ] Complete current-source Windows/Intel native verification, signing/notarization, published signed-upgrade testing, and owner-selected private provider/model/delivery checks. Local macOS packaging was attempted but native compilation is blocked by missing Xcode/CLT version detection.

Behavior: [local operations](operations.md). Validation and remaining release limits:
[2026-10-05 operations review](reviews/2026-10-05-local-operations.md).

## Intuitive workspace search

- [x] Add visible global search with plain-language descriptions, everyday aliases, partial words,
      small typo tolerance, examples, keyboard support, and useful empty/error states.
- [x] Route settings results to the exact section/control with focus/highlight and bookmarkable URLs;
      retain unsaved-edit protection and discard accepted pending Settings edits consistently.
- [x] Include pages, connected leagues, recent report metadata, and local lookup of older saved titles;
      exclude secrets, report bodies, imported messages, and unsaved forms from the index.
- [x] Add matching/URL/SQL-boundary tests and desktop/mobile journeys for every browser setting,
      keyboard behavior, reload, unsaved navigation, and reports outside recent summaries.

Behavior and limits: [workspace search](search.md). Native-device/browser coverage beyond the
local Chromium fixtures remains part of the existing release gates.

## Beginner-friendly experience

- [x] Reduce primary navigation to Home, Reports, Schedule, and Settings; keep Leagues, League members, and Imports in More tools and searchable. Preserve existing bookmarks.
- [x] Add guided AI connection with secure key entry, starting options, billing guidance, automatic connection testing, and explicit success/failure states; preserve existing custom connections.
- [x] Detect supported league links locally, carry ESPN seasons, and explain link discovery and private-platform access beside the connection form. Keep pasted input while access settings are configured.
- [x] Make Home emphasize the next setup, report-creation, or review action.
- [x] Add report type selection and visible create/review/send progress, selected-league context, a full saved-message preview, and separate recipient-specific send confirmation.
- [x] Add friendly voice presets with illustrative previews and individual review-only schedule presets with plain-language summaries.
- [x] Make common connection fields editable without writing JSON; keep raw configuration in Advanced. Explain failures and disabled sends, and keep technical error details expandable.
- [x] Keep Save/status feedback visible on long settings pages, preserve unsaved edits and section revision checks, and confirm destructive actions and automatic delivery.
- [ ] Validate these flows with representative nontechnical users and live provider accounts; local browser fixtures do not establish production provider onboarding or native accessibility.

## Tasks, sample mode, and searchable help

- [x] Add isolated fictional sample league/report exploration with editable examples and
      copy/download, without provider calls, service mutations, or real delivery.
- [x] Add saved-report copy/download and supported native share, with unsaved-edit guards,
      denied-clipboard fallback, and unchanged provider delivery state.
- [x] Add negation-aware local task search for scoped delivery previews, report schedules,
      and failed-send help. Require review, confirmation, recipients, and revision checks.
- [x] Edit schedules on Schedule and display timezone-correct planned occurrences,
      destinations, and running-service/season/data caveats.
- [x] Persist safe setup progress and validated league IDs across restarts, excluding
      arbitrary URL parameters, credentials, and incomplete pasted input.
- [x] Replace report dropdown choices with cards and clearly fictional examples.
- [x] Add Home readiness/data/next-report/automation summary with direct recovery links.
- [x] Create in-app Help & FAQ, searchable answers, validated answer bookmarks, and
      links to actual settings/pages; make Help reachable on desktop and phones.
- [x] Prepare the nontechnical commissioner usability study and managed-AI service
      authentication/threat-model design.
- [ ] Run the study with willing nontechnical participants and record anonymous findings;
      participant details are pending. Automated browser journeys are not a user study.
- [ ] Resolve hosted service/operator/account, auth, budget, and data policy, implement
      the optional managed AI connection, and review a concrete staging build before
      production enrollment/deployment. No hosted connection exists yet.

## Follow-up browser edge cases (October 7, 2026)

- [x] Reproduce and fix compound-channel task narrowing, unsupported cadence becoming
      weekly, compact AM/PM times being dropped, stale sharing feedback after edits,
      and lost dialog keyboard focus when a step removes the focused control.
- [x] Add parser regressions and five desktop/mobile journeys; verify Help during a
      simulated service outage and dialog keyboard access at 320×568. The expanded
      suite passes 74 browser journeys and 73 dashboard tests with dummy data.
- [x] Add full-width labeled delivery controls on phones, friendly timezone
      names with exact identifiers, and direct Schedule guidance for unsupported
      timing searches. Keep configured custom timezone choices available after
      trying another zone. Human usability validation remains open.
- [x] Verify the final UI with 78 desktop/mobile Chromium journeys, including
      readable controls at 320 and 390 pixels, explicit monthly saves, and custom
      timezone round trips. Dashboard's 73 tests, build, typecheck, lint, and
      formatting checks pass; other-browser/native/human gates remain open.

## Dialog and report-refresh QA (October 7, 2026)

- [x] Reproduce four desktop/mobile failures: stacked shortcut dialogs, narrow
      report-title/league-name overflow, late background report replacement, and
      scroll chaining into the page behind a review. Add eight browser regressions.
- [x] Scope report fetch results to their selection/edit session; cancel background
      refreshes on selection/edit changes. Suspend search shortcuts during other
      dialogs, wrap long review content, and restore scrolling after the last dialog
      closes. Reuse shared Dialog for guided setup.
- [x] Verify 86 Chromium browser journeys and 73 dashboard tests; production build,
      typecheck, lint, formatting, and whitespace checks pass. Use temporary SQLite
      and dummy adapters without real provider delivery. See
      [the review record](reviews/2026-10-07-dialog-reliability.md).
- [x] Keep the review title/status and 44-pixel Close control visible while scrolling;
      collapse metadata under Details while indicating missing data dates. Keep
      evidence guidance reachable separately.
- [x] Show matching report/send text once; retain exact separate delivery text for
      unsaved edits, shortened SMS/iMessage, immutable retry bodies, and linked
      citations whose reading view differs from literal delivery text.
- [x] Add eight desktop/mobile UI journeys for Details, sticky Close at 320×568,
      single-copy edit/save/confirm delivery, phone/group limits, immutable retries,
      and citation previews. Verify 94 Chromium journeys and 73 dashboard tests,
      production build, typecheck, lint, formatting, and whitespace checks with dummy
      data. Other-browser/native/human verification remains open.

## Save and message-boundary QA (October 7, 2026)

- [x] Reverify the approved Edit/shorten shortcut and friendly delivery labels on
      the current build: 18 targeted Chromium desktop/mobile journeys and 75
      dashboard tests pass. Inspect desktop and 320×568 screenshots with dummy
      data; no real delivery runs. Correct the current request-validator number
      narrowing and optional-field test fixtures needed by TypeScript checks.

- [x] Reproduce delayed draft saves replacing another report, editing remaining
      enabled during an in-flight save, lost keyboard focus when Save becomes
      disabled, and emoji splitting at phone-message caps.
- [x] Scope save results/errors/feedback and busy state to their editing session;
      lock fields while saving and explain background completion on close. Keep
      focus inside the dialog when the focused control becomes disabled.
- [x] Use a shared grapheme-safe delivery policy in previews, saved envelopes, and
      direct sends. Match the valid Twilio Conversation SID rule for its larger
      cap; preserve immutable retry text without shortening it again.
- [x] Add six desktop/mobile journeys for delayed saves, locked editors, intact and
      exact-fit emoji at direct/group/iMessage caps, and keyboard disclosure/edit/
      canceled-close handling. Add six core boundary tests and three dummy-provider
      delivery/envelope/retry tests. No real messages or provider calls were made.
- [x] Verify 100 Chromium browser journeys, 261 API tests, 60 core tests, and 73
      dashboard tests. Build, typecheck, lint, formatting, and whitespace checks pass.
      Use temporary SQLite and dummy provider interfaces on loopback; desktop
      1440×1000, phone 390×844 plus existing 320×568 regressions. No automated security
      scan was run. Other-browser/native/live-provider/human gates remain open.
- [x] Add the approved Edit/shorten shortcut beside the shortened-message notice.
      Open the unchanged saved body and focus/scroll to its editor; require an
      explicit save. Hide it while editing or after a delivery attempt, and disable
      editing while sending.
- [x] Use friendly Email, Text message, iMessage, and In-app only labels in previews,
      with consistent confirmation/button wording. Keep stored/request channel IDs.
- [x] Verify 104 desktop/mobile Chromium journeys and 73 dashboard tests, production
      build, typecheck, lint, formatting, and whitespace checks. New journeys cover
      the 320-pixel shortcut, body focus, explicit saves, unchanged delivery settings,
      friendly labels, confirmation wording, and attempted-delivery restrictions.
      Use temporary SQLite and dummy adapters; live/native/human gates remain open.

- [x] Reverify the approved report UI improvements on October 9: sticky Close,
      collapsed Details, one matching report/send copy, Edit/shorten, and friendly
      delivery labels are already implemented. The current build passes 26 targeted
      Chromium desktop/mobile journeys and 83 dashboard tests, build, typecheck,
      lint, formatting, and whitespace checks. Inspect desktop and 320×568 phone
      screenshots outside the repo; use temporary SQLite and dummy delivery only.
      This recheck changes no application behavior; other-browser/device/human
      verification remains open.

- [x] Repeat the five approved report UI checks on the current October 9 source:
      all 26 targeted desktop/mobile Chromium journeys and 84 dashboard tests pass.
      Build and workspace type checks pass; lint and formatting pass for the report
      surfaces and browser regressions, and the working-tree whitespace check passes.
      Inspect fresh 1440×1000 and 320×568 screenshots outside the repo. Verify
      Edit/shorten → focused editor → explicit save → delivery confirmation with
      temporary SQLite and dummy delivery; no application changes or real sends.

## Fantasy and betting advisor — implementation history

- [x] Define shared advice/evidence contracts and a bounded keyless NFL weekly-stats,
      schedule/results, and Sleeper activity adapter with cached source dates and outages.
- [x] Calculate source-linked historical workload/league points, distinct imported
      estimate medians, small rolling baseline error tests, and explicit data gaps.
- [x] Add legal FLEX/superflex assignments, draft replacement/pick timing evidence,
      season starting-slot trade impact, and bounded waiver marginal-gain screening.
- [x] Add odds/break-even/no-vig calculations, historical prop/game samples, push handling,
      retrospective ROI and sample-rate intervals; distinguish evidence confidence from
      calibrated prediction probabilities.
- [x] Support deeper official OpenAI reasoning-model request parameters through the
      saved connection; preserve custom provider contracts and use no new credentials.
- [x] Integrate production advice routes, cancellation/concurrency, history, existing AI,
      token/cost reporting, validated analysis and counterevidence review.
- [ ] Improve opponent/injury/role forecasts, provider scoring/identity coverage,
      prediction evaluation, public news/perception context and abstention rules.
- [x] Add discoverable Advice flows for pre/post draft, lineups/matchups, trades,
      waivers, game bets and player props; connect Home, search and Help.
- [x] Verify all modes and betting types through production routers and rendered
      desktop/mobile dummy-data journeys; check persisted history/reload, cancellation,
      unsaved navigation, search/Help, invalid model output and distinct forecast labels.
- [ ] Evaluate real model decision quality, quantitative opponent/role context,
      broader abstention cases and larger-league prompt budgets.
      Live public feeds and dummy-model tests do not prove recommendation quality.

- [x] Verify this foundation with 81 core, 113 integrations, 261 API, and 73 dashboard
      tests, production build, typecheck, lint, formatting and whitespace checks.
      A direct public-only live check loaded 23,845 player-game rows, 7,548 schedule
      games and 163 combined market entries on October 7. This verifies source
      availability/parsing only; no owner AI credential or real delivery was used.
- [x] Manually review fixed public URLs, deadlines/byte bounds, missing/ambiguous
      identities, source dates, model request compatibility, historical look-ahead,
      unit consistency and error sanitization. No automated security scan was run.

Full scope and current limitations: [Fantasy and football advice](advice.md).
The advisor now has a production route and page. Keep this goal active until the
remaining model/forecast requirements and their broader verification are complete.

- [x] Verify API/UI integration with 128 Chromium desktop/mobile journeys (24 new
      advisor cases), 267 API, 86 core, 113 integrations and 74 dashboard tests;
      production build, typecheck, lint and database/recovery integration checks pass.
      Narrow prop entry is checked at 320×568. Fake external providers use temporary
      SQLite and public-data fixtures; no owner key, real delivery or wager is used.
      Core contract checks also pass after tightening optional perception fields.
- [x] Manually review prompt data isolation, allowed numeric/source/player references,
      saved-result privacy, provider error sanitization, deadlines/concurrency,
      cancellation and backup/restore; no automated security scan is run.

## Advisor model selection and evidence limits (October 7, 2026)

- [x] Discover supported official reasoning models through the existing saved
      credential, show/select an analysis-local model, preserve custom/local
      connections and report settings, and omit mismatched saved-model cost rates.
- [x] Route official reasoning/Responses-only requests through Responses with
      storage disabled, bounded deadlines, final-text-only parsing and no paid
      fallback retry. Verify incomplete/refused/tool-only/malformed output handling.
- [x] Give advice a separate configurable reasoning/answer limit (16,384 tokens
      per pass default), five-minute workflow ceiling and initial 90-second API pass
      limit (subsequently increased to 120 seconds; see quality evaluation below).
      Keep cancellation, explicit usage charges and original report limits intact.
- [x] Enforce initial evidence-based verdict limits outside the model: incomplete
      scoring/roster/pick comparisons withhold picks; stale/historical baselines
      remain tentative; uncalibrated betting forecasts cannot establish a firm pick.
      New recommendations display numeric support; older valid history stays readable.
- [x] Verify production build, 551 workspace tests (271 API, 88 core, 118 integrations,
      74 dashboard), 130 full Chromium desktop/mobile journeys, typecheck and lint.
      Temporary stores and dummy external providers prove routing, reference bounds,
      override isolation, price handling and workflow, not live model access/quality.
- [ ] Complete real recommendation-quality evaluation, quantitative opponent/role
      context, empirical betting forecast evaluation, broader data/scoring coverage,
      public-perception robustness and larger-league context budgeting. Goal remains
      active; current unconditional betting Hold is an interim evidence constraint.

- [x] Follow-up advisor QA passes 28 desktop/mobile journeys, including two newly
      added unavailable-model recovery cases: no generation after access disappears,
      retain the selected model, disable Analyze until a replacement is selected,
      then save the replacement model without credential/settings writes. Inspect
      model-choice/output-limit screenshots at 1440×1000 and 320×568.
- [x] Ordinary code/manual security review checks fixed endpoint routing, OS-key
      reuse, metadata-only discovery, request bounds, source/metric/player validation,
      final-text-only parsing, cancellation and preserved history/backups. Formatting
      and whitespace checks pass. No automated security scan or release action ran.

## Advisor matchup evidence and context budgets (October 7, 2026)

- [x] Add current-team workload changes, recorded target/carry shares, QB attempts,
      prior player production, upcoming opponent/home/date, opponent-position totals,
      recorded NFL reference differences and prior team score context. Preserve
      sample counts, source IDs and descriptive caveats without projection multipliers.
- [x] Reject incomplete/zero share denominators, duplicate player-game samples,
      ambiguous identities, future/target-week/postseason/mismatched/old records,
      unsupported historical scoring and completed/ambiguous active-lineup targets.
      Older CSV snapshots keep missing attempt/completion fields unknown.
- [x] Carry caveats into both model passes using shared metric notes. Budget secondary
      evidence fairly, retain all comparison players, primary estimate provenance and
      decision totals, prune unused import metadata and close retained source references.
      Disclose omitted metrics; reject oversized required evidence before generation.
- [x] Verify 570 workspace tests (276 API, 101 core, 119 integrations, 74 dashboard),
      production build, typecheck and lint. A real public-only feed check loads 23,845
      rows; 25- and 40-player evidence samples fit at about 72 KB of prompt data,
      retaining every player and primary baseline. This verifies parsing/budgeting,
      not current player identity accuracy or predictive recommendation quality.
- [x] Verify 132 full Chromium desktop/mobile journeys and 28 final advisor journeys,
      including saved matchup context, workload shares, position-total caveats and
      readable stacked evidence cards at 320×568. Screenshots are outside the repo.
- [x] Re-run all 132 browser journeys on the final phone-card build. Twelve service/
      recovery integration checks, formatting and whitespace checks also pass.
- [x] Manually review date/identity joins, summed versus individual statistics,
      source closure, prompt notes, omission disclosure, old-result compatibility and
      retained provider/credential boundaries. No automated security scan, live paid
      model call, real delivery, roster transaction, wager or release action is used.
- [ ] Evaluate real model decision quality and empirical betting forecasts, improve
      current injury and public-perception grounding, extend scoring/identity support,
      and verify unusual/deeper league formats and larger required context. Descriptive
      evidence is implemented; predictive edge remains unproven and the goal stays active.

## Advisor media coverage and UI verification (October 7, 2026)

- [x] Select up to eight relevant recent player/team headlines, deduplicate tracked
      links/repeated titles, retain publication/retrieval dates and separate player
      mentions from team context. Display current/stale/unavailable coverage and
      attributed links in saved advice; connect the explanation to searchable FAQ.
- [x] Force unsupported or stale media interpretations to unknown. Keep matched
      current Sleeper activity as a limited behavioral proxy, using explicit catalog
      mappings across Yahoo, ESPN and NFL props without guessing identifier namespaces.
- [x] Verify 581 workspace tests (278 API, 110 core, 119 integrations, 74 dashboard),
      production build, typecheck, lint, formatting and whitespace checks. All 134
      Chromium desktop/mobile journeys pass on the final build, including stale/current
      saved coverage, attribution and unchanged credentials/settings.
- [x] Reverify the approved Edit/shorten and friendly delivery-label improvements:
      unchanged full-body focus, explicit save, matching confirmation wording and
      attempted-delivery restrictions. Inspect desktop and 320-pixel screenshots.
- [x] Manually review bounded public links, dates, identity mappings, metric/source
      closure, prompt references and stored-record compatibility. No automated security
      scan, owner key access, paid model call, real message, roster action or wager ran.
- [ ] Evaluate live media relevance, real model quality and calibrated betting methods;
      improve injury/scoring coverage and verify real devices and other browsers.
      The broader advisor goal remains active.

## Advisor injury evidence (October 7, 2026)

- [x] Retain GSIS, regular/postseason type and validated explicit-timezone report
      updates. Match current week/team/position and a verified identity; resolve
      newest reports by timestamp, reject conflicts and keep undated coverage unknown.
- [x] Gate status overrides separately on report/retrieval freshness. Preserve
      existing flags when evidence is missing, undated, stale or ambiguous. Remove
      current Out players from weekly estimates and limit uncertain weekly advice.
- [x] Carry practice/status/date caveats through both analysis passes, saved results
      and rendered player details. The October 7 public CSV probe found no report
      update column; retrieval alone cannot establish a current game designation.
      A bounded live parse loads 1,071 rows with GSIS IDs, including 19 regular-week-5
      records, and zero report timestamps. A matched sample stays undated and cannot
      override status. This proves parsing/guard behavior, not live injury accuracy.
- [x] Verify 587 workspace tests (279 API, 111 core, 123 integrations, 74 dashboard),
      32 advisor desktop/mobile journeys, build, typecheck, lint, formatting and
      whitespace checks. Inspect current-report screenshots at 1440 and 320 pixels.
      Dummy providers/temporary databases verify workflow and persistence, not
      real recommendation quality. No owner key, paid model, message or wager ran.
- [x] Manually review public URL bounds, timestamp/timezone parsing, GSIS/name and
      team/position joins, duplicate updates, missing versus healthy status, saved
      compatibility and recommendation limits. No automated security scan ran.
- [ ] Improve timestamped live injury coverage and evaluate injury-aware forecasts;
      finish real-model quality and empirical betting evaluation. Goal remains active.

## Rolling betting evaluation (October 7, 2026)

- [x] Compute rolling team/offense/opposing-defense estimates and player-history
      estimates with empirical errors, integer outcomes, push handling and a separate
      chronological calibration step. Preserve source-linked estimates/probabilities,
      evaluation counts, baseline Brier scores and hypothetical return labels.
- [x] Exclude target/future/postseason/old records, conflicting game IDs, duplicated
      team/week games and mismatched prop player/game identities. Verify earlier
      probabilities remain unchanged after changing later-week outcomes.
- [x] Replace unconditional betting Hold with a deterministic evaluation/price gate
      that permits at most a tentative choice. Require supported samples, weeks,
      calibration, improvement, fresh sources and a conservative push-adjusted advantage.
      Uncalibrated AI probabilities and uncertain player status cannot bypass it.
- [x] Persist validated optional forecast metadata, keep old history readable, show
      statistical versus AI forecasts separately, and explicitly label estimates that
      do not support placing a bet. Explain the distinction in searchable Help.
- [x] Fix evidence time ordering so a provider refresh completed during the request
      is not mislabeled future/stale. Verify it through production advice routes.
- [x] Verify 595 workspace tests (281 API, 117 core, 123 integrations, 74 dashboard),
      production build, typecheck, lint and formatting. The focused advisor suite
      passes 34 desktop/mobile journeys, including saved forecasts and explicit
      no-bet guidance at 320 pixels. Twelve service/recovery integration checks pass.
- [x] Verify all 138 Chromium desktop/mobile journeys on the final status/Help build,
      and rerun all 74 dashboard tests. Inspect desktop and narrow-phone screenshots
      showing the explicit no-bet status before the experimental estimate.
- [x] Add opt-in `npm run betting:evaluate`, using fixed illustrative prices and
      public data only. A live next-game check evaluates 172 outcomes across 11 weeks
      with 203 prior model errors. Moneyline Brier is 0.229 versus baseline 0.254;
      spread is 0.198 versus 0.239; total is 0.237 versus 0.251. All fail qualification,
      including the minimum 12-week requirement. This is not a sportsbook-price or
      profit backtest. Model calculations take 8–17 ms in this single local sample.
- [x] Manually review chronological fitting/calibration, duplicated identities,
      push/odds units, dependent-week caveats, prompt/source references, saved guards
      and bounded public calls. No automated security scan, owner-key access, paid
      AI call, roster action, real message, wager, commit or release action ran.
- [ ] Improve player-prop cohort/role/opponent models and current condition coverage;
      evaluate real AI decisions, prospective probability quality and actual market
      prices. Historical evaluation is initial evidence; the broader goal stays active.

## Advisor quality evaluation and actual lineup choices (October 7, 2026)

- [x] Add an isolated opt-in real-model evaluation through the production two-pass
      service. Fixed fictional cases grade raw reviewed and saved answers separately,
      with numeric expectations, first-pass validity and sanitized failure categories.
      Reuse an installed authenticated CLI; do not create a key, load owner histories,
      rewrite owner settings, send messages, submit roster changes or place bets.
- [x] Honor per-request CLI deadlines and validate bounds before spawning. Raise the
      advice ceiling to 120 seconds per pass within its five-minute workflow. Apply
      Claude output/reasoning and requested retry limits only to its child process.
      Add deadline/budget/isolation tests; generic CLI interfaces remain supported.
- [x] Fix an inactive bench player blocking complete replacement lineups, and keep
      unsupported betting confidence Low even when no optional AI forecast is emitted.
- [x] Evaluate existing authenticated Claude `opus`/high effort on controlled cases.
      Initial eight-case baseline passes lineup, betting (under its initial criteria),
      and injured-starter checks; three modes time out and two fail final validation.
      The betting score of 50 revealed a confidence defect, now capped at 49 when
      unsupported. A subsequent bounded two-case run passes waivers with correct
      selection/numerical support and fails draft planning's numeric-text contract.
      This is process evidence, not NFL prediction accuracy or betting-profit evidence.
- [x] Make numeric prose restrictions explicit and provide fixed trusted review
      feedback for invalid first answers, without including raw rejected model output.
- [x] Let lineup analysis consider all eligible roster alternatives. Require a full
      legal selected lineup and visible estimate support for changed/displaced players.
      Compute the actual choice's total and difference from the best estimate, persist
      both lineups when different, and keep unquantified contextual departures tentative
      with Low confidence. Add a ninth controlled case for a conservative preference.
- [x] Use plain position labels and explicit numbering for repeated slots in the
      rendered lineup. Preserve the saved assignment metadata and player estimates.
- [x] Verify 607 workspace tests (286 API, 120 core, 127 integrations, 74 dashboard),
      five grader checks over nine fixed cases, 40 advisor desktop/mobile journeys
      and 17 service/recovery/evaluation integration checks. Build and typecheck pass;
      inspect 1440-pixel desktop and 320-pixel phone selection/comparison screenshots.
      Dummy providers verify rules/workflow/persistence, not live model quality.
- [x] The live contextual-lineup evaluation fails before an answer, and a tiny
      tool-free existing-CLI health probe also exits without responding. The safe
      diagnostic is provider-exit; the underlying provider cause is not established.
      Do not label this as a valid contextual decision or infer a quota/auth cause.
      A read-only authentication-status check still reports logged in and omits all
      account identifiers. Authentication alone does not prove generation is available.
- [x] Manually review roster ownership/slot eligibility, full versus partial choices,
      numeric/source closure, estimate tradeoffs, verdict/confidence limits, invalid
      draft isolation, bounded/cancellable CLI execution and preserved owner settings.
      No automated security scan, real delivery, transaction, wager or release ran.
- [x] Complete the renewed draft-plan/draft-review/trade run after numeric feedback
      changes. All three fail the 120-second provider deadline: draft-plan before an
      answer, the other two after valid first answers. No final results are saved.
      This contradicts readiness across the six modes; increasing a deadline alone
      has not established reliable strong-model performance.
- [ ] Resolve observed latency/format failures and verify model access and
      recommendation quality across all six modes.
- [x] Offer an explicit analysis-local signed-in Claude/Opus choice, availability check,
      cancellable fixed probe and searchable Help. Use the same provider for both passes;
      never fall back, reuse API prices or change report/schedule/vault settings. Wire
      the typed integration into the actual application, with bounded executable lookup,
      sanitized auth status, isolated temporary working directories, tool/MCP restrictions
      and child-only subscription routing. No owner-service restart was performed.
- [x] The new preset detects the existing subscription login. Its bounded fixed live
      probe exits without an answer in approximately 2.2 seconds. Provider-exit is known;
      its cause is unproven. Sign-in is not generation readiness or model-quality evidence.
- [x] Verify 618 workspace tests (290 API, 121 core, 132 integrations, 75 dashboard),
      the complete `npm test` command and 152 Chromium desktop/mobile journeys. The
      eight new connection journeys cover explicit selection, both passes, saved source,
      key-free configuration isolation, unavailable login/reload, failed generation,
      probe cancellation and Help. Build, typecheck, lint, formatting and whitespace
      checks pass. Inspect connection controls at 1440 and 320 pixels. Dummy adapters
      prove workflow, not live recommendation quality; POSIX subprocess fixtures do
      not establish Windows CLI support.
- [x] Manually review fixed executable/argument boundaries, account-output isolation,
      inherited routing, managed-policy caveats, child deadlines/cleanup, exact probe
      shape, concurrent requests, saved compatibility and no-fallback semantics. A
      bounded live exit diagnostic recognizes no known usage-limit, option, auth,
      budget or model-unavailable message; do not infer any of these causes. No
      automated security scan, real delivery, roster transaction, wager or release ran.
- [x] Distinguish full-season and remaining-season projection intervals in CSV imports,
      stored evidence, comparisons and saved advice. Require the same season/current
      week/final week, allow an earlier league championship end, and never subtract
      past scoring or reuse full totals. Preserve legacy draft imports/history. Add
      a searchable FAQ with a direct Imports action.
- [x] Inspect the installed CLI's bounded JSON diagnostic: exit one, error flag true,
      subtype success, and a reported limit. Read native envelopes defensively, expose
      only fixed failure categories and validated token counts, and retain no-fallback
      behavior. Which limit/reset time remains unknown; live generation is not proven.
- [x] Keep interval imports out of full-season report draft/preseason comparisons and
      exclude another declared season from weekly report estimates. Review exact
      identity, duplicates, old-history compatibility, period bounds, usage metadata,
      process cleanup and fixed errors manually; no automated security scan was run.
- [x] Verify the complete `npm test` command and 627 workspace tests (293 API, 124 core,
      134 integrations, 76 dashboard). The 158-case browser run passes 156; correct the
      new Help locator and pass all six interval journeys, including those two cases.
      Inspect desktop and 320-pixel screenshots. Fixed cases cover all nine controlled
      decisions through the production service; they do not prove prediction accuracy.
- [x] Add an explicit existing-login Codex connection using GPT-6.1-Sol/high reasoning.
      The actual adapter passes a fixed live probe. A captured request through the
      installed CLI contains no model tools, skills catalog or private instructions;
      only the mock provider omits authorization. Preserve native login, fail closed
      on unverified CLI versions/isolation, and do not change saved report settings.
- [x] Complete and document an initial nine-case live controlled sweep through this
      adapter: seven pass, with draft-planning and waiver-review failures recorded.
      A successful fixed probe alone does not verify football quality.
- [ ] Repeat the complete live sweep with the added roster/draft context and diagnose
      intermittent waiver-review failure before claiming reliable six-mode quality.
- [ ] Improve timestamped current injury data, quantitative role/opponent/prop forecasts,
      scoring/identity/deeper-league coverage, live perception and prospective betting
      evaluation. Keep the original advisor goal active until its full scope is verified.

## Signed-in Codex integration (October 7, 2026)

- [x] Wire the typed native adapter into options, probes, both analysis passes,
      saved results, searchable Help and connection recovery. No API key is added.
- [x] Pin the CLI to verified version 0.162.0-alpha.2; disable tools, app connectors,
      plugins, history, host/project instructions and canonical installed skills.
      Bound skill discovery with cycle detection, entries, paths, argument size and
      deadline. Preserve native credential location without opening/copying tokens.
- [x] Bound subprocess output/runtime, honor cancellation, remove owned prompt files,
      extract only final text and safe token counts, and reject tool/native failure
      events, duplicate answers, incomplete/malformed streams and version changes.
- [x] Explain subscription limits and omit the unsupported token-budget control;
      reject API token overrides for this connection instead of silently ignoring them.
- [x] Verify 16 desktop/mobile connection journeys, 295 API tests and 140 integration
      tests. The actual adapter passes a fixed live probe and local captured-request
      isolation proof. Final `npm test` passes 638 workspace tests (295 API, 124 core,
      140 integrations, 79 dashboard), with two expected platform skips. All 166
      Chromium journeys pass; build/typecheck/lint/format and whitespace checks pass.
      Inspect desktop and 320×568 screenshots. Controlled model evaluation continues.
- [x] Perform ordinary code/manual security review of subprocess boundaries, native
      login status parsing, canonical symlinks, limits, cleanup, response metadata,
      failure sanitization and saved configuration isolation. No automated scan ran.

- [x] Complete an initial live GPT-6.1-Sol sweep of all nine controlled cases through
      the typed connection and production analysis/review path: seven pass, draft
      planning chooses Hold rather than the expected candidate, and the waiver
      review cannot be verified after a valid first pass. Do not call this sweep
      fully passing or infer prospective accuracy. Targeted diagnosis remains open.

- [x] Diagnose repeated draft-planning Hold responses using only the validated
      reviewed explanation: the prompt omitted saved roster ownership and pick-log
      data. Include selected/comparison rosters and draft status/picks/snapshot
      eligibility checks in both passes, distinguish conditional planning from live
      availability, and clarify proposed-answer review wording. Add a production
      service regression covering both passes. Live rerun verification follows.
- [ ] Investigate the intermittent waiver review failure: a targeted retry passes
      with normal native events, but neither a root cause nor a fix is established.

- [x] Verify the context fix with seven evaluator regressions, 295 API tests and
      typecheck. Live draft planning now selects the expected candidate and supports
      it with all candidates versus actual starters. Retain the original replacement
      metric/value expectation; accept either its visible citation or the complete
      six-metric roster-relative comparison. Tests reject partial comparisons, wrong
      players and wrong computed values. Offline replay of the unchanged validated
      live reviewed answer passes this equivalent-support rubric; it is not new
      inference. The original initial-sweep failure remains in the record.
- [x] A targeted waiver retry passes, with normal native events. This is not a
      diagnosed fix or evidence of stable generation. All model processes are terminal.

- [x] Reverify the final context change with 62 affected desktop/mobile advisor
      journeys, 295 API tests, 79 dashboard tests and seven evaluator regressions;
      typecheck/lint/format and whitespace checks pass. The earlier full run passes
      all 166 browser journeys and the complete root test command (638 workspace
      tests). No owner-service restart, release, transaction, delivery or wager ran.

## Current live decision and media verification (October 7, 2026)

- [x] Add fixed allowlisted native protocol failure categories to the evaluator;
      preserve fixed public errors and exclude private provider diagnostics. Verify
      140 integration tests, including exact missing/duplicate/error-item categories.
- [x] Add opposing-current-editorial and stale-media waiver cases through the same
      production analysis/review service. Grade attribution, tone, freshness, player
      choice and numerical support independently; policy repairs cannot conceal a bad
      raw reviewed answer. Eight evaluator regressions and 295 API tests pass.
- [x] Add a favorable exchange with a fixed legal-starter gain of 52 remaining points
      to distinguish accepting a helpful trade from rejecting a harmful one. Its
      conditional comparison does not assume counterparty willingness.
- [x] Clarify trade verdict direction after the current live model correctly rejects
      the harmful exchange in prose but labels it Lean. Rejecting/keeping the roster
      means Hold; retain the failing result and original grading expectation.
- [x] Verify the clarified harmful trade, repeated waivers, opposing-current media,
      stale media and favorable trade through the actual existing ChatGPT connection:
      five of five pass with valid analysis and review. Harmful trade uses Hold;
      favorable trade uses Lean and cites the computed 52-point starter gain. Media
      uses both citations for Mixed coverage; stale coverage stays Unknown. No
      prospective football accuracy claim follows from these controlled cases.
- [x] Finish the original-nine run at eight of nine: all but trade direction pass.
      Retain the failed Lean-against answer; the full run has not been silently
      regraded. The targeted five-case run passes after the instruction correction;
      it is not a single fully passing twelve-case run.
- [x] Check a possible key-free injury source with bounded public reads: ESPN's
      all-team feed exceeds 8 MB, but the ARI roster endpoint is 391,516 bytes and
      supplies ESPN IDs/status/date. No game week or verified update semantics were
      established; do not enable a status override from this exploratory evidence.
- [x] Verify the complete root test command (638 workspace tests, two expected
      platform skips), eight evaluator regressions covering all twelve cases, and
      48 affected Chromium desktop/mobile advisor journeys. Inspect current-coverage
      and narrow-phone attribution screenshots from dummy adapters. Build, typecheck,
      lint, formatting and whitespace checks pass.
- [x] Review source/citation closure, raw-versus-saved answer grading, bounded native
      diagnostics, unchanged provider selection/settings, fresh/stale attribution and
      trade direction manually. All model processes are terminal; no automated
      security scan, owner-service restart, real delivery, trade or wager ran.
- [x] Verify the original twelve cases in the subsequent passing seventeen-case
      native live sweep after the trade-direction correction. Keep failed runs separately.
- [ ] Evaluate real player/team media relevance and improve current injury/future
      forecasts and prospective betting verification. The original goal remains active.

## Automatic draft/trade forecasts and kickoff boundaries (October 7, 2026)

- [x] Add automatic league-scored full/remaining-season forecasts from unique public
      histories and scheduled future games, using current/two prior seasons without
      new provider keys. Compare chronological form/workload/opponent adjustments
      with the historical baseline, withholding unsupported coverage and retaining
      recorded/future decomposition, error bands and held-out evaluation metrics.
- [x] Preserve matching import priority; cap automatic comparisons at Lean and
      confidence 69. Link automatic forecast help to Search and Advice, and explain
      byes, played games, championship horizons and conditional availability.
- [x] Verify UTC kickoff conversion and reject started/unknown same-day games; recheck
      after betting inference and inside the save callback. Exercise kickoff crossing
      during both model passes and while queued for persistence, with no saved advice.
- [x] Include all current roster players and backups in draft review; distinguish
      supported current comparison from missing historical draft-grade evidence.
- [x] Fix the evidence-size failure reproduced with 27 public-data players. Share
      prompt metadata/caveats without changing saved schemas or dropping required
      values. Add a thirty-player engine-generated regression with twelve required
      candidate totals, both full/remaining scopes, source/units/sample/warning
      round trips and unchanged confidence/source boundaries.
- [x] Finish the fifteen-case native live sweep at fourteen of fifteen, preserving
      the automatic draft-planning citation failure. All thirty model passes validate;
      review compares future baselines against actual starters rather than using the
      grader’s full-season citation alternatives. Do not re-label this run as fully
      passing.
- [x] Complete the targeted automatic draft-plan live rerun at one of one: Lean
      selects the original expected candidate and passes the strict numerical-support
      check with confidence 50. Preserve the fourteen-of-fifteen full-run record; the
      targeted pass is a separate run. All native model processes are terminal.
- [x] Finish the complete root test command with 661 workspace tests and two expected
      platform skips; eleven evaluator regressions, build/typecheck/lint/format and
      whitespace checks pass. The forecast/prompt revision passes all 176 Chromium
      journeys and final news changes pass 64 affected desktop/mobile advisor journeys.
      Inspect current desktop and 320-pixel source-linked forecast screenshots.
- [x] Verify the original fifteen cases under the equivalent-support rubric in
      the subsequent passing seventeen-case native sweep. Preserve the earlier failure.
- [ ] Continue real-media relevance, calibration and injury/rookie/deeper-roster coverage.
- [ ] Extend larger/deeper comparisons: a forty-player public-data sample still
      exceeds saved evidence limits. Improve weekly/prop/current-injury forecasts,
      prospectively evaluate accuracy and availability, broaden scoring/rookie/identity
      coverage and check live media relevance. The original advisor goal remains active.

- [x] Expand advisor headline selection to a bounded hundred-story cached pool without
      extra polling; ordinary news remains ten, report prompts five and model-selected
      relevant headlines eight. Exclude undated stories and decode padded/hex numeric
      entities so apostrophes remain matchable. Verify 145 integration tests and 300
      API tests, including selection below the ordinary cutoff in both passes/history.

- [x] Scope primary-metric protection to actual player evidence or explicitly required
      decision metrics, allowing optional team sample totals to be budgeted. The
      regression retains player estimates and required totals; 301 API tests pass.
- [x] Add a strict six-value future-comparison alternative for automatic draft planning,
      retaining the original candidate, verdict, confidence cap and replacement-value
      check. Eleven evaluator regressions reject each missing comparison or corrupted
      value. Offline replay of the unchanged validated reviewed answer passes; this is
      not a new inference or replacement for the original full-sweep failure.

- [x] Keep broad news items paired with the retrieval timestamp from the same cache
      snapshot during a concurrent refresh. A forced interleaving regression verifies
      the newer items/date pair; 146 integration tests pass.

## Focused start/sit — October 7, 2026

- [x] Add a one-spot start/sit comparison alongside complete-lineup analysis.
      Validate two to twenty selected owned players and common starting eligibility;
      unrelated K/DST forecasts no longer block a supported receiver comparison.
      Selected active missing estimates still withhold picks, and inactive players
      cannot be selected. Require exactly one choice plus visible numerical support
      for every eligible alternative in both passes. Keep full-lineup guards intact.
- [x] Persist single-spot scope separately from lineup assignments, show the shared
      slots/conditional scope, and add searchable FAQ navigation. Prevent incompatible
      selections in the form and provide fixed server errors without inference.
      A lower-estimate contextual choice stays tentative and records its actual
      opportunity cost, with confidence capped at 59.
- [x] Run two targeted native ChatGPT/GPT-6.1-Sol high-reasoning cases: both pass,
      including the availability-based lower-estimate choice. All four passes validate.
      This measures fictional decision process, not prospective football accuracy.
- [x] Run the complete root command: 672 workspace tests (306 API, 139 core,
      146 integrations, 81 dashboard), twelve evaluator regressions over seventeen
      cases, and two expected platform skips pass. Build/typecheck/lint pass.
      Review ownership/scoring/scope/persistence, fixed error messages, provider
      isolation and unchanged transaction/credential boundaries manually; no
      automated security scan, real delivery, roster transaction or wager ran.
- [x] Pass all 180 desktop/mobile browser journeys and inspect desktop/320-pixel
      screenshots. Both layouts show the conditional one-spot scope and chosen
      player without horizontal overflow; browser fixtures assert identity, runtime
      health, incompatible selection prevention, saving/reloading and unchanged settings.
- [x] Pass final formatting and whitespace checks.
- [x] Finish the fresh seventeen-case native live sweep: seventeen of seventeen
      pass, with all thirty-four model passes valid. Preserve earlier failed sweeps
      separately; controlled cases do not establish prospective NFL accuracy.
- [ ] Extend actual DST/rookie/current-injury and deeper-roster forecast coverage.
      Kicker scoring and estimates are now implemented; see the October 9 work below.
      Prospective accuracy and trustworthy current availability remain unverified.

- [x] Verify a possible key-free team-defense source using the provider's
      [load_team_stats implementation](https://raw.githubusercontent.com/nflverse/nflreadr/main/R/load_stats.R).
      Bounded public CSV downloads for 2024/2025/2026 contain respectively
      544/544/128 unique regular-season team/week rows with defensive-event fields;
      no duplicate team/week keys were found. This is schema/data availability
      evidence, not a DST scoring implementation or evaluated forecast. Preserve
      unknown scoring definitions and missing data rather than infer fantasy points.

## Kicker evidence and forecasts — October 9, 2026

- [x] Extend the existing bounded public player CSV adapter with optional kicking
      counts and validated individual field-goal distances. Preserve raw misses
      separately from blocks; reject malformed lists, contradictory attempt/outcome
      totals and nonintegral/out-of-range counts. Older offensive CSVs remain usable;
      absent kicking data stays unknown. No additional URLs or API keys are needed.
- [x] Score supported Sleeper made kicks, distance bands, missed/blocked FG and PAT,
      made-yard totals and per-kick yards over thirty. Preserve known offensive
      contributions and withhold unsupported rules/missing required distances.
      Support the existing Yahoo made-kick distance/PAT names. Do not infer unknown
      ESPN scoring IDs, Yahoo miss penalties or DST points.
- [x] Add kicker history, attempt/role/opponent comparisons, weekly baseline and
      chronologically evaluated full/remaining forecasts in a separate K cohort.
      Preserve import priority, recorded/future decomposition, error bands, testing
      gates and tentative season-comparison limits. Disclose unknown weather,
      fourth-down coaching choices, kicking-job changes and availability.
- [x] Add searchable kicker guidance and four desktop/mobile browser journeys for
      actual baseline arithmetic, both alternatives, persistence, settings isolation
      and Help navigation. Eighteen affected browser journeys pass on the initial
      build, including narrow 320-pixel layouts.
- [x] Verify bounded fresh public CSV downloads: 569/569/130 K rows for 2024/2025/2026
      all score under the tested made/distance/miss/yardage settings. All 32 current
      matched kickers receive remaining estimates. The cohort evaluates 794 earlier
      outcomes across 28 weeks; adjustments lack reliable improvement, so all use
      the baseline. This is compatibility/historical-process evidence, not
      prospective accuracy, live weather or verified current kicking-job coverage.
- [x] Pass the targeted native GPT-6.1-Sol high-reasoning kicker comparison: both
      passes validate and Lean selects the expected kicker with the computed
      eleven-versus-seven baselines, including blocked/distance penalties. No new
      key or owner settings are used. This is a separate one-case check, not a fresh
      fully passing eighteen-case live sweep.
- [x] Fix a boundary regression in saved-evidence sizing: include the returned
      omission count in the budget, preserving protected comparison/forecast metrics.
      The large-profile regression had exceeded its asserted limit by thirteen bytes.
- [x] Finish the complete root command: 681 workspace tests (306 API, 144 core,
      149 integrations, 82 dashboard), thirteen evaluator regressions across eighteen
      cases and two expected platform skips. Build/typecheck/lint/format and whitespace
      checks pass. All 184 desktop/mobile Chromium journeys pass on the final build.
      Inspect desktop/320-pixel comparison and supporting-number screenshots with
      temporary production-router fixtures and dummy providers. Browser plugin absent;
      repository Playwright validates Search → Help → lineup and saved/reloaded results.
- [x] Manually review scoring/missing-data boundaries, bounded lists, legacy CSV
      compatibility, separate cohorts, chronology, imports, source closure, protected
      budget fields and persistence. Reject inherited scoring-object keys. No
      automated security scan, owner-service restart, real delivery, roster action,
      wager, credential change, commit or release ran. All native model processes
      started for these evaluations are terminal.

## Team-defense evidence and forecasts — October 9, 2026

- [x] Add keyless filtered Sleeper D/ST weekly stats and independently validated
      nflverse team totals. Bound response bytes, four shared request permits,
      per-resource/load deadlines, cache size, coalescing, retries and dates.
      Malformed refreshes preserve old raw evidence and original retrieval metadata.
- [x] Validate team identities and completed canonical game joins. Keep byes,
      same-day/incomplete games, vendor IDs, duplicate records and missing fields
      from becoming fabricated appearances or zero scores. Separate defense and
      special-teams event counters and verify omitted zeroes only from independent
      totals or exhaustive noncontradictory partitions. Preserve unresolved fumble TDs.
- [x] Score supported actual Sleeper defense events, points/yardage bands and linear
      rules with negative scores, unsupported-rule guards and explicit provenance.
      Add team-based weekly history and a separate chronologically evaluated D/ST
      full/remaining cohort; keep import priority, recorded/future decomposition,
      stale/missing recent-game guards and baseline fallback. Current personnel,
      weather and future turnovers remain uncertain; Yahoo/ESPN DST semantics remain
      unverified. Historical/source compatibility is not prospective accuracy.
- [x] Extend bounded metric/result provenance to seventy-five sources without
      relaxing prompt or saved-byte limits; discard unreferenced D/ST sources.
      Carry explicit row provenance into player, matchup and prop-history evidence.
- [x] Add searchable team-defense FAQ navigation, a friendly DEF → Team defense
      label, and production-router dummy journeys for numerical alternatives,
      persistence/settings isolation and full lineups containing K and D/ST.
- [x] Pass the targeted existing signed-in GPT-6.1-Sol high-reasoning defense case:
      both passes validate, Lean selects BUF from computed ten-versus-six baselines.
      This separate one-case run is not a fresh nineteen-case native sweep. The
      native process is terminal and no saved owner settings or new keys were used.
- [x] Verify fresh public data: 1,218 joined D/ST game records; 1,213 score under
      the tested common Sleeper settings. Five unresolved fumble-return TD games
      remain missing rather than zero. A current-week compatibility probe provides
      27 weekly and 31 remaining estimates; started games, byes and missing recent
      history can withhold estimates. All remaining estimates use baseline after
      855 earlier held-out outcomes across 28 weeks, MAE about 4.706 points/game;
      adjustments do not establish reliable gains. These counts are a dated probe,
      not complete format coverage or current availability verification.
- [x] Pass the complete root command: 706 workspace tests (309 API, 152 core,
      162 integrations, 83 dashboard), fourteen evaluator regressions across
      nineteen controlled cases, and two expected platform skips. Build, typecheck
      and lint pass. Manually review sparse/partition arithmetic, source closure,
      chronological boundaries, cache outages, resource limits and unchanged local
      credentials/transaction boundaries; no automated security scan ran.
- [ ] Broaden custom/platform defense scoring, current personnel/injury/rookie
      evidence, deeper comparisons, media relevance and prospective prediction/
      market-price checks. The original advisor goal remains active.

- [x] Pass all 188 Chromium desktop/mobile journeys on the final build. Inspect
      1440×1000 and 320×568 comparison/number screenshots: both defense estimates
      are readable, DEF uses the friendly Team defense label, and no horizontal
      overflow or app runtime errors appear. Validate Search → FAQ → actual lineup,
      saving/reloading, and complete K/DST starter assignments using temporary
      production-router SQLite fixtures and dummy providers. Format and whitespace
      checks pass; Browser plugin absent, repository Playwright used. All owned
      native/test processes are terminal; changes remain local and uncommitted.

Final roster-identity review fixes a catalog-outage case that could show an owned
D/ST again as an unrostered candidate under a different name. Catalog/owned
DEF/DST aliases now merge by verified NFL team while retaining the owned platform
ID and separate Sleeper identity. Synthetic team IDs are never tagged as GSIS.
Two pool regressions cover the fallback and cross-platform alias paths.

## Offensive fumble touchdown evidence — October 9, 2026

- [x] Resolve the five missing historical defense TD partitions using keyless public
      ESPN game summaries and the schedule's separate validated event ID. Check final
      game scope/identity/scores, Eastern date/kickoff, matching scoring plays, unit
      participation and retained offensive possession. Two offensive scores carry
      a misleading fumble-return label; never classify their unit from that label.
- [x] Require verified offensive scores to exhaust the independent same-team/game
      fumble-TD total before inferring missing D/ST zeroes. Preserve known positive
      counters and weekly/total/summary provenance. Missing, inconsistent, fourth-down
      and special-team evidence stays unknown. Check at most twelve recent unresolved
      games with shared request permits/deadlines, six-hour raw caching, five-minute
      retry backoff and one-megabyte bounded summaries; never follow external refs.
- [x] Verify live public history at 15:44 UTC: 1,218 joined records now all score
      under the tested common Sleeper settings, with no source-outage warnings.
      The five resolved records score ARI 2024 week 2: 11; BAL 2024 week 4: 9;
      ARI 2024 week 15: 5; TEN 2025 week 5: 7; HOU 2025 week 15: 5. These are
      historical league-rule computations, not future point predictions.
- [x] Probe the resulting week-5 evidence: 28 weekly and 32 remaining estimates.
      All remaining estimates retain rolling-baseline-v1 after 858 earlier held-out
      outcomes across 28 weeks, MAE approximately 4.704 points/game. A two-team
      remaining comparison retains all five summary citations, 54 sources, zero
      omitted metrics, about 35.6 KB compact prompt and 46.2 KB saved evidence.
      Every projection/metric source resolves to available dated metadata. Coverage
      does not establish prospective accuracy or current personnel completeness.
- [x] Pass the complete root command: 716 workspace tests (309 API, 152 core,
      172 integrations, 83 dashboard), existing evaluator regressions and two expected
      platform skips. New tests cover the five public structured-play excerpts,
      contradictory/partial/foreign proofs, identity/scope/calendar/score boundaries,
      malformed/oversized summaries, stale proof dates/backoff, twelve-game selection
      and shared four-request limits. Build, typecheck, lint and formatting pass.
- [x] Pass 22 targeted Chromium desktop/mobile defense, kicker, start/sit and
      forecast journeys on the current build, including owned aliases, complete
      K/DST lineups, numerical alternatives, saving/reloading and Search → FAQ →
      actual lineup. Use loopback fixtures and dummy providers; no real delivery,
      wager, roster action, new key or owner-service change. Manually review fixed
      URLs, trust boundaries, cache dates, exhaustive arithmetic and source budgets.
      No automated security scan, native-model rerun, commit or release was performed.
- [ ] Continue current personnel/rookie evidence, deeper comparisons, broader
      scoring/platform formats, media relevance and prospective forecast/market
      validation. The original advisor goal remains active.

## Rookie draft evidence and missing comparisons — October 9, 2026

- [x] Add one bounded, timed, cached keyless NFL draft CSV resource. Validate modern/
      legacy identity formats, missing IDs and historical PFR punctuation; copy only
      draft facts and exclude retrospective career statistics. Preserve outage dates.
- [x] Join by explicit identity or unique name/position when no GSIS exists; withhold
      ambiguous/conflicting identities and pre-May current-class data. Preserve current
      team membership separately from historical drafting-team codes.
- [x] Add same-position/round-band descriptive rookie cohorts using league scoring,
      equal player weights, scoring-complete completed appearances and two earlier
      classes. Require eight eligible players across two classes for scoring summaries;
      disclose selection bias and never substitute a cohort for a player forecast.
- [x] Fix draft/waiver planning silently discarding explicitly selected players without
      estimates. Keep their evidence and missing-data explanations; incomplete selected
      comparisons remain Insufficient. Matching scoring-confirmed imports keep priority.
- [x] Carry profile/source closure through both model passes, compact budgeting and
      closed saved-result validation. Show draft facts separately, format calendar years
      without thousands separators, and link searchable rookie Help to actual imports.
- [x] Verify the live public source: 4,350 supported-position draft profiles, 81 current-
      class records and 75 unique current Sleeper name/position matches. First-round WR
      comparisons include ten earlier rookies/two classes, mean about 11.215 points per
      recorded appearance under the tested PPR rules; QB/RB/TE samples are too thin for
      scoring summaries. No missing metric references or fabricated current teams.
- [x] Pass the new existing signed-in GPT-6.1-Sol high-reasoning native case in both
      passes: Insufficient, no pick, zero evidence confidence, unknown media tone.
      This is one targeted case, not a fresh twenty-case native sweep or NFL accuracy.
- [x] Pass the root command: 725 workspace tests (310 API, 157 core, 174 integrations,
      84 dashboard), fifteen evaluator regressions across twenty controlled cases,
      and two expected platform skips. Review identities, date/scoring/source boundaries,
      cohort weighting/selection, prompt interpretation and unchanged credential,
      roster, delivery and wagering boundaries manually; no automated scan ran.
- [x] Pass all 194 Chromium desktop/mobile journeys on the final build, including
      six rookie workflows for facts/import priority, missing-forecast retention and
      Search → FAQ → actual projection imports. Inspect desktop 1440×1000 and phone
      320×568 screenshots outside the repo; calendar years, draft facts and separate
      point estimates are readable without horizontal overflow. Production loopback
      SQLite fixtures/dummy providers record no runtime errors, real delivery, wagers,
      roster changes, vault writes or owner-settings changes. Build, types, lint,
      format and whitespace checks pass. Browser plugin absent, repository Playwright
      used; other browsers, real devices and nontechnical participant checks remain
      open. All owned processes are terminal; no commit, release or service restart.
- [ ] Continue player-specific forecasts for rookies before NFL history, current
      personnel, deeper comparisons, scoring breadth, live media relevance and prospective
      fantasy/betting validation. The original advisor objective remains active.

## Public individual forecasts — October 9, 2026

- [x] Integrate bounded, keyless ESPN public weekly projections into the existing
      football snapshot, separately from observed NFL statistics. Validate exact
      period/player/team/source IDs and full publisher scoring with overrides; ignore
      ambiguous aggregate totals. Bound five pages, concurrency, bytes, load deadlines,
      cache seasons and retries. Keep original dates through outages and withhold
      duplicate pagination. Derived scoring fields can be signed; event counts cannot.
- [x] Score public expectations under supported league rules after matching imports
      and before historical fallback. Support exact weekly, preseason full-season and
      remaining intervals without inventing NFL appearances. Respect final weeks/byes/
      started games; require complete unique schedules and credited past-game rows for
      full-season totals. Missing forecast/scoring/identity/freshness remains unknown.
- [x] Show and retain projected yards/catches/workload, future/recorded decomposition
      and publisher period through analysis, review and saved results. Protect these
      numbers when trimming optional detail and discard unreferenced forecast pages.
      Keep tentative policy/confidence caps and retrieval-versus-update disclosure.
      Add shared searchable Help with a direct Advice button and revise rookie/trade
      guidance without changing report/schedule settings or credentials.
- [x] Verify the live public feed at 16:51 UTC: 6,190 nonempty weekly forecasts for
      428 players, all five pages available. Score sampled current rookies under the
      explicit temporary Sleeper PPR settings, including exact weeks 5–17; missing
      weekly coverage for the two sampled players without history remains unknown.
      Full-season totals show credited points separately. This proves compatibility,
      not prospective accuracy or complete league/platform coverage.
- [x] Run the existing signed-in GPT-6.1-Sol high-reasoning new rookie case: both
      passes validate. Its weekly estimate is 12 versus owned receiver estimates 15
      and 25; Hold, no selected players, evidence confidence 50, unknown media tone.
      Correct the original pickup expectation and explicitly test an immediate
      starting upgrade, including both owned comparisons. The final targeted native
      rerun passes; this is not a new full twenty-one-case native sweep.
- [x] Pass the final root command: 740 workspace tests (312 API, 164 core,
      180 integrations, 84 dashboard), sixteen evaluator regressions across
      twenty-one controlled cases and two expected platform skips. Final build,
      typecheck, lint, formatting and whitespace checks pass. Manually review
      forecast/scoring/identity/time/source boundaries, cache outages, byte budgets,
      prompt interpretation and unchanged credentials/transaction interfaces;
      no automated security scan runs.
- [x] Pass all 200 Chromium desktop/mobile journeys on the final build, including
      six new public forecast paths for weekly rookie evidence, exact trade horizons,
      both model passes, persistence/settings isolation and Search → FAQ → Advice.
      Inspect readable 1440×1000 and 320×568 number/source screenshots outside the
      repo with no horizontal overflow or runtime errors. Use temporary loopback
      SQLite/dummy providers; no real delivery, roster action, wager, credential
      write, owner-service restart, commit or release. All owned processes are
      terminal. Browser plugin absent, repository Playwright used; other browsers,
      real devices and participant sessions remain outside this verification.
- [ ] Follow-up improvements: broader current personnel, scoring coverage, deeper
      comparisons, media relevance and prospective fantasy/betting validation. The
      requested advisor integration is verified in the completion audit below.

## Advisor completion audit and numerical explanations — October 9, 2026

- [x] Audit the six production modes, saved/signed-in model selection, two-pass
      reasoning, supporting statistics/source closure, confidence factors, risks,
      alternatives, public coverage and unchanged credential/transaction boundaries.
- [x] Run the production service with existing signed-in GPT-6.1-Sol against dated
      public NFL snapshots and a temporary league. Both lineup and moneyline analyses
      validate and save after two passes. The lineup compares 13.51/10.07 forecast
      points while preserving questionable availability; the hypothetical-price bet
      remains Hold because its chronological evaluation has only eleven weeks and
      the calibration lower band is below break-even. No owner league/settings/key,
      actual sportsbook quote, wager or delivery is used.
- [x] Fix repeated explanation units found in those actual model answers. Remove
      only exact adjacent duplicates when rendering new/saved statements, preserve
      different units and paragraphs, and tell both passes that placeholders already
      include units. Pass 165 core tests including the new rendering regression.
- [x] Finish the full native sweep: 21/21 cases and 42/42 valid model calls. After
      its runtime is terminal, rebuild and pass the final six-mode native check
      (6/6 cases, 12/12 valid calls) with the unit instructions. Recheck both actual
      public-data analyses: four valid raw calls, correct cautious decisions and
      readable units; all owned native processes are terminal.
- [x] Pass the final root command with 741 workspace tests (312 API, 165 core,
      180 integrations, 84 dashboard), sixteen evaluator regressions across
      twenty-one fixtures and two expected platform skips. Build, types, lint,
      formatting and whitespace checks pass. No automated security scan runs.
- [x] Pass 204 final Chromium desktop/mobile journeys, including four new exact
      unit/reload paths. Four additional outside-repo journeys display the actual
      native results through temporary production-router SQLite, expand evidence/
      confidence, and reload without generation, delivery or credential writes.
      Inspect 1440×1000 and 320×568 headline/number screenshots; no overflow,
      framework overlay or runtime error. Browser plugin absent, Playwright used.
- [x] Complete the [requirement-by-requirement audit](reviews/2026-10-09-advisor-completion.md).
      All requested local advisor capabilities are implemented and verified;
      broader formats, prospective accuracy, other browsers/devices and installer
      publication remain follow-up work. No owner service restart, commit or release.

## Live prices and measurable prediction results — October 11, 2026

- [x] Implement a typed keyless public ESPN pregame price adapter for moneyline,
      spread and total, verify NFL event/team/kickoff and paired current prices,
      bound network/cache/quote lifetime, and preserve original source times.
- [x] Add explicit fetch/select UI, manual fallback, exact source snapshots and
      pre/post-analysis verification; edited/moved/expired prices cannot masquerade
      as fetched actionable choices. Add searchable Help for prices/performance.
- [x] Add the independent bounded prediction ledger, migration eight, validated
      persistence/restore/salvage, pre-kickoff capture and earliest-target dedup.
      Verify final games and fresh complete player scoring; missing stays unknown.
- [x] Expose fantasy error/bias, betting Brier/odds baseline/calibration, hypothetical
      one-unit settlement/ROI and weekly uncertainty. Export/clear is explicit;
      checks use no inference, credentials, delivery or real wagers.
- [x] Add fixed chronological archived-market evaluation with actual paired prices,
      correct spread sign, no reconstructed current AI predictions or invented
      fills. Bound/cancel CPU replay in a worker outside the service event loop.
- [x] Verify actual DraftKings ESPN prices for Rams–Bills and run the 2024/2025
      public archive replay. All six market/season probability errors are worse
      than the sportsbook baseline; retain this finding rather than tuning on it.
      Positive small-sample paper returns do not establish profitability.
- [x] Pass 756 workspace tests and all root script checks (two expected platform
      skips), types/lint/format/build/whitespace validation and 214 Chromium journeys.
      Verify actual archive results through the temporary API worker and rendered
      desktop/320-pixel UI; add mobile field labels and keep desktop market names
      readable. Twelve final price/Help journeys and two actual-result visual rechecks pass.
      Record scoped manual code/security review in the
      [October 11 evidence](reviews/2026-10-11-live-prices-and-performance.md).
- [ ] Prospective validation (owner/maintainer): record future analyses before
      kickoff, check complete outcomes, and compare scoring/probability error and
      paper returns with matched baselines over substantial future coverage. No
      promised profitability; no old forecasts can be backdated into this record.
- [ ] Broader live market coverage (owner): select a permitted provider if props,
      in-play or additional sportsbooks are required; current keyless public
      coverage remains limited and publisher timestamp/fill availability unknown.

## Improve and retest the prediction model — October 12, 2026

- [x] Diagnose missing opponent/home adjustments and the generic-frequency
      validation mismatch. Develop ratings/regularized odds corrections on
      2016–2021 outcomes; freeze the selected procedure before later comparison.
- [x] Implement paired-price `market-regularized-v2`, typed Home/Neutral parsing,
      correct historical game-specific thresholds and strict pre-week/issuance
      boundaries. Bound cache/work and retain history/prop fallback compatibility.
- [x] Use a matched book baseline for support; withhold game-market picks based
      only on legacy frequency improvement. Preserve separately labeled methods
      and source/quote checks, and disclose book inputs in prompts, results and Help.
- [x] Reproduce real 2022–2025 comparisons: 3,221 non-push matched outcomes, 7.27%
      aggregate lower error versus v1, improvements in all twelve market/season
      samples. Book still wins overall; recent totals remain worse. No model paper
      choice passes the unchanged conservative gates. Do not claim profitability.
- [x] Verify real public Rams–Bills forecasts in all three game markets and exact
      agreement between bounded live and full replay contexts; no inference/wager.
- [x] Pass 762 workspace tests and root script checks (two expected platform skips),
      220 Chromium journeys, four targeted model paths and two actual-result visual
      checks at desktop/320-pixel widths. The real API worker matches the measured
      report; initial viewport, reload, uncertainty labels, console and overflow
      pass. Final types/lint/format/build/whitespace and 21 changed-path tests pass.
      Record scoped manual review in
      [model evidence](reviews/2026-10-12-model-v2-comparison.md).
- [ ] Prospective follow-up (owner/maintainer): collect future pre-kickoff versioned
      records with verified source/fill-time constraints and complete outcomes.
      Historical price timestamps, quarterback/weather effects and sustained
      improvement over book probabilities remain unverified. Keep later evaluation
      separate from any new tuning; no profit guarantee or manufactured selection.

## Further model improvement and consistency audit — October 12, 2026

- [x] Add bounded earlier-week schedule/line/team-residual context and adaptive
      moneyline shrinkage under `market-context-v3`; preserve saved v1/v2 methods
      and unchanged betting qualification gates.
- [x] Freeze older-season candidate selection, retain all eighteen explored rules,
      reproduce the older grid with production context, and report the reused
      2022–2025 comparison against both v2 and paired book probabilities.
- [x] Add reproducible local/live audit commands, pooled weekly uncertainty and
      twelve-comparison simultaneous intervals; never optimize betting returns.
- [x] Finish model/schema/API/rendered regression checks and scoped manual review:
      766 workspace tests, 220 Chromium journeys and two actual-result visual paths
      pass. See [v3 evidence](reviews/2026-10-12-model-v3-comparison.md).
- [ ] Establish consistent superiority with future pre-kickoff predictions and
      complete outcomes. Small pooled retrospective improvement is insufficient;
      most season/market comparisons lose to the book and profit is unestablished.

## Injury, quarterback and weather improvement — October 12, 2026

- [x] Implement typed dated injury, previous/captured quarterback and regional
      forecast context with identity/cutoff/unit/roof checks, bounded providers,
      cloning, cancellation and unknown-data disclosure. Add dated event-linked
      live injury alternatives without inventing archive publication times.
- [x] Freeze five older-season candidate procedures per market; enable joint
      penalty-200 corrections only for supported totals and retain v3 elsewhere.
      Add local snapshot/development/audit reproduction; preserve saved methods
      and all action gates.
- [x] Reproduce 3,221 matched 2022–2025 outcomes against v3/v2/book with production
      and CLI agreement. Totals improve in three seasons, worsen in 2024; only
      five of twelve market/season cells beat the book. Uncertainty spans zero,
      no paper action qualifies, and injury-only diagnostic performance worsens.
- [x] Verify 781 workspace tests/root suites, all 222 Chromium journeys, six focused
      model paths and two actual-result desktop/320-pixel visual checks. Final
      build/types/lint/format/whitespace and live injury/chart/quote checks pass;
      record scoped manual review in
      [v4 evidence](reviews/2026-10-12-model-v4-comparison.md).
- [ ] Collect substantial future pre-kickoff evidence with complete outcomes,
      verify live injury vendor equivalence, confirmed quarterback participation
      and regional forecast reliability. Historical 2025/2026 injury files lack
      dates; older charts lack capture times. Sustained book advantage and
      profitability remain unestablished.

## Better injury/QB data and candidate retest — October 12, 2026

- [x] Add bounded official NFL article discovery and latest-modification cutoffs,
      precise source links, typed prior QB/snap adapters, signed-unit checks,
      strict game/week/identity joins and unknown duplicate/unmatched behavior.
- [x] Recover partial official 2025 injury context (130 games); expose descriptive
      prior roles/efficiency in Advice and searchable Help. Avoid bulk production
      downloads for rejected historical personnel corrections.
- [x] Compare seven older candidates per market, freeze prior procedures and
      retest 3,221 matched outcomes. All new role/QB corrections lose older
      development; official-count numerical trial raises later error. Keep these
      effects disabled, retain exact v3/v4 errors and unchanged action gates.
- [x] Retain reproducible research commands/results/source hashes and a real
      pre-kickoff numeric record with outcomes pending. Pass 790 workspace plus root
      tests, 222 browser journeys and final focused model/provider checks; record
      scoped manual review in the [comparison](reviews/2026-10-12-personnel-data-comparison.md).
- [ ] Establish accuracy advantage using substantial new pre-kickoff records,
      officially confirmed starters, complete dated injury evidence and verified
      quote/fill constraints. Current data improvements do not establish a
      consistent sportsbook advantage or future profit.

## Richer QB/practice model retest — October 12, 2026

- [x] Add typed earlier-game passing/rushing EPA and team-relative QB evidence,
      offensive-line/skill Out roles, Doubtful and injury-related limited/DNP
      practice roles. Keep unknown/partial observations missing and withhold EPA
      for a stale chart that lists the previous QB ruled Out.
- [x] Compare thirteen procedures per market on 2018–2021 only; freeze structure
      and retest 3,221 matched 2022–2025 plus 224 additional 2026 market outcomes.
      Candidate pooled error improves slightly, but only six of twelve historical
      market/season cells beat the book and uncertainty includes zero. Keep the
      correction experimental; retain production probabilities/action gates.
- [x] Save source/code/input hashes, source coverage, candidate selection and
      audit artifacts with reproduction commands; verify future/target/week
      outcome exclusion and descriptive-only production integration. Live 2026
      parsing returns 180 QB/7,277 snap rows, 174 with usable EPA.
- [x] Capture a separate append-only candidate/production/book record for the
      Bills–Rams game at 2:37 p.m. New York, preserving the earlier
      production record. Its immutable prediction is scored in the
      [October 13 receipt](research/2026-10-13-v6-forward-result.json). Pass 797 workspace/root tests,
      types/build/lint/format checks and scoped manual code/security review.
- [ ] Establish consistent sportsbook superiority on substantial new pre-kickoff
      predictions with complete dated injuries and confirmed starters. Reused
      archives and current-season reconstructions cannot establish this.
      [Evidence](reviews/2026-10-12-model-v6-comparison.md).

## Loss diagnosis and alternate tree model — October 13, 2026

- [x] Attribute v6 losses by paired Brier correction cost/alignment and individual
      layers, season phases, line groups and source coverage. Identify persistent
      2024 Under bias, the 2023 personnel moneyline loss, midseason spread errors
      and inherited 2025 errors. Keep subgroup explanations descriptive.
- [x] Implement research-only time-decayed shallow boosted trees that correct the
      book directly, with optional past-only adaptive book blending. Compare
      eighteen procedures per market on older 2018–2021 data; freeze before audit.
- [x] Retest 3,221 matched archive and 224 prior current-season outcomes. Trees
      beat archived totals in all four seasons but lose moneyline/spread overall
      and current totals; pooled Brier 0.23691737 exceeds book 0.23666635. Keep
      the correction experimental and preserve production methods/action gates.
- [x] Score the previously issued v6 Bills–Rams record with final 37–34 evidence
      in a separate immutable-reference receipt. Two lower market errors and one
      higher total error are one game cluster, not an established edge.
- [x] Save diagnostic/selection/code/source/audit hashes, reproduction commands
      and scoped manual review. Pass 799 workspace/root tests and final checks.
      [Evidence](reviews/2026-10-13-model-v7-comparison.md).
- [ ] Verify any totals specialization on substantial newly issued forecasts and
      complete outcomes, with contemporaneous prices/injuries. All reused audits
      and small forward samples remain insufficient for sustained superiority.

## Totals hybrid and seasonal adaptation — October 13, 2026

- [x] Implement research hybrid using the frozen totals tree and exact existing
      v3 moneyline/spread probabilities. Preserve all live dispatch/action gates.
- [x] Add bounded weekly-decayed recalibration, explicit season carry/reset,
      earlier calibrated forecast/book blending, duplicate rejection and caller
      isolation. Compare sixteen adaptations plus plain hybrid on older data.
- [x] Freeze the plain hybrid and separately best enabled seasonal correction,
      then retest 3,221 archive and 224 fixed current-season market outcomes.
      Plain hybrid error 0.23638752 beats book 0.23666635 in aggregate and seven
      of twelve cells. Seasonal correction worsens both development and audit;
      recent totals still regress. Keep numerical changes experimental.
- [x] Save source/code/frozen/audit artifacts and verify exact non-total production
      invariance, earlier total reproduction, 802 workspace/root tests, final
      checks and scoped manual review.
      [Evidence](reviews/2026-10-13-model-v8-hybrid-comparison.md).
- [ ] Establish sustained advantage from substantial newly issued hybrid forecasts
      and completed outcomes. Reused archive gains, uncertainty and current totals
      failures do not authorize a production switch or profitability claim.

## 2026 totals diagnosis and online adaptation — October 13, 2026

- [x] Decompose the 77-case totals loss by correction variance/alignment, week,
      direction and magnitude. Identify bad game-level corrections (34/77 point
      the right way) and Weeks 4–5 losses despite a near-correct average Over rate.
- [x] Implement totals-only fixed-share-inspired expert mixing of book, slow/fast
      trees and production totals. Verify prior-week learning, season reset/carry,
      recovery, bounded weights/caches and exact moneyline/spread preservation.
- [x] Compare sixteen mixtures plus plain hybrid on older data, freeze the plain
      selection and separately best enabled mixture, then retest against book.
      New mixture reduces 2026 excess totals error about 85% but still loses
      (0.25045825 versus 0.25004633), sacrifices older/archive accuracy and fails
      to improve over a fixed-weight diagnostic control. Keep it experimental.
- [x] Save diagnostics/weekly weights/source-code hashes/frozen audits and verify
      805 workspace/root tests, final checks and manual review.
      [Evidence](reviews/2026-10-13-model-v9-expert-comparison.md).
- [ ] Establish useful new totals signals and sustained prospective accuracy.
      Reused current-sample loss reduction and synthetic regime recovery do not
      establish learned adaptation value, consistent edge or profitable betting.

## Fixed-mixture diagnosis and game-level totals signals — October 13, 2026

- [x] Diagnose the fixed control independently: 36/77 current corrections point
      correctly, about 81% of its excess error comes from negative alignment,
      and the slow expert dominates that alignment loss. Diagnose its small
      2024 variance-versus-alignment failure separately.
- [x] Add bounded typed team-stat ingestion, historical franchise joins and
      earlier-week opponent-adjusted passing/rushing EPA, play-volume,
      explosive-play, first-down and interaction signals. Save raw hashes,
      exact reparse and all ten excluded join rows without changing old contexts.
- [x] Compare trees/ridge and feature-free/book/production/fixed/plain controls
      on 2018–2021, freeze parameters/code/input hashes, then audit 3,221 archive
      and 224 fixed current outcomes. New-feature totals beat book in four archive
      seasons but lose 2026 (0.25076852 versus 0.25004633) and worsen the fixed
      mixture there. Plain hybrid remains the older-data selection.
- [x] Keep moneyline/spread probability differences exactly zero and retain
      production v3/v4 dispatch. Verify 812 workspace tests plus root suites,
      typecheck/lint/build/format/diff checks and scoped manual review.
      [Evidence](reviews/2026-10-13-model-v10-matchup-comparison.md).
- [ ] Establish stronger incremental game ranking and sustained performance from
      new issued forecasts with contemporaneous source snapshots. Reused archive
      wins, current feature-ablation improvements and near-perfect mean calibration
      do not establish consistent superiority or profit.

## Prediction-market and headline totals research — October 13, 2026

- [x] Add read-only bounded typed Kalshi/Polymarket discovery, exact full-game/
      half-point joins, pre-cutoff price/trade collection, rate spacing/retries,
      completion gates and source hashes. Exclude clamped settlement payouts,
      overlapping price windows and post-cutoff trades; retain normalized gzip
      inputs to remove temporary-file replay dependency.
- [x] Implement separate price, flow, headline and combined ridge corrections
      with thirty-earlier-game gates, past-only shrunken wallet weighting and
      exact non-total preservation. Capture dated headlines prospectively;
      never backfill current text, holders or leaderboard winners.
- [x] Freeze fixed settings and replay 79 completed 2026 totals. Combined and
      flow point estimates beat book (0.25013828/0.25018439 versus 0.25026877),
      but whole-sample uncertainty includes zero. Price-only still loses;
      historical sentiment has no valid sample. Keep production unchanged.
- [x] Seal fourteen upcoming Week 6 numeric forecasts with verified live book
      pairs and unchanged historical training tapes. Add independent final-result
      scoring without updating issued records; all fourteen remain pending.
- [x] Verify 819 workspace tests plus root suites, final checks and scoped manual
      review. [Evidence](reviews/2026-10-13-model-v11-external-markets.md).
- [ ] Evaluate prospective forecasts as genuine final results arrive, and gather
      enough timestamped media/wallet histories to establish incremental value.
      Reused point wins, one active historical wallet-weight feature, and two
      later-week clusters do not establish consistent edge or profitable wagers.

## Historical external totals expansion — October 13, 2026

- [x] Add separate archive adapters, legacy contract/price validation and
      seven-day trade history. Retain 509 matched tapes and 135,310 executions
      with hashed wallet identifiers, source provenance and reproducible inputs.
      Recover sixteen 2024 exact-line contracts; checked 2023 sources remain empty.
- [x] Test sportsbook/production offsets, stronger shrinkage, rolling two-season
      weekly fits and earlier-flow/wallet features. Select on 2024/early 2025;
      freeze before late 2025/reused 2026 audit. Keep the selected model fixed
      through a separately preserved four-contract source-coverage correction.
- [x] Replay 890 totals over 2023–2026. Combined audit improves over the older
      external algorithm but loses book/production; 2026 point win does not
      establish consistent edge. Preserve moneyline/spreads exactly and verify
      earlier forecast/source seals. [Evidence](reviews/2026-10-13-model-v12-historical-totals.md).
- [x] Verify 827 workspace tests plus root suites, typecheck/lint/format/build,
      durable compressed-input replay and scoped ordinary manual review.
- [ ] Obtain more independent prospective wallet/price histories and outcomes
      before any promotion. 2023 fallback and 2024 cold-start ties are not wins.

## Seasonal external totals retest — October 13, 2026

- [x] Reproduce v12 forecasts and decompose late-2025 Brier loss. Wrong-way
      corrections account for 89.4% of excess loss; unsigned coverage/liquidity
      blocks dominate movement. Preserve diagnostic ablations as retrospective.
- [x] Compare eight fixed recency/reset/feature candidates on 2024/early 2025.
      Select a four-week decay, season reset and honest earlier-forecast feedback;
      freeze settings/source/data/diagnosis before reused late-2025/2026 audit.
- [x] Retest 890 totals and exact non-total preservation. Reduce late-2025 excess
      loss by 44.6%, but still lose late 2025 and combined audit. 2026 gain is tiny
      and confined to one active week; keep production/issued forecasts unchanged.
      [Evidence](reviews/2026-10-13-model-v13-seasonal-external-totals.md).
- [x] Verify 831 workspace tests plus root suites, final typecheck/lint/format/build,
      exact durable-input replay, parent audit/forecast integrity and scoped
      ordinary manual code/security review.
- [ ] Establish incremental value on independent timestamped prospective games.
      Better fallback behavior and repeated historical point wins are not proof
      of consistent sportsbook edge or profitable bets.

## Remove unsigned external totals predictors — October 13, 2026

- [x] Reproduce v13 predictions and diagnose remaining late-2025 loss: Week 12
      accounts for 99.0% of net excess loss, with coverage/volume pushing Over
      while only 4/14 games go Over. Preserve fixed-fit diagnostic ablations.
- [x] Force removal of both providers' coverage flags and unsigned relative
      volume; retain signed features and source eligibility guards. Freeze a
      stricter price-only control too. Inherit adaptation settings without search.
      Refit coefficients and prequential feedback independently for each policy.
- [x] Replay 890 totals with paired book/v13 comparisons. Primary removal reduces
      late-2025 excess loss by 85.0% but still loses; price-only is effectively
      book with no edge. Preserve exact moneyline/spread outputs and production.
      [Evidence](reviews/2026-10-13-model-v14-directional-totals.md).
- [x] Verify 835 workspace tests plus root suites, typecheck/lint/format/build,
      exact two-policy durable-input replay, parent/source/forecast seals and
      scoped ordinary manual code/security review.
- [ ] Establish independent prospective value before promotion. Tiny price-only
      departures or exact baseline fallbacks are not incremental forecast wins.

## Canonical direction and robust signed-flow retest — October 13, 2026

- [x] Identify and correct the legacy Kalshi same-bit direction bug from official
      source semantics and original SHA-verified responses. Join all 117,536
      executions; correct 70,673 mislabeled Over rows. Preserve old inputs/records,
      quarantine legacy Kalshi directions from new robust flow, and retain a
      durable repair patch. Earlier signed-flow attribution is known defective.
- [x] Add versioned canonical parser and centered, capped minute/actor flow;
      aggregate before caps/large-bucket classification, keep source gates, and
      compare a stricter contemporaneous price-confirmation control. Freeze all
      parameters and inherit seasonal adaptation without audit-based selection.
- [x] Retest direction repair alone and both revised representations on 890
      totals, with unchanged moneyline/spreads. Robust primary essentially returns
      book; tiny combined/2026 point wins and late-2025 loss do not establish edge.
      Preserve production and issued forecasts; disclose defect on interpretation.
      [Evidence](reviews/2026-10-13-model-v15-robust-trade-flow.md).
- [x] Verify 842 workspace tests plus root suites, final typecheck/lint/format/build,
      byte-exact corrected-data reconstruction from durable source/patch, all
      three policy replays and unchanged parent/forecast seals; complete scoped
      ordinary manual code/security review.
- [ ] Establish independent prospective incremental value using canonical inputs.
      Correcting the source and suppressing weak corrections are necessary data
      quality repairs, not proof of consistently profitable predictions.

## Stronger football totals signals — October 13, 2026

- [x] Reproduce corrected v15 and separate weak support, small feature/coefficients and feedback shrinkage. Ungated flow still loses late 2025.
- [x] Capture 2019–2026 PBP, validate paired identities/drive clocks and quarantine 39 unavailable historical games; retain selected raw fields and normalized inputs for exact offline derivation.
- [x] Add opponent-adjusted drive scoring/opportunity/clock and neutral efficiency/pass/no-huddle features, with a continuous book-line residual learner and earlier-forecast feedback. Compare football-only and football-plus-flow at two fixed penalty strengths; freeze development selection before audit.
- [x] Retest 890 totals. Frozen primary beats reused 2026 and combined audit, but loses late 2025 and the full comparison. Added flow slightly worsens both later phases. Keep production and exact moneyline/spreads unchanged. [Evidence](reviews/2026-10-13-model-v16-drive-totals.md).
- [x] Verify 851 workspace tests plus root suites, typecheck/lint/format/build, exact selected-source reconstruction/full four-candidate replay, parent/issued seals and scoped ordinary manual code/security review.
- [ ] Establish independent prospective incremental value before any promotion; repeated historical point gains are not consistent sportsbook edge.

## Recent totals feedback and seasonal adaptation — October 13, 2026

- [x] Reproduce v16 raw/final forecasts and diagnose late-2025 loss: underlying corrections overwhelmingly favor Over, while trust lags losses and recovery. Keep source forecasts/features/fitting and no-flow choice fixed.
- [x] Separate feedback memory from model fitting, add a six-week window, two/four-week decay, half/full correction cap, and reset/limited fading prior seed. Verify current/future exclusion, sparse evidence guards and recovery using raw forecasts while trust is zero.
- [x] Select two-week decay, half cap and reset using 390 reused development games only; freeze eight variants before audit. Retest all 890 totals: late-2025, combined and full-sample point gains; smaller 2026 gain, still 2023/2024 losses. Preserve exact moneyline/spreads and production. [Evidence](reviews/2026-10-13-model-v17-recent-feedback.md).
- [x] Verify 857 workspace tests plus root suites, typecheck/lint/format/build, exact fresh-input eight-candidate replay, parent/source/issued seals and scoped ordinary manual code/security review.
- [ ] Establish independent prospective incremental value before promotion. Reused aggregate wins and a nominal five-week current-season interval are not consistent sportsbook edge.

## Weak-season totals stability — October 13, 2026

- [x] Reproduce v17 and decompose 2023/2024 losses, including dependence on individual recent winning weeks and transfers across correction directions. The raw source itself also loses both seasons.
- [x] Add weekly uncertainty penalties and leave-week-out stability, each pooled/directional, retaining frozen source forecasts and v17 temporal/cap/reset settings. Require three weeks and protect policy/cache mutation.
- [x] Select six fixed candidates on 537 matched 2021–2022 totals before the 2023–2026 replay. Disclose diagnosis-informed reused evidence and later-selected inherited source settings.
- [x] Retest 890 totals: reduce primary 2023/2024 excess losses by 14.7%/91.3%, but still lose both; regress late 2025 and full sample. Reject promotion and preserve exact moneyline/spreads, production and issued records. [Evidence](reviews/2026-10-13-model-v18-stable-feedback.md).
- [x] Verify 863 workspace tests plus root suites, typecheck/lint/format/build, exact fresh-input six-candidate replay, parent/source/issued hashes and scoped ordinary manual code/security review.
- [ ] Establish independent prospective value and stable conditional improvements. Book-copy ties and a different historical winner for each season are not a consistent model edge.

## White default and optional dark appearance — October 13, 2026

- [x] Replace cream surfaces with a white default and semantic light/dark colors across the dashboard, controls, statuses, and dialogs.
- [x] Add a header Dark mode switch and Settings → Appearance radios. Save a device-local preference, synchronize both controls and other tabs, and restore before rendering through a local CSP-compatible script. Handle unavailable storage without blocking the app.
- [x] Persist Electron appearance independently of its changing loopback port using a private atomic file, allowlisted trusted-dashboard IPC, cached startup reads, and serialized writes drained on quit. Verify reload, restart on a new port, rapid writes, and invalid input in a focused Electron 44.4.5 harness.
- [x] Verify desktop (1440 × 1000) and mobile (390 × 844) in headed Chrome against an isolated real API fixture: both modes, reload persistence, Settings synchronization, keyboard radios, and blocked-storage fallback. Record scoped manual review and code checks in [appearance review](reviews/2026-10-13-appearance.md).

- [x] Refine dark mode to a pure black canvas and neutral charcoal surfaces/text/dividers, including matching browser chrome, startup script, and Electron window backgrounds. Preserve the white default and saved theme behavior.

## Models and all advice workflows review — October 13, 2026

- [x] Review production fantasy estimates, all six decision workflows, betting probability/price gates, and rejected totals research. Research exact assignment and chronological probability evaluation from primary documentation.
- [x] Replace order-dependent draft FLEX/Superflex allocation with joint league-wide assignment; verify against exhaustive small-pool allocations and supported maximum size.
- [x] Require explicit GSIS matches for both individual scoring and workload context; preserve independent imports. Separate selected fantasy-model error from rejected-candidate error.
- [x] Add optional owned-player waiver drop, complete before/after optimization and source-linked metrics, inactive-player guards, Hold for non-improving moves, and visible add/drop evidence requirements in both model passes. Verify ownership before inference.
- [x] Require historical sportsbook validation for betting action gates, including player props; preserve forecast probabilities, history and all frozen v18 research code hashes.
- [x] Expand controlled decision cases for beneficial and losing drops, repair/final-rejection checks, and desktop/mobile interaction verification. Complete scoped manual code/security review; see [evidence](reviews/2026-10-13-advice-model-review.md).
- [x] Reverify isolation/protocol support for installed Codex CLI `0.162.0-alpha.17.2` before enabling that exact version on macOS. Captured-request proof and signed-in probe pass after isolation fixes; the fresh full quality retest is tracked in the compatibility section below. The original preflight failure remains recorded.
- [ ] Establish prospective player forecast quality and consistent sportsbook improvement; reused archive point wins and controlled decision tests do not prove either.

## Codex CLI compatibility and fresh advice quality — October 13, 2026

- [x] Verify installed 0.162.0-alpha.17.2 against official CLI documentation and native protocol/model metadata; keep adjacent and future versions blocked.
- [x] Capture outgoing requests and fix global instruction reads, skill rendering, model-catalog capability overrides and `input.additional_tools` declarations. Share production builders with the opt-in loopback proof and verify both fixture and existing native homes. Preserve native login in place.
- [x] Add exact macOS version support, scoped OS read restriction, strict startup-notice validation, owned tool-free catalog, explicit orchestrator/agent disables and focused regression/lifecycle checks. [Compatibility review](reviews/2026-10-13-codex-compatibility.md).
- [x] Verify source checks, eight adapter regressions, ordinary manual code/security review and all 51 sealed football-model source hashes unchanged. No automated security scan or owner service restart.
- [x] Finish fresh production-path GPT-6.1-Sol analysis/review quality tests: 23/23 fixed cases across all six workflows, 46 validated calls and zero validation/grading failures. Retain unchanged raw-answer grading, the earlier preflight failure and the prospective-accuracy limits. [Quality record](research/2026-10-13-codex-advice-quality.json).
- [ ] Verify newer native CLI isolation and installers on Windows/Linux before expanding support beyond macOS. The latest macOS ARM package is verified in the installer review above. Owner: project maintainer.

## Local imsg iMessage support — October 13, 2026

- [x] Review existing BlueBubbles-only support and upstream/current native imsg JSON, group and send protocols; verify installed 0.15.10 with a version-only typed probe.
- [x] Add optional macOS provider, explicit installation/chat discovery, stable GUID delivery, selected-ID/GUID history validation, bounded subprocesses and sanitized errors. Preserve legacy provider defaults and immutable retry destination/body/executable identity.
- [x] Reuse guarded manual/interval sync, initial-mention baseline, deduplication, namespaces and message-time retention. Recheck provider/configuration/consent across provider and AI waits; require renewed automation consent after provider changes.
- [x] Add Settings, Imports, Search and Help; inspect and repair desktop/mobile rendering with fictional chats and an isolated API/SQLite fixture. [Review](reviews/2026-10-13-imsg-support.md).
- [x] Complete final source checks and record results: 892 workspace tests plus repository script/integration suites, typecheck, lint, build, format and diff checks; all 51 sealed v18 source hashes unchanged. See the review for live/native limitations.
- [ ] Owner: grant Full Disk Access/Automation to the actual app/service and explicitly verify an intended live conversation/send before relying on real or packaged delivery. No owner messages sent during implementation.

## Six weekly-decision recommendations — October 13, 2026

- [x] Lead Home with selected-team weekly decisions, freshness, saved availability flags and scoped saved advice; retain reports/review queues.
- [x] Lead advice results with choice, conditional change, alternative and reconsideration; distinguish quality labels from probabilities.
- [x] Add no-AI readiness checks, preflight cancellation/recovery and immutable saved readiness, including dated injury coverage.
- [x] Separate betting research and fixed-code prospective cohorts, matched verified quotes, calibration and weekly uncertainty; preserve numerical models and research-only sentiment/whale signals.
- [x] Extend the fantasy journal with supported pre-kickoff hypothetical comparisons and scoring/league/position/season/horizon-aware projection errors.
- [x] Add team-before-AI setup, native team persistence and explicit messaging readiness; isolate desktop tests from owner preferences/data/OS credentials.
- [x] Record final source, desktop/mobile browser, packaged Mac and artifact checks in the [review](reviews/2026-10-13-weekly-decision-workflows.md).
- [ ] Owner release gates: signing/notarization, published upgrade, current Windows/Linux/Intel interactive testing and intended live-provider/TCC verification. Do not claim a sportsbook edge until independent prospective evidence supports it.

## Real-data six-workflow advice review — October 13, 2026

- [x] Capture actual current NFL/Sleeper/ESPN/news/injury evidence and verify identity, temporal scope, duplicates and coverage; use isolated synthetic PPR roster scenarios.
- [x] Run 20 analyses/40 validated model responses across all six workflows, preserve initial missing-data cases and retest corrected/supported cases; manually review usefulness and source interpretation.
- [x] Fix verified bench-bye coverage, PUP/NFI exclusions, narrow publisher suffix identity, saved-starter context, specific compliant Hold headlines and quantified one-spot/multi-waiver summaries.
- [x] Independently check 190 scoring/roster/price calculations; retain public capture and scoped evidence without owner settings/history or credentials.
- [x] Pass 906 workspace tests/root suites, 78 desktop/mobile regression journeys and 48 final affected journeys; finish source and actual-result rendering checks in the [review](reviews/2026-10-13-real-advice-quality.md).
- [ ] Establish prospective prediction accuracy and executable sportsbook edge; retain missing dated injury/full-season evidence and supported-format limits.
