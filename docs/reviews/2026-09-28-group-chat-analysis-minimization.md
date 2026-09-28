# Group-chat profile analysis data-minimization review — 2026-09-28

## Scope

Manually reviewed AI-assisted profile learning in the Twilio Conversations and BlueBubbles
history-sync routes in `apps/api/src/index.ts`.

## Finding and change

Both routes previously added recent messages from the whole group to each participant's
profile-analysis prompt. Even with analysis explicitly enabled, that sent other participants'
messages while updating one person's profile. Each route now sends only the selected author's
newly authored messages and that profile's existing notes. The system instruction already
limits style inference to the selected author's messages; the input now enforces that boundary.

The API-process integration fixture synchronizes two authors through each provider path and
asserts that each model prompt contains the selected author's text and excludes the other
participant's text. Memory analysis remains off by default and requires its separate owner
opt-in.

## Validation

- API build passed.
- Twilio and BlueBubbles group-chat history integration passed with per-author prompt assertions.
- No automated security scans were run, per repository policy.
