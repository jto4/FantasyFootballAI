# Documentation guide

Use this page to find the right project context and keep the records in sync.

## Start here

- [`../AGENTS.md`](../AGENTS.md) — repository-wide instructions, code conventions, commands,
  and the owner's requirement not to run automated security scans.
- [`implementation-plan.md`](implementation-plan.md) — product scope, current readiness, and
  remaining release work.
- [`tasks.md`](tasks.md) — implementation checklist and evidence notes for completed slices.
- [`support-matrix.md`](support-matrix.md) — what has been implemented versus verified on a
  real provider or operating system.
- [`memory.md`](memory.md) — durable behavior, privacy invariants, and architectural context;
  it is not a release-status report.

## Reference

- [`setup.md`](setup.md) — source setup, credentials, providers, data handling, and operations.
- [`architecture.md`](architecture.md) — service boundaries, integrations, storage, and data
  flow.
- [`decisions.md`](decisions.md) — durable architectural choices and why they were made.
- [`mcp.md`](mcp.md) — MCP server behavior and client configuration.
- [`performance.md`](performance.md) — repeatable local performance smoke measurements and
  their limits.
- [`release-install.md`](release-install.md) — building and installing release artifacts.
- [`design/dashboard-visual-direction.md`](design/dashboard-visual-direction.md) — dashboard
  design goals and reference limitations.
- [`reviews/`](reviews/) — dated manual code and release-workflow review records.

## Keeping project context current

- Update `tasks.md` when implementation changes. Keep each checklist item explicit about
  what works, the evidence that supports it, and remaining gaps.
- Update `support-matrix.md` only from recorded tests, live checks, or native platform
  verification. A mocked test is not evidence of live-provider or OS behavior.
- Update `implementation-plan.md` when product scope, readiness, or release gates change.
- Record durable architecture changes in `decisions.md`; keep `memory.md` for stable
  constraints and behaviors, not dates, temporary investigations, or pending tasks.
- Put dated review evidence in `reviews/` and benchmark results in `performance.md`.
- If documentation and the current code disagree, inspect the code and its tests, then fix
  the inaccurate documentation rather than treating the stale statement as behavior.
