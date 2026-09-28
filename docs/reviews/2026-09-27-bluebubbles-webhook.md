# Manual security review: BlueBubbles webhook

- **Reviewer:** Codex
- **Date:** 2026-09-27
- **Review type:** Focused source review; not a release review
- **Automated security scans:** Not run, per repository policy

## Scope

Reviewed `apps/api/src/index.ts` webhook routes and middleware, plus
`apps/api/src/bluebubbles-webhook.ts` and its focused tests. The review traced webhook
input from HTTP parsing and bearer-token comparison through event validation and the
existing iMessage history-sync path.

## Findings

No security issue was identified in the reviewed path. The webhook token is generated
with a cryptographically secure random source and stored in the OS credential store.
The callback compares it without an early content-dependent exit for equal-length
tokens, rejects malformed payloads and unrelated chats, and treats the body as a hint
to start the existing bounded history sync rather than importing webhook-supplied
message content. Sync also requires the owner's memory and automatic-sync settings.
Request bodies are limited to 1 MB, and provider or credential-store failures return
fixed error text.

## Limits and follow-up

This did not review other API routes, browser behavior, packaged artifacts, dependency
contents, or the complete release diff. The application was not running for runtime
verification, and the repository checkout has no Git metadata from which to identify a
release commit. Complete both `SECURITY.md` release checklists for each release
candidate, inspect its artifacts, and record the release commit and platform checks.
