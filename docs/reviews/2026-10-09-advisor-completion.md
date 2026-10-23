# Advisor integration completion — October 9, 2026

The requested fantasy and NFL betting advisor is integrated into the existing local
API and dashboard. This audit verifies the requested decision modes, intelligent
analysis/review, numerical support, confidence, public perception where available,
and reuse of existing AI access without new keys. It covers source integration and
local runtime behavior; publishing an installer or establishing future prediction
accuracy is separate work.

## Requirement audit

| Requested behavior                          | Current implementation and authoritative evidence                                                                                                                                                                                                                                                                                                          | Verification                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incorporate into the current app            | [Production router](../../apps/api/src/advice-routes.ts), registration in [API startup](../../apps/api/src/index.ts), [Advice page](../../apps/dashboard/src/ui/AdvicePage.tsx), Home/navigation/search and searchable Help                                                                                                                                | Production-router/SQLite browser journeys exercise entry, generation, cancellation, persistence and reload. Actual native results also load through these routes without generation.                                                                                                                              |
| Pre-draft analysis                          | [Fantasy planner](../../packages/core/src/fantasy-advice.ts) compares player estimates, starter demand/replacement value, roster needs and available logged pick/ADP context                                                                                                                                                                               | Native `draft-plan` and `automatic-draft-plan` pass fixed numerical and choice rubrics; final `draft-plan` passes both model calls. Missing rookie/season estimates remain Insufficient.                                                                                                                          |
| Post-draft analysis                         | Saved picks, team ownership, draft status and scoring-supported comparisons are supplied to both model calls; current forecasts are distinguished from draft-time evidence                                                                                                                                                                                 | Native `draft-review` and `automatic-draft-review` pass. Final `draft-review` passes both calls. Incomplete historical evidence withholds unsupported grades.                                                                                                                                                     |
| Matchup start/sit                           | [Player evidence](../../packages/core/src/player-evidence.ts), [football context](../../packages/core/src/football-context.ts) and planner support full legal lineups and one shared spot, matchup/workload/availability context and explicit alternatives                                                                                                 | Native full/focused/contextual/injury/kicker/defense cases pass. Actual public-data comparison validates in both final model calls and renders both player estimates and known injury uncertainty.                                                                                                                |
| Trades                                      | Ownership-checked give/receive choices use legal starter impact and the exact remaining interval; past points and bench sums do not become future starter gain                                                                                                                                                                                             | Native losing/beneficial/automatic-beneficial trades pass their fixed rubrics; final losing-trade case passes both calls. Public forecast browser journeys verify selected final weeks and saved interval evidence.                                                                                               |
| Waivers                                     | Explicit shortlists or bounded screening compare unrostered options with owned starters and disclose drop/FAAB/availability limits                                                                                                                                                                                                                         | Native waiver/current-media/stale-media/rookie cases pass; final waiver case passes both calls. A forecasted rookie below both owned alternatives does not become an immediate upgrade.                                                                                                                           |
| Football betting                            | Moneyline, spread, total and supported player props use verified upcoming games, entered odds/line, break-even, historical statistics and a separate chronological rolling model                                                                                                                                                                           | All four market types have production-router browser coverage. Native betting passes before and after the wording fix. The actual public-data moneyline analysis validates in both calls and correctly remains Hold when its conservative support gate fails.                                                     |
| Numbers and statistics supporting decisions | [Math](../../packages/core/src/advice-math.ts), [forecasting](../../packages/core/src/fantasy-forecast.ts), public forecasts (`public-player-forecast.ts`, since removed) and [contracts](../../packages/core/src/advice-contracts.ts) compute source-linked evidence. Model prose references supplied metrics; unsupported numbers/IDs/links are rejected | Fixed rubric values verify comparisons, roster impacts and forecasts. Core tests verify scoring, time/identity boundaries and arithmetic. Actual model explanations cite both compared forecasts, expected receptions/yards, workload and opponent aggregates.                                                    |
| Confidence score                            | Reproducible evidence score with visible coverage, freshness, sample, independent-source and margin factors; missing/stale/uncertain evidence caps confidence                                                                                                                                                                                              | Core/policy and saved-result browser checks pass; actual public results retain 41/100 for the tentative lineup and 49/100 for the declined bet. The label and FAQ explain that it is not win probability.                                                                                                         |
| Highly intelligent decision process         | [Advice service](../../apps/api/src/advice-service.ts) supplies numerical/roster/context evidence for analysis and a separate review. [Signed-in Codex](../../packages/integrations/src/signed-in-codex.ts) uses verified GPT-6.1-Sol with high reasoning; both calls must obey numerical, roster, source and decision-policy contracts                    | Actual native model passes the full twenty-one-case decision benchmark. A fresh final six-mode run also passes. The grader checks the raw reviewed model answer as well as the saved result, so policy corrections cannot conceal bad model choices. This measures process, not prospective football performance. |
| Public sentiment/perception where possible  | [Perception builder](../../packages/core/src/advice-perception.ts) supplies matched dated headlines/publishers and fresh matched Sleeper add/drop activity. Models attribute coverage and preserve Unknown when unsupported                                                                                                                                | Native current-media case cites both contrasting stories and returns Mixed. Stale-media case returns Unknown. Actual public analyses find no cited relevant current story and preserve Unknown while distinguishing available platform activity from public opinion.                                              |
| No new API keys/current-system reuse        | Existing saved API/local-tool connection or explicitly selected installed signed-in Claude/Codex; analysis-local selection, bounded native execution and no credential creation or provider fallback                                                                                                                                                       | Full/final native runs and actual public analyses use the existing ChatGPT login. Fixtures assert unchanged report/schedule settings and zero vault writes. No owner league/settings are used in the public-data check.                                                                                           |

## Final verification

- `npm run build`: pass on Node 22.23.3/macOS ARM. Vite reports its existing
  large-chunk advisory; build succeeds.
- `npm test`: pass, including **741 workspace tests** (312 API, 165 core,
  180 integrations, 84 dashboard), sixteen evaluator regressions across twenty-one
  controlled cases, service/recovery checks, and two expected opt-in platform skips.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `git diff --check`: pass.
- Full signed-in native benchmark: **21/21 cases, 42/42 valid model calls** before
  the numerical wording fix. No grader failures or canceled cases.
- Final signed-in native check after the fix: **6/6 modes, 12/12 valid model calls**.
  Both raw analysis/review calls validate; fixed decision rubrics pass.
- Final actual public-data check: **two analyses, four valid model calls**, saved
  by the production service. Read the evidence details below.
- Repository Playwright: **204/204 Chromium desktop/mobile journeys**, including
  four new explanation-unit/reload checks. Temporary SQLite and controlled providers
  isolate the owner's data and deliveries.
- Additional outside-repo Playwright: **4/4** desktop/phone checks display the
  actual final native results through production saved-result routes, expand player
  details/confidence factors, and reload without any generation, delivery or vault
  write. Inspect headline/confidence and numerical screenshots at 1440×1000 and
  320×568; ordinary mobile coverage also uses 390×844. No app runtime errors,
  framework overlays or horizontal overflow appear. Browser plugin unavailable;
  repository Playwright used. Screenshots/scripts/results stay outside the repo.

The full benchmark command is
`node scripts/evaluate-advice.mjs --connection codex-cli --explain-failures`.
The final six-mode check adds
`--case lineup,draft-plan,draft-review,trade,waivers,betting`.
Raw validated grading summaries are emitted without native reasoning/account data.

## Actual public-data check and readability fix

The temporary league uses explicitly declared Sleeper PPR scoring and public catalog
identities. Historical/schedule snapshots were retrieved at 16:18 UTC and the five-page
ESPN forecast snapshot at 16:51 UTC on October 9; their original retrieval dates are
retained. News/injury adapters refresh at analysis time. The final model checks run
at approximately 17:29–17:32 UTC using the existing ChatGPT sign-in.

The one-spot comparison shows Carnell Tate **13.510192895** versus Makai Lemon
**10.0661941309** expected weekly points, a **3.4439987641** difference. Both raw
model calls tentatively select Tate, preserve his Questionable catalog status and
undated injury uncertainty, show each receiver's expected catches/yards, distinguish
aggregate opponent production from an individual forecast, and explain Lemon as an
availability-dependent alternative. Both records remain separate from observed NFL
production. The saved evidence confidence is 41/100.

The Jacksonville home moneyline uses an explicitly hypothetical **-110** test price,
not a fetched sportsbook quote. Its break-even is **52.380952%**. The separate rolling
estimate is **66.532663%**, evaluated on **172** games across only **eleven** weeks;
its calibration band begins at **28.009154%**. Both raw calls choose Hold. Better
retrospective probability scoring does not meet the weekly/conservative-price gate,
and the answer distinguishes historical hit rate/ROI from future probability or
realized profit. The saved confidence is 49/100. No bet is submitted.

The first public-data run exposed redundant units such as `66.53 %%`. The shared
renderer now removes only an identical unit directly after a verified placeholder,
including saved answers. It preserves different units, compound descriptors,
paragraph boundaries, metric values and stored prose. Both model calls are told
that placeholders already include units. Core tests cover exact unit duplicates,
regex-special unit characters, multiple placeholders and unchanged nonduplicate text;
new desktop/mobile journeys cover points/percent statements and saved reloads. Final
actual explanations are readable without repeating units.

## Manual review and limits

- [x] Trace each requested mode through final UI, production route, deterministic
      planner/evidence, both model calls, schema/decision checks and saved-result rendering.
- [x] Review actual native outputs against supplied comparison values, ownership,
      availability, time scope, confidence factors and source attribution; inspect raw
      reviewed verdicts rather than relying only on policy-enforced saved results.
- [x] Review unit normalization: escape regex metacharacters, remove exact adjacent
      units only, preserve numeric evidence and different text, and keep React text escaping.
- [x] Review existing integration boundaries: loopback-only routes, fixed bounded
      public fetches, source/identity/date validation, bounded/cancelable native processes,
      disabled native tools/project instructions, sanitized errors, and local retention.
- [x] Confirm existing-account reuse, no new key, no owner data/settings/vault write,
      no real delivery, roster change, wager, owner-service restart, commit or release.
- [x] Update current task/status documentation. No automated security scan was run,
      in accordance with the owner's explicit instruction.

Broader custom/platform scoring, dynasty/pick assets, personnel/weather modeling,
representative public-opinion sampling and prospective fantasy/betting performance
are follow-up improvements. Unsupported/incomplete comparisons withhold estimates or
picks and expose their gaps; imports can supply scoring-confirmed estimates where
supported automatic scoring is unavailable. Confidence does not promise an outcome.
Other browsers, physical devices, new native CLI versions and published installers
require their own verification. These limits are not claims supported by the local
model, source or browser checks above.
