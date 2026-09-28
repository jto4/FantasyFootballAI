# Manual review: Windows Task Scheduler integration check

- **Date:** 2026-09-28
- **Review type:** Focused manual code and security review
- **Scope:** `scripts/service-manager.mjs` and `scripts/windows-task-scheduler.integration.test.mjs`
- **Result:** No findings in the reviewed diff.

The test only runs on Windows GitHub Actions workers. It registers a uniquely named
per-user task, points it at a temporary Node.js script under paths containing spaces,
waits for that script to create a marker, queries the task, stops it, and removes it. The
build command is stubbed because the temporary fixture is not an application checkout; the
Task Scheduler operations and task launch use the real Windows commands. Cleanup runs in
`finally`, including best-effort stop and deletion if an assertion fails. The test does not
launch the production API or verify that the ONLOGON trigger fires during a real sign-in.

The service manager's task-name override is an internal injection point for test isolation;
the public CLI continues to use the fixed `Sunday Sidekick` task name. The task is created
without elevation under the current CI user. No automated security scan was run. This review
does not cover a release candidate or native macOS/Linux service-manager behavior.

Hosted CI run `36372505755` passed the integration test on Windows. The first run exposed an
incorrect assertion that expected the verbose task listing to include the trigger name; the
test now reads the scheduler XML for the trigger and checks the successful last-run result
from the verbose listing. The task executable and quoted spaced-path fixture both ran on the
Windows runner, and the complete cross-platform workflow passed.
