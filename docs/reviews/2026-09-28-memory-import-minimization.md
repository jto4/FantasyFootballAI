# Conversation import AI data-minimization review — 2026-09-28

## Scope

Manually reviewed the opted-in AI analysis path in `apps/api/src/memory-import-routes.ts`, where
conversation exports are parsed into per-author member profiles.

## Finding and change

Before the review, every participant's analysis prompt included both that participant's authored
messages and up to 20 KB of the full conversation export. That sent other participants' messages
to the model while analyzing a single profile. The route now sends only the selected
participant's authored messages, along with that profile's existing style and context notes.
This keeps the analysis inputs aligned with the per-member profile boundary and reduces
unnecessary external data sharing.

A regression assertion verifies that Alex's prompt excludes Blair's message and Blair's prompt
excludes Alex's message. Analysis remains disabled unless the owner enables it in Settings.
The route also preflights every participant's merged source size before initializing or calling
the AI provider, so an oversized later profile cannot cause earlier participants' text to be sent
when the overall import will be rejected.

## Validation

- The focused API conversation-import tests passed, including a regression case that rejects an
  oversized later profile before the AI runtime is initialized.
- API typecheck, formatting, and `git diff --check` passed.
- No automated security scans were run, per repository policy.
