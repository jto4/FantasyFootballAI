# 2026 totals diagnosis and online expert adaptation — October 13, 2026

## Outcome and decision

A different adaptation reduces the hybrid's 2026 totals losses substantially, but
still fails to beat the sportsbook. Weekly online expert mixing is implemented
and tested; it remains experimental. Production moneyline and spread are unchanged
at every scored case and in the research dispatch. Live production totals also
retain v4; no new method or HTTP tuning option is deployed.

| 77 reused 2026 totals outcomes | Brier (lower is better) |
| ------------------------------ | ----------------------: |
| Previous plain hybrid          |              0.25280588 |
| New online expert mixture      |              0.25045825 |
| Fixed-weight mixture control   |              0.25039020 |
| Existing production totals     |              0.25015286 |
| Paired no-vig sportsbook       |              0.25004633 |

The new mixture removes about **85% of the old hybrid's excess totals error**, but
its remaining book-minus-model interval is [-0.00262233, +0.00179848], including
zero. The fixed-weight control is slightly better than weekly learning. Thus most
of the improvement is attributable to weaker/different combined corrections,
not demonstrated value from adapting the weights. This is error attribution on
one reused sample, not a causal guarantee or new prospective evidence.

The all-market 224-outcome mixture Brier is 0.24112544 versus book 0.24112677,
but log loss is slightly worse (0.67529227 versus 0.67528617), production is better
(0.24102046 Brier), and the **totals being changed still lose**. This nearly equal
aggregate cannot establish an advantage. Unchanged spread probabilities account
for much of the aggregate improvement versus the book. No profitability is inferred.

## Why the old hybrid loses this sample

The sample still ends at the frozen October 12 context snapshot: 77 non-push totals
from five NFL weeks. It excludes the separately scored Bills–Rams forward record.
The tree's average Over probability is **48.96%**, compared with a **49.35%**
realized Over rate and **49.94%** mean book probability. Its average is already
close; shifting every prediction by the same seasonal intercept cannot repair
which individual games it ranks above/below the book.

For `d = tree - book`, paired excess Brier is `mean(d²) - 2 mean[d*(y-book)]`.
Here the squared correction cost is **0.00075923**, and the alignment gain is
**negative (-0.00200033)**, totaling **0.00275955** excess error. The corrections
move toward the realized outcome in only **34 of 77** games (44.2%). Both positive
and negative correction directions lose on aggregate: the 25 games tilted Over
have a 40.0% Over rate; the 52 tilted Under have a 53.8% Over rate. These subgroups
are post-hoc descriptions, not learned selection thresholds or wagering rules.

| Week | Outcomes | Tree-minus-book Brier |
| ---- | -------: | --------------------: |
| 1    |       16 |           +0.00215521 |
| 2    |       16 |           -0.01134066 |
| 3    |       16 |           +0.00121276 |
| 4    |       16 |           +0.01554860 |
| 5    |       13 |           +0.00702083 |

Week 2 helps considerably, while Weeks 4–5 drive losses. Only five of sixteen
Week 4 and four of thirteen Week 5 corrections point the right way. There are
only five observed weekly clusters; uncertainty is large. Losses at large
correction magnitudes are also worse, but five games above a 5-point correction
are far too few to establish a magnitude rule. The full diagnostic is preserved
without selecting new thresholds from these observations.

## Different adaptation: track expert reliability

The new totals forecaster mixes four earlier-trained sources:

1. Paired no-vig sportsbook probability.
2. The existing depth-two, 730-day totals tree.
3. A depth-two, 120-day totals tree that responds faster to new seasons.
4. Existing production v4/v3-fallback totals.

At each origin, weights are learned from **earlier NFL weeks only**. Completed
prior-week mean Brier losses update expert weights exponentially; a fixed share
is returned to the starting weights after each update so a formerly poor expert
can recover. A season boundary resets weights fully or carries only one-quarter
of the preceding season's posterior. Previous-season history is bounded to one
season. Each prediction is a convex mixture of these four probabilities.

This is fixed-share-inspired loss tracking, distinct from the previous global
intercept and two-model calibrated blend. The
[original Herbster–Warmuth paper](https://mwarmuth.bitbucket.io/pubs/J39.pdf)
describes exponential expert updates and sharing for changing best experts. Our
weekly mean-loss updates, nonuniform prior, bounded season history and resets
differ from its exact setup; we do not claim that paper's bounds or guaranteed
superiority to any sportsbook. All expert forecasts themselves fit before their
respective target weeks. Historical source/price publication timing remains
unverified, as in the previous experiments.

The starting book weight is 0.5 or 0.8; the rest is split equally among the three
models. The fixed grid tests learning rate 16/64, share 0.05/0.2, and season carry
0/0.25: sixteen mixtures plus the plain hybrid. Data/settings are cloned, probabilities
and identities are bounded/validated, duplicates rejected, returned weight arrays
isolated, and origin caches bounded. No target-week label updates a weight.

## Freeze, older selection and retest

Later diagnostics motivated this family, so all later tests are **reused audits**.
Before development preparation, every row after 2021 is removed. Only 2018–2021
totals choose settings; other-market probabilities are fixed.

- Plain-hybrid development Brier: **0.24875265**.
- Best online mixture development Brier: **0.24952919**.
- Best mixture: learning rate 16, share 0.05, book prior 0.5, season carry 0.25.

Selection freezes at **05:06:15 UTC (1:06 a.m. New York)**. The plain hybrid remains
the selected procedure because all mixtures worsen older error; the best enabled
mixture is separately frozen for the requested new-adaptation test. Final type
annotations/reporting were repaired before this freeze; the candidate grid and
prediction equations were unchanged and no new-family later audit had been read.
No later-season winner replaces the older choice.

On 3,221 matched 2022–2025 market outcomes, the online mixture scores **0.23657706**
versus plain hybrid **0.23638752**, production **0.23658686**, book **0.23666635**.
Its totals-only Brier is **0.24968028**, versus plain hybrid 0.24911449 and book
0.25011732. It wins six of twelve market/season cells, including three totals
seasons, versus seven cells/four totals for the plain hybrid. No simultaneous
interval establishes superiority.

| Season | Total outcomes | Plain hybrid | Online mixture |       Book |
| ------ | -------------: | -----------: | -------------: | ---------: |
| 2022   |            268 |   0.24858508 |     0.24927096 | 0.25021228 |
| 2023   |            270 |   0.24902448 |     0.24949701 | 0.25006923 |
| 2024   |            269 |   0.24884642 |     0.24980981 | 0.24977945 |
| 2025   |            272 |   0.24999057 |     0.25013739 | 0.25040564 |

The new method improves the problematic small current sample at the cost of
historical accuracy and still trails current production totals. Choosing it based
on that current improvement would override the frozen older-data selection.
Moneyline/spread maximum difference from production is **zero** in both archive
and current-season comparisons.

## Control: separate learning from conservative mixing

After the first audit, we scored an explanatory ablation with the frozen mixture's
starting weights held constant: book 0.5 and each model 1/6. No new parameter grid
or selection was performed. Its archive totals Brier is **0.24963001**, versus
online 0.24968028; current totals Brier is **0.25039020**, versus online 0.25045825.
The weekly learning does not outperform this simpler control on either sample.
The control is diagnostic, not a retrospectively promoted model.

Recorded weekly weights illustrate the delayed feedback: after Week 2 success,
slow-tree weight rises to 19.0% for Week 3; after Week 4 failure it falls from
18.3% to 15.2% for Week 5. That is verified adaptation behavior, not evidence that
recent winners predict the next regime. Synthetic tests show recovery after a
regime switch; the real test does not establish improved weight learning.

## Reproduction and verification

Use Node 22 and the unchanged public context snapshot, SHA-256
`4cf98d965842625c7242cac204808b5bd8d818eac808b52a4b6768a718721de5`.

```sh
npm run betting:hybrid-diagnose -- --contexts <recent-games.json>
npm --silent run betting:expert-develop -- --contexts <recent-games.json> > development.json
npm run betting:expert-audit -- --contexts <recent-games.json> --frozen development.json
node scripts/audit-static-total-mixture.mjs --contexts <recent-games.json> --frozen development.json
```

Artifacts under `docs/research`: `model-v9-2026-totals-diagnostics.json`,
`model-v9-expert-{development,frozen,audit}.json` and `model-v9-static-control.json`.
They retain diagnostic attribution, the complete older grid, frozen choices,
context/development/implementation hashes, weekly weights and matched results.
The audit validates hashes, parameters and fixed specification identities; raw
public snapshots remain outside the repository. The v8 plain-hybrid reference
reproduces within 1e-12; original forecast/outcome records remain unchanged.

**805 workspace tests** plus root/service suites pass. New tests cover expert
recovery after a regime change, normalized/positive weights, season reset,
input-order/caller isolation, numeric/duplicate rejection, full target/week/future
exclusion, and exact moneyline/spread dispatch. Types, production build, lint,
formatting and whitespace checks pass. The pre-existing large dashboard chunk
warning remains. This isolated research change adds no frontend or live routing;
existing dashboard rendering tests pass in the workspace suite.

Scoped manual code/security review covered bounded validated snapshots and rows,
strict earlier-week/date joins, prior-origin expert training, weekly label updates,
stable exponent normalization, convex bounds, prior/reset/share state, bounded
cloned caches, frozen comparison checks, paired prices and push exclusions,
source-era limitations and unchanged live/other-market dispatch. No automated
security scan ran. No credentials, AI, owner settings, service, release, wager,
prior prediction record or previously scored outcome was changed. Substantial
new pre-kickoff forecasts and completed outcomes remain necessary for a credible
advantage claim; there is no prospective v9 result in this comparison.
