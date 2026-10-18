# Richer quarterback and injury model retest — October 12, 2026

## Result and production decision

The frozen research candidate improves aggregate probability accuracy slightly,
but still does not consistently beat the paired no-vig sportsbook. Numerical
corrections remain experimental; production retains `market-context-v3` and
supported `health-weather-total-v4` totals. Current Advice gains richer descriptive
QB and injury-role evidence without changing forecast probabilities or action gates.

| 2022–2025, 3,221 matched non-push outcomes | Brier error (lower is better) |   Log loss |
| ------------------------------------------ | ----------------------------: | ---------: |
| Frozen rich-personnel candidate            |                    0.23653643 | 0.66422845 |
| Retained production                        |                    0.23658686 | 0.66435334 |
| Paired no-vig sportsbook                   |                    0.23666635 | 0.66450478 |

The candidate beats the book in **6 of 12** season/market comparisons, versus
five for retained production, and beats retained production in five. Its pooled
book-minus-model Brier improvement is 0.00012992; the weekly-cluster nominal 95%
interval is **[-0.00041539, +0.00067523]**. The interval against retained production
also includes zero. None of the twelve simultaneous season/market intervals
establishes superiority. These seasons have already been examined repeatedly;
they are reused retrospective evidence, not an independent holdout. Brier/log
loss measure probability accuracy, not realizable betting returns.

An additional 2026 comparison, scored only after the older-data selection froze,
has 224 non-push market outcomes from 77 completed games. Candidate pooled Brier
is 0.24101725, retained production 0.24102046, and book 0.24112677. Only spread
beats the book: moneyline 0.22499556 versus 0.22494425, spread 0.24825960 versus
0.24877559, total 0.25015286 versus 0.25004633. All book-improvement intervals
include zero. This is also retrospective reconstruction, not a prospectively
recorded forecast. Neither comparison establishes a consistent advantage.

## Better inputs and source research

The typed weekly-player adapter now retains bounded passing EPA, rushing EPA,
and rushing exposure from the existing public NFLverse player-stat source.
Up to eight earlier appearances receive exponential recency weights (0.85 per
appearance) and a 100-play shrinkage toward zero. QB EPA combines passing and
rushing EPA with attempts, sacks and carries as exposure. Separate rushing EPA
and the expected/previous QB's difference from recent team QB appearances are
available. Strict GSIS identity takes priority over a unique normalized name;
a chart listing the previous QB after he is ruled Out cannot provide new EPA
features. The chart/previous starter remains an assumption about participation.

The [primary stats implementation](https://github.com/nflverse/nflfastR/blob/master/R/calculate_stats.R)
shows that passing EPA includes pass/spike plays and rushing EPA includes runs
and kneels. These are contextual performance measures, not isolated intrinsic
QB value, and their underlying EPA models/stat corrections may have been revised
retrospectively. The [publisher schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
describes nightly statistics and later corrections. Prior-week completion plus a
24-hour availability allowance is still an assumption, not verified historical
publication metadata.

Dated injury records now produce separate prior-snap measures for offensive-line
Out, skill-position Out, offensive/defensive Doubtful, injury-related limited
practice and missed practice. The [injury dictionary](https://nflreadr.nflverse.com/articles/dictionary_injuries.html)
documents participation, injury and modification fields. Practice groups exclude
rest, personal matters and non-injury absences. Missing practice observations,
incomplete matches, conflicting identities and absent source coverage remain
unknown. There is no assigned participation probability or fixed point penalty.
No practice rows are reconstructed from an official article that only reports
game designations; its previously captured facts retain their source.

[ESPN Total QBR](https://www.espn.com/nfl/story/_/id/17653521/how-total-qbr-calculated-explain-our-improved-qb-rating)
was investigated as an alternative because it considers rushing and opponent
strength. Its opponent estimates evolve during the season; historical adjusted
QBR without contemporaneous snapshots is excluded from this experiment because
later opponent information could leak into earlier forecasts. Similarly, the
publisher's post-2023 participation data arrives after the postseason, so it
cannot stand in for an in-season injury feed.

Across 2,639 prepared 2016–2025 games, both-team QB EPA is usable in 2,231,
both-team offensive limited-practice roles in 1,647, and both-team line Out
roles in 2,029. The 2025 archive still has no usable dated practice coverage;
new line-role fields were not fabricated from aggregate saved official counts.
For the recent 2026 reconstruction, 74 games meet the 24-hour preparation cutoff,
73 have both-team EPA and all 74 have dated charts; none has both-team usable
dated injury reports. Three more completed games are scored with available
fallbacks. Injury-only candidates therefore equal retained production in 2026
spread/totals. All per-year coverage, raw-source hashes and URLs are retained.

A live provider check returned 180 QB rows, 174 with usable EPA and 7,277 snap
rows in 0.415 seconds. This checks source availability/parser compatibility,
not historical completeness, prospective accuracy or all provider latency.

## Selection, reproduction and isolation

Thirteen procedures per market (retained production plus all/QB/injury families,
two ridge penalties and direct/adaptive-book rules) were compared on 2018–2021.
All later rows were removed before model preparation. Each numerical fit and
adaptive blending weight reads strictly earlier NFL weeks; at least 200 earlier
nonzero feature cases are required for the extra ridge correction. Adaptive
weights are learned against the book from earlier predictions, not betting profit.

An initial older-data pass was rebuilt after tightening partial-practice and
stale-Out-chart validation. Candidate structures were unchanged; no later audit
was read during this repair/selection. Final selection froze at
**18:34:12 UTC (2:34 p.m. New York)**. All-200-direct wins moneyline; injury-only
1000-direct wins spread and totals. Development Brier improves respectively from
0.21082684 to 0.21060374, 0.24907034 to 0.24905834, and 0.24967576 to 0.24965233.
The twelve later season/market comparisons and additional recent sample cannot
be used to change this frozen choice. A new hypothesis must be labeled a new
experiment and evaluated on new evidence.

Commands (public raw snapshots remain outside the repository):

```sh
npm run betting:rich-prepare -- --contexts <v5-games.json> --data-dir <public-csv-directory> --output <rich-games.json>
npm --silent run betting:rich-develop -- --contexts <rich-games.json> > development.json
npm run betting:rich-audit -- --contexts <rich-games.json> --frozen development.json --recent-contexts <recent-games.json>
node scripts/research/prepare-recent-personnel.mjs --contexts <rich-games.json> --data-dir <public-csv-directory> --season 2026 --as-of 2026-10-12T18:32:36Z --output <recent-games.json>
```

Raw names are `statsYYYY.txt`, `snapsYYYY.txt`, `injuriesYYYY.csv`; recent preparation
also requires filtered dated `qbYYYY.csv`. The hashes identify original inputs.
The audit rejects mismatched frozen context/development hashes or unsupported
specifications; recent inputs must preserve every historical row through 2025.
Evidence lives in `docs/research/model-v6-rich-{development,frozen,audit,sources,
recent-sources,live-check}.json`. The production reference error reproduces the
previous audit exactly. No new production method or HTTP tuning/import option is
introduced, and existing pre-kickoff prediction records are preserved.

## Prospective research record

A separate append-only v6 numeric record for the upcoming Bills–Rams game was
issued at **18:37:53 UTC (2:37 p.m. New York)**, before its 8:15 p.m. kickoff.
The script refreshed typed current personnel and complete paired displayed prices,
then saved candidate, retained-production and no-vig book probabilities, context,
source/quote timestamps and code/history/frozen-selection hashes. It refuses
completed games, post-kickoff captures, stale/incomplete paired quotes or an
existing output path. The file is
`docs/research/2026-10-12-v6-pregame-numeric-record.json`; outcomes are pending.
This is one prospective research observation, with no wager, AI call or saved
owner Advice entry. The earlier 12:57 p.m. production record remains unchanged.

The reproduction entry point is:

```sh
node scripts/research/record-rich-personnel.mjs --contexts <rich-games.json> --frozen development.json --game-id <upcoming-id> --output <new-record.json>
```

## Verification and manual review

Focused tests cover malformed/blank/zero EPA units, prior-week and timestamp
cutoffs, QB rushing, incomplete practice groups, rest exclusion, stale Out charts,
feature orientation/unknowns, and future/target/same-week outcome invariance for
both direct and adaptive research rules. A forecast regression checks that richer
visible facts leave production probabilities, historical cases and qualification
unchanged. Build, types, lint and formatting checks pass. The production build
retains its existing large-dashboard-chunk warning.

The initial full test command used the shell's unsupported Node 26 and failed to
load the existing Node 22 SQLite native module. Rerunning with the repository's
supported Node 22.23.3 passes; no database or installed dependencies were changed.
The final full test command passes **797 workspace tests** plus all root script
and service integration suites. The final types, production build, lint, formatting
and whitespace checks pass. No new browser journeys were run for this numerical/
evidence change; dashboard rendering tests pass in the workspace suite.

Scoped manual code/security review covered bounded CSV sizes before allocation,
fixed provider endpoints, strict IDs/game/week joins, signed/blank numeric values,
missing observations, report/quarterback cutoffs, source selection isolation,
future-outcome exclusion, bounded model caches, frozen artifact checks and
unchanged HTTP/production dispatch. No automated security scan was run. No AI,
credential, owner setting, saved Advice journal, service, release or wager changed.
Complete dated injury/starter snapshots, contemporaneous prices and substantial
new pre-kickoff outcomes remain necessary to assess a lasting advantage.
