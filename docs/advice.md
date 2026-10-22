# Fantasy and football advice

The requested feature covers pre-draft planning, post-draft review, start/sit and
matchup decisions, trades, waivers, and football game/player-prop betting analysis.
Every decision needs numerical support, a confidence score, sources, and a concise
explanation of risks and alternatives. Reuse the saved API or local CLI connection,
save the Codex GPT-6.1-Sol account preset for reports and advice, or explicitly select installed signed-in Claude or Codex subscription access for an individual analysis;
do not introduce new provider credentials. Public sentiment is supplementary
context, never a substitute for football evidence.

## Current implementation

The production advice API and Advice page integrate the calculations, public
evidence, and existing AI connections. All six modes are reachable from navigation,
Home, search and Help. The model analyzes a decision, then reviews the proposed
answer against the same evidence. The requested integration is verified by the
[October 9 completion audit](reviews/2026-10-09-advisor-completion.md): the full
signed-in model benchmark, a final six-mode model recheck, actual public-data
analyses and rendered saved-result journeys all pass. Supported scoring, available
evidence and explicit abstention rules apply as documented below. Broader formats
and prospective prediction quality remain follow-up validation, not established
football accuracy or betting profit.

For start/sit, **Set my lineup → Compare players for one spot** checks two to
twenty selected players from the saved team. All must share a supported starting
slot, including Flex/Superflex where the league permits it. This does not fill the
other slots or guarantee a complete legal lineup; keep the chosen player out of
other starter slots and check the remainder separately. Unrelated missing kicker,
defense or bench forecasts do not prevent the selected comparison. Every selected
active option still needs a scoring-matched weekly estimate, and both model passes
must show the estimates for all eligible alternatives before choosing exactly one.
Recorded inactive options cannot be selected. A lower-estimate contextual choice
is tentative, shows the actual estimate given up, and caps evidence confidence at
59; the contextual injury/matchup benefit remains unquantified. The full-lineup
option retains complete-roster, all-slot and chosen-lineup verification.

The searchable **How do I compare players for one starting spot?** FAQ links to
the lineup mode. Invalid ownership/common-slot selections stop before inference
and return fixed actionable messages. Results persist their comparison scope
separately from full-lineup assignments; old history remains readable.

`packages/integrations/src/football-data.ts` loads fixed public URLs for current and
two previous seasons of weekly player stats, NFL schedules/results, and Sleeper add/drop
activity. Downloads have deadlines and incremental byte limits; parsers validate
schemas, quoting, finite values, duplicate identities and bounds. Blank statistics
and unplayed-game scores remain missing. Unattributed team-event rows cannot be
joined to players. The in-memory cache coalesces concurrent requests, retains
original evidence dates during outages, backs off failures, and holds at most three
seasons. It does not poll, persist data or access credentials.

The [nflverse schedules dictionary](https://raw.githubusercontent.com/nflverse/nflreadr/main/data-raw/dictionary_schedules.csv)
defines its spread as home points minus away points: a positive number means home
favored. This differs from a sportsbook's selected-team handicap. Bet calculations
use the selected fetched quote or explicitly entered handicap and odds. Live prices
come from a separate verified ESPN summary adapter; archived schedule prices never
become current quotes. The weekly source is the `stats_player` release's
`stats_player_week_<season>.csv`, verified against the current schema.

[Sleeper's API documentation](https://docs.sleeper.com/) describes a read-only,
keyless API, attribution requirements, and free non-commercial access; commercial
distribution requires licensing review. Its truncated top add/drop lists describe
platform activity over 24 hours. Unlisted counts are unknown, not zero. GSIS and
Sleeper IDs remain distinct. Activity attaches through an explicit catalog Sleeper
ID, including matched Yahoo/ESPN players and NFL player props. A roster ID is used
directly only for Sleeper leagues. Ambiguous or conflicting matches stay unknown.
The shared catalog supplies GSIS, ESPN and Yahoo identifiers where present.
Verified GSIS identifiers resolve otherwise ambiguous historical names. Betting
choices use NFL identifiers rather than fantasy roster IDs, and props must match
a team in the selected upcoming game.

`packages/core/src/player-evidence.ts` joins uniquely matched prior player games,
calculates workload and league-scoring statistics, and prefers the median of
uniquely matched, scoring-confirmed imported projections in the selected scope.
Duplicate imports, ambiguous names and conflicting platform identifiers cannot
silently become additional evidence. Import source sets are not presumed to be
independent publishers. Weekly historical baselines need at least four scored prior
played games; they use up to eight games and explicitly assume the earlier role
continues. They do not predict injuries, missed games, rookie development or new
roles. Season estimates use the evaluated automatic method described below when no matching import is available.
With at least eight historical games, a rolling local baseline test measures error
using only earlier games for each held-out observation.

`packages/core/src/football-context.ts` adds descriptive matchup and role context.
It matches an upcoming unplayed regular-season game, displays opponent/home/away/date,
compares the most recent two current-team appearances with up to four preceding
appearances, and calculates shares only from complete, nonzero recorded team totals.
QB attempts, RB carries/targets and WR/TE targets remain unknown when absent. Older
weekly CSV snapshots may omit attempts/completions without becoming zero-volume games.
Duplicate player-game records and ambiguous identities cannot increase player samples.
Prior-team history is disclosed and excluded from current-team workload comparisons.

Opponent evidence sums all recorded players at the position in each of up to eight
prior defense games; at least four complete games are needed. A recorded NFL reference
pool needs at least sixteen defense/game observations and weights each observation
equally, with up to eight per defense. Supported league scoring can also show combined
position points. These are position totals, not an individual projection, opponent-
adjusted strength rating or projection multiplier. Team score averages/margins and
schedule reference lines retain separate labels and source/sample attribution. Future,
target-week, postseason, mismatched and older-than-prior-season records are excluded.
Weekly active-lineup estimates are withheld for completed, past-date or ambiguous games.

Injury evidence keeps GSIS identity, regular/postseason type and the report update
date when supplied. A current-week regular-season report must match NFL team and
position, using an explicit GSIS ID or a unique name identity. Newest dated reports
win regardless of CSV ordering; conflicting latest records and mixed undated records
stay uncertain. The advisor's 36-hour policy applies separately to retrieval and
report updates. Missing, invalid, timezone-free or future dates cannot establish
current status. No matched report does not establish health. The live season CSV
checked October 7 had no `date_modified` column, although it is described in the
[injury dictionary](https://nflreadr.nflverse.com/articles/dictionary_injuries.html).

Only a current verified game designation overrides the existing roster/catalog
flag. Undated reports remain explicitly limited context; a fresh download cannot
clear or fabricate status. A recorded Out designation removes weekly estimates.
Unknown or questionable availability limits weekly lineup/waiver advice to a
tentative comparison. Practice participation and source/update caveats survive
both model passes, saved results and the player-evidence disclosure. No injury
probability or injury-based projection multiplier is invented.

Historical scores currently support common linear offensive Sleeper rules and
unambiguous Yahoo labels. Unknown bonuses, generic Yahoo interception labels,
ESPN numeric scoring IDs, unsupported K/DST/IDP rules and missing required stats
withhold league-point calculations. Scoring-confirmed imports can still supply
estimates. Provider-specific scoring translation and format coverage need further
work; do not fall back silently to standard or PPR scoring.

`packages/core/src/fantasy-advice.ts` calculates:

- Legal starter assignments with a global matching algorithm, including FLEX and
  superflex, rather than filling flex greedily. A player is used once. Missing
  projections do not count as zero; incomplete rosters do not become full totals.
- Trade changes to season estimates for starting slots, rather than equating bench
  sums with lineup value. Ownership is checked against the selected teams. Depth,
  roster limits, future byes, dynasty/keeper assets and pick trades still require
  additional evaluation.
- Waiver starting-lineup gains for unrostered candidates, with current availability,
  an optional owned-player drop, and FAAB/priority caveats. Explicit add/drop comparisons remove the selected player before reassigning all slots; add-only screens stay tentative. Automatic screening is bounded to the top 25
  estimates per supported position, with explicit shortlist comparisons available.
- Draft season value above league-wide starting demand and logged pick versus
  imported ADP timing. FLEX/Superflex replacement allocation jointly optimizes league-wide starting demand, independent of slot order. Bench demand and future draft choices remain unmodelled. Incomplete
  pools cannot establish replacement value or a draft grade.

The confidence score is a reproducible evidence-quality score out of 100. Its
factors cover data coverage/freshness, sample size, source independence and decision
margin versus variability, with caps for missing/stale/short-sample evidence. It
is not a calibrated success or win probability. Current imports do not establish
source independence, so that factor receives no credit.

`packages/core/src/advice-math.ts` also handles American odds, break-even rates,
two-sided no-vig baselines, historical prop/score-margin/total frequencies, pushes,
retrospective sample ROI and Wilson 95% sample-rate intervals. Historical player
samples exclude target-week, future, unscored and postseason games. Bet output
labels historical rates and intervals as descriptive; they are not predictive
probabilities or future expected returns. A separate rolling model now supplies
chronological probability evaluation and initial abstention criteria. Improved
opponent/role/injury adjustment, prospective evaluation and betting-market validation
remain unfinished.

Official OpenAI reasoning requests use the Responses API with `store: false`,
explicit high reasoning effort and a bounded output/deadline. Only completed final
assistant text is retained; incomplete/refused/tool-only output is rejected without
retrying a paid request on another endpoint or model. Custom endpoints preserve
Chat Completions. Ordinary official Chat Completions requests also disable storage.
Provider retention policy still applies; this flag is not a zero-retention guarantee.
The contract follows the [Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)
and [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning).

Model choices reuse the saved endpoint and OS credential for metadata discovery,
without league data or generation. A reviewed capability list ranks discovered
reasoning models, preferring GPT-6 Astra then GPT-6.1 Sol when available. This follows
the [official model catalog](https://developers.openai.com/api/docs/models), not a
measured football-accuracy ranking. The UI displays its default before Analyze and
allows the saved model or another listed option. Custom endpoints/local tools retain
their configured model. An explicit request override is rechecked before generation;
unavailable models are rejected rather than silently substituted. Discovery failures
retain saved-model access with a notice. Model changes apply to this advice only,
leave report settings intact, and do not reuse the original model's saved cost rates.

## Advice workflow

`GET /api/advice/options` loads player choices and upcoming regular-season games
without generating an AI answer. Official API connections also read model metadata. Fantasy modes require a connected league and team; betting
can work without one. Draft/trade comparisons use season projections; lineup/waiver
comparisons use the selected week. The saved connection and selected analysis model are shown before Analyze. Report
settings and credentials are never rewritten. Previously selected models remain
visible after a choice reload; unavailable selections require a new user choice.

`POST /api/advice/<caller UUID>` runs one analysis at a time, requests high reasoning
effort where supported, uses a separate advice output limit (16,384 tokens per pass
by default, configurable under Advanced analysis limits), and times out after
300 seconds. API and CLI advice passes use a 120-second deadline. Other CLI requests
retain the 60-second default; explicit request deadlines are validated between one
and 120 seconds. Cancellation and forced process termination remain available.
Reasoning tokens count toward API output limits. A configured executable named
`claude` or `claude.exe` uses the Claude-specific integration: per-child documented
output/reasoning controls and zero requested provider retries, without changing
the parent's environment or owner settings. CLI-managed settings may still take
precedence. Other CLI tools/wrappers retain their own options. These controls follow
the [official Claude CLI environment reference](https://code.claude.com/docs/en/env-vars).
Facts are computed before prompting, with untrusted fields in bounded
data-only blocks. Final JSON must reference provided player/metric/source IDs.
Numeric placeholders resolve only to computed evidence; unsupported numbers,
links, references and extra model fields are rejected. New recommendations must
actually display supporting numeric placeholders, not merely declare metric IDs.
Each placeholder renders its value and unit. Both model passes are told to put
the metric description before the placeholder and omit a repeated unit afterward.
The shared renderer removes an identical adjacent unit from new or saved prose,
including percent signs. It preserves different units, compound descriptors,
paragraph boundaries and the stored answer; numerical evidence is unchanged.
Older valid saved advice remains readable through the storage-compatible guard. A review can repair an
invalid first answer without retaining or passing its raw text onward. Responses
show concise explanations, risks and an alternative, rather than private
chain-of-thought. Usage aggregates both passes; cost estimates require saved model
rates and provider-reported tokens.

Verdicts have a direction: **Recommend** supports the proposed action, **Lean**
tentatively supports it, **Hold** declines or waits, and **Insufficient** means
required evidence is missing. For trades, a rejection of the specified give/receive
exchange uses Hold even if its prose says "lean against." Both model passes receive
this instruction; grading keeps rejection expectations separate from schema validity.

Model prompts share labels, units, source IDs and evaluation sample counts in
`metricProfiles`; each metric's `profile` indexes that metadata. Its optional `note`
indexes a caveat in `metricNotes`. Player `warningNotes` index `playerWarningNotes`,
including individual injury and forecast limits. Both passes explicitly receive the
decoding instructions. Saved evidence retains ordinary self-describing metrics and
player warnings; only repeated prompt metadata is shared. Evidence
budgeting keeps every comparison player, primary estimate/provenance and deterministic
decision total, then removes lower-priority historical/team detail in rounds across
players when needed. Omission counts are visible. Only supplied metrics can be cited.
Unused projection-source metadata is omitted; referenced missing metadata stays
explicitly unavailable. Evidence reserves space under the existing prompt/result
limits; if required comparisons cannot fit, analysis fails before paid generation.
These bounds do not yet prove all unusual/deep league formats or request sizes fit.

Verified results are saved in `advice_results` (SQLite migration 7), with at most
100 results, and participate in backup validation, restore and salvage. Ordinary
dashboard state payloads exclude them. Listing/opening saved advice makes no model
call. Repeating a completed UUID with the same request reuses its saved answer.
Delete cancels running work or removes a saved result. Closing the analysis HTTP
request cancels it; late provider output cannot be saved after cancellation.
Pending requests are not durable queued jobs. After a failed connection, check
saved history before starting another paid analysis.

The UI offers searchable shortlists, trade ownership choices, explicit sportsbook
handicaps/American odds, cancellation, retained inputs on errors, saved-result
bookmarks, unsaved-navigation protection and confirmed deletion. Results lead with
the recommendation and evidence confidence, followed by numbers, player details,
risks, sources/dates, model/usage and data gaps. AI betting forecasts and hypothetical
returns remain explicitly uncalibrated. Deterministic decision policy is supplied
to both model passes and enforced after review: incomplete decision evidence yields
no player pick; stale evidence or historical baselines allow at most a tentative
comparison. Incomplete draft pick logs/league rosters reduce coverage. Betting with
fewer than eight settled observations or an unavailable prop player withholds a
pick. Larger samples use the rolling evaluation and conservative price gate below;
an asserted AI interval alone cannot establish a betting edge. No roster changes,
trades, waiver claims or bets are submitted.

## Rolling betting forecast

`packages/core/src/bet-forecast.ts` implements the fixed `rolling-residual-v1`
method, separate from the AI's optional uncalibrated judgment and retrospective
hit rates. Game estimates blend each team's previous eight offensive scores with
the opposing team's previous eight conceded scores; their difference predicts home
margin and their sum predicts total points. Player props use eight previous matched
appearances. These are experimental estimates with no explicit home advantage,
injury, weather, lineup or current-role adjustment.

Current/prior-season completed regular-season records must precede both the target
week and its date. Duplicate/conflicting game identities and team/week collisions
cannot inflate samples. Prop records must match player ID, game, season/week, team
and opponent, with one observed statistic per player/game. Missing values stay
missing. At least 24 earlier prediction errors are needed for a probability.

For every later game, the point model and empirical errors use earlier weeks only.
The shifted error distribution is rounded to integer outcomes and distinguishes
wins, losses and pushes. A five-bin calibration step shrinks earlier same-bin
outcomes toward the raw estimate with a fixed weight of 20. Neither that game's
result nor other games in its week participate in its fitting/calibration.
The output includes a trace for opt-in evaluation; this trace is not sent to AI or
saved as ordinary advice history.

Evaluation compares squared probability errors (Brier scores) against a rolling
earlier-outcome-frequency baseline at the same fixed threshold. Weekly mean paired
loss differences supply a normal-approximation improvement bound. The band for
current similar estimates uses weeks as an effective sample, with outward-rounded
Wilson-style limits widened to contain the estimate. It is a conservative heuristic
for historical calibration uncertainty, not a guaranteed game-level probability
interval. Cross-week correlations and changed conditions can invalidate it.
See [probability calibration](https://scikit-learn.org/stable/modules/calibration.html)
for the distinction between calibration and overall probability scores.

Maximum **Tentative choice** requires fresh source metadata, at least 100 evaluated
non-push games across 12 weeks, 40 similar-estimate outcomes across eight weeks,
a positive weekly improvement lower bound, a lower model Brier score, a calibration
gap no greater than 0.10, and a lower-band advantage exceeding two percentage points
after accounting for modeled pushes. Uncertain selected-player availability blocks
this upgrade. Otherwise the policy remains Hold or More evidence needed. AI wording
cannot override the gate. No strong betting verdict or transaction is enabled.

The statistical estimate, evaluation counts and caveats persist and render separately
from the AI forecast. Probability/return metrics cite public data and entered odds;
model-implied return is hypothetical. The entered threshold applied retrospectively
is a scenario, not the actual historical sportsbook line or a profit backtest.

`npm run betting:evaluate` is an opt-in keyless public-data check of the next game
using fixed illustrative moneyline/spread/total prices. It prints forecast/evaluation
JSON and elapsed times. It reads no owner settings/credentials, generates no AI
answer, and submits no wager. It is not a CI or automated security scan.

## News and perception coverage

Advice selects at most eight relevant HTTPS headlines published in the preceding
seven days from a bounded cached pool of up to one hundred dated stories. Ordinary
news display retains the newest ten and report prompts the newest five; all share
the same coalesced feed refresh. Undated/malformed publication dates are excluded
instead of replaced with retrieval time. Numeric HTML entities are decoded before
player-name matching. Exact player mentions rank before team context. Publication dates stay
separate from feed retrieval dates; tracked URLs and repeated titles are deduplicated.
Team context does not imply a story names an individual player. Publisher counts
describe selected coverage, not independent samples or a public-opinion survey.

The result shows coverage, retrieval status, media tone and an expandable attributed
headline list, including on phones and after reloading saved advice. Missing, future
or older-than-one-hour retrieval dates make the feed stale. Stale recent stories
remain inspectable but cannot ground current tone. A positive/negative/mixed
interpretation requires a direct citation to a selected current headline; otherwise
the service sets tone to unknown. Available matched Sleeper activity needs a source
retrieved within 24 hours and remains behavior rather than a sentiment score.

The FAQ explains this coverage and is indexed by workspace search. Saved results
without the optional coverage record remain readable.

## Decision-process evaluation

`npm run test:advice:evaluation` checks the evaluation fixtures and grader without
calling an external model. Twenty-one fixed cases cover all six modes, missing season
estimates, injuries, contextual start/sit choices, positive/negative trades, current/stale
media, automatic season forecasts, kickers, team defenses and rookie evidence.
They run through the production two-pass service
with an isolated in-memory store. Expected lineup totals, positional replacement
and trade impact are fixed from fictional inputs before any live model call. A
known inactive bench player without a weekly estimate does not prevent comparing
a complete replacement lineup; missing active-player estimates still block picks.

Lineup analysis can consider all eligible roster options with weekly estimates,
including bench players. Each actionable answer must select exactly a complete
legal lineup; the service never fills a partial selection silently. A change from
the highest-estimate comparison must visibly cite the replacement and displaced
players' estimate metrics. The saved lineup and total belong to the actual chosen
starters. The highest-estimate lineup remains a separate comparison, with a computed
estimate difference. Context-based departures remain tentative; their confidence
cannot inherit the optimizer's decision margin and is capped below Moderate until
the tradeoff is quantitatively supported. No injury/matchup multiplier is invented.
The owner's question can express decision context or a conservative preference;
it cannot establish new facts or override the roster/evidence/answer requirements.

Review receives only fixed trusted validation feedback when the first answer fails.
Raw rejected model text, parser errors and provider diagnostics are never forwarded.

`npm run advice:evaluate -- --cli-command <absolute executable> --cli-args '<JSON
string array>'` runs those cases through an already-authenticated installed CLI.
`--case lineup` limits the run to one case. No owner database/settings/history or
credential is loaded or changed. No news/provider data download or transaction is
performed. Each case makes up to two model calls; failed cases are reported without
printing model text, prompts, stderr or credential data. Existing provider usage
allowances or charges apply. The caller must configure CLI tools, session storage,
model, reasoning and spending limits appropriately.

For an existing authenticated Claude installation, a bounded tool-free example is:

```sh
npm run advice:evaluate -- \
  --cli-command /absolute/path/to/claude \
  --cli-args '["--print","--safe-mode","--tools","","--strict-mcp-config","--setting-sources","","--no-session-persistence","--no-chrome","--disable-slash-commands","--model","opus","--effort","high","--max-budget-usd","1"]' \
  --case lineup
```

The evaluator honors interruption by cancelling the in-flight CLI and stopping
before another case. Its summary distinguishes attempted from requested cases.
Multiple case IDs can be selected with a comma-separated `--case` value.

The grader checks raw reviewed answers separately from saved answers, including
verdict, selected players, numerical decision support and unsupported perception.
It records first-pass validity and rejects invalid final output even if app policy
would otherwise correct its verdict. This is a small controlled decision-process
evaluation, not prospective football accuracy or a betting-profit backtest. A
failed case can identify model weakness, a contract mismatch or a service defect;
investigate before changing expectations. Broader live evaluation remains required.

## Signed-in Claude for advice

The analysis-local connection selector offers **Saved AI connection** and
**Signed-in Claude · Opus**. The latter discovers a known executable in the user's
local install or absolute PATH directories and checks `auth status` without model
generation. Only the sanitized availability enum reaches the API/UI; account fields
and tokens never enter saved settings, results or logs. Status is rechecked on reload
and before generation. Existing results without a connection field remain readable.

The preset requires an existing `claude.ai` subscription login, uses Opus/high effort
for both passes, and never falls back to the saved API or creates a key. It strips
inherited API-key/token/cloud routing from its own child environment. Calls run in
separate empty temporary directories with a fixed system prompt, disabled tools,
empty strict MCP configuration, safe mode, no browser/session persistence and no
project/user setting sources. Managed CLI policy still applies. Authentication and
subscription allowance remain managed by the installed tool. The preset does not
use `--bare`, which would require API credentials; see the
[official CLI reference](https://code.claude.com/docs/en/cli-reference).

**Test signed-in AI** calls `POST /api/advice/connection-test` explicitly with only
a fixed JSON probe and no football/private data. It has a 25-second provider deadline,
a 35-second route deadline and client cancellation; probes and analyses cannot run
concurrently. Opening/reloading choices never generates an answer. Each generation
requests a USD-equivalent budget cap of one; CLI-managed limits still apply, and this
is not a claim about subscription pricing. Saved API prices are not reused for this
connection. No report/schedule configuration changes are made. Searchable Help explains
the flow. Sign-in success alone does not establish generation availability.

The subscription preset reads the native JSON result envelope and checks `is_error`
as well as the result subtype; a `success` subtype alone cannot establish success.
Only verified result text and bounded nonnegative input/output token counts escape
the envelope. Native session/account fields, error prose and billing estimates are
discarded. Fixed errors distinguish a reported limit, the per-pass budget, and an
unverifiable response; failures never invoke the saved provider. See the
[headless CLI documentation](https://code.claude.com/docs/en/headless).

Current live verification detects the existing subscription login. A bounded JSON
probe exits with code one, `is_error: true`, subtype `success`, and a result containing
“limit”. This establishes a provider-reported limit, not which limit or its reset
time. No verified model answer was returned. Source/dummy-provider verification
does not resolve the earlier live latency/format failures.

## Projection intervals and trade value

Projection imports can declare `season`, `fromWeek` and `throughWeek`. With only
`season`, a weekless row covers weeks 1–18; a weekly row covers its exact `week`.
Explicit intervals require both week endpoints and an ordered, valid range. A weekly
row's interval must match its week. Legacy rows remain readable; weekless legacy
values remain full-season totals, without independently established season metadata.

Midseason trades require estimates for the selected season, current NFL week and final week. Scoring-confirmed, uniquely matched imports take precedence; supported automatic estimates can supply the same interval. **Count remaining value through
NFL week** defaults to 18 and can use an earlier league championship week. The final
week cannot precede the current week. Full-season totals, another season, another
start/end week, conflicting player identity and duplicate source rows cannot supply
remaining value. The service never subtracts already-earned scores or invents future
zeroes. Draft planning/review and ordinary draft/preseason reports continue using
full-season projections. Weekly reports reject another declared season or interval.

For example, an owner-authorized forecast for weeks 5–17 can use:

```csv
player,playerId,position,projectedPoints,season,fromWeek,throughWeek
Fictional Receiver,fictional-id,WR,150,2026,5,17
```

Leave `week` blank for an interval. Imports show declared periods and undeclared row
counts. Saved evidence includes its scope and interval; trade comparisons identify
remaining points, while older saved full-season comparisons keep their original
label. A searchable FAQ explains the interval and leads directly to Imports.
Source accuracy, inclusion of partially played current-week games, and forecast
independence remain the owner's source assumptions for imports. Automatic forecasts have separate schedule, source and historical-evaluation requirements.

## Automatic draft and remaining-season estimates

`packages/core/src/fantasy-forecast.ts` prepares a shared league-scoring model for
QB/RB/WR/TE/K. Matching scoring-confirmed imports keep precedence. The public adapter
loads two prior seasons so preseason forecasts have enough earlier test weeks.
The method requires a unique player, supported complete scoring, fresh source dates,
at least four prior scored appearances, and a complete modern team schedule with
17 distinct games across weeks 1–18. This schedule expectation follows
[NFL Football Operations](https://operations.nfl.com/calendar-events/nfl-schedule/making-the-schedule).
Future injuries, missed appearances, moves and rookie development remain unknown.

A fixed ridge model learns residual corrections to an eight-appearance scoring
baseline from recent three-appearance form, normalized pass/kick attempts or carries/targets
changes and recorded opponent-position scoring. Missing workload supplies no
adjustment. Incomplete or duplicate opponent contributors invalidate that game total.
Each whole NFL week is predicted before updating weights, player histories or
opponent totals. Evaluations begin after 40 training cases and eight training weeks;
forecasts require 40 later evaluated cases across eight weeks. The adjusted method
is selected only when an approximate weekly-cluster lower improvement bound is
positive; otherwise the evaluated baseline is retained. These historical tests and
method selection are not prospective season validation.

Remaining values use only scheduled unplayed games in the requested current/final
week interval. Byes, completed games and a verified started game contribute no future
value. Unknown same-day timing withholds the estimate. The adapter converts
nflverse's documented Eastern `gametime` to UTC, rejects ambiguous/invalid wall times
and leaves unknown times absent; see the
[nflverse schedule dictionary](https://raw.githubusercontent.com/nflverse/nflreadr/main/data-raw/dictionary_schedules.csv).
Full-season values add individually recorded completed-game points to the future
estimate. Missing credited rows withhold full-season value, never become zero.
In-season full totals cannot grade information available at the draft.

Saved/player evidence includes baseline points, form/workload/opponent adjustments,
credited points, future game count, range, chronological MAE and baseline MAE, test
weeks and source metadata. Ranges sum historical per-game residual quantiles without
an independence assumption; they are not calibrated season or availability intervals.
Prompt budgeting protects this decomposition, uncertainty and evaluation along with
the point estimate. Evaluation sample counts belong to the evaluation metrics, not
every decomposition component. Draft review supplies the entire current roster
alongside the saved picks, including backups, and exposes current positional
replacement metrics. Missing contemporaneous forecasts, ADP and available alternatives
prevents a draft-time grade; it does not invalidate a supported current roster
comparison. Full-season estimates include credited outcomes and cannot establish
what was knowable at the draft. Automatic comparisons have a maximum Lean verdict and evidence
confidence cap of 69; larger empirical ranges also reduce margin support. Confidence
is not a success probability. The UI labels each method and Search links the new
FAQ directly to Advice; the remaining-period FAQ retains its Imports action.

Bet choices and weekly active-lineup estimates now use the same upcoming-game check:
scoreless same-day rows require a verified future kickoff, and a known started game
is excluded. The betting service rechecks the recorded kickoff after inference and
inside the save transaction, discarding a crossed-kickoff result with a fixed,
actionable error. These checks use the fetched schedule; late schedule changes still
require fresh data. They do not provide in-play betting support.

## Remaining requirements

- Evaluate discovered model access and real decision quality through the existing
  connection. Capability routing, per-analysis selection and initial abstention
  guards are implemented; metadata discovery and dummy providers do not establish
  live access, latency, answer quality or a football prediction advantage.
- The October 15 app-wide Codex preset is saved in the running owner app and passes its live data-free probe. Existing football-quality evidence is separate from connection access; prospective prediction accuracy remains unestablished. Earlier Claude limit observations remain historical, not a current availability check.
- Evaluate prospective season accuracy, missed-appearance/role forecasts, rookie estimates and future injury changes. Automatic interval estimates now handle scheduled games, byes, verified kickoff times and championship horizons; these conditional estimates are not availability forecasts.
- Expand grounding/abstention evaluation and context budgeting for unusual/deeper leagues.
- Forecasting: use the implemented descriptive opponent/workload evidence in evaluated
  methods, improve injury context and richer player-prop error models, explicit
  uncertainty, prospective and price-aware evaluation, and cautious/no-pick results where an edge
  is unsupported. Improve provider scoring/identity coverage without weakening
  validation.
- Evaluate live news relevance and model interpretations across more players/teams;
  current attributed media and platform activity do not measure representative public
  sentiment or demonstrate predictive value.
- Further verification: larger/unusual league formats, scoring/identity coverage,
  source outages, opponent forecasts and real model recommendation quality.
  Public-feed availability and deterministic dummy-model tests do not prove
  live prediction accuracy.

No automated security scans are permitted. Continue ordinary code and manual
security review, including secrets, public URL boundaries, prompt data isolation,
stored results and provider error sanitization.

## Experimental existing ChatGPT connection

In Advice, choose **Signed-in Codex · GPT-6.1-Sol (experimental)**. It uses the Codex
CLI already installed and signed in using ChatGPT, currently verified at
`codex-cli 0.162.0-alpha.2` and, on macOS, `0.162.0-alpha.17.2`. No new API key is created. Other versions remain
unavailable until isolation is verified. **Reload connections** checks native login;
**Test signed-in AI** sends a fixed JSON probe without league data. The actual typed
adapter succeeded at that probe on macOS ARM. Native sign-in/model availability and
subscription limits can change; a fixed response does not establish decision quality.

The newer verified macOS build uses standalone execution, an owned model catalog
that disables native tool capability overrides, explicit orchestrator/agent disables,
and an OS read restriction for global `AGENTS.md`/`AGENTS.override.md`. That CLI
loads global instructions even when config/project docs are disabled. Native login
stays in its original location. Only the exact permission-denial startup notice for
the restricted paths is accepted before a turn; other errors still reject results.
See the [compatibility review](reviews/2026-10-13-codex-compatibility.md).

Both football passes use the selected model with high reasoning. Tools, project/user
instructions, skills, apps and plugins are disabled. Selected decision evidence and
the owner's note are shared; private member conversations/notes remain excluded.
Failure/cancellation retains the form and never changes providers or report settings.
Only final validated advice and safe usage counts are stored, not native reasoning or
session/account metadata. Saved API cost rates do not apply to subscription use.

This connection cannot enforce a token budget per pass. Advanced limits explains this;
time and output-size bounds remain active. The API rejects explicit token overrides.
Cancellation removes the owned instruction file and stops the subprocess. Source
integration is not a restart/upgrade of the owner's running service or installers.

Run controlled fictional cases through the same typed adapter and production service:

```sh
npm run advice:evaluate -- --connection codex-cli
# Select cases to investigate a failure without repeating all calls:
npm run advice:evaluate -- --connection codex-cli --case lineup,trade
# Include only validated reviewed decisions for manual qualitative inspection:
npm run advice:evaluate -- --connection codex-cli --case mixed-media-waivers,stale-media-waivers --explain-reviewed
```

The command reads native login through Codex but does not read/write owner league
history/settings or credentials. It uses fictional evidence and prints grading
categories, not raw model text by default. `--explain-failures` additionally prints
only the structurally validated reviewed decision for failed fictional cases, excluding
native reasoning/session/account metadata and invalid provider output. `--explain-reviewed`
does the same for all selected cases, including successes, so attributed explanations
can be inspected. The suite includes the original nine decisions, current mixed/stale
media cases, a favorable trade and automatic draft-plan/draft-review/trade cases. The media cases use opposing fictional editorials, not live publisher opinion;
grading checks numerical decision support, both headline citations, mixed versus unknown
tone, feed freshness and the independently counted headline total. Both structural
validity and the raw reviewed decision
are graded, so policy corrections cannot hide a bad model answer. Controlled cases
do not prove prospective football prediction accuracy or betting profit.

Initial live controlled evaluation: **seven of nine cases pass**. Draft planning
returns Hold instead of the expected candidate; waiver review fails after a valid
first pass. Keep these reliability gaps visible until diagnosed and corrected;
passing UI fixtures or a successful retry alone cannot establish a fix.

Targeted follow-up found that the prompt omitted selected/comparison roster ownership
and saved draft status/pick-log information. Both passes now receive this context and
explicit snapshot eligibility limits. A live draft-plan rerun selects the expected
candidate with the forecasts of each candidate versus the actual starting alternative.
The rubric originally required a specific replacement-value citation. It now accepts
that citation or the complete six-metric roster-relative comparison, preserving the
expected player, verdict and independently checked replacement value. The unchanged
validated live reviewed answer passes an offline production-service replay under this
rubric; this is not an additional inference. Seven regression tests cover diagnosis,
context delivery and rejection of partial support/wrong choices/wrong values.

Waiver review passes a targeted retry but its initial failure is not reproduced or
classified from retained native events; no fix is established. A fresh full live
sweep with the improved context and repeat reliability checks remain open. Do not
replace the initial seven-of-nine result with a claim that every current live case
has passed reliably.

Native protocol failures now have fixed categories (for example missing final answer,
duplicate answers, unexpected items and nonzero exit) in evaluator diagnostics.
Only allowlisted categories are printed; UI error text remains fixed. No native
messages, account identifiers or reasoning are included. These diagnostics help
classify future intermittent failures; they do not retroactively explain the earlier
waiver rejection.

The current-context original-nine live run finishes at **eight of nine**: draft
planning now passes, and waiver review passes. The remaining failure is trade
direction: the reviewed explanation correctly rejects the harmful exchange but
returns Lean. Verdict instructions now explicitly use Hold for a rejection; a fresh
targeted live run passes **five of five** cases: harmful trade, repeated waivers,
mixed media, stale media and favorable trade. The harmful trade now uses Hold;
the favorable trade uses Lean and cites the computed 52-point legal-starter gain.
Mixed coverage attributes both opposing editorials without claiming representative
public opinion or a predictive edge; stale coverage remains Unknown in the raw
reviewed answer and saved result. Keep these runs distinct from a single fully
passing current twelve-case sweep. The earlier intermittent waiver failure still
has no established root cause or repair.

Eight evaluator regressions exercise all twelve fixtures, 295 API tests and the full
root command pass (638 workspace tests), and 48 affected desktop/mobile Chromium
journeys pass. Build, typecheck, lint, formatting and whitespace checks pass. The
current/phone source displays were inspected with dummy adapters. All native model
processes are terminal; no owner-service restart, real message, roster action or wager
was performed. Repeat twelve-case and real-source/prospective evaluation remain open.

A bounded exploratory ESPN check found the all-team injuries feed exceeds an 8 MB
diagnostic limit. The fixed team roster endpoint
[`teams/22/roster`](https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/22/roster)
returns a 391,516-byte snapshot with explicit ESPN player IDs, injury statuses and
minute-resolution timezone-marked dates. Its checked team is ARI, season 2026,
regular season; no game week is supplied. The timestamp/date semantics and current
game association still need verification before treating these as updated game
designations. This source has not been enabled or joined into advice; existing
nflverse limits and conservative status guards remain intact.

Automatic forecast/live context follow-up: the first fresh fifteen-case sweep passes
fourteen. All thirty model passes validate; automatic draft planning picks the expected
candidate but fails the original full-season citation alternatives while comparing
every candidate with actual starters using conditional future baselines. Preserve that
failed run. A strict six-value future-comparison alternative checks all candidate/
starter values independently and retains the original replacement value, choice,
verdict and confidence cap. Eleven evaluator regressions reject partial and corrupted
comparisons; offline replay of the unchanged validated reviewed answer passes, without
new inference. The subsequent targeted live case passes one of one with Lean, the
expected candidate and confidence 50. The full sweep has not been re-labelled fifteen
of fifteen. Source checks pass 661 workspace tests and both recorded browser scopes
(176 full journeys and 64 affected journeys after broader news selection). These
controlled cases remain separate from prospective NFL accuracy and betting returns.

The focused start/sit extension passes the complete root command with 672 workspace
tests, twelve evaluator regressions over seventeen controlled cases, build,
typecheck, lint, formatting and whitespace checks. All 180 local Chromium journeys
pass on desktop/mobile, including incompatible selections, numerical alternatives,
explicit scope, saving/reloading and FAQ navigation. A targeted actual signed-in
ChatGPT/GPT-6.1-Sol high-reasoning check passes both focused cases with all four
passes valid. The fresh seventeen-case sweep passes all seventeen cases, with all
thirty-four model passes valid; preserve earlier failed full sweeps separately.
Dummy and native controlled cases verify process, not prospective NFL accuracy or betting profit. Broader DST scoring, rookie,
current-injury and larger comparison coverage remain open.

## Kicker support

The existing player-stat CSVs provide optional kicking counts, distance bands,
made-yard totals and individual distances. See the
[nflverse player-stat dictionary](https://raw.githubusercontent.com/nflverse/nflreadr/main/data-raw/dictionary_player_stats.json).
The adapter validates bounded lists/counts and attempt/outcome consistency. Current
CSVs use semicolon-separated distances; the documented comma form is also accepted.
Missing fields remain unknown and older offensive files do not need kicking columns.

Sleeper made/PAT rules, 0–19/20–29/30–39/40–49/50–59/50+/60+ made/missed bands and
made-yard rules are supported. Raw nflverse misses exclude blocks. The scorer adds
blocked FG/PAT counts to miss penalties, using individual blocked distances for
bucket penalties, as required by
[Sleeper scoring](https://support.sleeper.com/en/articles/3998131-what-scoring-options-are-available).
Configured applicable rules add their contributions, consistent with
[Sleeper stacking](https://support.sleeper.com/en/articles/3186339-what-stacks);
50+ includes 60+ while 50–59 excludes it. Per-yard-over-thirty uses each made kick's
excess separately, never total distance minus thirty times every kick. Positive
blocked counts without verified distances withhold bucket scores. Yahoo support
covers the existing recognized made-FG bands and PAT names; unknown active settings
still withhold rather than silently switch to standard scoring. DST remains separate.

Kicker player evidence shows attempts, made kicks, unblocked misses and blocks with
source/sample information. Descriptive recent-role/opponent facts do not multiply
estimates. Weekly comparisons use the same explicit played-game baseline or matching
imports. Automatic season forecasts fit/evaluate K separately, with the same source,
identity, chronology, schedule, scope and confidence guards. Current weather,
coaching decisions and kicking-job changes remain unverified; no fabricated weather
or injury adjustment is applied. Searchable Help opens the lineup flow.

The October 9 public-file check scores all 1,268 K rows from current/two prior
seasons under the tested kicking settings and produces 32 current remaining
estimates. The K cohort evaluates 794 earlier outcomes across 28 weeks; adjustments
fail the improvement gate, so all retain the baseline. A separate native model case
passes both rounds, choosing the expected kicker from eleven-versus-seven historical
points. These checks do not prove prospective accuracy or real-world availability.

## Team-defense evidence and forecasts

Sleeper D/ST uses a bounded public filtered weekly statistics endpoint and independent
nflverse team totals, without a new API key. Fetch only completed regular-season
weeks in the selected season and two prior seasons. The adapter limits itself to
four concurrent requests across all loads, twenty seconds per resource (including
queue time), sixty seconds per load, 256 KB per weekly JSON and 1 MB per team CSV.
Resources coalesce, cache six hours, and back off five minutes after failures. A
failed or malformed refresh preserves cached raw values and their original dates.
The filtered Sleeper statistics route is not part of its documented v1 API contract;
format changes become unavailable evidence, not substituted values.

Join DEF/DST by normalized verified NFL team identity, then match the season, week,
opponent and game date against one completed public schedule game. Vendor game IDs
are not nflverse game IDs. Conflicting team identifiers, duplicate records, byes,
unknown/incomplete games and same-day results cannot enter history as zeroes.

Supported Sleeper rules include sacks, interceptions, defensive and special-teams
fumble recoveries/forced fumbles/touchdowns, safeties, blocked kicks, linear points
and yards allowed, and the supported points/yardage bands. Apply the actual league
weights; negative fantasy scores are valid. Do not substitute the final score for
fantasy points allowed. [Sleeper's points-allowed definition](https://support.sleeper.com/en/articles/4126495-how-are-points-allowed-calculated)
excludes touchdowns scored by the opponent's defense while retaining the conversion
afterward. Team and individual special-teams rules remain separate.

Sparse event fields remain unknown unless explicit independent same-game totals
prove zero. nflverse defensive touchdowns omit fumble-return touchdowns, so an
omitted vendor touchdown needs both relevant totals or an exhaustive verified
partition. Positive opponent fumble-recovery totals cannot simply be copied into
ordinary defensive recoveries: special-teams recoveries are a separate component.
Contradictory partitions provide no zero proof. Offense-versus-defense fumble-return
TDs can remain unresolved; such missing required fields withhold the estimate.
For positive totals with missing defense TD counters, check up to twelve recent
games against ESPN's public game-summary endpoint, with the same shared permits,
deadlines, cache/backoff and a 1 MB response limit. Its route is undocumented;
unavailable or changed responses provide no new proof. The schedule's optional
numeric ESPN event ID is separate from the canonical game ID. Verify NFL/regular
season, week, Eastern calendar date (and kickoff when known), both teams, final
status and final scores. Match a fumble touchdown to the same structured scoring
play and possession/unit records. A "Fumble Return Touchdown" label alone is not
proof of a defensive score: offensive recoveries can carry that label too.

Only ordinary first-through-third offensive downs with retained possession count
toward the offensive proof; fourth-down fakes, kicks, punts, returns, missing plays
and inconsistent identities stay unresolved. Only when those observed offensive
scores exhaust the independent same-team/game fumble-TD total can they prove the
remaining defensive/special-teams fumble TDs zero. Existing positive vendor counts
must still agree. Rows carry weekly, independent-total and game-summary source
IDs/dates. Never follow summary-provided links or use this proof to change fantasy
points allowed, recoveries, other statistics, or a positive defensive touchdown.
Every row records all sources used, and later metrics retain that closure.

Weekly estimates require complete recent defense appearances and fresh source dates.
Missing latest games cannot be replaced by older favorable outcomes. Full/remaining
forecasts use a separate D/ST chronological cohort, the same earlier-test gates and
baseline fallback, and exact credited/future game decomposition. Scoring-confirmed
imports take priority. The model does not estimate defensive personnel, weather or
future turnover luck. Yahoo/ESPN automatic D/ST scoring and unfamiliar custom rules
remain unverified. Searchable **team defense** Help links to the lineup comparison.
The advisor goal remains active for these gaps, current availability, rookies,
larger comparisons, live media relevance and prospective prediction/market checks.

## NFL draft facts and rookie context — October 9, 2026

The keyless public football adapter now includes
[nflverse draft picks via PFR](https://nflreadr.nflverse.com/reference/load_draft_picks.html).
It keeps identity, name/position, year, round, overall pick, drafting team and college;
retrospective career totals and honors are excluded. The resource is bounded at six
megabytes/20,000 rows, timed, cached for six hours and retried after five minutes on
failure. Prior cached facts keep their actual source date through outages. Profiles
support missing PFR/GSIS cells and validated historical ID formats, without invented
identifiers. The source is factual draft context, not an independent forecast.

A fresh draft source (at most seven days old) is joined by GSIS, or by unique
normalized name/position when the player has no GSIS. Conflicting explicit identity,
ambiguous names and position conflicts withhold facts. Years since the draft are not
verified playing experience. Draft-team codes do not change current roster/catalog
teams. Before May 1 of the class year, current-class facts are withheld because this
feed has no per-pick historical availability timestamp. This is a conservative
boundary, not evidence that every fact was published at that time.

For current-class QB/RB/WR/TE, descriptive cohorts compare the same position and
round band (first; second/third; fourth through seventh) across two earlier draft
classes. Eligible players have at least four unique, completed, scoring-complete
recorded rookie appearances and fresh game/stat sources. Each player's recorded
points-per-appearance average receives equal weight. Means and lower/upper quartiles
require eight players across two classes; thinner cohorts show sample counts only.
Players without adequate recorded usage are excluded, so these outcomes favor
players who earned appearances. The figures are neither complete-class results nor
individual projections, season extrapolations, prediction intervals or probabilities.

Draft/waiver shortlists now retain explicitly selected players without an estimate.
Previously the planner dropped them after numerical screening, losing their draft
facts and missing-data explanations before the model prompt. Such incomplete
comparisons remain insufficient. Matching scoring-confirmed imports take priority;
ordinary automatic forecasts can still use sufficient NFL history. Draft facts and
cohort means never fill projectedPoints. The model receives these rules in both
analysis and review; source/profile closure and primary draft metrics survive
budgeting and saved-result validation. Player disclosures and the searchable rookie
FAQ lead directly to the projection import form.

A separate public-data probe at 16:18–16:20 UTC parsed 4,350 supported-position
profiles, including 81 from 2026, and joined 75 uniquely to the current Sleeper
catalog. Those catalog records lack GSIS, so this probe exercises the unique
name/position path. First-round WR context includes ten eligible earlier rookies
across two classes, mean about 11.215 league points per recorded appearance,
quartiles 8.5/11.7 under the tested PPR rules. First-round QB (seven), RB (two) and
TE (three) samples do not pass the scoring-summary threshold. All metric references
resolve to available dated sources. Some current rookies have enough NFL appearances
for the existing conditional automatic estimate; those without history still have
no invented estimate. These counts describe this source snapshot, not NFL accuracy.

The existing signed-in GPT-6.1-Sol high-reasoning connection passed the new
rookie-missing-forecast native case in both analysis and review. It returned
Insufficient, no selected players, evidence confidence zero, and unknown media tone.
This is one targeted native case, not a fresh full twenty-case live-model sweep or
prospective prediction validation. No owner settings, new key, wager, roster change
or real delivery was used. Player-specific pre-NFL rookie forecasts remain open,
alongside current personnel, deeper comparisons, scoring breadth, media relevance
and prospective fantasy/betting checks. The original advisor goal stays active.

## Public individual player forecasts

`packages/integrations/src/player-forecasts.ts` reads the public ESPN default
football projection universe without cookies, a league-owner identifier, or a key.
The source is linked to [ESPN player projections](https://fantasy.espn.com/football/players/projections).
This undocumented response is validated against season/current period, exact weekly
projection IDs, player/team/position identity, and the publisher's complete scoring
formula including position overrides. Changed or inconsistent formats fail closed.
Five fixed pages of at most 100 players have six-megabyte page bounds, three
concurrent reads, a shared 45-second deadline, six-hour caching and five-minute
failure backoff. Outages retain actual original retrieval dates; conflicting
pagination withholds all affected player/week forecasts.

Only explicit weekly source projections are used. In-season aggregate totals may
cover an ambiguous interval and are never prorated or reduced by past scores.
Sparse categories in a reconciled publisher forecast mean expected zero for the
mapped statistic; this does not change missing observed NFL statistics into zero.
Derived category scoring values and unused projection fields can be negative;
modeled event counts cannot. Fractional event counts are expectations. Unsupported
first-down/bonus/platform rules and missing forecasts remain unknown.

`packages/core/src/public-player-forecast.ts` joins an explicit ESPN identity or a
unique name/position only when no explicit ID exists, verifies the current NFL team,
and scores the raw expectations using supported actual league rules. Matching
scoring-confirmed imports take priority, then public individual forecasts, then
supported historical estimates. A weekly estimate requires one verified future game.
Season/remaining estimates require a complete unique 17-game regular-season schedule
and each exact future week's forecast. Remaining value excludes verified started
games, respects the selected final week and includes no past production. Full-season
value separately adds uniquely matched, scoring-complete recorded games; missing
credited rows withhold it. Preseason rookies need no NFL history when future weekly
forecasts cover their season. The feed's current scoring period and retrieval date
cannot establish what was known at a past draft.

Saved `public-projection-v1` results show projected workload/yards/catches/TDs,
future games/points, recorded points and source period. Primary expected statistics
survive evidence budgeting. Forecasts have no prospective error evaluation here;
policy permits only tentative choices and caps evidence confidence. Neither the
forecast nor confidence is a success probability. Source dates indicate retrieval,
not an independently verified publisher update. Follow-up improvements include richer current role/availability evidence, broader
scoring coverage, deeper comparisons, media relevance and prospective fantasy/
betting validation. Search **ESPN public weekly forecasts**
for Help and its direct Advice button.

## Current sportsbook prices and forward performance

In **Advice → Analyze a bet**, choose an upcoming game and market, click **Fetch
sportsbook prices**, then **Use this price**. The public ESPN NFL summary adapter
provides current paired moneyline, spread and total prices when available, with
sportsbook, source URL and actual retrieval time. This is limited public coverage,
not every book, an executable fill, publisher update time or an in-play feed.
Player props remain manual. No new credential, paid feed or wager adapter is added.

`packages/integrations/src/sportsbook-lines.ts` verifies the numeric ESPN NFL event,
season, kickoff, competing team identities, pregame state and paired prices. It
uses only current structured prices, never opening prices, assumed minus-one-ten,
remote refs or affiliate URLs. Reads are fixed-host, redirect-denied, two-megabyte,
ten-second requests. A sixty-second bounded cache retains original retrieval
times; a chosen snapshot expires after five minutes. Editing price fields clears
fetched provenance. Analysis verifies exact terms before model calls and again
before saving; expired/moved/unavailable prices prevent an actionable paper choice.
The saved result retains the exact analyzed snapshot.

New completed analyses capture forecasts with their actual save time before
kickoff, frozen game identities, model/method and fantasy league scoring/context.
The independent SQLite `prediction_records` table (migration eight) survives
advice-history retention/deletion, restart and backup restore. It is bounded to
two thousand entries/eight megabytes, reserving space for settlement metadata;
reaching capacity preserves existing records
and reports omitted new forecasts. It is excluded from ordinary dashboard/report
snapshots. No old advice is backdated into the ledger.

Expand **Prediction accuracy and paper results** to view the record; **Check
finished games** fetches verified final-event receipts and, where necessary, fresh
observed player statistics. A unique final NFL result is required for settlement.
Incomplete or missing appearances, identity conflicts and unavailable scoring stay
unknown, never assumed zero/DNP. Defense joins use the frozen team; future team
moves can leave a frozen player horizon unresolved. Full-season captures measure
only a known future component, excluding already-recorded points. Outcome fetches
are explicit, throttled and bounded; there is no unattended polling or inference.

Accuracy uses the earliest prediction per target/method/horizon/league/scoring to
avoid inflating results through retries. Fantasy cohorts show average absolute
error and bias by method, position and horizon. Betting cohorts show conditional
win-probability Brier error, matched no-vig odds baseline and calibration bins;
pushes are excluded from probability error. Paper results count at most one
qualifying selected side per game/market, only for still-verified fetched prices.
They use one hypothetical unit, correct American payouts and refunds on pushes;
AI probability records are graded separately and do not create additional bets.
Weekly-cluster approximate intervals require eight settled weeks. Fees, taxes,
fill availability and slippage are excluded. Export before explicitly clearing
this local record; neither action changes saved advice or places a wager.

Local API additions: `GET /api/advice/odds?game=&season=`, `GET
/api/advice/performance`, `POST /api/advice/performance/refresh`, `POST
/api/advice/performance/backtest`, `GET /api/advice/performance/export`, and
`DELETE /api/advice/performance`. Mutation routes retain host/origin/JSON controls;
checks accept no threshold/forecast/configuration inputs. The history export
contains local forecasts and scoring context, not credentials/member imports.

**Test historical market prices** (or `npm run betting:market-evaluate`) evaluates
the unchanged rolling model on two completed consecutive seasons, fitting each
forecast only from earlier weeks. It uses paired actual archived prices and the
correct home-favorite spread sign; missing prices are not synthesized. The API
runs the bounded replay in a worker with no inherited environment secrets, app
state, player data or inference. Current AI judgments/public projections cannot
be reconstructed retrospectively. The archive lacks verified quote-publication
times and sportsbook identity, and outcomes existed during method development;
this is a retrospective simulation, not an untouched/prospective holdout.

The [October 11 review](reviews/2026-10-11-live-prices-and-performance.md) records
actual live feed compatibility, two-season results and verification. The legacy scores-only model
has **not demonstrated an accuracy advantage over sportsbook probabilities**:
its Brier error was higher in every measured market/season in that earlier check. Sparse positive paper
returns do not establish profitability. Forward validation requires future
pre-kickoff analyses and complete subsequent outcomes. Search/Help explains both
fetching and results tracking with direct Advice actions.

## Opponent-adjusted market model v2

The earlier paired-price game method was
`market-regularized-v2`; saved v2 results retain that method. Recency-weighted ridge offense/defense ratings account for
opponent strength and a learned home effect, removed at explicit neutral sites.
A regularized logistic correction starts from the sportsbook no-vig probability,
using book calibration and the score-model residual. The sportsbook is an input;
improving the old scores-only model does not establish independent market edge.
Score, residual and correction fitting use earlier NFL weeks. Each validation game
uses its own archived handicap/total and both prices. Live forecasts exclude
outcomes after issuance. Current injuries, quarterback changes, weather and market
movement are not quantitatively adjusted.

The frozen parameter procedure was selected on 2016–2021 development data before
retesting 2022–2025. [The dated comparison](reviews/2026-10-12-model-v2-comparison.md)
records 7.27% lower aggregate probability error than v1 over 3,221 matched non-push
outcomes. It still slightly trails the book overall; recent totals remain worse,
and favorable isolated intervals do not establish consistent advantage or profit.
Those historical outcomes already existed and prior v1 recent results were seen;
future recorded validation remains separate. No hypothetical selections pass the
paired book-improvement/calibration/price gates in this study.

Advice shows new, previous and book errors plus weekly paired uncertainty with
adequate decimal precision. Existing `rolling-residual-v1` results remain readable
and retain their method. Missing paired current odds or thin archive coverage can
retain the legacy calculation; its frequency baseline cannot substantiate an
actionable game-market edge. Props retain the separate legacy numerical path.
Forward records separate methods and never recompute old advice. Run
`npm run betting:market-evaluate -- --compare` for the four most recent completed
seasons; the default button still checks the two most recent completed seasons.

## Market context and adaptive moneyline correction v3

Supported paired-price game forecasts introduced `market-context-v3`; current
moneyline/spread and totals without usable v4 context retain it. It retains
v2's opponent/venue score ratings and regularized book correction, adding derived
rest differences, combined rest, season phase, the selected market line (or
moneyline curvature), and earlier team scoring errors against each game's own
archived line. Rest is inferred from earlier completed regular-season dates,
defaults to seven days without a prior appearance, and caps at fourteen days.
Team errors are clipped, decay with a 120-day half-life and shrink toward zero.
No postgame starter or observed weather field is treated as pre-kickoff knowledge.

Moneyline corrections additionally blend toward the book using earlier
out-of-week candidate forecasts and a fixed ridge penalty. The blending weight
can be zero; this is disclosed reliance on the book, not an independent edge.
Spread/total rules and the moneyline blending choice were selected from nine
older-season candidate structures and eighteen prediction rules, with no betting
return objective. Later-season results remain mixed. No threshold or current
forecast tuning is accepted through HTTP.

The reused 2022–2025 audit slightly improves pooled Brier versus v2 and the book,
but the paired interval includes zero and most individual season/market cases do
not beat the book. Existing action/calibration/price gates are unchanged. Saved
v1/v2 advice is readable and never regraded; new ledger entries retain v3's method.
The historical comparison also reports matched v2 error in its uncertainty details.
See [the v3 evidence](reviews/2026-10-12-model-v3-comparison.md).

`npm run betting:model-audit` prints matched model/v3/v2/book errors for four completed
seasons, pooled weekly-cluster intervals, and consistency counts. Individual
intervals are nominal; twelve season/market simultaneous comparisons use a
Bonferroni normal approximation. Add `-- --snapshot <schedules.csv>` to replay a
bounded local public archive snapshot instead of fetching current data.
`npm run betting:model-develop -- --snapshot <schedules.csv>` reproduces the fixed
older development grid, discarding all rows after 2021 before model preparation.
These are research commands; they never save advice or place a wager. Frozen
selection and candidate results are in `docs/research/model-v3-*.json`. Archived
publication timing and book identity remain unavailable, and these reused
historical outcomes are not a prospective or untouched validation sample.

## Dated health and forecast-weather context v4

Supported totals now use `health-weather-total-v4`; moneyline/spread retain v3.
A regularized past-week fit adds dated offensive/defensive absences, the previous
quarterback's reported Out/Doubtful status, captured rank-one chart changes and
regional wind/cold/rain forecasts. At least 200 earlier eligible paired-price
cases are required. Missing context stays unknown; no fixed injury point deduction
or confirmed-starter claim is made. Current ESPN dated injury labels can supply
a team-level alternative to undated NFLverse rows; their equivalence to historical
NFLverse reports remains unverified. IR is excluded.

Historical 2025/2026 injury archives omit publication timestamps and are excluded
from dated features. Dated depth-chart capture is available from 2025; earlier
undated charts are excluded. Outdoor regional weather uses 48-hour JMA forecasts
with a conservative 36-hour availability boundary, not postgame observed weather.
Covered/retractable venues and unknown locations receive no weather adjustment.

The reused matched 2022–2025 retest improves pooled error only slightly. Totals
improve versus v3 in three seasons and worsen in 2024; only five of twelve
season/market cells beat the book. Paired uncertainty includes zero and no paper
pick qualifies. See [v4 results and coverage](reviews/2026-10-12-model-v4-comparison.md).
`betting:model-audit` now defaults to context enrichment; `-- --contexts <public-games.json>`
replays a bounded validated snapshot. `betting:context-develop -- --contexts <public-games.json>`
reproduces all five older-season candidate procedures. Saved v1/v2/v3 advice is
preserved and totals record their distinct v4 identity. Help/search explains the
source and participation limits.

## Better personnel sources and rejected corrections

Official NFL weekly articles now supply partial dated injury context from 2025
onward, using the latest modification before the prediction cutoff and linking
the actual article. Prior snap roles and shrunken quarterback passing efficiency
are shown as supporting context, with strict earlier-week/game identity and
missing-match rules. The captured chart/last starter remains unconfirmed.

Six new corrections all worsened older development error. Feeding new official
counts into v4 also raised recent measured error, so these numerical effects
remain disabled. Production retains v3/v4; official source coverage is descriptive
and does not qualify quantitative injury correction. The retained 2022–2025
errors reproduce exactly. See the [personnel comparison](reviews/2026-10-12-personnel-data-comparison.md).
`betting:personnel-develop` and `betting:personnel-audit` reproduce the explicit
local research trials; no HTTP tuning or new v5 method is enabled.

## Advice review and calculation improvements — October 13, 2026

Draft replacement now jointly assigns every supported starting slot across the
league, using a bounded residual min-cost flow. Overlapping FLEX, receiver FLEX,
WR/RB FLEX and Superflex no longer depend on input order. This improves allocation
correctness given supplied estimates; it does not validate the estimates or
forecast other managers' picks, dynasty value or bench demand.

**Find waiver pickups → Player to drop (optional)** compares a full add/drop.
Before, removed-player, after and gain metrics use the same weekly scoring and
complete starting slots. A move that loses a starter elsewhere can have a negative
gain despite a strong incoming estimate. Non-improving moves remain Hold; an
add-only screen stays tentative. Both answer passes must visibly cite the complete
computed comparison, and unsupported final explanations cannot be saved. Inactive
options cannot be proposed as immediate starters. Platform locks, FAAB, IR rules,
priority and longer-term stash value still need separate confirmation.

Explicit GSIS conflicts now withhold both individual scoring history and
workload/production context instead of falling back to another player's name.
Separately validated platform imports remain usable. Automatic seasonal forecasts
report the selected method's chronological MAE separately from the adjustment
candidate's MAE, including when that candidate was rejected. This changes reporting,
not forecast coefficients.

Every actionable betting forecast requires matched historical sportsbook
validation. Legacy prop/fallback frequency tests are labelled explicitly and
remain Hold even if their descriptive errors look good. Existing saved results
remain readable; no forecast journal was rewritten. Moneyline/spread/totals
probability calculations and rejected research candidates remain unchanged.

The [review](reviews/2026-10-13-advice-model-review.md) records primary research,
all six workflow checks and limitations. A fresh signed-in model benchmark stopped
before generation: installed `codex-cli 0.162.0-alpha.17.2` does not match the
connector's verified `0.162.0-alpha.2`. New provider quality is therefore not
verified in this review; the version check was retained.

## New native CLI isolation and fresh quality retest — October 13, 2026

The [compatibility review](reviews/2026-10-13-codex-compatibility.md) verifies
macOS CLI 0.162.0-alpha.17.2 after fixing global instruction reads and model-catalog
tool overrides. Request capture checks top-level tools and `input.additional_tools`;
fixture and existing-native-home requests contain only supplied instructions and
fictional evidence, with no tools or skills. Native login remains in place.

A fresh unchanged-rubric production-path sweep passes 23/23 cases across all six
workflows, including both waiver-drop comparisons, with 46 validated calls and
no validation/grading failures. [Results](research/2026-10-13-codex-advice-quality.json).
This supersedes the connection-availability blocker from the original review;
its failed preflight remains recorded. No football probability model changed,
no sportsbook edge is established, and newer-build Windows/Linux/installer
verification remains open.

See the [weekly-decision workflow review](reviews/2026-10-13-weekly-decision-workflows.md)
for the weekly Home, team-before-AI setup, evidence readiness, clearer results,
prospective cohorts and fantasy outcome journal. Local messaging read verification
is explicit and discards contents; sending still uses saved-report review and
confirmation. Native team preferences persist across localhost port changes.

## Real football data quality evaluation

Use `npm run advice:real-capture -- /tmp/public-football.json` followed by
`npm run advice:real-evaluate -- --snapshot /tmp/public-football.json --output /tmp/real-advice`
to exercise the six workflows with actual public sources and isolated PPR scenarios
through the existing signed-in Codex connection. `--prepare` checks readiness without
model generation. See the [real-data review](reviews/2026-10-13-real-advice-quality.md)
for observed recommendations, independent checks, fixes and prospective limitations.

## Market Signals and player prop research

Open **Advice → Market signals**, choose an upcoming NFL game/provider and enter
the sportsbook's exact half-point total. Load signals to view 24-hour contract
price movement, hourly executed cash in trades ≥$500 and relevant recent NFL
headline coverage. Expand Chart data or Sources for exact values and limitations.
Kalshi has anonymous trades; neither the large-trade chart nor selected publisher
coverage establishes informed whale activity or representative public sentiment.
Polymarket availability depends on an exact public contract match. Missing data
stays unavailable. The panel never supplies inputs to betting predictions.

**Freeze prospective record** saves the first eligible game/provider capture with
the fixed `external-price-v1` comparison: latest Over price versus the matched
sportsbook no-vig probability. Subsequent captures cannot replace the first line,
probabilities or covariates. **Check final scores** resolves completed games only;
provider/season Brier scores compare the same outcomes. These manually selected
cohorts have no automatic promotion gate or profitability claim. Export research
separately: its private SQLite ledger is not in ordinary app backups. Collection
is manual; no new background polling or scheduled AI calls are enabled.

In **Analyze a bet → Player props**, choose the game/player/statistic and enter
line/odds. Passing attempts/completions, yards, touchdowns, interceptions, rushing
attempts, receptions and targets are supported. Recent-game charts show up to 12
completed games, average and Over/Under/Push counts at that exact line. Counts are
historical descriptions, not calibrated winning probabilities. This uses public
nflverse stats with identity/team/opponent checks and excludes missing values.
The app still requires manually verified sportsbook prop prices; it places no bets.

## Published prop lines, book prices and closing line value — October 22, 2026

**Player props** no longer need typing. Choosing a game lists its published props; Over or
Under fills player, statistic, line and (when available) price.

- Without a key, lines come from ESPN's public prop feed (DraftKings lines at present). ESPN
  publishes no prop prices, so odds stay empty until entered; **Use the typical −110** is an
  explicit opt-in, never a silent default. Athlete names are resolved from ESPN athlete records
  and matched to the game's players only by an exact, unique name.
- With an optional **The Odds API** key (Settings → Delivery & access → Credentials), props come
  with both sides' prices per sportsbook, and **Compare sportsbooks** shows each book's game
  price, its implied chance and the margin-free consensus. The key is sent only to
  `api.the-odds-api.com` (its required `apiKey` query parameter) and is never logged. Listing
  events is free; each game's props or prices cost Odds API credits and are cached ten minutes.
  Prices from other books fill the form as manual prices; only ESPN-verified quotes carry a
  quote identity into paper selections.

**Closing line value.** While the app runs, it records the latest same-book, same-side price
for pending verified selections every ten minutes in the hour before kickoff; the last capture
is the closing price. CLV is the margin-free closing probability minus the probability implied
by the price taken, and is computed only when the line did not move. Track results shows average
CLV, how many selections beat the close, and a week-by-week running paper result. Settlement
also runs automatically every 30 minutes instead of only on **Check results**.

The AI's own uncalibrated win probability is still recorded for research but is no longer
shown in results. A weekly bet limit (stored on this computer) counts saved bet analyses from
the last seven days; the app never places bets.

**Claude API.** Settings → AI → Connection type → Claude API uses an Anthropic API key from
the OS credential store with Claude Opus 5.5 by default (Sonnet 5.5 and Haiku 5.5 are lower-cost
choices). Requests use adaptive thinking with effort from the analysis, no sampling temperature
(the current API rejects it), and Anthropic's server-side fallback for safety-declined requests;
a final refusal is an error, never partial advice.
