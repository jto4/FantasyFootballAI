# Weak-season diagnosis and stability-aware feedback — October 13, 2026

The new weekly stability guard reduces the 2023 and 2024 excess losses by 14.7%
and 91.3%, but still loses both seasons. It sacrifices the earlier late-2025
and full-sample point wins. **The candidate is rejected as a replacement.**
Production, the prior research records, moneyline and spreads remain unchanged.

## Why 2023 and 2024 still lose

[Diagnosis](../research/2026-10-13-v18-older-season-diagnosis.json) first reproduces
all frozen v17 forecasts exactly, then decomposes correction loss and recent-week
feedback contributions.

| Season | Games | V17 excess Brier over book | Raw source excess | Final variance cost | Final alignment gain |
| ------ | ----: | -------------------------: | ----------------: | ------------------: | -------------------: |
| 2023   |   270 |                 0.00013243 |        0.00031186 |          0.00002256 |          -0.00010986 |
| 2024   |   269 |                 0.00011317 |        0.00015568 |          0.00003075 |          -0.00008243 |

In both seasons the active corrections align negatively with outcomes. The
underlying raw source already loses, so this is not only a feedback problem.
2023 raw forecasts split 148 Over/121 Under; 2024 shifts toward Over with
224 Over/42 Under. Remaining cases return book. One pooled trust coefficient
can also transfer evidence across opposing correction regimes.

Short feedback memory follows recent winning blocks, then activates immediately
before losses. In 2023, Week 8 gains precede losing Week 9, and a strong Week 17
gain precedes losing Week 18. In 2024, Week 8 supplies most positive alignment
before losing Weeks 9–10. V17 trust is 0.5 for all three of 2023 Week 18 and
2024 Weeks 9–10; omitting the strongest recent week makes it zero. Before
2023 Week 9, omitting the strongest week still leaves trust 0.423, so not every
loss is attributable to a single outlier. Recent evidence can be genuinely
positive and still fail on the next week.

Season reset prevents stale prior seasons from dominating feedback, but does not
prevent noisy within-season activation. A point-estimated slope with only a few
weeks can reach the cap without stable incremental information.

## New adaptation and fixed source

All source probabilities, football features, residual fitting, penalty 100 and
exclusion of market flow stay fixed. The new adapter reuses v17's prior-only
48-hour lag, six-week window, two-week decay, seasonal reset and maximum
correction weight 0.5. It requires three distinct weeks, 24 observations and
twelve effective games. No current-week or future labels enter feedback.

Six candidates were predeclared:

- Weekly cluster penalties of 0.5 or one standard-error unit, each pooled or
  restricted to the current forecast's Over/Under correction direction.
- A leave-one-week-out minimum-trust guard, also pooled or directional.

For the cluster method, group the earlier weighted alignment contributions by
season/week. Center each group by its own effective mass, preserving unequal
bye-week counts and recency weights. Subtract a fixed fraction of the empirical
between-week standard error from total alignment before fitting the mixture
weight. This is a conservative reliability heuristic, not a certified confidence
interval for predictive skill.

For the leave-week method, recompute the alignment/variance slope after removing
each earlier week and use the smallest resulting weight. Remaining data is not
amplified and ridge stays fixed. Directional heads cannot borrow alignment from
the opposite correction direction; separate cache keys preserve that distinction.
Unsupported or insufficient evidence returns book, while all source forecasts
remain available for future feedback. Caller changes cannot mutate the selected
policy or cached reliability result.

## Selection and paired retest

To avoid choosing the new feedback settings on the requested 2023/2024 targets,
[selection](../research/2026-10-13-v18-frozen-settings.json) uses **537 matched
2021–2022 totals**, including fallbacks. It selects pooled cluster feedback with
one standard-error penalty. Development Brier is 0.24910158 versus book
0.24935727 and v17 0.24912886. Nominal development intervals include zero.

This does **not** make the pipeline historically untouched: diagnosis has already
inspected 2023/2024; the inherited raw model settings were selected in earlier
later-season rounds, and the PBP is revised historical data. The new feedback
selection alone uses the earlier cohort. No later result selects a different
candidate or a season-specific policy.

[Audit](../research/2026-10-13-v18-audit.json), lower Brier is better:

| Sample                | Games |     Sportsbook |            V17 | New frozen primary |
| --------------------- | ----: | -------------: | -------------: | -----------------: |
| 2023                  |   270 | **0.25006923** |     0.25020165 |         0.25018213 |
| 2024                  |   269 | **0.24977945** |     0.24989262 |         0.24978933 |
| 2025 full season      |   272 |     0.25040564 | **0.25039994** |         0.25087559 |
| Late 2025, Weeks 9–18 |   151 |     0.25036106 | **0.25024812** |         0.25077248 |
| 2026, Weeks 1–5       |    79 |     0.25026877 | **0.24911242** |         0.24986896 |
| All 2023–2026         |   890 |     0.25010217 | **0.25007216** |         0.25024754 |

The 2023 excess loss drops from 0.00013243 to **0.00011291**; the 2024 excess
drops from 0.00011317 to **0.00000988**. Neither becomes a sportsbook win. Full
2025 regresses by 0.00047565 versus v17, late 2025 by 0.00052436, and 2026 by
0.00075654. The current sample still beats book by 0.00039981, but the full
sample loses book by 0.00014538 and v17 by 0.00017538.

[Result decomposition](../research/2026-10-13-v18-result-diagnostics.json) shows
why the narrower trust gate is not a general improvement. It changes only 30
2023 games (Weeks 8–9), down from 102, but discounts the profitable Week 8 while
retaining full capped trust for the losing Week 9. In 2024 it changes only fifteen
Week 9 games, at reduced trust, eliminating most of the earlier loss but also
abstaining on later gains. In 2025 it misses gains in Weeks 9, 16 and 18 while
still acting in losing Weeks 6, 11 and 17. In 2026 it returns book through Week 4
and acts only in Week 5. Uncertainty filtering does not automatically allocate
abstention to the right games in a changing regime.

Across 890 totals, the primary changes 134 probabilities, including 119 changes
of at least 0.001; 756 return book exactly. Coverage is the same 879/890. Mean
absolute correction is 0.001245 probability. Suppressing more forecasts improves
some weak-season loss numbers, but it is not evidence of stronger conditional
prediction or consistent edge. Every matched case remains in the comparison.

All declared alternatives remain visible:

| Method / strength / scope        |       2023 |       2024 |  Late 2025 |  2026 W1–5 |    All 890 |
| -------------------------------- | ---------: | ---------: | ---------: | ---------: | ---------: |
| Cluster / 0.5 / pooled           | 0.25024096 | 0.24994245 | 0.25079287 | 0.24963294 | 0.25026237 |
| Cluster / 1 / pooled — primary   | 0.25018213 | 0.24978933 | 0.25077248 | 0.24986896 | 0.25024754 |
| Leave week out / 1 / pooled      | 0.25014164 | 0.24977945 | 0.25076035 | 0.24981834 | 0.25022492 |
| Cluster / 0.5 / directional      | 0.24997560 | 0.24990873 | 0.25079108 | 0.24973511 | 0.25018044 |
| Cluster / 1 / directional        | 0.25008219 | 0.24981836 | 0.25077314 | 0.24995642 | 0.25023388 |
| Leave week out / 1 / directional | 0.25009260 | 0.24977945 | 0.25076279 | 0.24989213 | 0.25021701 |

One directional control wins 2023 on points, but loses 2024 and aggregate. Both
leave-week controls return book on **all 269 games in 2024**: those are exact
ties, not model wins. No combination is assembled from the best outcome in each
season. Every alternative loses the full comparison and late 2025.

Nominal 95% week-cluster book-improvement intervals for the primary include zero:
2023 [-0.00038607, 0.00016025], 2024 [-0.00002926, 0.00000949], all games
[-0.00038052, 0.00008977], and 2026 [-0.00039374, 0.00119335]. The later-audit
paired comparison against v17 is worse, with nominal interval
[-0.00119934, -0.00000887]. Repeated research and the five-week current sample
limit inference; no independent prospective edge is established.

## Verification and reproduction

863 workspace tests plus root suites, typecheck, lint, format, build and diff
whitespace checks pass under supported Node 22. The existing dashboard 536.29 kB
chunk warning remains. New tests isolate a single lucky week, stable weekly
alignment, directional cache separation, current/future invariance, expired
history, three-week evidence gates, unsupported source fallback, invalid identity
and policy combinations, mutation protection and exact non-total dispatch.

Scoped ordinary manual code/security review checks inherited temporal validation,
bounded artifact input, weekly aggregation, non-amplified omission, sparse evidence,
separate heads, convex probability bounds, original source/parent hashes and
predeclared selection. No automated security scan, network acquisition, wager,
credential/configuration change, owner Advice journal write or AI call is performed.

Every candidate preserves all **890 raw totals probabilities**, **893 moneyline**
and **870 spread** probabilities exactly; source/parent/issued records remain
unchanged. Historical publication vintages and sportsbook observation timestamps
remain unavailable, so this is probability-score research, not executable ROI.

[Verification](../research/model-v18-verification.json) records fresh-input replay.
Decompress the shared v11 contexts, original v12 r2 signals and corrected v15
signals into a new directory, build dependencies under Node 22, then run:

```sh
node scripts/replay-drive-signals.mjs /path/to/drive-stats.json
node scripts/audit-stable-total-feedback.mjs /path/to/games.json /path/to/original-signals.json /path/to/corrected-signals.json /path/to/drive-stats.json docs/research/2026-10-13-v18-frozen-settings.json
```

Retained selected PBP fields reconstruct all 3,822 normalized team-game rows
byte-for-byte. All six candidate audits reproduce every probability, metric and
row, excluding only the scoring timestamp. Diagnosis and development CLIs remain
separate from sealed replay. No production or issued forecast is rewritten.
