# Real football data advice review — October 13, 2026

Tested all six advice workflows with current public football data and the production
signed-in Codex GPT-6.1-Sol analysis/review service. **20 analyses, 40 validated model
responses, zero invalid responses and zero independent arithmetic/audit failures.**
The review includes an initial ten-case sweep and ten corrected/supplemental cases.
The [quality record](../research/2026-10-13-real-advice-quality.json) retains reviewed
answers, decision metrics, fetched quotes, phase identity and evidence hashes.

This tests evidence consistency and practical decision explanations. The fantasy
rosters, ownership and pick log are explicitly constructed PPR scenarios, not the
owner's league. Future NFL outcomes, forecast calibration and betting profit are
not established by this run. Nothing was sent, traded, drafted or wagered.

## Real data and quality checks

Public capture at **2026-10-14 01:54:53 UTC** (October 13 locally):

| Evidence                                        | Recorded coverage                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Current NFL state                               | 2026 regular season, Week 6                                                |
| Player-game rows, including supported D/ST rows | 45,108 across 2024–2026                                                    |
| Current-season stat coverage                    | Weeks 1–5, 5,659 rows                                                      |
| Sleeper catalog                                 | 12,229 player identities                                                   |
| ESPN publisher forecasts                        | 6,035 weekly rows, 426 identities; issued Week 6                           |
| Football data source loads                      | 61 available, none unavailable                                             |
| Injury CSV                                      | 1,413 rows; zero Week 6 rows and zero report-update dates                  |
| News                                            | 11 retrieved stories; attributed selected headlines remain limited proxies |
| Real sportsbook test                            | ESPN-displayed DraftKings prices for SEA at DEN                            |

Player/game composite keys and forecast identity/season/week keys had zero
duplicates. Week 6 scheduled games had no recorded results. Matching checks keep
GSIS, ESPN and Sleeper identities separate and reject conflicting explicit IDs.

The [nflverse update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
distinguishes the feeds' update schedules. The observed CSV cannot establish
current injury availability merely because it downloaded successfully. The
[Sleeper API documentation](https://docs.sleeper.com/) describes the public state,
player catalog and activity interfaces. Retrieved forecasts and prices remain
publisher expectations/snapshots, not guarantees or executable transactions.

## Issues fixed

1. **A confirmed bench bye blocked a complete lineup and waivers.** Chase's absent
   weekly estimate reduced coverage even when a legal complete replacement lineup
   was quantified. Player evidence now distinguishes a verified bye using a complete,
   unambiguous team season schedule. The planner excludes that player without
   inventing zero points. Partial schedules, unknown active estimates and incomplete
   starting assignments retain their original gates. Saved evidence validates the
   optional bye field and forbids a simultaneous point estimate.
2. **PUP/NFI could retain historical active estimates.** Charbonnet's PUP flag still
   allowed a 12.425-point historical baseline. Shared inactive-status checks now
   withhold active estimates/choices for reserve flags, including betting player
   availability. Questionable remains an uncertain conditional comparison.
3. **Publisher suffix mismatch lost current projections.** Sleeper's “James Cook”
   failed to match ESPN's unique “James Cook III.” A narrow optional suffix match
   retains unique position/provider identity and NFL team checks, rejects different
   explicit suffixes and ambiguous identities, and never repairs conflicting
   explicit IDs. His weekly evidence now uses the 19.326639003-point public estimate
   instead of the 15.7375-point historical fallback. General historical GSIS
   matching and source/scoring validation are unchanged.
4. **The model lacked saved starter identities.** Both passes now receive current
   week/team starter IDs from the saved snapshot. These identify proposed swaps;
   they do not claim verified platform slot assignments or transaction permission.
5. **Specific correct Hold headlines were overwritten.** An already compliant
   player-free Hold retains its validated headline. Unsupported actionable responses
   still become Hold with a corrected headline; explicit waiver/insufficient gates
   retain their standard wording. Real betting results now lead with the specific
   price/side to pass on.
6. **Multi-candidate waiver losses were hidden in the summary.** Hold results with
   an explicit drop show the best quantified compared add/drop change. Missing
   comparisons stay missing; the display does not select or execute a move.
7. **One-spot summaries hid the numerical comparison.** The summary now compares
   the chosen saved weekly estimate with the highest supplied eligible alternative,
   including negative contextual choices. It remains a single-spot difference,
   not a complete-lineup improvement or a success probability.

## Recommendations reviewed

| Workflow         | Corrected real-data result and usefulness review                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lineup/start-sit | Conditional Nacua/Bowers substitutions produce a supported 16.898769053-point lineup difference; Lamb stays conditional, Chase is benched for the bye and Barkley for recorded Out. One-spot Nacua/Wilson comparison shows an 8.150397872-point estimate gap with an availability fallback.          |
| Draft planning   | Conditional Hubbard preference in the supported-roster variant, with RB depth rationale, all candidate estimates, future-only versus already-earned scoring, and a Hampton/Odunze countercase. No invented ADP, pick timing or immediate lineup gain.                                                |
| Draft review     | Hold the historical draft grade without draft-time estimates/ADP/alternatives; still explain current QB/WR depth and RB/TE fragility. Missing full-season credited appearances in the original roster remain an explicit data gap, not zero points.                                                  |
| Trades           | Cook-for-Robinson variant: conditional remaining starting-slot gain of 53.788464227 points. Receiving usage supports the comparison; depth, byes, availability, manager willingness and aggregate-versus-weekly optimization remain qualifications. Out-player or incomplete evidence cases abstain. |
| Waivers          | Keep Olave: the best compared immediate add/drop change is -2.74 points. Explain why a bench acquisition does not offset a starter loss; distinguish stash value. PUP/IR candidates cannot become active picks.                                                                                      |
| Betting          | Moneyline, home spread and over all Hold against real paired prices. Reviewed responses distinguish break-even/no-vig probabilities, matched historical Brier results and uncalibrated opinion; no automatic switch to the opposite side.                                                            |

The supported-season and supported-trade variants are explicitly labeled separate
scenarios. They exercise actionable conditional comparisons while retaining the
original missing-data cases; excluded roster members are not silently imputed.

Independent code recomputes PPR publisher scoring from captured expected/observed
stats, exhaustively checks small-roster legal assignments, compares trade/add-drop
before/after differences, and recalculates break-even and no-vig prices. **190
recorded checks pass.** Structural/reference validation covers both raw model
responses and saved results; manual review covers the explanations, countercases,
source interpretation and practical limits. Arithmetic audits alone do not grade
all qualitative football claims or future results.

## Verification and reproduction

- `npm test`: **906 workspace tests passed** (327 API, 87 dashboard, 261 core,
  231 integrations), plus root suites; two expected platform skips.
- A focused 78-journey desktop/mobile browser regression passes. Actual model
  results also open through production routers and temporary SQLite, with ordinary
  fixture IDs normalized for the browser transport; rendering makes no AI call.
- Typecheck, lint, build, formatting and diff whitespace checks pass. After the
  final summary update, all 48 affected desktop/mobile journeys passed again.
  Manual in-app Chromium checks opened all six actual saved workflows plus
  one-spot advice through an isolated loopback API; headings, figures, disclosures
  and source links render correctly. The 390 × 844 phone viewport has no horizontal
  document overflow; console warnings/errors are empty. Screenshots are under
  `/tmp/sidekick-real-advice-qa/`. The existing Vite chunk-size advisory remains.
- All 51 v18 sealed research-source hashes remain unchanged. Numerical sportsbook
  forecasts, frozen research and signed-in Codex isolation code are unchanged.
  Fantasy availability/identity handling and explanatory presentation changed.
- Early loaded-machine runs hit existing research-test five-second timeouts; the
  bounded-worker rerun and subsequent full ordinary `npm test` passed without
  changing the sealed tests or their assertions.

Reproduce with the supported Node 22 runtime and an already signed-in verified
Codex CLI. Both commands use production public adapters and no saved app settings,
API key or owner league:

```sh
npm run advice:real-capture -- /tmp/sidekick-public-football.json
npm run advice:real-evaluate -- --snapshot /tmp/sidekick-public-football.json --output /tmp/sidekick-real-advice
```

Use `--case lineup,start-sit,waivers` for a subset or `--prepare` for readiness only.
Prices must be freshly fetched/verified for an upcoming game; source gaps and
unsupported native versions fail rather than quietly substitute fabricated data.
The exhaustive audit intentionally supports the small offensive PPR test rosters.

The compressed public capture and original contexts/results are retained locally
under ignored `.sidekick/research/2026-10-13-real-advice/`. Snapshot SHA-256 is
`7d9e840d3877a431645205f9b27745b75567ee5227b00043076388c067e4cf29`.
The receipt hashes compact JSON serialization of result/context objects, not the
pretty-printed files. New live captures can differ; native model responses are not
byte-deterministic. This is not a certified historical publication-vintage archive.

## Ordinary manual code and security review

Reviewed the scoped typed data additions, saved-result compatibility, source
identity ambiguity, complete-schedule proof, active-choice gates, roster/horizon
math, bounded snapshot capture, independent audit and subprocess cancellation.
Public data remains behind existing validated integration adapters; native model
calls retain their verified tool/skill isolation and native login in place. Test
stores and research files contain public football data and labeled synthetic
rosters. No owner preferences, credentials, saved advice, messages or service were
changed, and no automated security scan ran.

This review recorded source validation. The subsequent
[installer rebuild](2026-10-13-latest-installer.md) includes these fixes and records
packaged verification; it remains an unsigned contributor build. Live K/DST/IDP, dynasty/keeper formats, player
props, real transaction eligibility and prospective outcome accuracy are outside
this real-data sweep; existing controlled regressions do not establish those live
capabilities. Current injury publication gaps and missing full-season appearances
remain disclosed rather than filled with invented values.
