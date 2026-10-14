# Local operations review — 2026-10-05

Reviewed by Codex on macOS ARM with Node 22.23.3. Scope is the working-tree changes on
`codex/reliable-operations`, based on main commit
`890ffcb8599dc5598dd7cfc7d9082bbb64ed2938`. This is local implementation evidence, not a
published release or a hosted check of a final commit. The owner requested follow-up items
2–8 and excluded item 1; GitHub protections and workflow triggers are unchanged.

## Behavior reviewed

- MCP draft creation queues a caller-saved request ID, with explicit status/cancel/history
  tools. Reusing an archived or cancelled ID cannot silently generate another draft.
- Queued cancellation avoids inference; running cancellation propagates to API/CLI adapters.
  A save-time check rejects late provider output. CLI termination escalates after two seconds.
- SQLite schema 6 indexes report summaries and request identities. Unrelated saves skip
  unchanged rows; the latest 200 terminal jobs remain in active state and older compact
  receipts survive restart, backup, validation, and recovery salvage.
- Hash URLs recover page/league/report selection. Back/Forward guards preserve unsaved
  report and Settings edits; registering dirty state before paint fixes an immediate-Back
  timing issue found during browser validation. A renderer boundary retries without showing
  raw exception text. Memory/import/backup clients have deadlines and response guards.
- Diagnostics expose bounded counts, age, categories, runtime/storage status, and sanitized
  correlation metadata. HTTP references are independently generated UUIDs. Downloads omit
  free-form log fields, paths, private league/report content, and credentials.
- Scheduled encrypted backups are opt-in, with machine-local revision-checked configuration,
  an exact passphrase in the OS vault, validation before publication, and rotation only after
  success. Validation uses a disposable private database without restoring owner data.
- Desktop data moves now request an explicit SQLite copy instead of a portable ZIP and
  include the routine backup folder. Existing destinations are rejected and failed copies
  are rolled back. Packaged GUI behavior remains an unavailable native check below.

## Validation

- `npm test`: 556 tests total, 554 passed and two opt-in native service checks skipped.
  After the final dirty-registration adjustment, the dashboard suite was rerun; the
  production-router test was also rerun with a SQLite-copy header/content assertion.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, production build, and Git
  whitespace checks are recorded for this local slice.
- `npm run test:e2e`: all 28 desktop 1440×1000 and mobile 390×844 Chromium journeys passed,
  with ten additional repeated Back/Forward checks passing after the timing fix. The journeys exercise
  production loopback routers and temporary real SQLite, with controlled provider/vault
  interfaces. Coverage includes bookmark/reload/Back/Forward, rejecting unsaved navigation,
  cancellation, recovery beyond the recent-job window, encrypted capture/download,
  nondestructive validation, safe diagnostic download, and renderer failure/retry.
  An intentional private render exception is injected only after the app loads; eight
  focused operations journeys were rerun with console/page-error checks, all passing.
  Normal changed journeys assert no unexpected runtime errors. Screenshots were inspected for page
  identity, visible controls, recovery states, narrow-screen layout, and absence of overlays.
- Database tests check stable cursor ties, filters, index use, body-free summaries, unchanged
  report write counts, archive persistence, deduplication, backup restore, and salvage.
- `npm run perf:smoke`: passed on the synthetic local fixture. Startup was 173 ms,
  dashboard summary p95 3.42 ms, assets 475.3 KiB, and API RSS 129.7 MiB. The measurements
  exclude live inference/sync and browser paint; see [performance](../performance.md).
- `npm run sleeper:catalog:smoke`: live public check passed at
  `2026-10-05T04:03:50.124Z`, returning 12,229 normalized players.
- The documented public historical Sleeper sample was captured at
  `2026-10-05T04:06:40.465Z`: 12 anonymous rosters, 81 scoring fields, and 180 draft picks.
  Replay tests use the actual adapter. The fixture records provenance and privacy transforms;
  names/account IDs are removed or replaced. This does not verify current-season private
  accounts, every fantasy format, AI generation quality, or message delivery.

## Manual code review checklist

- [x] Read the changed source, tests, configuration, and documentation; no dependency or
      lockfile changes and no GitHub workflow changes are included.
- [x] Check typed integration boundaries, MCP protocol changes, HTTP validation/errors,
      cancellation states, stored schema validation, and documentation contracts.
- [x] Review queue identity, concurrency, cancellation, late completion, restart/shutdown,
      archived lookup, backup serialization, due/retry timing, and retention ordering.
- [x] Review database indexes/targeted writes, bounded responses/deadlines, backup limits,
      disposable validation, and performance evidence. Full report bodies still load into
      the domain cache at startup; receipts intentionally have no automatic expiry.
- [x] Review dashboard loading/error/recovery, dirty guards, draft review, diagnostics, backup
      status, and narrow layouts. New controls use the existing typography/checkbox styles.
- [x] Update tasks, setup, architecture, decisions, memory, MCP, support, and release records.
- [x] Keep unrelated refactors out of this scope. A complete persistence API rewrite is not
      required by these changes and remains a separate possible improvement.
- [ ] Inspect current native artifacts and complete interactive device lifecycle checks;
      local packaging did not produce a current artifact.

## Manual security review checklist

- [x] Trace changed request IDs, job responses, imported memory payloads, route parameters,
      backup inputs, stored archive receipts, and public fixtures through validation/storage.
- [x] Confirm the shared loopback-only host/origin/CSP boundary applies to new routes;
      no remote listener or authentication bypass is introduced.
- [x] Confirm the backup passphrase stays in the OS vault, never SQLite/settings, logs,
      diagnostic exports, portable archives, fixtures, or screenshots. Tests use fake vaults
      and temporary data; no saved owner credentials were modified.
- [x] Preserve owner-controlled outbound actions. MCP generation always creates a draft;
      polling/cancellation neither sends messages nor replays provider calls.
- [x] Review subprocess cancellation, shell-disabled execution, stdin/output bounds,
      discarded stderr, deadlines, termination escalation, and listener/timer cleanup.
      Oversized stdout is discarded during termination, keeping the output bound in effect
      even while a child ignores its first termination signal.
- [x] Review backup names, traversal/symlink rejection, private permissions, archive/database
      bounds, atomic publication, rotation, restore ordering, rollback, and disposable cleanup.
- [x] Preserve existing custom-endpoint credential boundaries. No new external endpoint
      accepts secrets and no new dependency/native privilege is introduced.
- [x] Record unavailable platform/provider approvals and their next checks in tasks and
      release status. No automated security scan was run, as required by the owner.
- [ ] Inspect release artifacts, verify signing/notarization, and review the exact published
      commit. These are publication gates, not claims supported by local source tests.

## Unavailable release evidence

`npm run desktop:make` was attempted for macOS ARM. Electron Forge failed rebuilding
`better-sqlite3`: node-gyp reported **No Xcode or CLT version detected**, with missing
Command Line Tools package receipts. No current installer or packaged GUI pass resulted.
The toolchain/license was not changed or bypassed. An Intel command also failed with
**Bad CPU type in executable**; this host has no working Intel/Rosetta execution path.

`npm run desktop:verify -- <packaged executable> <evidence directory>` is implemented to
launch an actual packaged GUI with isolated data, check storage/diagnostics, stop the local
service, and record executable hash/runtime/screenshots. It has not been verified against
a current artifact. The owner/device maintainer must repair the macOS toolchain and run it
on current Mac/Windows artifacts; existing Intel packaging lanes remain unchanged.

Current-source hosted Windows/Intel builds, interactive installation/data moves/tray/login/MCP,
credentialed signing/notarization, published signed upgrades, and owner-selected private
fantasy/AI/delivery scenarios remain open. Prior October 4 hosted successes cover the
previous integrated source only. See [release status](../release-status.md) before publication.

## Workspace search follow-up

The owner asked for navigation that makes sense to users unfamiliar with technical terminology.
The dashboard now has a visible global search, reviewed plain-language descriptions/aliases,
prefix and single-edit/transposition matching, examples, keyboard support, and exact setting
anchors. Setting links survive reload; search navigation shares the dirty guard and resets
accepted pending Settings edits consistently. Search opens destinations without executing them.

Full history lookup is metadata-only: parameterized/escaped SQL title/type terms, a 120-character
request limit, at most 50 returned summaries, and no report bodies. Debounced requests use the
existing timeout/validation client and ignore aborted/stale results. Query text is transient and
never persisted or sent to a provider. No new dependency, workflow, remote listener, credential
handling, or automatic sending was introduced. A manual review traced the query and route
boundaries, trusted catalog IDs/anchors, disabled/conditional controls, dialog focus, and Settings
reset behavior; no automated security scan was run.

Local checks: 569 tests total (567 passed, two opt-in native checks skipped); typecheck, lint,
formatting, production build, and whitespace checks passed. All 36 desktop/mobile Chromium
journeys passed, including eight search journeys that visit every available browser setting,
verify unchanged saved Settings/no generation/no sends, keyboard/typo/question matching,
bookmark/reload/focus, rejected/accepted unsaved navigation, and an old report outside the
recent fifty. Search flows capture console/page errors and screenshots. Subsequent focused
checks cover the final question-word handling for historical report lookup and settled screenshot
states. Desktop/mobile screenshots were inspected for a visible search entry, readable dialog,
contained results scrolling, and a highlighted control in view. Browser plugin was unavailable;
repository Playwright was used with temporary production routers/SQLite and controlled providers.

Historical title/type matching uses literal words after removing common request words; typo
matching applies to the catalog and recent metadata. Native Mac/Windows screen-reader behavior,
other browsers, and very large history performance remain unverified. Product contracts and
maintenance guidance are in [workspace search](../search.md).

## Beginner experience follow-up

Reviewed by Codex on October 5, 2026, against local uncommitted source on
`codex/reliable-operations`; no release artifact or publication is claimed. The scope is
the guided dashboard experience, supported-link detection, and accompanying documentation.
The previously recorded operations/search changes remain in the working tree.

Manual code review:

- [x] Reviewed new guided setup, report composer, connection fields, friendly errors,
      navigation presentation, conditional Home states, voice/schedule presets, save
      feedback, dialog portals, and their integration with existing routing/history.
- [x] Checked empty/loading/error/recovery states, draft review, recipient-specific send
      confirmation, section-scoped optimistic concurrency, and unsaved-edit guards.
- [x] Confirmed individual schedule presets clear stale one-time dates/completion state,
      keep timezone/scope/channel, and explicitly choose draft review. Existing bulk
      schedule suggestions retain their established policy behavior. Scheduler timing,
      queue deduplication, cancellation, database schema, and service lifecycle are unchanged.
- [x] Reviewed resource use: supported links parse locally without URL fetches; tests
      reuse bounded existing API calls; saved-connection tests run once per configuration
      or AI-key change, with no league data and no repeated failure loop. No new runtime
      dependencies, remote search, analytics, or package-lock changes were introduced.
- [x] Updated tasks, setup, architecture, decisions, durable memory, documentation index,
      usability guidance, release status, and support limits. Full release/packaging and
      live-provider review remain separate gates.

Manual security review:

- [x] Traced supported URL detection through the existing protocol/host/path/size
      allowlist to existing typed adapters. Pasted links are never fetched and private
      provider access is not bypassed.
- [x] Traced guided key entry into transient password-field state and the existing OS
      credential endpoint. Keys do not enter ordinary settings, SQLite, logs, exports,
      search, or screenshots. Browser fixtures use explicit fake values and a separate
      injected credential interface; they do not access the owner's OS vault.
- [x] Reviewed provider-forwarding order: a fresh AI revision and credential status are
      read, newly discovered custom connections block a switch, and trusted OpenAI
      settings must save before writing the key. A revision conflict writes no key.
      Other trusted local windows can still change configuration; settings/vault writes
      are not a cross-process transaction. Existing custom connections are tested without
      replacement. Startup tests and local-tool execution are disclosed in usability docs.
- [x] Confirmed draft creation never sends league messages; individual presets return to
      review mode; automatic report/chat delivery and destructive connection/style changes
      require explicit consent. Final sends still validate revision/channel/destination and
      retain immutable uncertain-delivery envelopes and duplicate-send protections.
- [x] Checked rendering uses escaped React text, structured form serialization, and
      expandable reviewed error details. Saved secrets are not read back into inputs.
      Body portals change layering, not CSP, Electron privileges, loopback, or origin rules.
- [x] No subprocess, filesystem permission, archive parsing, listener, dependency,
      signing, or release-artifact changes belong to this follow-up. No automated
      security scan was run, in accordance with the owner's explicit exclusion.

Validation: the full ordinary suite passed 570 checks total (568 passed, two opt-in native
checks skipped). The final dashboard suite, typecheck, lint, formatting, production build,
and whitespace checks passed. All 48 desktop/mobile Chromium journeys passed, covering the beginner flows
alongside existing search, recovery, revision conflict, pagination, cancellation, backup,
and uncertain-send behavior. Relevant screenshots were inspected for page identity,
meaningful content, modal layering, readable controls, mobile wrapping, and sticky saves.
Expected simulated provider failures are asserted separately from clean normal journeys.
Browser plugin was unavailable; repository Playwright was used.

The sticky save bar initially covered the search dialog on phones; rendering dialogs in a
body portal corrected the actual layering failure, and all setting destinations were
rechecked. Follow-up tests also verify AI readiness survives a non-AI credential save and
that a successful manual test clears an earlier startup error. Private Yahoo/ESPN setup,
actual provider billing/delivery, native packaging, other browsers, screen readers, and
representative nontechnical-user testing remain unverified. No owner app/service process
was restarted; no GitHub commit, push, merge, or release was performed for this follow-up.
