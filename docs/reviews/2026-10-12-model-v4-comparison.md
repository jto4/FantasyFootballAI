# Injury, quarterback and forecast-weather model comparison — October 12, 2026

## Implemented behavior

Paired-price totals with usable dated context now use `health-weather-total-v4`.
The prior book-offset logistic model jointly learns eight additional features:
reported offensive and defensive absences, the previous starting quarterback's
reported Out/Doubtful status, a captured rank-one quarterback change, forecast
wind, cold and precipitation. Coefficients are regularized and fitted exclusively
on earlier NFL weeks. At least 200 earlier eligible paired-price observations are
required; otherwise the calculation retains v3. No fixed injury point penalty or
invented participation probability is applied. Moneyline and spread retain v3:
older development evidence did not favor the new corrections for these markets.

Current Advice fetches typed public context and exposes source coverage, missing
inputs and named quarterback comparisons. The historical worker uses each game's
own pre-kickoff snapshot, own line and paired prices. Saved older advice remains
readable; newly saved totals retain their separate method. Help/search explains
what the new inputs mean. HTTP requests cannot tune the procedure or import the
research snapshots. Book probabilities remain an explicit model input, and all
existing calibration, paired-improvement, quote and actionable-pick gates remain.

## Sources and temporal limits

- NFLverse dated injury rows supply 2016–2024 context. The downloaded 2025 and 2026
  files omit update timestamps, so none of their injury rows become dated numeric
  features. Publication dates must precede the snapshot and be within seven days
  of kickoff. Duplicate/conflicting identities are excluded. An unlisted player is
  not described as healthy. See the [injury dictionary](https://nflreadr.nflverse.com/articles/dictionary_injuries.html).
- Historical rank-one quarterback comparisons use 2025+ depth-chart capture times.
  Older undated weekly charts are excluded. The previous quarterback comes only
  from an earlier completed game; the target game's recorded starter is never a
  predictive input. Captured charts must be within three days and the prior start
  within 30 days. A chart listing is not confirmation of a game-day starter. See
  the [depth-chart dictionary](https://nflreadr.nflverse.com/articles/dictionary_depth_charts.html).
- Regional JMA GSM forecasts use Open-Meteo `previous_day2` (48-hour lead), available
  from 2018. The availability boundary is conservatively taken as valid hour minus
  36 hours, allowing 12 hours after initialization; exact publication timing is not
  established. Forecasts are coarse regional conditions, not measured stadium
  weather. Only fixed, verified outdoor ID/name pairs have coordinates; covered
  and retractable-roof venues are omitted. Of 28 attempted outdoor locations, 25
  fetched successfully and three international locations failed. Coordinates come
  from the [primary stadium author](https://github.com/greerreNFL/Stadiums); model
  lead semantics are described by [Open-Meteo](https://open-meteo.com/en/docs/previous-runs-api).
- Live ESPN event-linked injury labels supply a dated current alternative when
  a team's NFLverse rows lack publication dates. Event identity, kickoff, teams,
  season and pre-event status are checked. Only dated Out/Doubtful/Questionable
  labels within seven days qualify; IR is excluded. These are publisher labels,
  not a verified official participation report. Historical fitting uses NFLverse;
  the ESPN-to-NFLverse vendor bridge has not been validated prospectively.
- Current ESPN depth charts receive the actual retrieval observation time, never
  a backdated publication claim. Missing context stays unknown. Provider URLs are
  fixed; response sizes, record counts, timeouts, caches and combined work are
  bounded. No remote URL supplied by an athlete or injury payload is followed.

## Selection and reproduction

The raw schedule SHA-256 is
`c2323a79d0abfe38c10f577520bec65718c5f62cbf618b323b1a1c5a19c94092`.
The prepared public game snapshot SHA-256 is
`3fccd9613e9b9ece2b5ddb187ce75c5928e0d924f7681471ea5e244c81de2fca`.
Post-freeze diagnostic cases are retained in `docs/research/model-v4-ablations.json`.
All raw source hashes, retained candidate results and the freeze are recorded in
`docs/research/model-v4-{frozen,development,audit}.json`.

Five procedures per market were compared only on 2018–2021: v3, joint additional
features at penalties 200/1000, and an additional correction around earlier-week
v3 logits at penalties 200/1000. All rows after 2021 were discarded before
preparation. The final choice froze at 09:58:53 UTC: v3 for moneyline/spread,
joint penalty 200 for totals. No return optimization or later-season retuning was
performed. Earlier v1/v2/v3 results for 2022–2025 had already been inspected; this
is reused retrospective evidence, not an untouched holdout or prospective test.

`npm run betting:context-develop -- --contexts <public-games.json>` reproduces the
older grid using a bounded validated local snapshot. `npm run betting:model-audit
-- --contexts <public-games.json>` prints the matched audit; without a snapshot it
fetches public game context. `--snapshot <schedules.csv>` remains scores-only v3.
The production historical worker and audit CLI agree within 1e-12 for all twelve
season/market errors on the frozen snapshot. Research commands never save advice,
invoke paid AI, or place a wager.

## Matched results

Brier error is mean squared probability error; smaller is better. The same 3,221
non-push market outcomes in 2022–2025 were scored for every procedure.

| Procedure                 | Pooled Brier |
| ------------------------- | -----------: |
| New mixed v4/v3 procedure |   0.23658686 |
| Previous v3               |   0.23660618 |
| Previous v2               |   0.23678419 |
| Paired no-vig sportsbook  |   0.23666635 |

The aggregate change is approximately 0.0082% versus v3 and 0.0336% versus the
book. The weekly-cluster paired 95% interval for book-minus-model error is
[-0.00041080, +0.00056978], which includes zero. The model beats the book in only
five of twelve season/market cells, unchanged from v3. No simultaneous comparison
establishes superiority. All paper-action gates continue to withhold selection;
there are zero qualified bets and no demonstrated betting profitability.

| Total season | Outcomes |     New v4 | Previous v3 |       Book |
| ------------ | -------: | ---------: | ----------: | ---------: |
| 2022         |      268 | 0.24888108 |  0.24892321 | 0.25021228 |
| 2023         |      270 | 0.24804128 |  0.24823442 | 0.25006923 |
| 2024         |      269 | 0.25135219 |  0.25114012 | 0.24977945 |
| 2025         |      272 | 0.25055727 |  0.25076258 | 0.25040564 |

Totals improve versus v3 in three of four seasons; 2024 gets worse. Moneyline and
spread probabilities remain identical to v3. Total non-push coverage is:

| Season | Dated injury cases | Regional weather cases | Captured QB changes |
| ------ | -----------------: | ---------------------: | ------------------: |
| 2022   |                265 |                    167 |                   0 |
| 2023   |                269 |                    168 |                   0 |
| 2024   |                268 |                    167 |                   0 |
| 2025   |                  0 |                    171 |                  49 |

A post-freeze diagnostic, without retuning, retrained totals using each context
family separately. Across the same 1,079 outcomes with v3 fallback, injury-only
Brier was 0.24984951, weather-only 0.24967330 and chart-only 0.24976022, versus v3
0.24976722 and book 0.25011732. Active coverage differed (802/673/48), so these
are not isolated causal effects. Injury-only worsens v3 overall; combined gains
cannot be attributed to all three new families, and limited chart coverage cannot
establish a reliable quarterback-change effect. No candidate was changed after
this diagnostic.

## Verification and scoped manual review

A real public Rams–Bills pregame check at 10:45 UTC produced dated ESPN injury
labels and current chart comparisons for Stafford/Allen. Both chart changes were
false, Buffalo had one reported offensive and one defensive absence, and covered
SoFi weather remained unknown. All three numeric forecasts returned; totals used
v4, moneyline/spread v3, and every pick was withheld. Cold moneyline preparation
was 4.28 seconds in this check. Four-season production replay took 77.98 seconds
under concurrent test load. These timings are observations, not latency promises.

781 workspace tests and the root script suites pass, including source/calendar
validation, future-report rejection, prior-start boundaries, duplicate handling,
roof/name matching, forecast units/lead/cutoffs, dated live injury alternatives,
cache mutation isolation, cancellation and saved-method compatibility. Six model
browser paths pass for desktop and 320-pixel widths. The actual two-season API worker reaches the renderer in a 43.2-second desktop
journey and matches the research replay exactly. The same report passes 320-pixel
replay, console/overflow/overlay checks and visual screenshot inspection. The
repository development command reproduces every older-grid candidate and selection
exactly. All 222 Chromium journeys pass. Final production build, typecheck, lint,
formatting and whitespace checks pass; the build retains the existing large-chunk
warning. Desktop/mobile screenshots show readable reports without horizontal
overflow or browser errors. No UI regression was found in this scope.

Manual code/security review covered fixed upstream origins, response/time/work
bounds, strict event/team/date/venue identity, context cloning, cache identity,
worker isolation, price/outcome alignment, pre-week fitting, unchanged action
gates, source disclosure, and old ledger methods. No automated security scan was
run. No owner credentials, settings, service, AI account, wager, deployment or
release was changed. Future timestamped records, official injury/vendor agreement,
confirmed quarterback participation, regional-weather reliability and sustained
book superiority remain open validation requirements.
