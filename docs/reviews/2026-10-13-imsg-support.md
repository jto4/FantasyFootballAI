# Local imsg support — October 13, 2026

Reviewed by Codex on macOS ARM with supported Node 22.23.3. The application
previously supported iMessage through BlueBubbles only. It now offers an explicit
local `imsg` alternative for text delivery and selected-chat history sync. Existing
configurations retain BlueBubbles; installing imsg does not activate it or send a
message. The local installed CLI reports 0.15.10 through the typed version-only
probe. Real owner chat reads, sending and packaged TCC permissions were not tested.

## Research and implemented scope

The upstream [JSON schema](https://github.com/openclaw/imsg/blob/main/docs/json.md)
and [group documentation](https://github.com/openclaw/imsg/blob/main/docs/groups.md)
identify stable GUIDs and database-specific row IDs. The
[send documentation](https://github.com/openclaw/imsg/blob/main/docs/send.md)
and native 0.15.10 help describe ordinary Messages automation and JSON receipts.
Read the upstream `GroupPayload`, history-output and send-result implementations
as well. The adapter requires imsg 0.15.10 or later; actual CLI availability was
verified only at the installed 0.15.10 build.

- Settings → Delivery & access selects BlueBubbles or Local Messages via imsg.
  Check installation reads only the CLI version. Find iMessage chats is an explicit
  bounded metadata read, returning only iMessage names, IDs and GUIDs; account and
  routing diagnostics are discarded. Select a conversation to fill its GUID and
  history ID, then save that section. Conventional Homebrew locations are detected;
  an optional absolute executable path is supported without adding a credential.
- The integrations adapter uses shell-free subprocess arguments, bounded output,
  30-second commands, scrubbed inherited AI/session variables, discarded stderr,
  cancellation and process-group termination (including native child automation).
  History verifies the selected row ID/GUID/service with `group` before reading up
  to 200 messages; every returned message must still match that ID/GUID. Discard
  attachments, participant arrays, account routing, reactions and other extra data.
- Delivery uses the stable `--chat-guid` target, explicit iMessage service and no SMS
  fallback. A version-only preflight rejects unsupported versions before sending.
  A successful JSON response must include a message GUID receipt. It
  establishes local acceptance, not remote receipt. Missing/invalid receipts or
  any failure after subprocess start are uncertain and never automatically retried.
  Pre-dispatch configuration failures are distinguishable safe failures.
- Existing delivery envelopes preserve body, destination and resolved executable
  identity across retries. Changing provider or executable cannot silently reroute
  an old attempt. Mention drafts cannot automatically cross providers. Native
  sending still goes through the existing report review/explicit automation gates.
- Manual and interval sync use the existing memory/reply workflow. Native cursors,
  author IDs and mention IDs are namespaced from BlueBubbles. Initial sync never
  replies to old mentions. Imported native sources share bounded deduplication and
  message-time retention. Memory, AI analysis, report/reply context and automatic
  replies remain separate opt-ins. Provider/path/row-ID/target changes are rechecked
  after retrieval and around AI setup/generation, before persistence. Switching
  providers disables polling and automatic sends until separately reapproved.
- BlueBubbles webhooks are hidden and rejected when local imsg is selected. The
  native provider uses existing opt-in polling; no injected IMCore, attachment
  sends, reaction mutation, chat creation, SIP changes or always-running watcher
  is introduced. Search and Help explain native setup.

Full Disk Access must belong to the app/service that launches imsg, and Messages
Automation permission is needed for sending. The implementation does not grant
these permissions or change the owner's Messages/account configuration. A localhost
app and a rebuilt Electron installer can have different TCC identities.

## Verification

Focused adapter tests cover safe metadata, stable GUID routing, ID/GUID and service
mismatches, malformed/oversized/duplicate rows, receipt uncertainty, protocol version
checks, environment scrubbing and cancellation of a termination-resistant fixture.
API tests cover native import/deduplication/retention with zero credential/AI use,
consent/target/provider/path/row-ID races, provider changes during AI setup, immutable
delivery envelopes, configuration validation, renewed automation consent, and safe
installation/discovery endpoints. UI tests preserve legacy setup and check native
controls/permission guidance.

Browser plugin not available: used headed Playwright CLI against an isolated real
API/SQLite fixture with fictional native metadata/history. Verified Settings →
Delivery & access → native provider → installation check → chat discovery/selection
→ save → reload, then Imports → selected-chat sync → imported native profile. No
real messages or owner database/settings/credentials were involved. Desktop
1440 × 1000 and mobile 390 × 844 render the setup without horizontal overflow. A
mobile two-column explanation was found and repaired; final screenshots were
visually inspected in `/tmp/sidekick-imsg-*-final.png`. No framework overlay or
relevant console errors appear; Chromium emits existing verbose form/autocomplete
suggestions. The fixture and owned browser are closed after verification.

Final checks pass: `npm test` (892 workspace tests plus runtime, service,
maintenance, release and integration suites; two platform-specific skips),
`npm run typecheck`, `npm run lint`, `npm run build`, `npm run format:check`,
and `git diff --check`. The build retains the existing large-chunk warning.
Focused coverage includes five adapter tests, ten API tests and two added UI
tests; the existing delivery UI assertions remain covered. All 51 v18 sealed
source hashes match their recorded values.

## Ordinary manual code/security review and limits

Reviewed new subprocess, filesystem/executable resolution, metadata/history parsing,
loopback routes, settings/store/generation-snapshot validation, delivery identities,
consent across awaited work, cursor namespaces and retention against `SECURITY.md`.
Native code remains behind typed integrations interfaces. No new secret, remote
listener, external recipient, dependency, credential copy, automated security scan,
owner service restart or installed-app release is involved. CLI paths are trusted
owner configuration; the adapter is not a sandbox for a malicious local executable.
The repository excludes protection from a host administrator/malicious local process.

Verification does not establish owner TCC grants, real group sending/remote delivery,
older/future imsg protocol versions or installer operation. Sync is bounded to the
latest 200 messages per check; it is not an unlimited archive backfill. Native imsg
operation requires macOS; existing BlueBubbles remains the cross-platform alternative.
Football forecast algorithms, probabilities and all 51 v18 sealed source hashes are
unchanged. No sportsbook/model-performance claim is made by this messaging change.
