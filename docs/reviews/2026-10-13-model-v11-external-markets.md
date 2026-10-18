# Prediction-market flow, prices and headline research — October 13, 2026

Implemented the recommended totals-only research layer, collected real historical
Kalshi/Polymarket data, tested price/flow/media/combined variants, and sealed
fourteen upcoming-game numerical forecasts. Combined price and flow and flow alone
beat the matched sportsbook point estimate in this small reused sample. The whole
sample's uncertainty includes no improvement. No variant was promoted or selected
from these results; production moneyline/spread and v3/v4 dispatch remain unchanged.

## Sources and historical coverage

Fresh nflverse schedule capture at 19:02 UTC includes **79 completed 2026 games**.
The earlier temporary enriched context no longer exists. This comparison uses
the same fresh un-enriched base for all variants, not the old 77-game/personnel
snapshot. Historical metadata QB names are not treated as contemporaneous injury
reports. Production totals here fall back to v3; old frozen v4 results are not
replaced or claimed to reproduce. Baseline sportsbook prices have no verified
historical capture timestamp, so this is a retrospective probability comparison,
not proof of an executable price advantage.

The final bounded collection yields **113 exact-line full-game tapes**: 57 Kalshi
and 56 Polymarket, with **62,463** locally filtered executed trades. All 113 trade
walks completed; 45 provider/game combinations have no eligible exact-line
contract. Price evidence supports 74/79 games; sufficient complete trade-flow
windows support 64/79. An initial faster collection encountered rate limits;
the final capture uses request spacing and bounded retries and has no failed
provider/game reads. All final response URLs, retrieval times, byte sizes and
hashes are preserved in [quality/provenance evidence](../research/model-v11-source-quality.json).

Kalshi supplies public quantity, execution time and taker outcome/book side;
it does not provide trader identities in that feed. See its primary
[market](https://docs.kalshi.com/api-reference/market/get-markets),
[trade](https://docs.kalshi.com/api-reference/market/get-trades), and
[candlestick](https://docs.kalshi.com/api-reference/market/get-market-candlesticks)
documentation. Polymarket supplies outcome-token history and wallet trade activity
through its [public Data API v2](https://data-api.polymarket.com/v2/docs).
Current holders, positions and leaderboards are deliberately not used to fabricate
historical positions or select winning wallets after outcomes.

Discovery requires exact game/date/team identity and half-point line, full-game
totals semantics, and creation/open time before the prediction cutoff. Quarter,
half, moneyline and different-line contracts cannot substitute. Historical cutoff
is kickoff minus thirty minutes, with a preceding 24-hour observation window.
Polymarket game-start metadata must match the schedule exactly. Market rule
metadata is currently retrieved, not a certified original publication snapshot;
postponed/revised contracts require additional source-version evidence.

## Leakage and data validation

The typed integration uses fixed public HTTPS origins, no keys, bounded response
sizes, fifteen-second request deadlines, at most twelve trade pages, cursor-loop
rejection, and bounded idempotent retry/backoff. It validates numeric ranges,
direction/outcome orientation, dates, identities, duplicates and pagination.
Incomplete walks cannot support flow. Public wallet addresses are reduced to stable
hashes in normalized records; profile names, bios and images are not model inputs.
The raw public responses stay outside the repository under `/tmp/sidekick-model-v11`.

**A live source probe exposed settlement leakage:** Polymarket returned a final
payout at the requested old endpoint alongside a legitimate pre-cutoff price.
The parser excludes every `resolution_seconds = 0` point, including genuine raw
terminal ticks, because those cannot be safely distinguished from clamped payouts
using this payload. It accepts only positive-width windows whose entire interval
ended before the cutoff. A unit test covers a final payout clamped exactly to the
historical cutoff. This may sacrifice freshness but never treats the result as
a historical predictor.

Kalshi prices use completed bid/ask candle midpoints, excluding crossed/very-wide
or endpoint quotes. Polymarket prices are aggregate Over-token transaction-price
observations, not executable bid/ask midpoints. Both need a point no more than an
hour old. Six-hour price movement is separately recorded. Trade responses are
filtered locally by execution time; Polymarket's market-wide trade endpoint does
not honor start/end filters, so twelve bounded pages must finish or flow is
unavailable. Query/filter semantics follow the API's current schema and are not
assumed from an older client library.

## Model and controls

Four predefined families are compared: prices, flow, media, and combined. They
fit a ridge correction to the earlier production total logit. There is no new
global expert-weight search. Twenty feature dimensions represent each provider's
price gap to paired book, six-hour movement, availability, one-hour signed flow,
large-trade flow, relative volume, large-trade count and wallet-weighted flow,
plus four headline proxy dimensions. Flow alone excludes price features; prices
alone excludes flow. Missing evidence gates the family back to production.

Large-trade eligibility is determined using the preceding 23-hour size distribution
(95th percentile), with a floor of 500 shares × execution price. The recent hour
cannot choose its own threshold. Taker purchases of Over and sales of Under are
positive; purchases of Under and sales of Over are negative. Trades on both sides
of a transaction are not counted as two independent votes.

Wallet weighting needs at least ten earlier completed game observations, shrinks
directional accuracy relative to the paired sportsbook by twenty prior games,
and caps each trade's contribution. Only earlier weeks contribute, including for
each historical training feature. This is a past directional-information proxy,
not a PnL leaderboard, proof of skill, or a human identity. Only **one** audited
game has a nonzero wallet-weighted feature. The observed flow gain therefore
chiefly concerns anonymous executed-trade flow, not validated whale selection.

Parameters were frozen at **19:15:18 UTC / 3:15 p.m. Eastern** before numerical
score inspection: ridge penalty 100, minimum thirty earlier supported games and
maximum added logit 0.15. A provenance-only guard was strengthened before score
inspection to require exact context/history hashes for replay and unchanged
training tapes for pending records. Numerical methods/settings did not change.
No family was selected using later outcomes. The model requires earlier completed
NFL weeks, excludes target/same-week/future labels and tapes, and computes every
training game's features at its original cutoff.

## Retrospective results

Lower Brier is better. These 79 totals belong to only five reused week clusters;
corrections actually change thirty games after the minimum-history gate opens.

| Totals method             | Brier, Weeks 1–5 | Brier, Weeks 4–5 |
| ------------------------- | ---------------: | ---------------: |
| Sportsbook                |      0.250268772 |      0.250664954 |
| Unchanged production base |      0.250512675 |      0.251372034 |
| Price differences only    |      0.250409572 |      0.251109287 |
| Large-trade flow          |  **0.250184386** |  **0.250535426** |
| Price + flow              |  **0.250138277** |  **0.250417924** |
| Media-only fallback       |      0.250512675 |      0.251372034 |

Combined totals log loss is 0.693436562 versus book 0.693685000; flow is
0.693528651 and price-only is 0.693978598. Combined improves whole-sample Brier
by 0.000130494 versus book. Its nominal normal week-cluster interval is
**[−0.003057953, +0.003318942]**. The later subset has only two clusters; even its
apparently positive normal interval is not credible evidence of significance or
consistent performance. These intervals do not account for repeated research on
this sample or choosing among four families. No profit or sustained edge is claimed.

All-market combined Brier is 0.242205097 versus book 0.242376374. Maximum
moneyline/spread difference from their original production calculation is
**exactly zero** in every family. Untouched-market results cannot be attributed
to the new totals signals.

## Sentiment and prospective records

The sentiment component is a narrow, auditable **headline scoring-language proxy**:
high/low-scoring descriptions, matched story volume, availability concerns, and
an explicit coverage flag. It requires at least three different headlines from
two publishers. Copied titles are deduplicated. Team-matched football headlines
are supplementary evidence, not a representative online opinion survey. Existing
public RSS sources provided seven current dated headlines in this capture.
No new paid social API account or credential was introduced.

Current text cannot be backdated merely because a headline has an old publication
date. Historical media coverage is consequently zero, the media model falls back
exactly, and **sentiment accuracy has not been evaluated**. The current snapshots
are available for prospective collection; sufficient dated training observations
are still needed before the media correction can activate.

The verified live sportsbook collector provided paired Over/Under prices for
**fourteen upcoming Week 6 games**. Their exact-line external capture has nineteen
matched tapes and nine missing provider/game contracts. The historical tapes are
preserved as training input. All four variants' numeric Over probabilities and
original book quotes were issued before kickoff at about **3:16 p.m. Eastern,
October 13**, and saved without an owner Advice-journal write. All fourteen are
pending; the first independent sidecar check confirms zero resolved games.

The [issued numeric record](../research/2026-10-13-v11-pregame-numeric-record.json)
is sealed by [its checksum](../research/2026-10-13-v11-pregame-seal.json).
The [initial forward check](../research/2026-10-13-v11-forward-check.json) is an
independent result sidecar. A separate CLI fetches verified final ESPN results,
checks the seal and game/kickoff identities, and writes a new sidecar with
`flag: wx`; it never updates issued probabilities or original odds. Variants from
one game remain correlated observations. No scheduler or background polling was
created, and no pending result is counted as accuracy evidence.

## Reproduction and verification

Saved [frozen code/settings](../research/model-v11-external-frozen.json),
[historical audit](../research/model-v11-external-audit.json),
[pregame audit](../research/model-v11-pregame-records.json), and source-quality
evidence. To avoid another lost temporary-data dependency, bounded normalized
public tapes and the context are retained as gzip snapshots; raw publisher feeds
are excluded. They contain no provider secrets or wallet profile text.

```sh
gzip -dc docs/research/model-v11-contexts.json.gz > /tmp/v11-contexts.json
gzip -dc docs/research/model-v11-external-signals.json.gz > /tmp/v11-signals.json
node scripts/research/audit-external-totals.mjs --contexts /tmp/v11-contexts.json --signals /tmp/v11-signals.json --frozen docs/research/model-v11-external-frozen.json
node scripts/research/score-external-totals-forward.mjs --contexts /tmp/v11-contexts.json --record docs/research/2026-10-13-v11-pregame-numeric-record.json --seal docs/research/2026-10-13-v11-pregame-seal.json --out /tmp/v11-new-forward-result.json
```

Capture new snapshots explicitly with `scripts/research/capture-external-totals.mjs`;
`--mode history` uses the thirty-minute cutoff, and `--mode pregame` verifies
fresh paired sportsbook prices and captures current media. Use a new output
directory. New issued predictions require the unchanged historical training
tapes; never replace the existing sealed record after games finish.

All **819 workspace tests** plus root/service suites pass, along with typecheck,
lint, build, formatting and diff checks. Added tests verify contract/line identity,
creation and kickoff gates, outcome orientation, payload bounds, terminal payout
exclusion, overlapping time-window exclusion, duplicate rejection, incomplete
flow fallback, current-text backfill rejection, wallet cold start and successful
past-only weighting, future-label/tape perturbations and exact non-total output.
Synthetic test fixtures are excluded from all measured results. Production build
retains its existing 536.29 kB dashboard-chunk warning.

Scoped manual code/security review confirms typed integration boundaries, fixed
URLs, no authenticated trade endpoints or credentials, deadlines/size/page/rate
bounds, source-version limitations, no prompt execution from provider text,
read-only public provider access, no deployment/service/owner-journal changes,
and separate immutable forecast/outcome artifacts. No automated security scan
was run. Archived v9/v10 frozen numerical modules and issued older records remain
unchanged. Larger contemporaneous samples and prospective results are still required.
