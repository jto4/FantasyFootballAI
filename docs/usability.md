# Everyday use

Sunday Sidekick presents five main pages: **Home**, **Advice**, **Reports**,
**Schedule**, and **Settings**. **More tools** contains league management, league members, and imports.
Search can reach every page and setting, including settings inside Advanced; it opens
those sections before highlighting the control. Existing `#/desk` and `#/memory`
bookmarks remain valid.

## Shorter decision screens

Home leads with the selected team's lineup, saved availability flags, waivers and
trades. Connections, report activity, and league standings/news expand on demand.
Report activity starts open when drafts, delivery issues, or generation need
attention. An empty report queue stays compact; onboarding and failed connections
still show their next action.

Advice separates **New decision**, **Saved advice**, and **Track results**. All six
tasks use compact buttons. Switching these views preserves the unfinished form;
opening another result or leaving Advice keeps the existing unsaved-change guard.
Saved advice starts with five results and offers **Show more saved advice**.
Opening a result does not rerun its AI analysis.

Results show the verdict, conditional expected change, evidence confidence,
availability flags, supported starting lineup where applicable, and first reason.
Further reasons, risks, alternatives, calculations, player evidence and sources
expand separately. Numerical values and source statements remain intact.
Low confidence, unverified availability and conditional estimates remain
visible; confidence is not a win probability.

Settings puts Appearance under **Storage & desktop**, with the theme switch still
available in the app header. Diagnostics, backups, report schedules, league
calendar and Yahoo connection details open on demand. Search opens their parent
sections before focusing an exact setting. Existing independent Save controls,
conflict handling and delivery confirmations remain available.

## Reports and graphs

Open **Reports** for power rankings and matchup previews. **Create now** opens the draft preview; **Edit automation** opens the existing schedule. **Draft & offseason reports** contains draft hype, draft review and offseason updates.

**Set up weekly drafts** previews a Tuesday 9 AM rankings report and Wednesday 9 AM matchup preview for the selected league. **Enable weekly drafts** saves this plan. It replaces these two report types’ previous schedule/scope/delivery policy with drafts in the app; other schedules stay as configured. Each action keeps its timezone. Keep the local service running and the computer awake, and configure/test the selected AI connection before the first run. Generation may incur AI usage charges. The plan sends no messages. The Schedule page still shows planned times and run history, with season-aware pauses and retries.

**League charts** switches to recorded season points, wins and current-week matchup scores. Larger leagues start with six teams and three matchups. Each chart can expand independently, and **View chart data** opens the underlying table. The league season and source times remain visible; recorded scores retain two decimals, wins are counts, and missing scores are unavailable and platform scores may be live or final. Charts are snapshots, not predictions.

During saved-report review, **Explore the report’s chart snapshot** shows the numbers captured at generation. Refreshing the league or editing the report text does not rewrite them. Older reports keep their text without invented historical charts. Charts currently stay in the app; copy/download and provider delivery continue to share the saved report text.

## First report

1. On Home, choose **Guided setup** and connect a league. Paste a supported HTTPS
   league link; the app recognizes Sleeper, ESPN, or Yahoo, and an ESPN link can also
   supply its season. IDs still work with an explicitly selected platform. The app
   parses the link locally and uses its existing platform adapters, never fetching the
   pasted URL. Unsupported hosts, credentials, ports, protocols, and invite links are
   rejected. **Where do I find my league link?** explains how to copy it.
2. Connect the AI service. A saved connection can be tested without replacing it.
   For a new OpenAI connection, create a key in your own account and paste it into the
   password field. Guided setup chooses the existing `gpt-4o-mini` starting model,
   saves only the AI section and stores the key in the OS credential manager, then
   runs the existing fixed connection test with no league data. OpenAI API usage has
   [separate billing from ChatGPT](https://help.openai.com/en/articles/9039756-managing-billing-settings-on-chatgpt-web-and-platform).
   Alternative services, models, endpoints, and local tools remain under Advanced.
3. Choose a report type. The selected league is displayed, and **Create draft**
   explains what is shared with the AI provider. Creation never sends a league message.
4. Review the saved draft, edit if necessary, and save the edits. A send preview shows
   the actual channel, destination, subject where applicable, and exact channel-limited
   saved text. Choose the send action, then confirm using **Send email to …** or the
   equivalent channel-specific button. **Back to review** cancels that confirmation.
   Missing destinations and unsaved edits have an explanation and a disabled send.

Home highlights unfinished connections, waiting drafts, or creating a report. Existing
saved connections receive one fixed connection check per configuration/AI-key change
in the current app session. That test may incur a small provider usage charge or
invoke the configured local tool; it includes no league or conversation data. Failures
lead to guided setup rather than repeated automatic retries.

Private ESPN access still requires the owner's session values; the credential card
explains where to find them. Yahoo still requires its approved developer app and
owner authorization. Clearer guidance does not remove those provider requirements.
Pasted league input stays in the current app session while users configure access,
and **Resume league connection** returns them to it.

## Personalization and scheduling

Voice offers **Friendly**, **Playful trash talk**, **Straight analysis**, and
**Hype crew**, with illustrative text clearly labeled as an example. Existing preset
values and arbitrary custom styles remain supported. Profanity, excluded topics,
report length, and destination boundaries remain separate controls.

Individual schedule presets choose the recommended cadence and 9 AM in the existing
timezone, preserve league scope and channel, enable the schedule, and choose draft
review mode. Changes stay in the form until saved. A sentence spells out cadence,
timezone, scope, and whether anything is sent. The existing bulk **Use suggested
times** action retains its existing scope/channel/review-policy behavior.
Automatic report delivery and automatic chat replies require explicit confirmation
before the form enables them. The running app must be available at the scheduled time.

## Settings and recovery

Settings keep section-scoped Save and Saved/Unsaved/Saving feedback visible while
scrolling. On phones, the save bar stays below navigation. Storage cards retain their
individual save controls. Switching sections retains edits; leaving the page and native
browser history still use the existing unsaved-change guard and revision conflicts
keep the local edits available.

Connection cards are collapsed until needed. Resend, Twilio, and BlueBubbles accept
ordinary named fields, with raw JSON available in Advanced. Only newly entered values
are displayed; saved secrets are never read back into inputs. Saving a connection does
not send a message. Test-email sending retains its separate confirmation.

AI, league, report-loading, and operational failures provide a plain-language summary,
a recovery action, and expandable support details. Existing send uncertainty, immutable
saved envelopes, retry confirmation, backup restore checks, deletion confirmation,
loopback restrictions, and credential boundaries remain in force. Dialogs render in a
body portal so sticky navigation and settings bars cannot cover the search or report flow.

See dated review records and the support matrix for actual test coverage and limitations.

## Try it and get help

Home and Help & FAQ offer **Try a sample league**. This uses fictional teams and
prewritten examples with no account, AI generation, scheduled jobs, database writes,
or delivery sends. Choose a report card, open its example, edit and save a sample
draft, then copy/download it. Sample edits exist only until the preview closes.
**Set up my league** starts the real guided flow; sample teams never become real
connected leagues.

Help & FAQ is available from the desktop sidebar and More tools on phones. Every
answer is also indexed by global search and has a `#/help?answer=...` bookmark.
Choosing an answer opens its details and focuses the heading. Answer buttons lead
to the relevant actual page or setting. FAQs cover account/API billing, league links,
private access, sharing, failed/uncertain delivery, scheduling, voice, privacy, and
backup recovery. Answers and search entries come from one shared content module.

## Task search

The app interprets a bounded local vocabulary for tasks, without sending queries
to an AI service. **Stop sending emails** previews only affected email report
policies; confirmation returns them to draft review without deleting schedules.
Other channels and chat-reply policy are explicitly unchanged. **Stop automatic
messages** can also switch chat replies to review; the schedules and delivery
sections save separately with revision checks, and a partial failure is explained.
An already-running send may still finish.

**Turn automatic emails on** lists enabled scheduled email actions and actual
recipients before its final confirmation. Missing recipients prevent enabling it;
a changed delivery revision requires reopening the preview. **Email rankings every
Thursday at 10:30 AM** opens a proposed schedule on Schedule, always initially in
review mode. The user checks timezone, league scope, timing, channel, and policy;
search alone never saves or sends. Unsupported/ambiguous details remain visible
choices, not silently inferred instructions. Negation is retained by the task
parser; contradictory requests and excluded/alternate cadences are not actionable.

**Why did my report not send?** leads to the delivery FAQ and then saved attempts.
Ordinary setting search still opens/highlights the exact control. Search suggestions
include task examples and empty results link to Help. Search uses help titles,
keywords, and descriptions; it does not index secret values or report bodies.

## Share and schedule directly

Saved report reviews offer **Copy report**, **Download report** (plain text), and
**Share report** where the device/browser supports the
[Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).
Only the saved title/body is used, not settings, recipients, or credentials. Save
or cancel edits before sharing. Denied clipboard access reveals selectable text;
share cancellation is quiet and other failures offer copy/download. These actions
never call the delivery service or mark a draft as provider-sent. Users choose
where to paste or share it themselves.

Sharing feedback belongs to the exact saved text. After the report changes, an old
copy/download/share confirmation is hidden; copy again to put the new text on the
clipboard. Dialogs retain keyboard focus when a step replaces its focused control,
so Tab and Escape still work and closing returns focus to the opener.

Report choices are cards with purpose and clearly fictional examples. Schedule
cards show the planned next run and destination. Their Edit buttons open an inline
editor; unsaved changes remain through a canceled close/back action and revision
conflicts retain the proposal. Saving updates only the schedules section. The
editor keeps all existing cadence/timezone/league-scope options; enabling automatic
external delivery requires a recipient and an explicit final confirmation.

Delivery channel and review/send policy have visible labels and full-width controls
on phones. Timezones show friendly names such as **Eastern Time — New York**, with
the exact configured identifier below the selector. Uncommon configured zones remain
available after trying another choice. Display labels never rewrite the saved
timezone or change daylight-saving calculations. Non-weekly timing searches offer a
direct Schedule link; the user chooses a supported frequency and saves it explicitly.

Planned occurrences use the configured timezone, skip nonexistent daylight-saving
wall times, and do not promise a second recurring fall-back run. Due, missed, finished,
and disabled one-time schedules have distinct labels. A planned time is not a delivery
guarantee: the running service, awake computer, current league data, AI readiness,
and season policy still apply.

Home includes a compact league-data, AI-readiness, next-report, and automatic-send
summary with direct recovery links. Setup remembers progress, platform, ESPN season,
and a validated league ID in versioned browser storage. Arbitrary URL parameters,
partial input, API keys, and platform session values are never stored there. Actual
saved connections remain in the service/vault and determine which step needs work.

[The usability study plan](research/usability-test-plan.md) is ready for willing
nontechnical participants; automated tests do not replace those sessions. The
[managed AI service design](managed-ai-design.md) remains a proposal pending operator,
hosting/account, authentication, budget, and policy choices. No managed service is
currently deployed or advertised as available.

## Dialog reliability

While setup, sample exploration, or a report dialog is open, Command/Ctrl-K keeps
focus in that task. Close it to use search. Dialogs keep the page behind them still
while their content scrolls; closing restores normal page scrolling. Guided setup
uses the same keyboard and scroll behavior as other dialogs. Long titles and league
names wrap inside report reviews on narrow phones. A delayed report refresh cannot
replace a newly opened report or an active editing session.

Saved report reviews keep their title, status, and Close button visible while
scrolling, including narrow phones. **Details** expands generated, league-data,
news, and last-edit dates; its summary indicates missing data dates. Evidence and
limitations remain a separate disclosure.

When delivery uses the exact saved report text, the review displays it once and
**Send preview** explains that the full report above will be sent. Channel, recipient,
and email subject are still shown before explicit confirmation. Shortened text,
immutable retry messages, linked-citation formatting, and saved text during editing
retain a separate literal preview. Save edits before sending to update that preview.

While a draft is saving, its title/body and Cancel editing are temporarily disabled.
If you close the review, the app explains that the save continues in the background.
A completed save does not replace another open report or show its feedback there.
Phone-message shortening preserves whole emoji and accented characters; the exact
preview, newly saved delivery message, and outgoing text use the same size policy.

Shortened-message notices offer **Edit/shorten** for editable drafts. It opens the
full saved body and focuses its editor; it does not automatically shorten or save
anything. After you shorten and save the draft, the notice and duplicate preview
disappear when the full message fits. Reports with a delivery attempt cannot be
edited. Review delivery methods are labeled **Email**, **Text message**, **iMessage**,
and **In-app only**; the confirmation uses the same plain-language method name.

## Football advice

Advice is a primary destination, with a **Get advice** entry on Home and searchable
choices for draft planning/review, starting lineups, trades, waivers and NFL bets.
**How advice works** opens the searchable FAQ. Choose your fantasy league/team or
upcoming NFL game, search for players where needed, and review the evidence before
acting. Draft and trade season comparisons link directly to projection Imports.
Bet prices are entered explicitly; the selected team's handicap and American odds
are explained beside their fields.

Trades let you choose the last NFL week that matters for your league, up to week 18.
Advice estimates remaining points automatically when public history, scoring and schedule coverage support it. Matching imports for the current week through that same final week take priority. Full-season totals include already-earned points and cannot supply future trade value. Imports display declared periods; results show remaining points.
Search **remaining season projections** for the FAQ and its direct Imports button. Search **automatic draft forecast** for the automatic-estimate FAQ and its Advice button.

**Connection for this analysis** chooses the saved service or **Signed-in Claude · Opus**
when the installed tool has an existing subscription login. No new key is created.
**Reload connections** checks sign-in without generating an answer; **Test signed-in AI**
sends a fixed probe with no league data and can be canceled. Sign-in does not guarantee
model availability. Failures never switch providers, and report/schedule settings remain
as saved. Search and Help explain the connection choice.

**Signed-in Codex · GPT-6.1-Sol (experimental)** uses an existing ChatGPT login in the
installed Codex CLI. Both passes use high reasoning without a new API key. The current
adapter requires verified CLI version 0.162.0-alpha.2; unsupported versions remain
unavailable. Its searchable FAQ explains setup, testing, isolation and limitations.
Native subscription usage has no per-pass token cap, so Advanced analysis limits shows
a disclosure in place of that selector. Time/response-size bounds and cancellation
remain active. Failures never switch connections or alter report settings.

**Analyze my choices** uses the selected connection for analysis and review.
Inputs are temporarily locked during analysis; **Cancel analysis** stops it and
retains the form. Failed verification retains inputs and offers recovery actions.
Unsaved choices and running work trigger the existing navigation guard. Completed
analyses focus/scroll to the recommendation and show supporting numbers, evidence
confidence, risks, an alternative, perception, data gaps and source dates. Confidence
is not a success probability; AI betting forecasts have a separate uncalibrated
label. Sources/model/usage can be expanded. Saved advice reopens without new AI
calls, has a bookmarkable URL, and requires confirmation to delete. Sidekick never
submits a trade, waiver claim, lineup change or bet for the user.

**AI for this analysis** lists supported models available through the existing
connection and marks the recommended deep reasoning choice. It is displayed before
Analyze and applies to this decision only. Discovery failures retain the saved
model; a no-longer-available choice stays visible until the user picks an available
one. Deeper models may take longer and cost more. **Advanced analysis limits** sets
the per-pass reasoning/answer budget, with deep, standard and compact choices; the
provider charges actual usage. The selected model appears in saved results, and
cost estimates are omitted when the saved prices belong to another model. The token
selector applies to saved/Claude connections; Codex has the subscription disclosure
above. Missing
comparison evidence produces a no-pick result with recovery guidance; uncalibrated
betting judgments remain separate and cannot become firm picks.

Player evidence includes the upcoming opponent, home/away status and game date.
Recent workload, recorded team shares and opponent-position totals show sources,
sample counts and their descriptive limits. On phones, evidence table rows stack
into readable cards with Value and Source & sample labels. Large comparisons show
an omission notice when secondary detail is prioritized to fit the analysis limit;
the comparison players and primary estimates remain available.

News coverage shows the number of relevant recent headlines, feed retrieval status,
and whether matched Sleeper activity is available. Expand **Headlines used in this
analysis** to see source links, publication dates and player mentions or team context.
Stale or uncited media produces an **unknown** tone. The searchable perception FAQ
explains why selected headlines and activity do not represent everyone's opinion.

Starting-lineup advice can choose an eligible bench alternative on availability or
matchup context. **Supported starting lineup** shows the players actually chosen and
their supplied-estimate total. If that differs from the highest estimate, **Highest
estimate for comparison** shows the other lineup and Supporting numbers shows the
estimate given up. Such choices remain tentative with Low evidence confidence when
the tradeoff has not been quantified. A Hold/no-pick analysis labels its numerical
lineup as a comparison. Saved results retain these distinctions after reload.
Position labels use plain names, with explicit slot numbers only for repeated
positions. Those numbers describe lineup slots, never player rankings.

Automatic draft/trade player details show the historical scoring baseline, form,
workload and opponent adjustments, future scheduled games, recorded points and
historical error tests/ranges. Matching imports take priority. Results remain
tentative because future participation and role changes are unverified; full-season
points recorded after a draft cannot establish what was knowable then. Remaining
trade estimates exclude played games and respect the selected championship week.

For bets, games with verified started times are excluded even if the feed has no
score. A same-day game needs a verified future kickoff. If kickoff passes while
Advice is generating, the result is discarded and the error asks you to choose
another game and check its current odds.

Team-defense advice has searchable **team defense**, **DEF** and **D/ST** help,
linked directly to the lineup workflow. Both supported defense slot abbreviations
render as **Team defense**. Comparisons show the actual league-scored alternatives,
while missing events, current personnel and weather remain visible limitations.

Rookie player details show NFL draft year, round, overall pick and college separately
from fantasy point estimates. Where enough prior data exists, numbers describe
recorded outcomes for earlier rookies under the league scoring and explain the
selection bias. A selected player without a point estimate stays visible with the
missing-history explanation; the result requests more evidence. Search **rookie
college NFL draft** for the FAQ and **Add rookie projections** to open the actual
projection import form. NFL draft facts alone do not establish role or fantasy value.

Public offensive forecasts can give a rookie an individual estimate before NFL
history exists, when identity, supported league scoring and exact future schedule
coverage are available. Player details label **public weekly forecast · your league
scoring** and show expected yards/catches/workload alongside future games, future
points and separately recorded points. Forecast counts can be fractional. Matching
imports keep priority; forecasts, missing data and role uncertainty remain explicit,
and the advice stays tentative. Search **ESPN public weekly forecasts** opens a
shared FAQ with an actual Advice button. The rookie and trade FAQs explain this
source, exact week intervals, and why an in-season total cannot grade draft-time
knowledge. These forecasts do not change report/schedule AI settings or require keys.

See the [weekly-decision workflow review](reviews/2026-10-13-weekly-decision-workflows.md)
for the weekly Home, team-before-AI setup, evidence readiness, clearer results,
prospective cohorts and fantasy outcome journal. Local messaging read verification
is explicit and discards contents; sending still uses saved-report review and
confirmation. Native team preferences persist across localhost port changes.

## Report accuracy boundaries

A completed draft gets a retrospective outlook rather than a “draft day is here” title. Archived league reports keep their own season context and omit modern headlines/undated estimates that cannot describe it. Matchup estimates are withheld when a listed starter is Out or on a reserve list; update the lineup first. Questionable labels remain conditional and potentially stale, rather than verified injury diagnoses. Scheduled reports retain the renamed league label and the actual sync time.
