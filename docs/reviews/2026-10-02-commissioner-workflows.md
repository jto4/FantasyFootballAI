# Commissioner workflow review

Date: 2026-10-02. Reviewer: Codex. Base commit: `0d8bd86`; local uncommitted changes.
This is a scoped source review, not approval of a signed release candidate.

## Changes and manual code review

- Dashboard generation explicitly requests a draft; HTTP generation defaults to draft-only.
  Scheduled callers retain their configured automatic policy, and MCP's draft/send boundary remains.
- Reports separates review from scheduling, filters by league and delivery state, captures new-report
  generation evidence, edits unattempted drafts, and shows the recipient/channel/subject/text used
  for sending. SMS/iMessage previews match the adapter's truncation limits.
- Editing checks the persisted revision and delivery claim under an immediate SQLite transaction.
  A stale editor, another process's claim, or any delivery attempt prevents content changes.
  Sending verifies the previewed destination and revision before credential reads or provider calls.
- Settings PATCH merges one shared allowlisted section against current state inside serialized
  persistence. Optional fields can be cleared with null; required fields cannot. AI test/discovery
  saves only AI fields. Normalizing form and saved baselines consistently prevents false dirty
  warnings, preserves pending changes, and reflects derived privacy/polling changes in clean sections.
- Shared local-time conversion returns sorted instants for repeated DST wall times and rejects
  skipped times. The next-action view orders schedules/calendar milestones by absolute time and
  applies season suppression only for fresh snapshots. Scheduler execution/claims remain unchanged.
- Report, delivery, settings, and chat routers/services retain injected boundaries; group polling
  shares its existing in-flight guards with the bootstrap. API bootstrap fell from 2,239 to 1,124
  lines and dashboard orchestration from 1,239 to 884 lines. Settings remains a future extraction
  candidate; its provider-specific operations remain separately guarded.
- The only new dependency family is pinned development-only Playwright and its browser runner.
  Existing Linux optional-package libc selectors were preserved after npm rewrote lock metadata.
- Native startup failures use a separate event and safe instructions; the desktop recovery prompt
  remains reserved for storage failures. The runtime preflight opens only an in-memory database.
- Current readiness moved to release-status; tasks tracks active work, the product plan tracks scope,
  and dated support/package evidence remains historical. September artifacts were not rebuilt here.

## Manual security review

- Traced changed HTTP input through section allowlists, full settings validation, bounded report
  title/body/revision validation, persisted edit/send claims, and inert dashboard rendering.
- League links are parsed locally: HTTPS, matching provider host, no credentials/custom port,
  bounded input and league ID. Only the normalized ID/ESPN season reaches the existing adapter.
- Existing loopback host/origin controls and production headers/CSP remain in front of new routes.
- Credentials remain in the OS store, and provider configuration/errors retain sanitized boundaries.
  Saved report evidence includes analytical limitations and retrieval times, never raw member context.
- Reviewed extraction of pre/post-inference and final-save memory-consent checks, author isolation,
  history deduplication/retention, polling revocation, explicit auto-reply opt-ins, provider receipts,
  duplicate claims, and uncertain-delivery confirmation. Existing process/integration coverage passes.
- Model output and owner-edited prose render as text except previously validated allowlisted citation
  links; unsupported edited Markdown does not become executable markup.
- No automated security scan was run. No real credentials, owner database, or provider messages were
  used for browser verification. Full artifact/signing/device review remains a release gate.

## Validation

- `npm test`: passes on Node 22.23.3 and the minimum Node 22.13.0; workspace totals are
  239 API, 54 dashboard, 46 core, and 102 integration tests, plus runtime/service/release/process
  checks. Two native service tests skip without their explicit owner-device opt-in.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, production build,
  and `git diff --check`: pass locally.
- `npm run test:e2e`: ten Chromium journeys pass at 1440×1000 and 390×844 on the built dashboard,
  loopback `http://127.0.0.1:4201`, using synthetic API responses. Coverage includes connect URL →
  AI test → first draft review; generate → edit/save → recipient preview → send → sent filter;
  unrelated Voice edits through AI test/discovery; navigation/close warnings; keyboard focus trap;
  failed-send labeling, edit lock, and delivery filter. Successful flows have no console/page errors;
  the failure case produces only the intentionally injected HTTP 502 resource error.
- Browser plugin not available; Playwright provided browser interactions and screenshots. Reviewed
  desktop/mobile report review, mobile scoped Settings, and the next-action area. The Voice selector
  was cramped and now uses the existing styled field container. Screenshots/traces remain outside
  the repository in the system temporary directory.
- `npm run perf:smoke`: passes on macOS ARM/Node 22.23.3. Synthetic fixture: 176 ms startup,
  3.39/8.89 ms full-state p50/p95, 33.51/49.76 ms synthetic generation p50/p95, 127.9 MiB RSS,
  and 447.3 KiB dashboard shell/assets. Excludes live inference/sync and browser paint timing.

## Remaining gates

Updated hosted OS/package/browser CI has not run. Signing/notarization, native installation,
owner-device sign-in/upgrade, published native updates, live provider accounts, and slower-hardware
measurements remain assigned to the owner/release maintainer in [release status](../release-status.md).
No package was published or installed, and no real outbound message was sent.
