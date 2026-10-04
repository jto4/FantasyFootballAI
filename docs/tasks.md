# Project tasks

Use [release status](release-status.md) for readiness and release gates,
[the support matrix](support-matrix.md) for provider/OS verification, and
[the product plan](implementation-plan.md) for scope. Completed tasks describe checked source
behavior, not public release readiness. Prior detailed implementation evidence is retained in
[the archived task record](reviews/2026-09-28-task-history.md).

## Commissioner workflow improvements

- [x] Always draft from dashboard generation; distinguish drafts, sends, failures, and unknown outcomes.
- [x] Split Settings into independent sections; scope AI test/discovery writes and warn on unsaved edits.
- [x] Surface review queues, upcoming scheduled/calendar work, snapshot freshness, and delivery issues.
- [x] Add Reports filters, generation evidence, durable revision-checked editing, send preview, and attempt history.
- [x] Guide first use through league connection, runtime test, generation, and draft review; parse supported league URLs.
- [x] Extract report/delivery/chat/settings services and add desktop/mobile browser interaction coverage in CI.
- [x] Pin the verified Node 22 runtime, detect native SQLite mismatch safely, and consolidate current release claims.

Validation and manual review: [2026-10-02 workflow review](reviews/2026-10-02-commissioner-workflows.md).

## Workflow reliability and repository cleanup

- [x] Freeze rendered delivery envelopes before sending; keep email retry keys and detect changed sender/account configuration without storing credentials.
- [x] Require section revisions for Settings PATCH requests; preserve unsaved edits on conflicts and explicitly reload only the affected section.
- [x] Persist idempotent generation jobs with bounded concurrency, atomic report completion, and interrupted-job recovery.
- [x] Exercise production workflow, league, and provider routers against temporary SQLite databases in desktop/mobile browser journeys; retain fast mocked journeys.
- [x] Share nested workflow request/response validation and stable API error codes between the API and dashboard.
- [x] Poll visible dashboards using body-free summaries; page report history and fetch saved bodies on review.
- [x] Split core domains, persistence, and Settings hooks; consolidate theme tokens and remove superseded CSS declarations while preserving rule order.

Validation and manual review: [2026-10-02 reliability review](reviews/2026-10-02-workflow-reliability.md).

## Remaining validation and release work

- [x] Run updated hosted OS/source/package/browser CI and the minimum-runtime lane; see [2026-10-04 integration evidence](reviews/2026-10-04-main-integration.md).
- [ ] Verify credentialed signing/notarization, owner-device lifecycle, and a signed published-release upgrade.
- [ ] Complete owner-authorized live provider/model/delivery checks and broader fantasy-format semantics.
- [ ] Repeat performance checks on slower hardware and with live providers.
- [ ] Complete the publication review and publish reviewed artifacts after owner approval.

Specific required evidence and current limitations are maintained in
[release gates](release-status.md#gates-before-publication). Continue quarterly manual code,
security, and refactoring reviews; do not run automated security scans.
