# Seasonal adaptation of external totals signals — October 13, 2026

Diagnosed the v12 late-2025 loss and tested a separate totals adapter with faster
recency weighting, weaker/reset seasonal carryover and feedback from earlier
forecasts. The selected adapter reduces late-2025 excess Brier loss versus the
sportsbook by **44.6%**, but still loses on late 2025 and on the combined audit.
The reused 2026 point estimate beats book by only 0.00001085. No consistent edge
is established, and production remains unchanged. Moneyline and spreads reproduce
the existing calculation exactly.

## Why v12 loses in late 2025

The diagnosis reproduces every prior v12 total probability from its original
frozen inputs/settings. On 151 late-2025 totals, the model's excess Brier loss is
0.00067565. Using the exact identity

`(p - y)^2 - (book - y)^2 = 2 (book - y) (p - book) + (p - book)^2`,

0.00060403 (89.4%) is the first term: corrections are aligned with outcomes
poorly. Only 0.00007162 (10.6%) is the squared correction magnitude. Stronger
shrinkage helps, but the main issue is weak ranking/direction, not just excessive
confidence.

The observed outcome mix changes within this small sample. Overs occur in 42.1%
of weeks 9–12 cases, while v12 increases over probability by 0.55 percentage
points on average. In weeks 13–18, overs occur in 56.4% of cases while v12's
average correction is slightly downward. Week 12 has 4/14 overs and a mean
upward correction of 0.72 points; Week 14 has 11/14 overs and a mean downward
correction of 0.81 points. These are sample reversals, not proof of persistent
league-wide regime changes.

The fitted liquidity/flow block supplies much more forecast movement than price
disagreement, earlier large executions or wallet weights. Unsigned relative
volume and coverage flags can act as sample-selection/calibration proxies,
rather than evidence of a particular scoring direction. With coefficients fixed,
removing the coverage block improves late-2025 Brier from 0.25103671 to
0.25072346; removing flow improves it to 0.25065318. Both still lose book's
0.25036106. Removing wallet weighting slightly worsens it to 0.25103836; only
16 late-2025 games have a nonzero wallet feature. More wallet identities do not
establish independent skill. These ablations diagnose association and do not
isolate causal effects or count as independently selected models.

V12's unweighted current/two-prior-season fit has no explicit feedback gate for
recent failed forecasts. In this archive, usable older-season labels are also
sparse, so shortening the season window alone cannot solve calibration lag or
feature-selection bias. The new adapter therefore changes both label weighting
and the amount of permission given to its own residual correction.

## New approach and frozen selection

The new research module reuses v12's exact eighteen as-of feature values,
including its wallet construction. It does not alter the data, v12 model math,
production model, or existing issued forecasts.

- A weighted sportsbook-offset logistic fit gives completed earlier current-season
  games an exponential half-life of four or eight NFL weeks. Ridge penalty stays
  fixed at 400, making a small effective recent sample more conservative.
- Prior seasons are either discarded or carried with weight 0.25 and additional
  recency decay, including elapsed weeks in the new season. At most two prior
  seasons are eligible. Current-week/later outcomes never enter a fit.
- A feedback mixture learns how much to depart from the book using **earlier
  predictions fitted at their own origins**. It does not judge in-sample fitted
  probabilities. For earlier candidate changes `d = raw - book`, its weight is
  `clip(sum(w d (y - book)) / (sum(w d^2) + 0.01), 0, 1)`.
  At least twenty earlier nonzero candidate forecasts are required. Negative
  evidence or insufficient feedback returns the book exactly.
- Raw correction requires twenty earlier supported games and remains bounded
  at 0.15 logit. Feedback is a probability mixture, so it cannot enlarge that
  correction. Missing evidence remains unavailable; exact book returns are ties.
- Development also compares directional-only features that omit unsigned volume
  and coverage flags. Eight candidates cover the feature choice, half-life and
  seasonal carryover. The selected candidate retains all features, uses a
  four-week half-life and **resets both fitting labels and feedback each season**.
  Wallet feature history remains the separately frozen v12 as-of construction.

Selection uses 2024 and 2025 weeks 1–8 only; audit settings, inputs, diagnosis and
source hashes are frozen before this new audit. The selected development Brier
is 0.24999061 versus book 0.24999099, with only eleven modified cases in one
week cluster. That tiny selection advantage is fragile. Two development
candidates return book for all cases; neither is counted as a model win.

The adaptation design is informed by the already inspected late-2025 diagnosis.
All audit seasons were previously examined in this project. This is explicitly
a reused, diagnosis-informed research retest, **not untouched validation**.
Weekly walk-forward fitting/feedback may use earlier audit-week outcomes once
those games have completed; it never uses the forecast's own or later labels.

## Results against the matched sportsbook

Lower Brier is better. All methods use identical paired sportsbook odds/lines
and exclude pushes/incomplete outcomes. The source snapshot is unchanged:
509 exact-line tapes, 135,310 executions and the original un-enriched v11 contexts.

| Audit sample           | Totals |     Sportsbook |            V12 | New seasonal adapter |
| ---------------------- | -----: | -------------: | -------------: | -------------------: |
| Late 2025, weeks 9–18  |    151 | **0.25036106** |     0.25103671 |           0.25073543 |
| Reused 2026, weeks 1–5 |     79 |     0.25026877 | **0.24989373** |           0.25025792 |
| Combined audit         |    230 | **0.25032936** |     0.25064412 |           0.25057141 |

The new model's late-2025 excess loss is 0.00037437 versus v12's 0.00067565,
a 44.6% reduction. Faster weighting/reset without feedback scores 0.25077730
on late 2025; feedback adds a further 0.00004187 improvement. On the combined
audit, feedback slightly worsens the ungated candidate (0.25057141 versus
0.25057017) because it also suppresses some 2026 gains. It is not uniformly
beneficial. Production totals score 0.25026161 on the combined audit, better
than the new candidate.

The feedback rule modifies 52/151 late-2025 totals and returns book for 99.
Following Week 12's losses, it returns book for every Week 13–18 game, avoiding
the old Week 14 loss. It does not anticipate Week 12's reversal: that week still
loses (new 0.25964166 versus book 0.25564379). This remaining lag and the weak
feature evidence explain why the retest still loses. Active late-2025 cases score
0.25219613 versus book 0.25110902: gains from more fallback must not be mistaken
for superior conditional forecasts.

In 2026, the season reset returns book during weeks 1–4; fourteen Week 5 games
are modified after sufficient earlier feedback. The apparent pooled 2026 gain
therefore comes from a single active week, not five independently successful
weeks. The combined audit modifies 66/230 games and returns book for 164.

The nominal week-clustered 95% interval for book improvement is
**[-0.00073644, 0.00025233]** on the combined audit and
**[-0.00001069, 0.00003239]** on 2026. Both include zero. These are nominal
intervals, not an adjustment for the project's repeated model searches.
2023 has no external coverage and 2024 never clears the training/feedback gates;
both remain book ties. Full 2025 Brier improves to 0.25061292 from v12's
0.25094002, but still loses book's 0.25040564. There are 890 totals in the
four-season coverage/control replay.

Moneyline and spreads have maximum absolute production difference **0** across
893 moneyline and 870 spread cases. Live dispatch remains v3/v4 as before;
no candidate is promoted. Historical sportsbook capture timestamps are still
unavailable, so these scores do not establish executable betting returns.

## Evidence, reproducibility and verification

- [Loss diagnosis](../research/2026-10-13-v13-loss-diagnosis.json) contains the
  exact decomposition, phases/weeks, feature ablations and largest gains/losses.
- [Frozen selection](../research/2026-10-13-v13-frozen-settings.json) records all
  development candidates, fixed parameters, data/diagnosis/source hashes and the
  unchanged v12 settings reference.
- [Audit](../research/2026-10-13-v13-audit.json) records per-game predictions,
  ungated forecasts, feedback weights, training/effective counts, weekly scores,
  fallback/active counts and non-total comparisons.
- Inputs remain the [v12 r2 tapes](../research/model-v12-external-signals-r2.json.gz)
  and [v11 contexts](../research/model-v11-contexts.json.gz), verified against the
  [existing manifest](../research/model-v12-r2-source-manifest.json). No new live
  provider request or fabricated historical sentiment is used.

With supported Node 22, decompress those inputs into a fresh local directory,
then run the diagnosis or the frozen audit:

```sh
node scripts/research/diagnose-expanded-total-losses.mjs /path/to/games.json /path/to/signals.json docs/research/2026-10-13-v12-r2-frozen-settings.json
node scripts/research/audit-seasonal-external-totals.mjs /path/to/games.json /path/to/signals.json docs/research/2026-10-13-v13-frozen-settings.json
```

The audit verifies frozen inputs, prior settings, diagnosis and source hashes.
Repeated replay must match every probability, summary and row except the new
scoring timestamp. The scoped ordinary manual review checks prior-only weighting,
honest feedback fitting, seasonal resets, correction limits, vector/identity
validation, unchanged production dispatch and forecast seals. No automated
security scan, service/configuration change, credential access, wager, AI call,
or owner Advice journal write is performed.

Tests cover exact recency weights and weakened prior-season carry, seasonal
resets, nonzero successful feedback, adverse prequential feedback returning book,
current/future label and feature exclusion, earlier labels actually changing the
fit, non-total preservation, malformed/duplicate vectors, target identity and
caller mutation isolation. Final repository checks and replay verification are
recorded in the [verification record](../research/model-v13-verification.json).
831 workspace tests plus root suites, typecheck, lint, format and build pass.
The existing 536.29 kB dashboard chunk warning remains. Exact offline replay,
old v12 audit integrity and v6/v11 forecast/source seals were verified unchanged.
