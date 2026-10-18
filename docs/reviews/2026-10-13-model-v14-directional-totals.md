# Removing coverage and liquidity predictors from totals — October 13, 2026

Reproduced the updated v13 model's remaining late-2025 losses and refit without
coverage flags and unsigned relative volume. This reduces late-2025 excess Brier
loss against the sportsbook by **85.0%**, but still loses slightly. A separately
frozen price-only control also removes all execution-flow/wallet signals and
effectively reproduces the sportsbook; it establishes no predictive edge.
Moneyline/spreads, live production dispatch and earlier numerical forecasts
remain unchanged.

## Why the updated model still loses

The diagnosis exactly reproduces every v13 total probability and ungated
probability. Its late-2025 excess Brier is 0.00037437: 0.00035874 (95.8%) comes
from corrections pointing the wrong way, and only 0.00001562 (4.2%) from their
squared magnitude. The exact decomposition is

`(p-y)^2 - (book-y)^2 = 2 (book-y) (p-book) + (p-book)^2`.

**Week 12 accounts for 99.0% of the remaining net excess loss.** Only 4/14
games go Over while the model adds 0.51 percentage points to Over probability
on average. Week 12 Brier is 0.25964166 versus sportsbook 0.25564379. Other
active weeks partly offset that loss; after Week 12, feedback returns book for
Weeks 13–18. It reacts after results arrive, so it cannot prevent the reversal
that invalidates its earlier calibration. This is an observed sample change,
not evidence that league-wide scoring regimes are predictable from these feeds.

With original coefficients and feedback weights held fixed, removing coverage
improves late-2025 Brier to 0.25061987; removing unsigned volume improves it to
0.25057325; removing both improves it to 0.25046178. All still lose book's
0.25036106. Removing coverage plus all execution signals leaves tiny price
corrections and scores 0.25036095. These are retrospective diagnostics, not
independently refitted models or causal proof. The requested retest refits both
coefficients **and earlier prequential feedback** after masking predictors.

Coverage and unsigned volume previously acted as directional calibration terms.
They identify which games have data or activity, but do not inherently say that
more points will be scored. Retaining them as coefficients lets a historical
sample association push many games together when the outcome mix changes.

## Fixed feature removal

The new research wrapper validates the original eighteen-element source vector
before masking it. It cannot switch back to all features through the spec.
The underlying frozen seasonal fitting/feedback engine is reused unchanged.

| Provider block        | Removed from primary predictor                                        | Retained                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Kalshi and Polymarket | Fresh-price availability, flow availability, unsigned relative volume | Price/book logit disagreement, six-hour price movement, signed recent/large execution flow, earlier large flow, as-of wallet-weighted flow |

This removes original indices **2, 5, 8, 11, 14, 17**. A stricter fixed sensitivity
test retains only price disagreement and movement, indices **0, 1, 9, 10**; it
removes all coverage, volume, signed flow, earlier flow and wallet predictors.

Source coverage still guards eligibility/freshness/completion. Removing a
coverage coefficient does not make missing evidence valid or turn an incomplete
tape into observed zero activity. Malformed values are rejected even in removed
columns. The original same-game/line/cutoff joins remain unchanged.

Both policies are frozen before this new audit. They inherit v13's four-week
half-life, season reset, ridge 400, twenty-game training/feedback gates, feedback
ridge 0.01 and 0.15-logit correction cap. No hyperparameters are searched and no
variant is selected from late-2025/2026 scores. Feedback continues to use earlier
candidate forecasts fitted at their own origins, never in-sample probabilities,
current-week outcomes or later features. It is recalculated for each policy.

## Matched sportsbook retest

All variants share the frozen 509-tape/135,310-execution snapshot and un-enriched
v11 context. There are 890 eligible totals across 2023–2026; the principal audit
remains late 2025 plus 2026 weeks 1–5. Every season has already been examined in
this project: this is a fixed, diagnosis-informed **reused research retest**, not
untouched validation. Pushes and incomplete outcomes are excluded.

Lower Brier is better.

| Sample                 | Totals |     Sportsbook |            V13 | No coverage/unsigned volume | Price-only sensitivity |
| ---------------------- | -----: | -------------: | -------------: | --------------------------: | ---------------------: |
| Late 2025, weeks 9–18  |    151 | **0.25036106** |     0.25073543 |                  0.25041735 |             0.25036106 |
| Reused 2026, weeks 1–5 |     79 |     0.25026877 | **0.25025792** |                  0.25026888 |             0.25026877 |
| Combined audit         |    230 | **0.25032936** |     0.25057141 |                  0.25036635 |             0.25032936 |

The primary ablation's late-2025 excess loss falls from 0.00037437 to 0.00005629,
an 84.96% reduction. Without feedback its Brier is 0.25041860, so most of this
improvement comes from refitting without the removed predictors rather than
changing fallback counts. Both refits still use the fixed existing adaptation.
V13 modifies 52 late-2025 games; the primary ablation modifies 51 and returns
book for 100. Its active cases still lose: 0.25129743 versus paired book
0.25113077. This is not a case of hidden improvement caused solely by more
abstention.

Week 12's Brier falls to 0.25631286, but remains above book 0.25564379. Remaining
signed-flow features and lagging prequential reliability still generate some
wrong-way corrections. The new model returns book for Weeks 13–18, as v13 does.
Full 2025 Brier is 0.25043806 versus book 0.25040564. The old 2026 point win
disappears: the primary ablation loses book by 0.00000011, with only fourteen
active Week 5 games. Earlier four weeks are exact book returns.

The primary combined audit modifies 65/230 games and returns book for 165.
The nominal week-clustered 95% interval for book improvement is
**[-0.00012218, 0.00004819]**. The paired interval for improvement over v13 also
includes zero. Production totals remain better on this combined audit
(0.25026161). The point estimate improves after excluding these unsigned
predictors; it does not establish consistently better forecasts.

The price-only model's actual late-2025 Brier is **0.2503610589504203** versus
book **0.2503610574991748**: a tiny loss of 0.00000000145, hidden by table rounding.
Its maximum late-2025 probability departure is only **0.0000001294**; no game
changes by even 0.000001. Its 133 mathematically nonzero corrections therefore
have no meaningful probability impact. It returns book exactly on all 79
2026 games. Its combined Brier is 0.25032936030116787 versus book
0.25032935934839357. Calling this a model win would mistake near-copying the
baseline for incremental information. Its ungated near-wins are also negligible
relative to uncertainty and were not used to select a new policy.

2023 has no external coverage and 2024 never clears the training/feedback gates;
both remain book ties. Moneyline and spreads have maximum absolute production
difference **0** across 893 and 870 eligible cases respectively, for both
policies. Historical sportsbook capture timestamps are unavailable, so none of
these accuracy comparisons establishes executable betting returns or ROI.
No production model is promoted.

## Evidence and reproduction

- [Loss diagnosis](../research/2026-10-13-v14-loss-diagnosis.json): exact v13
  reproduction, loss decomposition, weekly breakdown, fixed-fit/fixed-feedback
  feature ablations and largest loss cases.
- [Frozen settings](../research/2026-10-13-v14-frozen-settings.json): both masks,
  inherited adaptation, data/diagnosis/source hashes and sealed parent audit.
- [Audit](../research/2026-10-13-v14-audit.json): predictions for both refitted
  policies, active/fallback/ungated counts, paired v13 comparisons, confidence
  intervals and exact non-total comparisons.
- Inputs are unchanged [v12 r2 tapes](../research/model-v12-external-signals-r2.json.gz)
  and [v11 contexts](../research/model-v11-contexts.json.gz), verified against the
  [existing manifest](../research/model-v12-r2-source-manifest.json). No new live
  provider request, fabricated sentiment, post-cutoff data, current holdings or
  leaderboard backfill is used.

With supported Node 22, decompress the retained inputs into a fresh directory:

```sh
node scripts/research/diagnose-seasonal-total-losses.mjs /path/to/games.json /path/to/signals.json docs/research/2026-10-13-v13-frozen-settings.json
node scripts/research/audit-directional-totals.mjs /path/to/games.json /path/to/signals.json docs/research/2026-10-13-v14-frozen-settings.json
```

The new adapter is research-only. Tests verify adversarial changes to removed
columns cannot change training, feedback or inference, strict price-only removal,
exact equivalence to the existing directional engine, rejection of malformed
removed values, retained eligibility gates, as-of fitting/feedback and exact
moneyline/spread dispatch. Scoped ordinary manual review covers those invariants,
bounded inputs, fixed masks, parent/source integrity and unchanged live behavior.
No automated security scan, configuration/credential access, wager, AI call,
service change or owner Advice journal write occurs.

835 workspace tests plus root suites, typecheck, lint, format and build pass.
The existing 536.29 kB dashboard chunk warning remains. Fresh durable-input
offline replay reproduces every probability, summary and row for both policies.
Parent v13 source/settings/audit integrity and v6/v11 forecast seals are unchanged.
[Verification record](../research/model-v14-verification.json).
