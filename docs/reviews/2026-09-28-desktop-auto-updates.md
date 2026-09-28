# Desktop auto-update review — 2026-09-28

## Scope

Reviewed user-triggered desktop updates, platform-specific update assets, draft-release
assembly, and the trust boundary around downloading and applying an update.

## Finding and change

The desktop app only pointed owners to a release page, and the release workflow omitted the
raw files required by Electron's updater. A follow-up review found that, even after assembling
those raw files, the draft/publish step still uploaded only the user-facing archives. The
publication allowlist now includes the native update ZIPs, Windows Squirrel metadata and package,
and the update checksum manifest, with a regression test that checks both draft create and
existing-draft upload commands. macOS builds now make architecture-specific app ZIPs;
Windows release assembly includes the Squirrel `RELEASES`, full NuGet package, and installer.
The release assembler validates these assets and publishes a separate SHA-256 manifest. Version
tags must match the app version so the update feed cannot advertise a package under a different
version.

The main process offers native updates only on packaged macOS and Windows builds, after the owner
checks for a stable public release. Updates download in the background but never restart the app
without owner confirmation. Linux remains on distribution or manual updates. The renderer sees
bounded status/progress values and generic errors; provider or local error details are not exposed.

## Validation

- Native updater tests cover platform/architecture feeds, progress bounds, unsupported builds,
  explicit install after download, sanitized errors, and retry.
- Release assembly tests verify both macOS update ZIPs, Windows Squirrel files, their checksum
  manifest, rejection of incomplete Windows update payloads, and inclusion of every updater asset
  in both GitHub release publication paths.
- Service and release test suites, typecheck, lint, and the packaged macOS dashboard/API, MCP,
  and headless shutdown smokes passed.
- End-to-end updates remain unverified until a signed release is published. macOS requires a
  signed app for Electron's native updater; Windows and Linux device installation checks remain.
- No automated security scans were run, per repository policy.
