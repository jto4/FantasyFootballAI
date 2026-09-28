# Manual review: Windows Task Scheduler integration check

- **Date:** 2026-09-28
- **Review type:** Focused manual code and security review
- **Scope:** `scripts/service-manager.mjs`, `scripts/windows-task-scheduler.integration.test.mjs`, and `scripts/windows-background-service.integration.test.mjs`
- **Result:** No findings in the reviewed diff.

The tests only run on Windows GitHub Actions workers. One registers a uniquely named
per-user task, points it at a temporary Node.js script under paths containing spaces, waits
for its marker, inspects the scheduler XML and successful result, then stops and removes it.
The second runs after the CI production build. Its task starts a wrapper under a temporary
checkout path; the wrapper launches the built API with an isolated loopback port and temporary
SQLite/data directory. The test verifies API health, status, graceful shutdown, restart, and
uninstall. Build commands are stubbed only in the isolated fixtures because CI has already
built the project. Both tests use real Task Scheduler operations. Cleanup runs in `finally`,
including best-effort stop and deletion if an assertion fails. They do not verify that the
ONLOGON trigger fires during a real sign-in.

The service manager's task-name and API-port overrides are internal injection points for test
isolation; the public CLI continues to use the fixed `Sunday Sidekick` task name and local
port 4173. The tasks are created without elevation under the current CI user. The service
manager only sends health/shutdown requests to loopback. No automated security scan was run.
This review does not cover a release candidate or native macOS/Linux service-manager behavior.

Hosted CI run `36373316213` passed both integration tests on Windows. The first fixture run exposed an
incorrect assertion that expected the verbose task listing to include the trigger name; the
test now reads the scheduler XML for the trigger and checks the successful last-run result
from the verbose listing. The task executable and quoted spaced-path fixture both ran on the
Windows runner; the built API also started and shut down cleanly through Task Scheduler. The
complete cross-platform workflow passed.
