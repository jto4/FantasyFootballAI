# Football drive features and totals residual model — October 13, 2026

The corrected flow model adds little practical information after its regularization
and feedback gate. A new football residual model produces meaningful departures
and improves the reused 2026 sample, but still loses late 2025 and the full
four-season comparison. It is **not promoted**. Production totals, moneyline,
spreads and issued forecasts remain unchanged.

## Why corrected flow contributes so little

[Exact v15 reproduction and decomposition](../research/2026-10-13-v16-flow-diagnosis.json)
separates feature scale, training support and feedback:

- Late 2025: 137/151 games have external support; 85 have robust flow and only
  34 matching price confirmation. Mean absolute raw correction is 0.00003396
  probability, or 0.00340 percentage points. Mean feedback weight among raw
  active forecasts is 0.001941, retaining about 0.194% of the correction.
- 2026: 74/79 games have support, 62 flow and ten price confirmation. Raw mean
  absolute correction is 0.00003216 probability. Mean feedback weight among raw
  active forecasts is 0.005356; only fourteen games have positive feedback.
- The effective training averages are 56.5 and 20.1 games respectively. Small
  centered feature values, ridge penalty 400 and a season reset produce tiny
  coefficients. The feedback ridge further suppresses corrections whose squared
  magnitudes are small. This is mechanical shrinkage as well as weak evidence.
- Removing the gate is not a demonstrated fix: late-2025 raw alignment gain is
  negative, and its raw Brier still loses book. The 2026 raw point gain is positive,
  but neither it nor the gated result establishes an independent edge.

Distinct-minute activity is not independent trader skill. Kalshi identities are
anonymous; identified Polymarket wallet pressure remains a sparse, equal-wallet
measure. These results do not prove that all market flow lacks information, or
that coverage and prices establish trader expertise.

## New inputs and model

Captured official nflverse play-by-play releases for 2019–2026. The retained
[provenance](../research/model-v16-drive-provenance.json) records raw URLs, capture
times, compressed hashes, selected-field hashes, availability failures and counts.
There are **3,822 paired team-game rows**. Missing efficiency/drive metadata or
zero play counts make 39 historical games unavailable; values are not filled
with zero. All 79 current-season source games pass these checks.

The integrations adapter validates CSV schema, identity, season, team membership,
duplicate plays, drive results and clocks. Responses have a 45-second timeout,
45 MB compressed limit and 250 MB decompression limit; CSV also bounds rows,
columns and cells. Repaired `fixed_drive` IDs identify offensive possessions;
original drive IDs deduplicate possession clocks because repairs can merge
original drives. Unknown or contradictory metadata is rejected.

Prior completed weeks, with a 48-hour lag, supply opponent-adjusted attack and
defense ratings for EPA, success, explosive plays, passing efficiency, sack rate,
non-kneel scrimmage drives, drive scoring, opportunities inside the opponent's
40, red-zone finishing, possession clock consumption, and neutral pass/no-huddle
rates. Neutral means a score margin within eight, regulation, and more than two
minutes left in the quarter; kneels and spikes are excluded. Touchdowns contribute
seven and field goals three to the drive scoring **proxy**; return scores and
conversion variation are not inferred as offensive efficiency. Clock seconds per
play are clock consumption, not measured wall-clock snap tempo.

An expected drive count × matchup points-per-drive interaction supplies a gap to
the sportsbook line. Fourteen football predictors are scaled and bounded without
coverage indicators. Four optional columns average the providers' corrected
innovation/confirmation/large/wallet pressure. Missing flow is unavailable and
contributes zero, with no predictive liquidity or coverage flag.

The new model learns **final total minus archived line**, preserving outcome
severity beyond an Over/Under bit. Weighted ridge clips training residuals at
±35 points, converts a residual shift using prior fitted residual scale, and caps
added logit at 0.35. Current labels decay over eight weeks; up to three prior
seasons carry half-strength per season and decay over 26 weeks. Team features
carry only the preceding season at quarter strength. Earlier forecasts fitted
at their own origins determine bounded book-mixture feedback; no current-week
or future labels enter a fit or feedback weight.

This is revised historical PBP, not certified historical publication vintages.
The lag prevents current-game performance leakage but cannot undo revisions.
Official [PBP definitions](https://nflreadr.nflverse.com/articles/dictionary_pbp.html)
and [update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
were checked. No inferred historical injuries or game-time weather were added.

## Frozen selection and paired results

Four candidates were declared: penalties 25/100, each football-only or with flow.
[Settings](../research/2026-10-13-v16-frozen-settings.json) select **penalty 100,
football-only** by the 390 development games in 2024 and 2025 weeks 1–8, before
this audit. Its development Brier is 0.25039279 versus book 0.24999099: selection
identifies the best new candidate, not a development winner over book.

[Audit](../research/2026-10-13-v16-audit.json), lower Brier is better:

| Candidate                             | Late 2025, 151 | 2026 W1–5, 79 | Combined audit, 230 | All 2023–2026, 890 |
| ------------------------------------- | -------------: | ------------: | ------------------: | -----------------: |
| Sportsbook                            |     0.25036106 |    0.25026877 |          0.25032936 |         0.25010217 |
| Frozen primary: football, penalty 100 |     0.25093937 |    0.24869777 |          0.25016943 |         0.25026758 |
| Football + flow, penalty 100          |     0.25095009 |    0.24872030 |          0.25018421 |         0.25027206 |
| Football, penalty 25                  |     0.25082014 |    0.24610571 |          0.24920084 |         0.25032092 |
| Football + flow, penalty 25           |     0.25082810 |    0.24610829 |          0.24920695 |         0.25032480 |

The preselected primary improves 2026 Brier by **0.00157100** and the combined
audit by **0.00015993**, but loses late 2025 by **0.00057831** and all 890 games by
**0.00016541**. It loses each full 2023, 2024 and 2025 season. Nominal week-cluster
95% book-improvement intervals include zero for 2026
[-0.00115867, 0.00430067] and combined audit [-0.00139065, 0.00171051]. Only five
2026 week clusters exist. The lower-penalty audit winner was not substituted for
the frozen primary after seeing these results.

Football coverage is 879/890, including all 151 late-2025 games and 76/79 current
games. The three current fallbacks lack enough weighted prior football history,
not current source rows. Primary corrections exceed 0.001 on a substantial subset;
mean absolute correction is 0.01083 late 2025 and 0.01766 in 2026. This is an
actual conditional predictor, not the near-book tie of v15. Exact fallback is
still a tie and remains in the matched comparison.

[Result decomposition](../research/2026-10-13-v16-result-diagnostics.json) shows
why this is not a consistent improvement. Late-2025 raw alignment is positive,
but correction variance is larger. Feedback also allocates weight poorly:
Weeks 11–12 and 17 lose, with book fallback in Weeks 13–15 after recent failures.
This is descriptive evidence of delayed feedback in changing conditions, not a
causal attribution or permission to tune against those audit weeks.

Adding flow to the selected football model worsens late-2025 Brier by 0.00001072
and 2026 by 0.00002253. Its ungated point effect is mildly beneficial, but changes
in earlier-forecast feedback reverse that effect in final probabilities. Flow
still contributes very little relative to football corrections and does not
justify inclusion on these results.

All seasons were reused research cohorts, including the development sample.
Repeated experiments and retrospective selection weaken inference even when
settings are sealed before this replay. Archived sportsbook quotes still lack
observation timestamps. This measures probability forecasts, not executable
prices, betting profits or a guaranteed edge.

## Verification and reproduction

Moneyline and spread probabilities delegate directly to the unchanged production
`model.adjust` call. Maximum difference is exactly **zero** for all four variants
across **893 moneyline and 870 spread** cases. No live adapter/forecast route is
changed; the core export only makes the typed research input validator available
to integrations. Prior frozen code/settings/audits and v6/v11 issued numeric
records remain preserved.

851 workspace tests plus root suites, typecheck, lint, format and build pass under
supported Node 22. The existing dashboard 536.29 kB chunk warning remains.
Tests cover paired/sparse/ambiguous joins, source bounds and schema, fixed/original
drive clock deduplication, temporal invariance under changed future performance,
flow ablation, forecast identity, bounded predictions and exact non-total
preservation. Scoped ordinary manual code/security review checks these invariants,
provider boundary bounds, selected-source hashes and prior-only feedback. No
automated security scan, wager, credential change, owner configuration change,
owner Advice journal write or AI call is performed.

[Verification](../research/model-v16-verification.json) records exact source
reconstruction and full replay. With Node 22, build dependencies, decompress the
shared v11 contexts, original v12 r2 signals and v15 corrected signals into a fresh
directory. Then run:

```sh
node scripts/research/replay-drive-signals.mjs /path/to/drive-stats.json
node scripts/research/audit-drive-totals.mjs /path/to/games.json /path/to/original-signals.json /path/to/corrected-signals.json /path/to/drive-stats.json docs/research/2026-10-13-v16-frozen-settings.json
```

The eight retained selected-field CSV archives reconstruct every normalized
feature-input row offline, byte-for-byte against the saved
[drive snapshot](../research/model-v16-drive-stats.json.gz). The audit verifies
source/data/parent hashes and reproduces all four candidates' rows, probabilities
and metrics; only the scoring timestamp differs. Collecting new source data and
re-running selection are separate CLIs and are not needed for replay.
