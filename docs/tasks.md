# Project tasks

Use [release status](release-status.md) for readiness and release gates,
[the support matrix](support-matrix.md) for provider/OS verification, and
[the product plan](implementation-plan.md) for scope. Completed tasks describe checked source
behavior, not public release readiness. Prior detailed implementation evidence is retained in
the archived task records ([through 2026-09-28](reviews/2026-09-28-task-history.md), [through 2026-10-18](reviews/2026-10-18-task-history.md)).

Open items are grouped under the section that introduced them. When an item is finished, delete
it and add a short line to "Completed (summary)"; add a dated review only when
[the docs guide](README.md) calls for one.

## Completed (summary)

Recent passes, newest first. Details are in `decisions.md` and the dated reviews.

- October 23 (latest): matchup win probability and likely ranges (calibrated on 2026), a
  forecast-wind adjustment (fitted on 2025, confirmed on 2026), and game-day inactive alerts with a
  bench replacement.
- October 23 (later): running backs gain carries when a teammate back is ruled out (fitted on
  2025, confirmed on 2026); markdown docs consolidated, 17 model reviews into one history file.
- October 23: desktop right-click menu (edit, copy, links, spelling; Inspect in development
  builds); starters whose games have begun are locked in lineup, waiver and Waiver day math, the
  AI lineup analysis and chat; own weekly projections for every position (`sidekick-model-v1`)
  with ESPN projections removed; prop line ledger (`prop-lines.sqlite`) and snap-share and
  depth-chart prop features.
- October 22: Ask Sidekick chat (Ask page and ⌘J panel) from read-only lookups; live scoring from
  ESPN's public NFL box scores under each league's rules; props board in Advice with a backtested
  prop model, calibrated spreads and graded pre-kickoff leans; published prop lines fill the prop
  form (ESPN lines without a key, other books with an optional Odds API key); Home, Reports, Advice
  and Live tidy-ups.
- Earlier: see the archived task records linked above and the
  [betting model history](reviews/2026-10-betting-model-history.md).

## Open work

### Ask Sidekick chat and UI tidy — October 22, 2026

- [ ] Close the gap to ESPN's accuracy (5.50 vs 5.28 points on the same games). Calibration, an early-season blend and QB-specific changes were tested and did not help; next candidates are teammate correlation in win probability, an in-game win chance from the game clock, a returning-teammate adjustment, using vacated carries in prop leans, and target redistribution once more injury seasons are available.
- [ ] Once 3+ weeks of closing lines are saved, score the prop model against them (log loss and hit rate at the closing line).
- [ ] After 150+ graded props, check the refit market weight and Brier score; if the model's Brier isn't below 0.25, set the weight to 0 (no leans).
- [ ] Re-run `node scripts/research/prop-model-backtest.mjs out.json --emit packages/core/src/prop-model-settings.ts` after the season to refit with a full 2026.
- [ ] Measure chat answer quality and speed on each AI connection with a fixed question set; Codex rounds take tens of seconds each.

### Product pass — October 21, 2026

- [ ] Owner: choose where the app runs (stay local, read-only home-network view with a threat model, or managed service). See `decisions.md`.
- [ ] Owner: provide an Apple Developer ID and notarization credentials so macOS builds can be signed; until then installers show an unidentified-developer warning.
- [ ] Track league storylines and running jokes week to week in reports, building on member memory (needs AI and owner-approved chat history).

### Advice data and setup pass — October 21, 2026

- [ ] Owner: add ESPN `espn_s2`/`SWID` access in Settings → Credentials, then use Afton's "Import updated roster" → Connect league to switch it from snapshot to automatic refresh.

### Afton walkthrough and polish — October 18, 2026

- [ ] Rebuild the macOS installer with `npm run desktop:make` while the desktop app is closed (it replaces `apps/desktop/out/`), then relaunch and confirm the Afton league, selected team and drafts survive.
- [ ] Generate one report and one advice result with the new `gpt-6-luna` default and a real API key; confirm the 4,000-token budget produces complete text. [Review](reviews/2026-10-18-afton-ux-pass.md).

### Owner Afton verification and usability — October 15, 2026 (local batch verified)

- [ ] Owner setup dependencies: authorize ESPN provider refresh, grant packaged Messages Full Disk Access if desired, and configure an email provider. No OS grants or missing credentials are fabricated. Prospective predictive usefulness remains unestablished.

### Shorter primary workflows — October 14, 2026

- [ ] Maintainer: perform a fresh owner usability session on the rebuilt preview; participant task completion/time is not established by browser regression checks.

### Latest installer rebuild and packaged advice — October 13, 2026

- [ ] Maintainer: complete Developer ID/notarization, published upgrade, other-OS/Intel interactive checks and live owner messaging/TCC before expanding release claims. No owner app replacement or public release was performed.

### Remaining validation and release work

- [ ] Verify credentialed signing/notarization, owner-device lifecycle, and a signed published-release upgrade.
- [ ] Complete owner-authorized live provider/model/delivery checks and broader fantasy-format semantics.
- [ ] Repeat performance checks on slower hardware and with live providers.
- [ ] Complete the publication review and publish reviewed artifacts after owner approval.

### Local operations improvements

- [ ] Complete current-source Windows/Intel native verification, signing/notarization, published signed-upgrade testing, and owner-selected private provider/model/delivery checks. Local macOS packaging was attempted but native compilation is blocked by missing Xcode/CLT version detection.

### Beginner-friendly experience

- [ ] Validate these flows with representative nontechnical users and live provider accounts; local browser fixtures do not establish production provider onboarding or native accessibility.

### Tasks, sample mode, and searchable help

- [ ] Run the study with willing nontechnical participants and record anonymous findings;
      participant details are pending. Automated browser journeys are not a user study.
- [ ] Resolve hosted service/operator/account, auth, budget, and data policy, implement
      the optional managed AI connection, and review a concrete staging build before
      production enrollment/deployment. No hosted connection exists yet.

### Fantasy and betting advisor — implementation history

- [ ] Improve opponent/injury/role forecasts, provider scoring/identity coverage,
      prediction evaluation, public news/perception context and abstention rules.
- [ ] Evaluate real model decision quality, quantitative opponent/role context,
      broader abstention cases and larger-league prompt budgets.
      Live public feeds and dummy-model tests do not prove recommendation quality.

### Advisor model selection and evidence limits (October 7, 2026)

- [ ] Complete real recommendation-quality evaluation, quantitative opponent/role
      context, empirical betting forecast evaluation, broader data/scoring coverage,
      public-perception robustness and larger-league context budgeting. Goal remains
      active; current unconditional betting Hold is an interim evidence constraint.

### Advisor matchup evidence and context budgets (October 7, 2026)

- [ ] Evaluate real model decision quality and empirical betting forecasts, improve
      current injury and public-perception grounding, extend scoring/identity support,
      and verify unusual/deeper league formats and larger required context. Descriptive
      evidence is implemented; predictive edge remains unproven and the goal stays active.

### Advisor media coverage and UI verification (October 7, 2026)

- [ ] Evaluate live media relevance, real model quality and calibrated betting methods;
      improve injury/scoring coverage and verify real devices and other browsers.
      The broader advisor goal remains active.

### Advisor injury evidence (October 7, 2026)

- [ ] Improve timestamped live injury coverage and evaluate injury-aware forecasts;
      finish real-model quality and empirical betting evaluation. Goal remains active.

### Rolling betting evaluation (October 7, 2026)

- [ ] Improve player-prop cohort/role/opponent models and current condition coverage;
      evaluate real AI decisions, prospective probability quality and actual market
      prices. Historical evaluation is initial evidence; the broader goal stays active.

### Advisor quality evaluation and actual lineup choices (October 7, 2026)

- [ ] Resolve observed latency/format failures and verify model access and
      recommendation quality across all six modes.
- [ ] Repeat the complete live sweep with the added roster/draft context and diagnose
      intermittent waiver-review failure before claiming reliable six-mode quality.
- [ ] Improve timestamped current injury data, quantitative role/opponent/prop forecasts,
      scoring/identity/deeper-league coverage, live perception and prospective betting
      evaluation. Keep the original advisor goal active until its full scope is verified.

### Signed-in Codex integration (October 7, 2026)

- [ ] Investigate the intermittent waiver review failure: a targeted retry passes
      with normal native events, but neither a root cause nor a fix is established.

### Current live decision and media verification (October 7, 2026)

- [ ] Evaluate real player/team media relevance and improve current injury/future
      forecasts and prospective betting verification. The original goal remains active.

### Automatic draft/trade forecasts and kickoff boundaries (October 7, 2026)

- [ ] Continue real-media relevance, calibration and injury/rookie/deeper-roster coverage.
- [ ] Extend larger/deeper comparisons: a forty-player public-data sample still
      exceeds saved evidence limits. Improve weekly/prop/current-injury forecasts,
      prospectively evaluate accuracy and availability, broaden scoring/rookie/identity
      coverage and check live media relevance. The original advisor goal remains active.

### Focused start/sit — October 7, 2026

- [ ] Extend actual DST/rookie/current-injury and deeper-roster forecast coverage.
      Kicker scoring and estimates are now implemented; see the October 9 work below.
      Prospective accuracy and trustworthy current availability remain unverified.

### Team-defense evidence and forecasts — October 9, 2026

- [ ] Broaden custom/platform defense scoring, current personnel/injury/rookie
      evidence, deeper comparisons, media relevance and prospective prediction/
      market-price checks. The original advisor goal remains active.

### Offensive fumble touchdown evidence — October 9, 2026

- [ ] Continue current personnel/rookie evidence, deeper comparisons, broader
      scoring/platform formats, media relevance and prospective forecast/market
      validation. The original advisor goal remains active.

### Rookie draft evidence and missing comparisons — October 9, 2026

- [ ] Continue player-specific forecasts for rookies before NFL history, current
      personnel, deeper comparisons, scoring breadth, live media relevance and prospective
      fantasy/betting validation. The original advisor objective remains active.

### Public individual forecasts — October 9, 2026

- [ ] Follow-up improvements: broader current personnel, scoring coverage, deeper
      comparisons, media relevance and prospective fantasy/betting validation. The
      requested advisor integration is verified in the completion audit below.

### Live prices and measurable prediction results — October 11, 2026

- [ ] Prospective validation (owner/maintainer): record future analyses before
      kickoff, check complete outcomes, and compare scoring/probability error and
      paper returns with matched baselines over substantial future coverage. No
      promised profitability; no old forecasts can be backdated into this record.
- [ ] Broader live market coverage (owner): select a permitted provider if props,
      in-play or additional sportsbooks are required; current keyless public
      coverage remains limited and publisher timestamp/fill availability unknown.

### Improve and retest the prediction model — October 12, 2026

- [ ] Prospective follow-up (owner/maintainer): collect future pre-kickoff versioned
      records with verified source/fill-time constraints and complete outcomes.
      Historical price timestamps, quarterback/weather effects and sustained
      improvement over book probabilities remain unverified. Keep later evaluation
      separate from any new tuning; no profit guarantee or manufactured selection.

### Further model improvement and consistency audit — October 12, 2026

- [ ] Establish consistent superiority with future pre-kickoff predictions and
      complete outcomes. Small pooled retrospective improvement is insufficient;
      most season/market comparisons lose to the book and profit is unestablished.

### Injury, quarterback and weather improvement — October 12, 2026

- [ ] Collect substantial future pre-kickoff evidence with complete outcomes,
      verify live injury vendor equivalence, confirmed quarterback participation
      and regional forecast reliability. Historical 2025/2026 injury files lack
      dates; older charts lack capture times. Sustained book advantage and
      profitability remain unestablished.

### Better injury/QB data and candidate retest — October 12, 2026

- [ ] Establish accuracy advantage using substantial new pre-kickoff records,
      officially confirmed starters, complete dated injury evidence and verified
      quote/fill constraints. Current data improvements do not establish a
      consistent sportsbook advantage or future profit.

### Richer QB/practice model retest — October 12, 2026

- [ ] Establish consistent sportsbook superiority on substantial new pre-kickoff
      predictions with complete dated injuries and confirmed starters. Reused
      archives and current-season reconstructions cannot establish this.
      [Evidence](reviews/2026-10-betting-model-history.md).

### Loss diagnosis and alternate tree model — October 13, 2026

- [ ] Verify any totals specialization on substantial newly issued forecasts and
      complete outcomes, with contemporaneous prices/injuries. All reused audits
      and small forward samples remain insufficient for sustained superiority.

### Totals hybrid and seasonal adaptation — October 13, 2026

- [ ] Establish sustained advantage from substantial newly issued hybrid forecasts
      and completed outcomes. Reused archive gains, uncertainty and current totals
      failures do not authorize a production switch or profitability claim.

### 2026 totals diagnosis and online adaptation — October 13, 2026

- [ ] Establish useful new totals signals and sustained prospective accuracy.
      Reused current-sample loss reduction and synthetic regime recovery do not
      establish learned adaptation value, consistent edge or profitable betting.

### Fixed-mixture diagnosis and game-level totals signals — October 13, 2026

- [ ] Establish stronger incremental game ranking and sustained performance from
      new issued forecasts with contemporaneous source snapshots. Reused archive
      wins, current feature-ablation improvements and near-perfect mean calibration
      do not establish consistent superiority or profit.

### Prediction-market and headline totals research — October 13, 2026

- [ ] Evaluate prospective forecasts as genuine final results arrive, and gather
      enough timestamped media/wallet histories to establish incremental value.
      Reused point wins, one active historical wallet-weight feature, and two
      later-week clusters do not establish consistent edge or profitable wagers.

### Historical external totals expansion — October 13, 2026

- [ ] Obtain more independent prospective wallet/price histories and outcomes
      before any promotion. 2023 fallback and 2024 cold-start ties are not wins.

### Seasonal external totals retest — October 13, 2026

- [ ] Establish incremental value on independent timestamped prospective games.
      Better fallback behavior and repeated historical point wins are not proof
      of consistent sportsbook edge or profitable bets.

### Remove unsigned external totals predictors — October 13, 2026

- [ ] Establish independent prospective value before promotion. Tiny price-only
      departures or exact baseline fallbacks are not incremental forecast wins.

### Canonical direction and robust signed-flow retest — October 13, 2026

- [ ] Establish independent prospective incremental value using canonical inputs.
      Correcting the source and suppressing weak corrections are necessary data
      quality repairs, not proof of consistently profitable predictions.

### Stronger football totals signals — October 13, 2026

- [ ] Establish independent prospective incremental value before any promotion; repeated historical point gains are not consistent sportsbook edge.

### Recent totals feedback and seasonal adaptation — October 13, 2026

- [ ] Establish independent prospective incremental value before promotion. Reused aggregate wins and a nominal five-week current-season interval are not consistent sportsbook edge.

### Weak-season totals stability — October 13, 2026

- [ ] Establish independent prospective value and stable conditional improvements. Book-copy ties and a different historical winner for each season are not a consistent model edge.

### Models and all advice workflows review — October 13, 2026

- [ ] Establish prospective player forecast quality and consistent sportsbook improvement; reused archive point wins and controlled decision tests do not prove either.

### Codex CLI compatibility and fresh advice quality — October 13, 2026

- [ ] Verify newer native CLI isolation and installers on Windows/Linux before expanding support beyond macOS. The latest macOS ARM package is verified in the installer review above. Owner: project maintainer.

### Local imsg iMessage support — October 13, 2026

- [ ] Owner: grant Full Disk Access/Automation to the actual app/service and explicitly verify an intended live conversation/send before relying on real or packaged delivery. No owner messages sent during implementation.

### Six weekly-decision recommendations — October 13, 2026

- [ ] Owner release gates: signing/notarization, published upgrade, current Windows/Linux/Intel interactive testing and intended live-provider/TCC verification. Do not claim a sportsbook edge until independent prospective evidence supports it.

### Real-data six-workflow advice review — October 13, 2026

- [ ] Establish prospective prediction accuracy and executable sportsbook edge; retain missing dated injury/full-season evidence and supported-format limits.

### Market Signals and player props — October 15, 2026

- [ ] Gather independent multi-week/season prospective outcomes before considering promotion. Owner: model research; no current sportsbook-edge claim.

### Betting price tools, scorecard and Claude API — October 22, 2026

- [ ] Owner: optionally add an Odds API key and confirm live prop prices and book comparison for a real game; implementation was verified against ESPN live data and Odds API fixtures only.
- [ ] Owner: optionally add an Anthropic API key and run Settings → Test connection; the Claude provider is covered by unit tests, not a live call.
- [ ] Collect a season of graded projections before letting measured accuracy reorder projection sources; the Home scorecard reports accuracy but does not change source order.
- [ ] New betting model versions are paused until a source the books don't already price is available (see `decisions.md`).
- [ ] Re-run `betting:model-audit` and `betting:paper-simulate` at season end; act only if the untouched 2026 holdout interval stays above zero (see `reviews/2026-10-22-betting-model-test.md`).

### Game-day alerts, roster moves and projection records — October 22, 2026

- [ ] Owner: confirm a real game-day notification on the packaged desktop app (allow notifications for Sunday Sidekick in System Settings). Covered by unit tests; no live notification was shown during implementation.
- [ ] Owner: re-import Afton (or connect it with an ESPN login) so Waiver day and Trade ideas have this week's estimates; the current import has none, so both lists were only verified with fixtures.
- [ ] Optional: read FAAB budget and waiver order from Sleeper/ESPN adapters for Waiver day.
- [ ] Continue splitting `AdvicePage.tsx` (form sections) and `App.tsx` (league and report actions) into hooks/components; history, lazy loaders and roster-move panels are extracted.

### Live, playoff odds and Home focus — October 22, 2026

- [ ] Owner: check Live during a real game window with a connected league (live points depend on platform refreshes every ~10–15 minutes); verified against the real NFL scoreboard pre-game with an imported league only.
- [ ] Owner: re-import Afton to pick up the remaining schedule so playoff odds use real pairings.
- [ ] Optional: read Sleeper's future-week matchups for playoff-odds schedules.
