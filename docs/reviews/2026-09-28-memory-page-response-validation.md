# Members and Imports response validation review

## Scope

Reviewed local JSON response handling in the Members & Imports dashboard. The profile, projection
source, and received-email responses are now validated before they reach list rendering. Projection
source URLs permit only HTTP(S), and counts and timestamps must have valid shapes. Invalid payloads
use the existing retryable page or notice error paths rather than masquerading as empty data.

## Findings

- No correctness issue found in the reviewed change.
- Response validation is client-side resilience; the API continues to validate persisted and
  imported state at its own trust boundaries.
- Automated security scans were not run, as directed by repository policy.

## Validation

- Four focused tests cover valid/empty lists, malformed profiles, invalid projection counts and
  URLs, and malformed received-email lists.
- The dashboard workspace suite passes: 24 test files, 50 tests.
- Playwright rendered-flow check used an isolated temporary data directory and intercepted
  `/api/state` with a malformed profile list. Imports showed the retryable error and remained
  usable; browser console had no application errors or warnings. The temporary app was shut down.
- Full `npm test`, typecheck, lint, formatting, and `git diff --check` passed.
