# Documentation guide

Use this page to find the right project context and keep the records in sync.

## Start here

- [`../AGENTS.md`](../AGENTS.md) — repository-wide instructions, code conventions, commands,
  and the owner's requirement not to run automated security scans.
- [`release-status.md`](release-status.md) — current readiness and remaining release gates.
- [`implementation-plan.md`](implementation-plan.md) — product scope and direction.
- [`tasks.md`](tasks.md) — active implementation checklist; dated evidence lives in review records.
- [`support-matrix.md`](support-matrix.md) — what has been implemented versus verified on a
  real provider or operating system.
- [`memory.md`](memory.md) — durable behavior, privacy invariants, and architectural context;
  it is not a release-status report.

## Reference

- [`advice.md`](advice.md) — fantasy and betting advice: evidence, own weekly projections,
  game-market model, props, prices and remaining verification.
- [`setup.md`](setup.md) — source setup, credentials, providers, data handling, and operations.
- [`troubleshooting.md`](troubleshooting.md) — common install, provider, scheduling, delivery,
  recovery, and MCP issues.
- [`architecture.md`](architecture.md) — service boundaries, integrations, storage, and data
  flow.
- [`decisions.md`](decisions.md) — durable architectural choices and why they were made.
- [`usability.md`](usability.md) — guided setup, everyday navigation, report review, presets, and
  settings feedback.
- [`search.md`](search.md) — finding settings with everyday words, keyboard navigation, and local
  report-title lookup.
- [`operations.md`](operations.md) — durable requests, navigation, diagnostics, scheduled
  encrypted backups, and packaged GUI verification.
- [`mcp.md`](mcp.md) — MCP server behavior and client configuration.
- [`performance.md`](performance.md) — repeatable local performance smoke measurements and
  their limits.
- [`release-install.md`](release-install.md) and [`release-process.md`](release-process.md) —
  building, installing and publishing release artifacts.
- [`maintenance-review.md`](maintenance-review.md) — quarterly manual code, security, and
  refactoring review checklist used by the GitHub reminder workflow.
- [`managed-ai-design.md`](managed-ai-design.md) — proposed managed service, authentication,
  billing, and threat model; not deployed.
- [`design/dashboard-visual-direction.md`](design/dashboard-visual-direction.md) — dashboard
  design goals and reference limitations.
- [`research/usability-test-plan.md`](research/usability-test-plan.md) — ready-to-run
  commissioner study; participant sessions are pending.
- `research/` — JSON research outputs (betting model versions, prop and projection backtests)
  referenced from the reviews and decisions.

## Dated reviews

[`reviews/`](reviews/) holds dated release, live-provider and model-quality records. Newest
first; September security and packaging reviews are listed in the folder.

- [`reviews/2026-10-22-betting-model-test.md`](reviews/2026-10-22-betting-model-test.md) —
  production game model versus the book on an untouched 2026 holdout, plus paper returns.
- [`reviews/2026-10-21-advice-data-pass.md`](reviews/2026-10-21-advice-data-pass.md) — Advice
  warm-up, grouped readiness sources, ESPN live-refresh path, undated injury feed and iCloud
  findings.
- [`reviews/2026-10-18-afton-ux-pass.md`](reviews/2026-10-18-afton-ux-pass.md) — real-league
  walkthrough, store isolation and first-launch fixes, plain copy, gpt-6-luna default.
- [`reviews/2026-10-18-optimization.md`](reviews/2026-10-18-optimization.md) — lazy pages, dead
  CSS, research separation, file splits and open-only task list.
- [`reviews/2026-10-18-task-history.md`](reviews/2026-10-18-task-history.md) and
  [`reviews/2026-09-28-task-history.md`](reviews/2026-09-28-task-history.md) — short records of
  completed work archived from `tasks.md`.
- [`reviews/2026-10-15-saved-data-reports.md`](reviews/2026-10-15-saved-data-reports.md) —
  scheduled drafts from recent saved data and a real-clock Afton report.
- [`reviews/2026-10-15-owner-verification.md`](reviews/2026-10-15-owner-verification.md) —
  private ESPN import, native imsg and owner usability verification.
- [`reviews/2026-10-15-market-signals.md`](reviews/2026-10-15-market-signals.md) — Market
  Signals research charts and ledger, real public-data checks, player-prop game logs.
- [`reviews/2026-10-14-quiet-verification.md`](reviews/2026-10-14-quiet-verification.md) —
  test-only memory credentials, mock Keychain and popup-free teardown.
- [`reviews/2026-10-14-compact-workflows.md`](reviews/2026-10-14-compact-workflows.md) — shorter
  Home, separate Advice views and focused Settings.
- [`reviews/2026-10-14-real-report-quality.md`](reviews/2026-10-14-real-report-quality.md) —
  default reports, clock-driven generation and source/arithmetic audit.
- [`reviews/2026-10-14-report-library.md`](reviews/2026-10-14-report-library.md) — default
  reports, scoped automatic drafts and numeric charts.
- [`reviews/2026-10-13-latest-installer.md`](reviews/2026-10-13-latest-installer.md) — macOS ARM
  installer, packaged six-workflow advice checks and child credential isolation.
- [`reviews/2026-10-13-real-advice-quality.md`](reviews/2026-10-13-real-advice-quality.md) — all
  six workflows with real football data and independent arithmetic checks.
- [`reviews/2026-10-13-weekly-decision-workflows.md`](reviews/2026-10-13-weekly-decision-workflows.md)
  — weekly Home, readiness, prospective cohorts and fantasy journal.
- [`reviews/2026-10-13-imsg-support.md`](reviews/2026-10-13-imsg-support.md) — local Messages CLI
  delivery, selected-chat sync and consent.
- [`reviews/2026-10-13-codex-compatibility.md`](reviews/2026-10-13-codex-compatibility.md) —
  native CLI compatibility, request isolation and six-workflow model quality.
- [`reviews/2026-10-13-advice-model-review.md`](reviews/2026-10-13-advice-model-review.md) — all
  six workflows, allocation/validation fixes and model-quality limits.
- [`reviews/2026-10-13-appearance.md`](reviews/2026-10-13-appearance.md) — white default,
  optional dark mode and device-local persistence.
- [`reviews/2026-10-betting-model-history.md`](reviews/2026-10-betting-model-history.md) — one
  table for game-model versions v1–v18 (October 11–13): what each tried and how it compared with
  the sportsbook.
- [`reviews/2026-10-11-live-prices-and-performance.md`](reviews/2026-10-11-live-prices-and-performance.md)
  — live sportsbook prices, outcome ledger and archive results.
- [`reviews/2026-10-09-advisor-completion.md`](reviews/2026-10-09-advisor-completion.md) — advisor
  requirement audit and native-model/public-data evidence.
- [`reviews/2026-10-07-dialog-reliability.md`](reviews/2026-10-07-dialog-reliability.md) — dialog,
  scrolling, narrow-content and report-refresh QA.
- [`reviews/2026-10-05-local-operations.md`](reviews/2026-10-05-local-operations.md) and
  [`reviews/2026-10-05-task-search-help.md`](reviews/2026-10-05-task-search-help.md) — durable
  operations, tasks, search and help.
- [`reviews/2026-10-04-main-integration.md`](reviews/2026-10-04-main-integration.md) — local and
  hosted source/package validation for main integration.
- [`reviews/2026-10-02-workflow-reliability.md`](reviews/2026-10-02-workflow-reliability.md) and
  [`reviews/2026-10-02-commissioner-workflows.md`](reviews/2026-10-02-commissioner-workflows.md) —
  durable workflow and commissioner changes.

## Keeping project context current

Keep documentation proportional to the change. Most changes need only a code comment where
behavior is non-obvious and, when they close or open work, an edit to `tasks.md`.

- `tasks.md` lists open work plus a short "Completed (summary)". Add a short item for a known
  gap; when it is done, delete it and add a one-line summary.
- `decisions.md` records durable architecture choices and why; `memory.md` keeps stable
  invariants (privacy, evidence and safety rules) in a line or two each, never dated status.
- `support-matrix.md` changes only from recorded tests, live checks or native platform runs; a
  mocked test is not evidence of live-provider or OS behavior.
- Add a dated file in `reviews/` only for a release candidate, a live provider/model check, or
  a model-quality evaluation; ordinary features and fixes do not need one.
- Update `implementation-plan.md` when product scope changes and `release-status.md` when
  release gates change.
- If documentation and the code disagree, trust the code and its tests and fix the document.
