# Game-market context v3 comparison — October 12, 2026

Reviewer: Codex, scoped manual source/model and rendered review. Earlier working
changes are preserved. No release, GitHub write, owner-service restart, external
message or automated security scan is performed. Times below are UTC.

## Model and development

V3 retains the frozen v2 score ratings and book-anchored correction, adding
schedule rest differences/combined rest, season phase, selected line context
(moneyline log-odds curvature instead), and earlier team score errors against
each game's own archived handicap/total. Context uses earlier completed regular
season games, with no target/same-week/future outcomes. Missing rest defaults to
seven days; long gaps cap at fourteen. Team residuals use a fixed eight-game
ridge, 120-day half-life and 35-point clipping. No new source endpoint, provider
key, postgame quarterback starter, or observed game weather is added.

Nine structures (retained v2 and two context variants times two ridge penalties
times two time-weight choices) were compared with direct and adaptive prediction
rules: **eighteen explored rules**. Only 2016–2021 Brier loss selected each market's
rule; no profit or later-season objective was used. All three chose full context,
ridge 200 and no extra correction decay. Moneyline selected a past-only adaptive
blend toward the book; spread/total retained the direct correction. The moneyline
weight minimizes earlier out-of-week candidate Brier plus a fixed penalty toward
zero, restricted to zero through one. Negative support can remove all correction.

The initial selection was recorded at **09:01:32 UTC**, before viewing this v3
later-season audit. Those later outcomes had already been examined in v2; this
is explicitly **reused retrospective evidence**, not a fresh holdout. Production
verification identified a feature-scope difference: the prototype context also
included earlier postseason rows. Restricting it to validated regular-season rows
and repeating the older development grid retained exactly the same selected
rules. Production development error is 0.210547 moneyline, 0.249572 spread and
0.249726 total, against book 0.210548 / 0.249703 / 0.249918. No parameters were
changed in response to later audit performance. Frozen selection and all candidate
results are retained in [model-v3-frozen.json](../research/model-v3-frozen.json)
and [model-v3-development.json](../research/model-v3-development.json).

Run `npm run betting:model-develop -- --snapshot <schedules.csv>` to reproduce
the older grid: rows after 2021 are discarded before model preparation. Run
`npm run betting:model-audit` for the latest four completed seasons against the
production v3, retained v2 and book, or add `-- --snapshot <schedules.csv>` for a
bounded local archive. These commands print JSON and do not write application
state. The app still checks two completed seasons in a bounded worker.

## Production comparison

Exact public nflverse schedules snapshot SHA-256:
`c2323a79d0abfe38c10f577520bec65718c5f62cbf618b323b1a1c5a19c94092`.
The [schedule dictionary](https://nflreadr.nflverse.com/articles/dictionary_schedules.html)
describes lines and rest; this implementation derives rest from earlier dates.
Archive book identity, quote publication times and executable fills remain unknown.
The production replay of the two season pairs took **38.2 seconds**.

| Season | Market    | Non-push outcomes | V2 Brier | V3 Brier | Book Brier | Book-minus-v3 nominal 95% interval |
| ------ | --------- | ----------------- | -------- | -------- | ---------- | ---------------------------------- |
| 2022   | moneyline | 269               | 0.21103  | 0.21083  | 0.21082    | -0.000081 to 0.000061              |
| 2022   | spread    | 261               | 0.24867  | 0.24819  | 0.24853    | -0.001180 to 0.001863              |
| 2022   | total     | 268               | 0.24893  | 0.24892  | 0.25021    | 0.000079 to 0.002499               |
| 2023   | moneyline | 272               | 0.21893  | 0.21871  | 0.21871    | -0.000202 to 0.000195              |
| 2023   | spread    | 258               | 0.25040  | 0.25073  | 0.25000    | -0.002748 to 0.001288              |
| 2023   | total     | 270               | 0.24944  | 0.24823  | 0.25007    | -0.001129 to 0.004799              |
| 2024   | moneyline | 272               | 0.19974  | 0.20010  | 0.20016    | -0.000078 to 0.000208              |
| 2024   | spread    | 268               | 0.25134  | 0.25092  | 0.25107    | -0.001062 to 0.001366              |
| 2024   | total     | 269               | 0.25118  | 0.25114  | 0.24978    | -0.003875 to 0.001154              |
| 2025   | moneyline | 271               | 0.21224  | 0.21221  | 0.21214    | -0.000260 to 0.000109              |
| 2025   | spread    | 271               | 0.24961  | 0.25003  | 0.24959    | -0.001489 to 0.000612              |
| 2025   | total     | 272               | 0.25139  | 0.25076  | 0.25041    | -0.003404 to 0.002690              |

Lower Brier is better. Across **3,221 matched market outcomes**, pooled v3 error
is **0.236606**, v2 **0.236784**, book **0.236666**. The small relative reduction is
about **0.075% versus v2** and **0.025% versus the book**. V3 beats v2 in **9 of 12**
season/market samples, and the book in only **5 of 12**. It does not consistently
beat the book: recent spread/total samples and most moneyline samples still lose.

Pooled book-minus-v3 improvement is approximately **0.000060**, with a nominal
weekly-cluster 95% interval **-0.000427 to +0.000548**. The paired v2-minus-v3
interval also spans zero (**-0.000146 to +0.000502**). The pooled interval groups
all three markets together by NFL season/week, retaining their correlations.
Individual intervals in the table are nominal. Fixed Bonferroni normal intervals
for twelve season/market comparisons yield **zero** favorable intervals wholly
above zero. This does not account for all uncertainty from earlier model
selection, source corrections or publication timing. No statistical claim of
superiority or profitability is supported. No paper selection passes unchanged
book-improvement/calibration/current-price gates in any cohort; ROI stays absent.

## Behavior and verification

New forecasts use `market-context-v3`; saved v1/v2 advice remains readable and
keeps its original method. V2 correction is retained for matched upgrade
measurement, rather than relabeling its old results. The performance details show
v2 error/count beside the existing original-model/book comparisons. Prompts,
searchable Help and rendered v3 explanations disclose extra context, moneyline
shrinkage and reused-data limits. The book remains an explicit input.

Live preparation covers three nested four-season correction/blend validation
windows, plus residual/rating warmup: **seventeen seasons**. Four exact-content
contexts, 1,024 coefficient/weight origins and bounded team context caches limit
retention. The current selected quote supplies the line feature; historical
validation uses each historical game's own line. Freshness and source provenance
remain checked at use time. Forecast guards require a string method and sportsbook
baseline for v2/v3; legacy frequency evidence cannot support a game-market edge.

The current public ESPN DraftKings Rams–Bills compatibility check at 2026-10-12T09:12:25.699Z
returns all three v3 forecasts: 61.653% home win,
48.785% home spread cover, 50.256% over. All
book-improvement lower bounds are negative and no actionable pick qualifies.
This uses actual current public prices with the dated historical snapshot; it is
not outcome accuracy evidence. Exact full-versus-seventeen-season checks pass
for current point/residual/market cohorts, every earlier evaluation correction,
and current probabilities in all three markets. The cold check during the full
browser workload took 3.99 seconds; timings under concurrent load are not a latency target.
An isolated repeat with the same observed quote fixture takes **2.25 seconds**
for the cold moneyline forecast and **185/197 ms** for subsequent spread/total;
all three probabilities remain exactly equal. This is slower than the simpler
v2 cold fit and remains an experimental local model, not a performance release.

- Root unit/integration/script checks pass: 766 workspace tests (313 API, 183 core,
  186 integrations, 84 dashboard), two expected platform skips. Four new context
  cases cover rest boundaries, team orientation, omitted lines, bounded residuals
  and harmful/thin moneyline correction shrinkage. Existing game-model cases
  retain target/same-week/future exclusion, opponent complements and source gates.
- Production older-development predictions reproduce all three selected grid
  errors exactly. All twelve final production archive-report cohorts match the
  standalone audit errors, counts and nominal intervals within floating precision.
- The actual production API worker reproduces the final 2024/2025 report exactly
  at http://127.0.0.1:52922 (1440×1000); the same report is replayed at
  http://127.0.0.1:52971 (320×568). Both outside-repo Playwright journeys pass:
  title/route/meaningful first viewport, absent framework overlay, clean console,
  historical test/details interaction, mobile labels, screenshots and no root
  overflow. Screenshots were inspected. Both fixture processes are closed.
  Browser plugin not available; regular Playwright used.
- Initial full-suite checking found one five-second assertion that raced the
  completed worker response. The test now waits for and validates the actual
  response before asserting rendering. An outside visual fixture also expected
  a trailing numeric zero omitted by Intl formatting; its expectation was fixed.
  A new test fixture's explicit undefined optional fields were corrected for the
  repository's exact-optional TypeScript setting; runtime behavior was unaffected.
- Typecheck, lint, production build and the focused context recheck pass.
  The final complete browser rerun passes all 220 Chromium desktop/mobile
  journeys, including v3 source disclosure, saved reload, v2 compatibility and
  rejection of a v3 frequency baseline/coercible method. Formatting/whitespace
  checks pass after final documentation formatting. After the final prompt/metric
  clarification and selected-quote regression assertion, all 766 workspace tests
  pass again, followed by the final build/types/lint/format checks and all four
  focused desktop/mobile model journeys.

Manual source review traces archive validation, context derivation, target quote
thresholds, nested chronological fits/blending, bounded caches, retained v2,
method/schema gates, prompts, saved ledger behavior and React/Help rendering.
The complete paired book gate is preserved, with explicit no-action findings.
No provider endpoint, dependency, credential or database migration is introduced.
Existing loopback/host/origin checks, vault secrecy, source bounds, worker timeout,
cancellation and sanitized failures remain intact. New research file input is
bounded to 25 MiB and parsed through the existing validated integration; no shell,
remote address, request tuning, external write or backdated record is introduced.
No automated security scan is run. This is scoped manual review, not a release
or prospective sportsbook certification.
