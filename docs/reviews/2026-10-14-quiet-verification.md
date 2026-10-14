# Quiet automated desktop verification — October 14, 2026

Reviewer: Codex. Scope: the accumulated local tree on
`890ffcb8599dc5598dd7cfc7d9082bbb64ed2938`. No owner app, OS Keychain ACL,
database, credentials, signing identity or system permission was changed.

## Cause and change

Two independent paths could request Keychain access: the API's `keytar` adapter,
including the native verifier's independently seeded credential probe, and
Electron's browser cookie encryption. A fresh directory/credential namespace
does not eliminate the latter. The installed Electron 44.4.5 includes the
[Electron test fix released in 44.4.0](https://releases.electronjs.org/pr/53790)
for unsigned-app test processes requesting cookie keys.

When `SIDEKICK_VERIFICATION_ROOT` resolves to a valid confined test profile:

- API credentials use a bounded process-local memory backend. The native binding
  is not imported. Values are never returned to the browser and disappear on API
  restart; the existing provider/size validation remains. Invalid isolation fails
  before selecting a backend; ordinary launches keep the OS vault without a
  memory fallback.
- The test browser uses a named nonpersistent partition and, on macOS only,
  `use-mock-keychain` before readiness. Preferences and SQLite remain inside the
  private root. See [Electron's session contract](https://www.electronjs.org/docs/latest/api/session).
- A trusted read-only IPC flag identifies the test profile. The header labels it
  Test profile and credential settings describe the temporary storage.
- Stop skips its confirmation and form before-unload close handlers are omitted
  for disposable test sessions. Ordinary confirmations and internal navigation,
  revision, send and delivery guards remain. A scoped native teardown fallback
  uses [Electron's unload handling](https://www.electronjs.org/docs/latest/api/web-contents#event-will-prevent-unload).
- Expected startup/storage failures and unexpected API failure exit nonzero with
  private diagnostics rather than waiting on a GUI modal. Owner recovery/error
  dialogs remain available.

The standard `desktop:verify` helper creates its private root automatically. Its
real-Keychain probe has been replaced by a loopback credential round trip, reset
on restart, native session/switch assertions and no-dialog Stop with unsaved
fictional input. `credentials:smoke` remains an explicit real-OS check and is not
part of routine quiet desktop verification. Signed-in AI connection isolation is
unchanged; its existing account and external CLI remain separate integrations.

## Manual code and security review

- Reviewed native launch, child environment, trusted IPC, API credential selection
  and all four before-unload registration sites. No HTTP/user preference can
  activate verification mode. Normal secrets remain in the OS store.
- The memory backend is bounded by the existing provider allowlist and value
  limits, stays off disk and does not cross profiles or API restarts.
- Normal listener/origin/CSP, renderer sandbox, context isolation and Node
  integration settings remain. No additional outbound or remote access.
- Startup failure remains an error; it cannot be mistaken for a passed check.
  Expected test input can be discarded at teardown, while actual navigation and
  delivery confirmations remain exercised separately.
- No dependency changes or automated security scans. The only blocked native
  binding is in a disposable verification copy, never the delivered artifact.

## Verification

Source checks pass: **1,020 tests**, two platform skips, typecheck, lint, build
and formatting. **38 desktop/mobile browser cases** pass, including ordinary
Stop cancellation (no shutdown request), test Stop (no confirmation), ordinary
versus test before-unload policy, narrow layout, guarded setup/delivery and the
compact workflows. The credential contract's seven tests include zero native
backend calls in verification, reset/cross-profile isolation, normal namespace,
bounded validation and fail-closed configuration.

The final package passes API/dashboard, MCP and headless shutdown smokes. Ten
prior public-NFL/synthetic-roster saved results spanning all six advice workflows
pass exact replay, expanded evidence, history and narrow native views. No fresh
paid model analysis, messages or bets were used.

For stronger isolation evidence, a disposable copy of the final app has the
`keytar.node` native binding made unusable. Its GUI still passes credential
round trip/delete, credentials disappearing at restart, nonpersistent session,
mock-Keychain flag, theme/team persistence, diagnostics/backups and clean Stop
with unsaved fictional input. Both launches record **zero confirmation dialogs**.
An intentionally corrupt private SQLite fixture also exits with code 1 promptly
instead of offering recovery or startup modals. This does not substitute for the
separate opt-in OS-vault smoke; no real-vault success is claimed by this run.

Earlier attempts retained an overly early window assertion and a before-unload
handler race; native tests exposed and corrected both. Original failures and
successful retries remain in local `/tmp/sidekick-quiet-*` logs. The disabled
binding exists only in the disposable copy, which is removed after verification.

All 184 inspected compiled application files match the delivered source. The only
change among the 168 API/core/integration runtime files since the compact preview
is `apps/api/dist/credentials.js`; prediction code is unchanged. The payload
inventory contains 2,688 files with no local state, `.sidekick`, native `auth.json`
or `.env` capture. `hdiutil verify` and `unzip -t` pass.

Rebuilt macOS ARM preview, still unsigned version 0.1.0:

| Artifact                                                                        | SHA-256                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/desktop/out/make/Sunday Sidekick-0.1.0-arm64.dmg`                         | `d9b5db47a53bc0e536eb77a5dfce8ea65329a9b8e295fb44413049a7e1ff6dc5` |
| `apps/desktop/out/make/zip/darwin/arm64/Sunday Sidekick-darwin-arm64-0.1.0.zip` | `5bac4be68095b884302d4a262b067cb38eeb2307218e80417437c7b9e1e6a09a` |
| Delivered ASAR                                                                  | `9e6897335df67cd219ae0c36d2da6087e2dc1a93d238dd78409e8216ad9071da` |
| Disabled-binding verification-copy ASAR                                         | `0e0aad3e247865471a1a297c05eb65caf9b6e4b46796838ec728e9793c0a18a6` |

The preceding compact-workflow installer remains under
`/tmp/sidekick-before-quiet-verification-out`. Source and native receipts are
retained under `.sidekick/research/2026-10-14-quiet-verification/` and its adjacent
JSON record. Developer ID/notarization, owner real-vault permissions, live
messaging/TCC and other-platform interactive checks remain separate release gates.

## Later preview rebuild

The report-library rebuild supersedes this package at the same output filenames. This review’s
exact hashes remain the record for `/tmp/sidekick-before-report-library-out`; see
[the report-library review](2026-10-14-report-library.md) for the current artifact. Quiet testing
behavior is preserved and reverified in that build.
