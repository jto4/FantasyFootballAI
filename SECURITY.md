# Security Policy

## System and Scope

Sunday Sidekick is a self-hosted local service and browser dashboard for fantasy league data, imported conversations, generated content, and user-configured provider credentials. The API is intended to bind to loopback and serve a dashboard on the same machine.

## Threat Model and Trust Boundaries

Treat imported archives, league names, provider responses (including licensed injury-feed fields), news content, model output, and dashboard input as untrusted. When included in AI prompts, these values are context data and never instructions. External fantasy platforms and AI, email, SMS, and image providers receive data only through configured integrations. Local users with access to the host can access the local application and its data.

## Security Invariants

- Bind the API only to loopback; reject unexpected hosts and all origins except the exact API origin and the known Vite origin in development mode.
- Prevent third-party sites from framing either the production dashboard or the Vite development dashboard.
- Apply a restrictive Content Security Policy to production responses; permit development-only inline/eval behavior for Vite hot reload.
- Keep the Electron renderer sandboxed with context isolation and no Node integration; launch the loopback API in an owned utility process and stop it when the desktop app quits.
- Store credentials in the operating system credential manager, not the database, logs, exports, or source tree.
- Validate and bound remote responses and imported content; use request timeouts.
- Require explicit per-action configuration before sending outbound messages.
- Keep league data local unless an enabled integration needs selected data to perform an action.
- Never bypass provider authentication, access controls, or platform limits.

## Reportable Findings

Report reachable flaws that expose credentials or local data, allow unintended outbound messages, bypass configured authorization, execute imported content, or let remote websites use the localhost API. Include realistic preconditions and impact.

## Out of Scope and Limitations

This project does not protect data from a malicious process or administrator already controlling the host. Platform policy, provider availability, and the security of third-party CLI tools remain external dependencies.

## Release Review

Complete both checklists for every release candidate. Review the release diff and the packaged artifacts; a green build or test suite does not replace review. This project does not run automated security scans. Record the reviewer, date, release commit, checks completed, platform artifacts inspected, and any unresolved items in the release pull request or draft release notes. Track unresolved security risks in `docs/tasks.md` and do not publish while a release-blocking item remains.

### Manual code review checklist

- [ ] Read the complete release diff, including generated configuration and dependency-lock changes; confirm each change belongs in its current package and has an owner-facing reason.
- [ ] Check that public types, connector/provider boundaries, validation, errors, and docs agree. Review comments for non-obvious decisions without adding narration for obvious code.
- [ ] Confirm important behavior and failure paths have focused tests. Run the checks listed in `CONTRIBUTING.md` and record their results.
- [ ] Review scheduler timing, time zones, duplicate-run handling, retries, concurrency, and shutdown behavior for changes that touch background work.
- [ ] Review response sizes, timeouts, caching, database reads/writes, and large imports or exports for bounded work and acceptable local resource use.
- [ ] Confirm platform-specific file paths, permissions, process lifecycle, service setup, and user-facing limitations are correct for every claimed OS.
- [ ] Check empty, loading, error, recovery, and review-before-send states for changed dashboard flows; verify the relevant narrow-screen layout when UI changes.
- [ ] Update `docs/tasks.md` and relevant setup, architecture, decisions, memory, and release notes.
- [ ] Record refactoring opportunities and decide whether any are necessary before release; do not mix unrelated refactors into a release without review.

### Manual security review checklist

- [ ] Trace changed inputs from HTTP requests, imported files/archives, remote platform responses, feeds, and model output through parsing, validation, storage, prompts, and rendering.
- [ ] Confirm the API remains loopback-only; check host/origin validation, content security policy, response headers, and browser-triggered requests for the affected routes.
- [ ] Confirm credentials remain in the operating system credential store and never enter SQLite payloads, logs, errors, exports, fixtures, screenshots, or release artifacts.
- [ ] For each outbound integration, confirm the exact data sent, the owner-controlled recipient and action settings, draft/review behavior, duplicate-send handling, and sanitized provider errors.
- [ ] Review subprocess changes for shell use, executable/argument validation, inherited environment, stdin/stdout/stderr handling, timeouts, output limits, and shutdown cleanup.
- [ ] Review filesystem changes for canonical names, path traversal, symlinks, restrictive permissions, bounded file/archive sizes, atomic replacement, rollback, and cleanup after failure.
- [ ] Review custom endpoints and redirects for credential-forwarding boundaries; verify secrets are sent only to the endpoint the owner configured.
- [ ] Review dependency changes from their declared package and lockfile entries; identify whether they introduce native code, install scripts, or new runtime privileges. Do not run automated security scans.
- [ ] Inspect each release artifact for expected files and absence of development data, local user data, keys, and unexpected executables. Verify signing/notarization status and report unsigned packages clearly.
- [ ] Write down remaining assumptions, unavailable platform checks, or external provider approvals; assign them in `docs/tasks.md` with an owner and next action.
