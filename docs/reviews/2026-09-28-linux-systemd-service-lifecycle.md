# Manual review: Linux systemd service lifecycle

- **Date:** 2026-09-28
- **Review type:** Focused manual code and security review
- **Scope:** `scripts/service-config.mjs`, `scripts/service-config.test.mjs`, `scripts/service-manager.mjs`, `scripts/linux-background-service.integration.test.mjs`, and the Ubuntu service lifecycle workflow steps
- **Result:** The CI-discovered unit parsing issue is fixed; no unresolved findings in the reviewed change.

The real Ubuntu systemd test showed that quoting the `WorkingDirectory` value made
systemd treat the quote characters as part of the path and reject the unit. The renderer
now emits systemd C-style escapes for spaces, quotes, backslashes, percent specifiers,
and whitespace in that path. A renderer test covers spaces and percent characters, and
the hosted lifecycle test confirms systemd accepts the resulting unit when it starts the
built API from the checkout path.

The test runs only on the Ubuntu CI worker, uses the real user systemd manager, selects a
free loopback port, and verifies API health, SQLite creation, active status, stop/restart,
and uninstall. It first checks that the test unit and `~/.sidekick` data directory do not
exist, and performs best-effort uninstall plus data cleanup in `finally`. On failure it
captures a bounded systemd journal tail and the service error log before cleanup. The
service remains a user-level process with `UMask=0077`; the unit file and data/log paths
are written with private permissions. No remote access is added. This does not verify
Linux desktop installation, another distribution's systemd behavior, macOS LaunchAgent
behavior, or sign-in after a real reboot. No automated security scan was run.

Hosted CI run `36374668440` passed the real systemd lifecycle check and the complete
cross-platform source and packaging matrix.
