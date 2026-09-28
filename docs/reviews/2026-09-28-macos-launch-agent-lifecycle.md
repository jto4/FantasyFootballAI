# Manual review: macOS LaunchAgent lifecycle

- **Date:** 2026-09-28
- **Review type:** Focused manual code and security review
- **Scope:** `scripts/service-config.mjs`, `scripts/service-manager.mjs`, `scripts/service-runner.mjs`, `scripts/macos-launch-agent.integration.test.mjs`, and the related service configuration tests
- **Result:** The first integration attempt found a data-directory isolation gap; it is fixed and the real lifecycle now passes.

The LaunchAgent sets an explicit API port and local data directory. The runner uses that
directory for its private logs, and `serviceEnvironment` now sets the API's SQLite and
legacy JSON paths under the same directory. A relative data-directory override is rejected.
The integration test uses a temporary home, a free loopback port, and a temporary database;
it refuses to replace an already loaded Sunday Sidekick LaunchAgent and cleans up by
unloading the service and removing its temporary root.

The first test attempt exposed that only runner logs followed the temporary data path; the
API store still used its default home-directory database. The API started and answered its
health check, then the database assertion failed. The service was stopped and unloaded. A
post-run filesystem check found the existing home database's modification time remained
2026-09-27 16:35 EDT and no SQLite WAL, SHM, or journal sidecar; no file modification was
visible, though no pre-run timestamp was recorded. After fixing the environment, the test
passed and confirmed SQLite was created under the temporary home.

The successful run exercised real `launchctl` install, start, status, stop, restart, and
uninstall on the owner Mac. It does not verify desktop launch-at-sign-in, a fresh login, or
other macOS releases. No automated security scan was run.
