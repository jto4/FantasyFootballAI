# Better injury and quarterback data: candidate comparison — October 12, 2026

## Outcome

Better source coverage is implemented, but the tested corrections did not improve
prediction error. Production retains `market-context-v3` moneyline/spread and
supported `health-weather-total-v4` totals. No new v5 method is deployed. Official
NFL article reports, previous snap roles and quarterback efficiency are descriptive
context; their experimental numerical effects remain disabled. The research-only
counterfactual is explicit and is never enabled by HTTP/live callers.

## Sources and quality checks

The integrations boundary now discovers official NFL weekly injury articles from
bounded same-origin monthly indexes (2025 onward). It reads the NewsArticle's
publication and latest modification, validates the season/week/team/status fields,
and extracts bounded player facts from recognized team sections. The entire current
body inherits its latest modification: an early original publication cannot make
later edits knowable before kickoff. Malformed/duplicate team lists are withheld;
remote references and arbitrary domains are never followed. Current Advice prefers
usable official reports and preserves their exact article link; dated NFLverse or
ESPN alternatives remain available when no usable official list exists.

A 23-article collection yielded usable official injury facts for 130 games and 245
team sides in 2025, filling part of the original dated-injury gap. This is partial
coverage: most games with early kickoff cannot use a page edited later that day,
and an empty or missing list does not establish health. For example, the
[2025 Week 1 article](https://www.nfl.com/news/nfl-week-1-injury-report-player-statuses-for-all-16-games-2025-season)
had a September 7 modification at 19:58 UTC, later than early Sunday kickoffs.
The inspected 2024 Week 1 page was modified weeks after its games and cannot
reconstruct a pregame snapshot. Undated NFLverse 2025/2026 injury rows remain excluded.

Typed [NFLverse weekly player and snap data](https://github.com/nflverse/nflverse-data)
adds earlier-game quarterback efficiency and prior roles. Performance rows require
strict game/season/week/team/GSIS identity; snap roles use unique normalized
team/name matches, with duplicate/conflicting matches excluded. Recorded target
starters, target production, target snaps and uncompleted games never enter these
features. The snapshot requires an earlier NFL week and a 24-hour post-kickoff
availability allowance. That allowance is not verified historical publication
metadata; statistics may have been revised after the game. See the
[primary player-stat documentation](https://nflreadr.nflverse.com/articles/dictionary_player_stats.html).

Quarterback efficiency uses up to eight earlier appearances, adjusted net passing
yards per dropback (yards plus signed sack losses, plus 20 per touchdown, minus 45
per interception), shrunk by 100 dropbacks toward a six-yard reference and bounded
as a relative index. It is not intrinsic player value or confirmed participation.
Strict GSIS matches take priority; a unique name is used only without a usable ID.
A captured chart or last starter is a role assumption, not a confirmed starter.
Reported Out role weights sum prior offensive/defensive snap fractions from up to
three earlier team games. A missing match stays unknown; it is never converted to
zero use or a fixed points penalty. Questionable roles have separate descriptive
features, without guessed participation probabilities.

The source profile caught two errors before model selection: sack losses are
negative in the source, and the earlier frozen snapshot lacked previous-quarterback
names. Signed units were corrected, earlier identities rebuilt, and range/identity
checks added. The final 2016–2025 context has both-team personnel facts for 2,636
of 2,639 games, both-team quarterback grades for 2,445, and both-team complete
weighted offensive Out groups for 1,796. Player-level unmatched roles remain
unknown. Exact hashes, per-year coverage, source URLs and modification times are
in `docs/research/model-v5-personnel-{sources,quality,frozen}.json`.

Production history avoids downloading the rejected full personnel corpus.
Current descriptive roles fetch only the two relevant seasons and cache bounded
numeric facts for six hours. Full personnel history is opt-in through the typed
provider's research constructor, not a dashboard or HTTP tuning option. Optional discovery bounds/failures leave source status unavailable while retaining
other public history. Network budgets, bounded response/record sizes and cloned historical contexts remain in
place; source failures stay visible and do not invent weather or injury inputs.

## Candidate selection and retest

The previous procedure plus all, quarterback-only and injury-role-only corrections
at penalties 200 and 1000 were compared on 2018–2021, with all later rows removed
before preparation. This is seven candidates per market, 21 market/procedure
comparisons. Extra corrections fit earlier-week previous-model logits with ridge
regularization, enough prior eligible contexts and no return optimization.
Every new candidate had higher development error than the previous procedure;
all three markets retained it. Selection froze at 16:39:49 UTC. An initial joint
recent comparison was computed but not used to select the additional older-family
tests. Later comparisons are reused retrospective evidence: 2022–2025 results
had already been inspected repeatedly in prior work, so this is not a fresh holdout.

| Older development market | Matched outcomes | Retained error | Best new candidate error |
| ------------------------ | ---------------: | -------------: | -----------------------: |
| Moneyline                |            1,034 |     0.21082684 |               0.21082748 |
| Spread                   |            1,016 |     0.24907034 |               0.24907567 |
| Total                    |            1,027 |     0.24967576 |               0.24967785 |

At penalty 1000, injury-role-only is the best new moneyline candidate and
quarterback-only is best for spread/totals. Their measured errors are still higher. All candidates are retained in
`docs/research/model-v5-personnel-development.json`.

An explicit counterfactual also fed the new official injury counts into v4 totals
on the same 3,221 non-push 2022–2025 outcomes. Production masks this new source's
injury features and does not count them toward quantitative injury eligibility.
The current raw reports remain available for descriptive coverage.

| Procedure                               | Pooled Brier error (lower is better) |
| --------------------------------------- | -----------------------------------: |
| Retained production / previous v4-v3    |                           0.23658686 |
| Rejected official-count numerical trial |                           0.23659370 |
| Paired no-vig sportsbook                |                           0.23666635 |

The trial's 2025 totals error rises from 0.25055727 to 0.25063832; the 2025 book
error is 0.25040564. Earlier seasons are unchanged. The paired weekly-cluster
95% book-minus-trial interval is [-0.00042129, +0.00056658], including zero.
Both the retained procedure and trial beat the book in only five of twelve
market/season cells; no simultaneous comparison establishes superiority. No
qualified paper selections or profitability are established. Production reproduces
the prior forecast errors exactly in every market/season, within 1e-12. Rejecting
a deployment based on this audit does not make future evaluation independent:
consistent superiority still requires substantial newly recorded outcomes.

## Reproduction

`npm run betting:personnel-develop -- --contexts <public-games.json>` reproduces
all older candidate results and selection exactly. The bounded snapshot loader
checks types, dates, source classes, prior weeks, numeric ranges and unknown keys.
`npm run betting:personnel-audit -- --contexts <new-games.json> --reference
<previous-games.json>` reproduces the explicit research-only source trial and
retained-production comparison. These commands do not save owner advice, tune
HTTP requests, invoke AI, or place a wager. The frozen prepared snapshot SHA-256
is `77c3eb2fbf72e7929277a427f4a51ae8c6696dd737075813c3d98d7c6c1ceb54`.
Raw public collection files remain outside the repository; their hashes and
original endpoints are retained. There is no synthetic data in these error scores.

## Live/forward evidence and verification

A real public Rams–Bills check captured official Rams article context, dated ESPN
Bills labels, earlier GSIS identities, current chart observations and prior
performance/roles. Every game-market forecast returned and every pick was withheld.
Covered SoFi weather stayed unknown; several historical venue requests failed and
were disclosed. A complete cold public-data lifecycle took 58.81 seconds under
concurrent browser/research load, before the historical personnel download was
made research-only. It is not comparable to earlier checks that reused a prepared
local history. Current/cache behavior and provider latency remain limitations.

The numerical record at 16:57:41 UTC (12:57 p.m. New York time) precedes the
October 12 Rams–Bills kickoff. It retains paired prices, probabilities, source
context, method identity and code/history hashes in
`docs/research/2026-10-12-pregame-numeric-record.json`. Outcomes are pending; it is
one game, not an accuracy or profit result. It is separate from the owner's Advice
journal and invokes no real AI or wager. Subsequent source changes must not rewrite
this record or backdate later predictions.

790 workspace tests plus root script suites and all 222 Chromium journeys pass. The final
provider checks and six desktop/320-pixel model paths pass after reducing historical
downloads. Screenshots show readable disclosures with no browser errors or overflow;
saved schemas/history and settings/credential/delivery isolation pass. Final production build, types, lint, formatting and whitespace checks pass.
The existing large dashboard chunk warning remains. The final six browser paths
explicitly verify the visible rejected-correction disclosure after save/reload.

Scoped manual code/security review covered fixed origins, validated discovery,
latest-edit cutoffs, game/team/week/GSIS joins, duplicate rejection, signed units,
missing-value behavior, cache cloning/bounds, request cancellation, default-disabled
research corrections, preserved qualification gates and source attribution. No
automated security scan was run, and no owner settings, credentials, service,
AI account, deployment, release or wager was changed. Stronger officially confirmed
starter snapshots, exact historic publication/fill constraints, complete injury
coverage and substantial future outcomes remain open requirements.
