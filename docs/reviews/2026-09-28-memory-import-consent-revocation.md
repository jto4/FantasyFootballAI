# Conversation-import consent revocation review — 2026-09-28

## Scope

Manually reviewed the opted-in conversation analysis lifecycle in
`apps/api/src/memory-import-routes.ts`.

## Finding and change

The route previously captured the analysis setting once, then reused that value while it
initialized the AI runtime, sent participant prompts, and saved the resulting notes. An owner
could turn off either memory or imported-conversation analysis during those awaits, but the
request would continue using stale consent.

The import route now checks current consent after AI runtime setup, immediately before each
participant prompt, after each model response, and inside the final store update. Revocation
prevents later prompts, discards an in-flight response from profile notes, and prevents notes
from being committed if consent changes before persistence. The owner-authorized source messages
remain locally importable; revoked AI analysis is represented by an editable note.

This cannot retract a prompt already accepted by an external provider before revocation. The
checks stop subsequent requests and local note persistence once the revocation is observed.

## Validation

- API tests cover revocation during runtime setup, during an in-flight participant analysis, and
  immediately before profile persistence.
- API typecheck, all 42 API test files (216 tests), lint, formatting, and `git diff --check` pass.
- No automated security scans were run, per repository policy.
