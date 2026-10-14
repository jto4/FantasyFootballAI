# Prediction model v2 and sportsbook comparison — October 12, 2026

Reviewer: Codex, scoped manual source/model and rendered review. Earlier local
changes remain intact; no release, owner-service restart or GitHub write. Times
below are UTC. Development began October 11 in New York.

## Implemented change

`market-regularized-v2` replaces the legacy game forecast when both current prices
and at least two hundred supported earlier paired-price games are available.
It uses recent scores with opponent offense/defense ratings, a learned home effect
removed at verified neutral venues, and regularization to reduce small-sample
extremes. Older games lose weight continuously. A three-feature penalized logistic
correction starts from the book's no-vig log-odds and considers book calibration
and the difference between the independent score estimate and the book.

**Sportsbook odds are a model input.** The large improvement over the old
scores-only model primarily shows the value of that input; it is not independent
prediction or proof of market edge. Each evaluated game uses its own archived
handicap/total and paired odds. Every score fit, residual distribution, market
correction and validation point uses earlier NFL weeks, never the target result
or same-week results. Live contexts also exclude outcomes dated after issuance.

The selected procedure fixes score ridge four, half-life 240 days, a two-season
rating window, three-season residual window, four-season market window and market
ridge two hundred. The independent score candidate's half-shrink was explored
only during development; the deployed market model learns a regularized odds
correction instead. Missing current paired prices/thin market history retain the
legacy calculation, while its generic frequency comparison cannot support an
actionable game-market edge. Props retain their separate legacy calculation.

New forecast validation recognizes both methods and requires the explicit book
baseline for v2. Longer chronological evaluation cohorts are bounded to one
hundred weeks. Saved legacy advice and its future performance records are not
recomputed. New records keep their new method, preventing mixed accuracy groups.
Advice identifies odds as an input, separates the statistical and AI judgment,
and compares new/previous/book errors with five decimal places and paired weekly
uncertainty. Mobile fields keep visible labels. Searchable Help explains the change.

## Development and frozen comparison

Use an exact dated public schedules snapshot from the nflverse schedules release,
SHA-256 `c2323a79d0abfe38c10f577520bec65718c5f62cbf618b323b1a1c5a19c94092`.
No private league data, credentials, inference or wagers enter the study.

Development scored only 2016–2021 outcomes. The explicit grid contained score
ridge four/twelve/twenty-four, half-life 120/240/480 days and independent probability
shrink half/three-quarters/one: twenty-seven score candidates. The selected score
ridge/half-life were four/240. Four regularized book-correction penalties were
then compared: ten/fifty/two hundred/one thousand. Equal-market average development
Brier selected two hundred. These are thirty-one explored configurations; this
selection itself is not test evidence.

The development candidate at the selected book penalty scored moneyline
0.21060 versus book 0.21055, spread 0.24958 versus 0.24970, total 0.24982 versus
0.24992. Parameters were recorded at **03:42:32 UTC**, before the first later-season
comparison. Production parsing/normalization, time boundaries and cache changes
were verified against the frozen procedure rather than tuned to later returns.

The final production replay at **04:05:44 UTC** reproduced every earlier measured
metric exactly and added matched prior-model subset fields. It took **33.6 seconds**
for both 2022/2023 and 2024/2025 pairs. Price coverage includes 271 completed games
in 2022, excluding the abandoned unscored game, and 272 in each later season.
All supported targets use v2; probability loss excludes pushes. Old/new/book
comparisons use the same 3,221 non-push outcomes. Different coverage is explicitly
reported with the new model's matched-subset error rather than hidden.

| Season | Market    | Non-push comparisons | Previous Brier | New Brier | Book Brier | Book-minus-new 95% interval |
| ------ | --------- | -------------------- | -------------- | --------- | ---------- | --------------------------- |
| 2022   | moneyline | 269                  | 0.23382        | 0.21103   | 0.21082    | -0.00087 to +0.00045        |
| 2022   | spread    | 261                  | 0.26163        | 0.24867   | 0.24853    | -0.00165 to +0.00137        |
| 2022   | total     | 268                  | 0.26434        | 0.24893   | 0.25021    | +0.00024 to +0.00232        |
| 2023   | moneyline | 272                  | 0.23384        | 0.21893   | 0.21871    | -0.00145 to +0.00100        |
| 2023   | spread    | 258                  | 0.27533        | 0.25040   | 0.25000    | -0.00197 to +0.00117        |
| 2023   | total     | 270                  | 0.26192        | 0.24944   | 0.25007    | -0.00192 to +0.00317        |
| 2024   | moneyline | 272                  | 0.23481        | 0.19974   | 0.20016    | -0.00067 to +0.00152        |
| 2024   | spread    | 268                  | 0.27462        | 0.25134   | 0.25107    | -0.00089 to +0.00035        |
| 2024   | total     | 269                  | 0.25977        | 0.25118   | 0.24978    | -0.00345 to +0.00064        |
| 2025   | moneyline | 271                  | 0.22965        | 0.21224   | 0.21214    | -0.00073 to +0.00053        |
| 2025   | spread    | 271                  | 0.26993        | 0.24961   | 0.24959    | -0.00034 to +0.00029        |
| 2025   | total     | 272                  | 0.26615        | 0.25139   | 0.25041    | -0.00268 to +0.00072        |

Lower Brier is better. Intervals use a normal approximation with game losses
clustered by NFL season/week; positive book-minus-new favors the model. They are
not multiplicity-adjusted and are not independent of earlier parameter selection.

Aggregated by matched outcome count, the previous error is **0.25536**, new error
**0.23678**, and book error **0.23667**. The relative reduction versus the old model
is **7.27%**: moneyline **9.68%**, spread **7.54%**, total **4.87%**. V2 improves every
old-model market/season sample, but still slightly trails the book overall.
Only three of twelve sample comparisons beat the book. Only the 2022 total nominal
interval excludes zero in the favorable direction, among twelve comparisons; the
recent totals instead trail the book. This is not a consistent accuracy advantage.

The unchanged conservative paper selection rule now requires paired improvement
over the **book**, not a generic win frequency. No qualifying selection is made
in any of these cohorts: there is no ROI estimate or profit claim to manufacture.
The source archive cannot verify sportsbook identity, quote publication times or
executable fills. Historical outcomes existed during development and 2024/2025
old-model results had already been viewed. 2022/2023 are later than parameter
selection data, but this entire study is retrospective, not untouched or
prospective proof. Future pre-kickoff records remain necessary.

Reproduce on current public data after a build using
`npm run betting:market-evaluate -- --compare`. It compares the four most recent
completed seasons in two pairs and prints the normalized input digest, source
retrieval date, all matched errors, uncertainty and paper outcomes. Public data can
be corrected after this snapshot. Without `--compare`, the app and CLI retain the
two most recent completed seasons. No tuning settings are accepted by HTTP.

## Live compatibility and bounded work

The real public ESPN DraftKings Rams–Bills snapshot exercises all three game
markets. Their new forecasts are 62.237% home win, 49.288% home spread cover and
50.656% over, with no actionable edge: each earlier book-improvement lower bound
is negative. Those predictions are source compatibility examples, not settled
accuracy evidence. Full-history replay and the bounded live context agree exactly.
The first live model call took 532 ms and subsequent markets 61/67 ms on this Mac.
No model provider, owner settings or wager adapter is used by that numeric check.

Four exact-content cached contexts and 1,024 active correction origins bound reuse;
LRU avoids refitting still-used early origins. The live dependency window includes
two nested four-season validation windows, three residual seasons and two rating
warmup seasons. Price replay remains in a cancellable 120-second worker with no
inherited environment/app state/player records. Cache/source changes cannot
relabel old evidence as newly retrieved.

## Verification and manual review

- Root unit/integration/script checks pass: 762 workspace tests (313 API,
  179 core, 186 integrations, 84 dashboard), two expected platform skips.
- New tests cover opponent-side complements, each historical game's own line,
  neutral venue removal, missing/stale price coverage, earliest-week fitting,
  target/same-week/future exclusions, conflicting identities and issuance dates.
- Four targeted Chromium desktop/mobile production-router journeys pass: v2
  analysis/review/source disclosure, longer schema validation, ledger method,
  saved reload without new inference, historical old/book comparison and paired
  intervals. The complete suite passes 220 Chromium desktop/mobile journeys.
- Two additional actual-result visual journeys pass: the production HTTP worker
  reproduces the final 2024/2025 report exactly at `http://127.0.0.1:53699`
  (1440×1000), then the same API result is replayed at `http://127.0.0.1:53780`
  (320×568). Temporary fixtures are closed. Initial viewport, page/title/content,
  absent framework overlay, console health, table/uncertainty interaction,
  screenshots and root overflow pass. Browser plugin not available; Playwright used.
  These process checks do not turn dummy predictions into accuracy evidence.
- After the final issuance-boundary/dependency-window edits, the focused
  game-model/archive/venue recheck passes 21 tests. The real full-versus-bounded
  current forecasts agree exactly. Final types, lint, formatting, production build
  and whitespace checks pass.

Manual review traced fixed provider inputs through parsing, bounded score/market
fits, retrospective cutoffs, caches, numerical/schema gates, prompts, persistence
and React rendering. The venue parser accepts only explicit Home/Neutral values,
leaving absent metadata unknown. Legacy history is retained; fallback frequency
evidence cannot silently claim sportsbook support. Strong paired gates and current
quote rechecks retain explicit abstention. Method/source boundaries and scientific
limits agree with UI and Help. Existing loopback/host/origin controls, vault storage,
bounded/cancelable worker, fixed endpoints and sanitized errors are unchanged.
No new dependency, key, shell execution, external write, owner service action or
automated security scan is introduced. No release/platform certification is claimed.

Related method references: [rolling-origin evaluation](https://otexts.com/fpp3/tscv.html)
and [probability calibration measurement limits](https://www.jmlr.org/beta/papers/v23/22-0658.html).
These support the evaluation design, not the NFL results above.
