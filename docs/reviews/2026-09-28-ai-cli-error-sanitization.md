# AI CLI error handling review — 2026-09-28

## Scope

Manually reviewed the process boundary for generic local AI CLI and Apple Foundation Models
CLI execution in `packages/integrations/src/ai.ts`.

## Finding and change

A process-start failure previously returned Node's raw spawn error text. API generation and
mention-reply routes can return provider errors to the local dashboard, so a configured
executable path could be exposed in the response. The adapter now returns actionable,
path-free installation guidance for process-start failures. CLI stderr remains drained and
excluded from errors.

A regression test starts a guaranteed-missing path containing spaces and confirms the error is
actionable without including that path.

## Validation

- The focused integrations AI-provider tests passed.
- Integrations typecheck, formatting, and `git diff --check` passed.
- No automated security scans were run, per repository policy.
