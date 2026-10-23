# Task history, October 2026 (through October 18)

Short record of the completed work archived from `docs/tasks.md` on October 18, 2026. Open items
from these passes were kept in [current tasks](../tasks.md); durable choices are in
[decisions](../decisions.md) and evidence is in the linked dated reviews. Earlier work is in the
[September task record](2026-09-28-task-history.md). Some features below were later replaced; the
note in parentheses says so.

## Reliability, operations and release (early October)

- Commissioner workflows: dashboard generation always drafts; drafts, sends, failures and unknown
  outcomes are distinct. [Review](2026-10-02-commissioner-workflows.md).
- Workflow reliability: delivery envelopes are frozen before sending, email retry keys kept, and
  changed sender configuration detected. [Review](2026-10-02-workflow-reliability.md).
- Hosted OS/source/package/browser CI and the minimum-runtime lane.
  [Integration evidence](2026-10-04-main-integration.md).
- Local operations: queued MCP draft generation with request IDs, status, cancellation and
  history; durable requests and diagnostics. [Review](2026-10-05-local-operations.md).
- Workspace search, simpler primary navigation, a fictional sample league, tasks and searchable
  help. [Review](2026-10-05-task-search-help.md).
- Browser edge cases, dialog/scroll/report-refresh QA, and save/message-boundary QA (October 7).
  [Review](2026-10-07-dialog-reliability.md).

## Fantasy and betting advisor (October 7–11)

- Shared advice contracts and bounded keyless NFL weekly stats, schedules and Sleeper activity;
  six advice modes with a two-pass (analysis, then review) model flow.
- Model selection through the saved connection, matchup/workload evidence, context budgets,
  dated headlines, injury evidence, and an opt-in real-model evaluation suite.
- Signed-in Codex native adapter with request isolation (no tools, no saved session).
- Automatic full and remaining-season forecasts, kickoff boundaries, one-spot start/sit, kicker
  and team-defense scoring and forecasts, fumble-TD proof from public game summaries, and NFL
  draft facts for rookies.
- ESPN public weekly forecasts as a projection source (October 9; removed October 23, when the
  app switched to its own projections).
- Completion audit of all six modes. [Review](2026-10-09-advisor-completion.md).
- Public ESPN pregame prices, an independent pre-kickoff prediction ledger, settlement and paper
  results. [Review](2026-10-11-live-prices-and-performance.md).

## Game-market model research (October 12–13)

- v2–v4 deployed (`market-regularized-v2`, then `market-context-v3` for moneyline/spread and
  `health-weather-total-v4` for totals); v5–v18 tested and not promoted. None beat the
  sportsbook consistently. [Betting model history](2026-10-betting-model-history.md).

## Product passes (October 13–18)

- White default with optional dark mode. [Review](2026-10-13-appearance.md).
- Review of all six workflows with real data, Codex CLI compatibility, and the advice/model
  review. [Real data](2026-10-13-real-advice-quality.md),
  [Codex](2026-10-13-codex-compatibility.md), [models](2026-10-13-advice-model-review.md).
- Local imsg iMessage support. [Review](2026-10-13-imsg-support.md).
- Weekly decisions on Home, readiness, prospective journal and team setup.
  [Review](2026-10-13-weekly-decision-workflows.md).
- Rebuilt macOS ARM installer with packaged advice checks.
  [Review](2026-10-13-latest-installer.md).
- Shorter Home/Advice/Settings, quiet automated desktop verification, report library and league
  charts, and real report quality checks. [Compact](2026-10-14-compact-workflows.md),
  [quiet](2026-10-14-quiet-verification.md), [library](2026-10-14-report-library.md),
  [reports](2026-10-14-real-report-quality.md).
- Saved Codex account connection, authorized ESPN browser-snapshot import, owner Afton
  verification, saved-data scheduled drafts, and Market Signals with player-prop game logs.
  [Owner](2026-10-15-owner-verification.md), [saved data](2026-10-15-saved-data-reports.md),
  [market signals](2026-10-15-market-signals.md).
- Afton walkthrough, store isolation and first-launch fixes; lazy pages and file splits.
  [UX pass](2026-10-18-afton-ux-pass.md), [optimization](2026-10-18-optimization.md).
