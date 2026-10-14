# Real default reports and automatic-generation QA — October 14, 2026

Codex reviewed the working-tree increment based on `890ffcb8599dc5598dd7cfc7d9082bbb64ed2938`
and compared it with the previously inspected report-library package. This is internal
consistency/usefulness testing, not proof of future forecasts, profit or live owner-league accuracy.

## Sources and scope

- Freshly retrieved [Sleeper’s public documentation sample](https://docs.sleeper.com/#get-a-specific-league):
  the completed **2018** league, 12 team records/scoring totals, 180 draft picks and six archived
  Week 6 matchups. Account identities were removed and team labels anonymized before model use.
  Historical Week 6 replay is explicit; final standings and Week 6 scores are different periods.
- A separate **2026 regular-season Week 6** case uses real public ESPN expected NFL player statistics
  and catalog identities from the same-day capture (2026-10-14 02:58 UTC), with constructed
  two-team PPR fantasy rosters. Records, actual scores and fantasy team points-for were deliberately
  unavailable; forecasts were independently scored from the supplied expected statistics.
- Current NFL state and ESPN RSS were fetched again. Present-day headlines were not allowed to
  establish 2018 facts. [nflverse’s availability schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)
  distinguishes source freshness from verified injury status; no current injury CSV claim was made.
- Public source snapshot SHA-256: `4f95be3ebcaca3a39ab7ba29e7927c2bdfae620245b6388e5f0186e7f7aaa4c6`.
  No owner leagues, schedules, saved provider credentials or installed owner app were modified.

## Generation and review

**14 native GPT-6.1-Sol responses**: five initial manual reports, five corrected archive reports
from real one-time cron ticks, two current-week reports from real recurring ticks, and two targeted
recurring retests of the availability gate. Production report service, persisted scheduled runner,
season checks and cron implementation were used with a bounded public-data replay and the isolated
native provider. The connector input was recorded public data; this was not a live owner-platform
sync or a paid API-key test. All nine automatic generations saved drafts; delivery credentials were
never read. Overlap prevention blocked subsequent ticks while queued work was running.

Eight final reports were selected for accuracy and usefulness; the earlier current matchup that
counted an Out starter was rejected and superseded by the targeted tests.

| Type / case                     | Final review                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Power rankings                  | Correct wins-first top five: teams 6, 3, 10, 5, 1. Points-for breaks equal-win ties; no forecast or champion claim.                                             |
| Matchup preview, archive        | Correct smallest gap 5.50, largest gap 43.84 and Team 6–9 gap 19.46; explicitly historical snapshots, no winner/lineup invention.                               |
| Draft hype                      | Completed draft celebration/outlook, not a live draft alert. Kittle 137, Mahomes 159, Conner 177 verified against raw picks; passing-TD/PPR/FLEX rules correct. |
| Draft review                    | Correct 180-pick log and late-round pick/round references; final roster composition does not prove original draft ownership or draft-time value.                |
| Offseason update                | Correct 94.32 season scoring gap and 4.80 cross-record comparison; no transaction, championship or current-availability claim.                                  |
| Current incomplete rankings     | Abstains from a standings order because no complete record/points-for metric exists; gives useful Out/Questionable lineup checks.                               |
| Current Out-starter matchup     | Withholds totals and projected edge until the recorded Out starter is replaced; no fabricated zero or substitute.                                               |
| Current eligible-lineup variant | Conditional 134.3–98.2, difference 36.1, matches independent expected-stat sums; Lamb remains Questionable, source citation exact, no declared winner.          |

Final text is 150–169 words, with plain paragraphs/lists and verified source links. Qualitative
review covers practical next steps, uncertainty, scope, roster-versus-draft attribution and
absence of diagnoses or fabricated results. Fantasy rosters in current cases are constructed;
source expectations and availability labels remain uncertain.

## Issues fixed

1. Scheduled/calendar generation used the raw connector object, losing the renamed league label
   and newly stored sync date. Both now generate from the persisted snapshot. Scope/cadence/enabled
   state is rechecked after awaited scheduled sync; revocation prevents later AI work.
2. The AI context omitted the season while including modern headlines/catalog fields for an archive.
   Prompts now include period/sync/generation dates, filter nonmatching/undated/future headlines,
   withhold undated historical estimates and omit modern roster status/team fields in old setups.
3. Matchup sums counted a player marked Out in the separate injuryStatus field, and availability
   guidance ignored that field. Both status fields now contribute evidence; inactive starters
   prevent a complete active-lineup comparison. Questionable remains conditional.
4. Charts rounded actual two-decimal scores to one decimal and showed no year. Snapshots now
   retain the optional season; scores display two decimals and wins are integer counts.
5. Sleeper calculated scores ignored the documented commissioner override. Valid custom_points,
   including zero, now take precedence; missing overrides retain the calculated score.
6. Short AI outputs contained Markdown tables/headings/bold rendered literally. Plain-text instructions
   and top-five short rankings keep them readable. Draft hype uses recorded date/status and a neutral
   draft-outlook title, rather than “draft day is here” on a completed archive.
7. Missing-value charts inherited a fixed-height empty state that wasted space. Their spacing is
   now compact without inventing values or moving supporting charts into the default report view.

## Verification

- **104 independent checks** pass: raw records/scores, ranking order, draft facts, arithmetic,
  graph snapshot numbers, period/news filtering, sync dates, inactive abstention, supported
  conditional sums, plain-text length, exact citations and draft-only outcomes.
- `npm test`: **1,032 passed**, two expected platform skips. Workspaces: API 336, dashboard 87,
  core 266, integrations 232; root 111. Typecheck, lint, build, formatting and diff whitespace pass.
- **132 distinct desktop/mobile browser cases** pass (154 executions including overlapping batches and the final layout retest),
  covering public-data precision/year labels, report review/links, missing values, schedules,
  conflicts, advice, compact workflows, guided setup, API persistence and quiet profiles.
  Browser plugin unavailable; repository Playwright used at loopback fixture URLs, 1440×1000 /
  390×844 and 320px black mode. No framework overlays or relevant renderer errors in reviewed flows.
- Eight exact final generated reports open in the packaged app through temporary SQLite. Source
  links are checked against saved citation URLs; chart labels match raw two-decimal values.
  Desktop/mobile/black layout, unavailable current scores, API replay and quiet Stop passed.
  A QA assertion was corrected to account for intended citation-link rendering; original saved
  report text remained exact in the API and exports.
- Final spacing package passes all eight native report reviews again and 14 targeted layout/quiet-profile browser cases. Native launch/restart/unsaved Stop verification passes without dialogs; temporary credentials reset and white/black preferences persist. Archives validate and ZIP ASAR matches the inspected payload. 187 compiled application files match source; 2,700 payload files exclude local state, `.env`, `.sidekick` and `auth.json`. No numerical advice-model algorithms changed.

Evidence remains outside source under `/tmp/sidekick-real-reports` and the system Playwright result
folder. Source/browser logs: `/tmp/sidekick-real-report-all-tests.log`,
`/tmp/sidekick-real-reports-ui.log`, `/tmp/sidekick-real-report-main-flows.log` and
`/tmp/sidekick-real-report-browser.log`. Reproduction harnesses are temporary and use captured
public evidence; no owner credentials or public release were created.

## Scoped manual review

No automated security scan was run. `SECURITY.md` code/security checklist applied to this increment;
unchanged earlier payload behavior remains covered by the prior exact-artifact reviews.

- [x] Complete scoped source/compiled delta reviewed; changes belong to API orchestration, shared
      report evidence, dashboard charts or the typed Sleeper integration. No new dependencies.
- [x] Validations cover optional season, bounded snapshots and restored legacy reports. Data-only
      prompts, source URLs, HTML-free React rendering and citation allowlists retained.
- [x] Scheduler timing/timezones, occurrence claims, scope changes during fetch, completion pauses,
      retries, error collection and shutdown traced/tested. No new outbound channel authorization.
- [x] Loopback/host/origin/CSP and OS credential controls retained. Native model testing uses
      existing supported sign-in and isolation; no API key provisioned, logged or copied into state.
- [x] No application subprocess/filesystem behavior changed; temporary QA roots cleaned. Report
      snapshots contain numeric league evidence, not credentials or private member-memory imports.
- [x] Draft/review/delivery guards retained; neither cron tests nor native replay sent messages.
- [x] Missing/error/legacy/narrow/black states and existing advice workflows checked. Source/model
      uncertainty and live-versus-final limits remain visible without raw table dumps.
- [x] Docs/task/source-of-truth updated. Artifact inspection/signing limits recorded when finalized.
- [ ] Maintainer: Developer ID signing/notarization, interactive installation, Windows/Linux native
      checks, actual owner-league/provider validation and broader participant usability remain release gates.

## Exact final macOS ARM preview

| Artifact                                                                            | SHA-256                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| DMG `apps/desktop/out/make/Sunday Sidekick-0.1.0-arm64.dmg`                         | `47e0760c69615bbe0af37f67fd7a16f68ee16e5e039b197b26381500df672e09` |
| ZIP `apps/desktop/out/make/zip/darwin/arm64/Sunday Sidekick-darwin-arm64-0.1.0.zip` | `12564a6e60ab06b311e1f6635079268f6e7089f394a8b861333bfdfb10544361` |
| Delivered/ZIP ASAR                                                                  | `98501af027b30af3f99a90c377fcccac7a13a80d6d616a0e7d0fa316ebe573b4` |

The previous report-library package is retained at `/tmp/sidekick-before-real-report-fixes-out`;
the pre-spacing intermediate is at `/tmp/sidekick-before-real-report-empty-compact-out`.
These output filenames now contain the final rebuild. Unsigned contributor preview only;
Developer ID/notarization, native Windows/Linux, interactive installation and live owner-provider
validation remain maintainer gates. No publication or replacement of the installed owner app.
