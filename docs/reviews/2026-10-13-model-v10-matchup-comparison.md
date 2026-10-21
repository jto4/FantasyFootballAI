# Totals matchup signals and fixed-mixture retest — October 13, 2026

The new game-level efficiency/volume signals improve the reused archive versus
the fixed mixture, including its losing 2024 totals cell. They still lose on the
77-case 2026 sample and make that sample worse than the fixed mixture. Older
selection retains the plain hybrid. No model was promoted; production moneyline,
spread and supported v4 totals remain unchanged.

## Why the fixed mixture loses

This diagnosis is of the **fixed mixture**, not the plain-tree diagnosis from v9.
Its weights are book 1/2, slow tree 1/6, fast tree 1/6 and production totals 1/6.
For correction d = model probability − book probability, paired excess Brier is
mean(d²) − 2 mean(d × (outcome − book probability)).

On 2026, excess Brier is **+0.000343868**: correction variance costs 0.000065619
and wrong alignment costs 0.000278249. Roughly 81% of the excess comes from
corrections moving against outcomes, rather than correction size alone. Only
**36/77** corrections point the right way. The mean predicted Over probability
is 49.51%, close to the 49.35% realized rate; average calibration conceals poor
game ranking. An overall intercept change does not address this failure.

The slow tree contributes alignment −0.000333388 after its 1/6 weight. Fast-tree
and production contributions help slightly (+0.000010592 and +0.000044546), but
cannot offset it. Shrinkage reduces the slow tree's contribution without changing
its ranking. The decomposition reconstructs the fast probability from the saved
fixed mixture; it does not refit or select expert weights.

The thirteen Over corrections produce only five Overs and excess error
+0.002110959; the sixty-four Under corrections help very slightly
(−0.000015072). Week 4 has only four correctly directed corrections in sixteen
games and excess error +0.003265138; Week 5 adds +0.001778085. These are post-hoc
descriptions, not selection rules or causal claims. Do not turn the thirteen-game
cohort into a betting filter.

The fixed mixture's 2024 totals loss is much smaller, +0.000014297. Alignment
helps by 0.000090364, but variance costs 0.000104661. It leans Under on 180/269
games, including stronger incorrect Under adjustments; overall mean Over is
49.63% while 53.90% of outcomes are Over. Correct directions on 143/269 games
still do not establish useful correction magnitudes.

The existing experts chiefly share book/score-history signals. Fixed weights
shrink their errors, but cannot condition reliability on which offenses and
defenses meet. The diagnosis motivated independent team-stat matchup features;
it does not prove that any particular missing variable caused a loss.

## New data and features

The research-only typed integration loads bounded nflverse weekly team-stat CSVs
for 2015–2026. It validates season/week/team/game identities, duplicate rows,
finite EPA, nonnegative counts, mandatory measures, a 15-second deadline and a
one-megabyte response limit. Missing EPA/counts cause rejection, not zero-fill.
Passing EPA is used once; receiving EPA is not added to it. EPA and weekly team
stat definitions follow the [primary data dictionary](https://nflreadr.nflverse.com/articles/dictionary_team_stats.html).

Source files contain **5,948 team-game rows**, of which **5,938** join the exact
completed score-model observation pool. All 1,079 archive totals and 77 current
totals have supported prior-team histories. Ten rows are explicitly excluded:
three first games of relocated franchises absent from legacy fitted observations,
and the two Week 5 games uncompleted in the fixed context snapshot. Historic IDs
OAK/SD/STL map to current LV/LAC/LA only within this new research join. Neither
the production identity mapping nor score model changes. A reparse of all saved
raw CSVs with the final parser reproduces the signal snapshot exactly.

For each prediction cutoff, fit league-centered offense and opposing-defense
ridge effects on earlier team games only. Use the current and preceding season,
four effective games of shrinkage, sixteen coordinate iterations, and candidate
half-lives of 120/365 days. Features include:

- Passing, rushing and combined EPA per offensive play.
- Expected offensive play volume and the two teams' efficiency imbalance.
- Rates of plays gaining at least twenty yards and passing/rushing first downs.
- Pass share, efficiency × volume, and pass/rush efficiency weighted by pass share.
- Explicit weighted-history support and a missing-history fallback to the anchor.

Volume is attempts + sacks suffered + carries; it is **not measured neutral-script
tempo**. Each archived training game gets features computed at its own cutoff.
Same-week games, the target and future outcomes/statistics are excluded. A fixed
48-hour lag from the earlier game's recorded date further limits immediate reuse.
This is a conservative lag convention, not proof of actual historical publication.
[nflverse documents nightly updates and later stat corrections](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html).
Latest revised EPA/stat versions remain a retrospective data limitation.

## Selection and frozen test

Only 2018–2021 selects settings; all later game and stat rows are removed before
model preparation. The older experiment first examined trees, then added one
strongly regularized ridge alternative before any new later-season scoring. A
join/validation repair for relocated franchises was completed before the final
development run and freeze. Exploratory development outputs remain under /tmp;
the saved final development artifact includes every final candidate.

There are 36 configurations: four controls (book, production, fixed mixture,
plain hybrid) and 32 settings over two signal half-lives, signals on/off, tree/
ridge, book/static anchor and 1/4 or 1/2 new-expert weight. Eight settings duplicate
the signal-free half-life control. New trees retain the old twenty rounds, depth
two, leaf penalty twenty, minimum leaf sixty and 730-day label weighting. Ridge
uses penalty 200, an intercept, explicitly scaled/clipped features and uniform
label weights over four preceding seasons plus earlier current-season weeks.
Both methods cap added logits at 0.5. The final convex blend uses its frozen
strength; there is no post-audit weight adjustment.

The plain hybrid remains the overall selection: development totals Brier
**0.248752654**. The separately best enabled new-feature candidate is
`matchup-365-true-tree-static-0.5`, development Brier **0.249271957**, versus
fixed mixture **0.249510272** and book **0.249938662**. New features therefore
improve the fixed mixture in development, but do not beat the prior plain hybrid.
This separate candidate is frozen for evaluating the requested feature change;
it is not substituted for the selected winner after seeing later results.

Final code/input/settings hashes were saved at **2026-10-13 15:33:43 UTC** before
the later replay. The development artifact SHA-256 is
`9e0079d9f35ca6f699e2401eab873492eb8f886ef8c34c072e7216f72abc6a92`.
The old context remains exactly
`4cf98d965842625c7242cac204808b5bd8d818eac808b52a4b6768a718721de5`.

## Results against matched sportsbook probabilities

Lower Brier is better. Archive totals have 1,079 outcomes; 2026 has the same
77 outcomes in five week clusters already used in earlier experiments. The
replay contains 3,221/224 outcomes across all three markets. Paired no-vig
sportsbook probabilities are explicit inputs. Book capture/revision timing and
new-stat vintage are not certified historical kickoff snapshots.

| Totals model                             | 2022–2025 Brier |      2026 Brier |
| ---------------------------------------- | --------------: | --------------: |
| Sportsbook                               |     0.250117319 |     0.250046329 |
| Production v4/fallback v3                |     0.249709539 |     0.250152857 |
| Previous fixed mixture                   |     0.249630010 |     0.250390197 |
| New matchup-feature mixture              | **0.249496434** | **0.250768518** |
| Same mixture with added features removed |     0.249279735 |     0.251486510 |
| Older-selected plain hybrid              |     0.249114487 |     0.252805881 |

The added features beat their paired feature-free control on 2026 by 0.000717992,
but worsen that control's archive result by 0.000216699. The new candidate improves
the fixed mixture's archive result by 0.000133575 and worsens its current result
by 0.000378321. It still loses to book and production on 2026. Added information
does not establish a usable current edge or justify stronger correction weights.

| Archive season | New totals Brier |  Book Brier | Fixed-mixture Brier |
| -------------- | ---------------: | ----------: | ------------------: |
| 2022           |      0.249615702 | 0.250212279 |         0.249275930 |
| 2023           |      0.248941656 | 0.250069225 |         0.249396836 |
| 2024           |      0.249393778 | 0.249779448 |         0.249793745 |
| 2025           |      0.250031143 | 0.250405640 |         0.250048413 |

The new candidate beats book in all four archive totals cells and seven of twelve
all-market cells. No cell has a positive simultaneous 95% book-improvement lower
bound. Clustered archive totals improvement interval is
**[−0.000448657, +0.001690427]**. Current totals improvement interval is
**[−0.006332766, +0.004888387]**; five clusters provide limited precision, and these
nominal intervals do not correct for repeated research on the same samples.
Totals log loss is 0.692139828 versus book 0.693381848 in archive, and 0.694690926
versus book 0.693239935 on 2026. Brier/log loss measure probability accuracy,
not betting returns after vig, payout selection, or transaction costs.

On 2026, new mean Over is 49.364%, almost equal to realized 49.351%, but only
39/77 corrections point the right way. Their mean absolute size is 1.329
percentage points versus 0.683 for the fixed mixture. Correction variance costs
0.000257231 and negative alignment costs 0.000464959. The added signals improve
some rankings versus the control, yet the larger remaining wrong corrections
still erase the gain. This is descriptive loss attribution, not causal proof.

All-market Brier is 0.236515472 versus book 0.236666348 in archive and
0.241232092 versus book 0.241126773 on 2026. Moneyline/spread maximum probability
difference from production is **exactly zero** in both samples. Untouched markets
retain their prior losing cells; this request cannot establish superiority there.

## Artifacts, verification and manual review

Saved [development](../research/model-v10-matchup-development.json),
[frozen hashes](../research/model-v10-matchup-frozen.json),
[audit with current numeric predictions and fixed-mixture diagnostics](../research/model-v10-matchup-audit.json),
[fixed-expert contribution decomposition](../research/model-v10-fixed-component-diagnostics.json),
[source provenance](../research/model-v10-team-stats-provenance.json), and
[join/data-quality evidence](../research/model-v10-team-stats-quality.json).
Raw public CSVs and the independent signal snapshot remain under
`/tmp/sidekick-model-v10`; the old game context remains under
`/tmp/sidekick-model-v6/recent-games.json`. Saved issued pregame/outcome records
are untouched. The Bills–Rams forward sidecar remains excluded from this fixed
2026 replay; no new prospective result is claimed.

Reproduce with Node 22 after a successful build:

```sh
node scripts/research/develop-matchup-totals.mjs --contexts /tmp/sidekick-model-v6/recent-games.json --signals /tmp/sidekick-model-v10/signals.json
node scripts/research/audit-matchup-totals.mjs --contexts /tmp/sidekick-model-v6/recent-games.json --signals /tmp/sidekick-model-v10/signals.json --frozen docs/research/model-v10-matchup-development.json
```

Validation: all **812 workspace tests** plus root/service suites pass; typecheck,
lint, build, formatting and diff checks pass. Tests cover malformed/missing/
duplicate source measures, response limits, reciprocal joins, historical aliases,
publication lag, future/target label and stat perturbations for both learners,
and exact non-total preservation. Synthetic fixtures verify mechanics only.
The build retains its existing large-dashboard-chunk warning (536.29 kB).

Scoped manual code/security review confirms fixed provider URLs, bounded inputs,
timeouts/cancellation, no secret handling, no HTTP/AI/provider-credential path,
no deployment or ledger writes, and no production dispatch change. No automated
security scan was run. Production v3/v4 code and v9 frozen source hashes remain
unchanged; only new research modules, typed exports and evidence/docs were added.
Consistent or prospective sportsbook superiority is still unverified.
