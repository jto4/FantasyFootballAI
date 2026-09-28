# Manual security review: conversation imports and portable backups

- **Reviewer:** Codex
- **Date:** 2026-09-27
- **Review type:** Focused source review; not a release review
- **Automated security scans:** Not run, per repository policy

## Scope

Reviewed `apps/api/src/conversation-import.ts`, the conversation import preview and
commit routes in `apps/api/src/index.ts`, `apps/api/src/backup-archive.ts`,
`apps/api/src/image-library.ts`, and the portable backup restore route. The review traced
imported text and archive entries from request parsing through normalization, persistence,
and image replacement.

## Findings

No security issue was identified in the reviewed paths. Conversation uploads are limited
by the API parser and route, JSON/CSV/text parsers cap accepted message and participant
counts, and import mappings must explicitly select eligible local profiles. Import content
is treated as untrusted when AI analysis is enabled, which is separately opt-in. Backup
uploads have compressed and expanded size bounds, a strict archive path allowlist, bounded
entry counts, validated manifests, UUID-based image names, and per-image size limits.
Restoration stages image files with exclusive creation and private permissions before
replacing the image directory; database restoration validates and protects the prior data.

## Limits and follow-up

This review did not execute malformed archive cases, inspect dependency implementations,
review all API routes or dashboard flows, or establish release readiness. Existing focused
parser and archive tests provide implementation checks but are not a substitute for native
platform restore verification. Complete both `SECURITY.md` release checklists for each
release candidate, inspect its artifacts, and record the release commit and platform checks.
