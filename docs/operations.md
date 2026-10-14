# Local operations

## Saved generation requests

Dashboard and MCP generation share the durable queue. Each new request has a stable ID;
reconnects reuse it. Reports can cancel queued or running work. API adapters combine cancellation
with their deadline; CLI adapters terminate the child and force termination after two seconds
if necessary. The save transaction checks job state again, preventing a late result from
publishing after cancellation or shutdown. Cancellation cannot undo provider work or charges.

The dashboard directly fetches its saved pending ID when it is absent from the latest 50 jobs.
The active state retains all unfinished jobs and the latest 200 terminal jobs. Older terminal
receipts are compacted into an indexed SQLite table: identity, request parameters, timestamps,
status, failure category, and report link remain; verbose errors and start timestamps are removed.
Receipts have no automatic expiry so an old request ID cannot silently generate a duplicate.
Database backups and recovery salvage retain those receipts.

Reports uses SQLite indexes for league/status filtering and date/ID cursor ordering. Summaries
omit bodies. Unrelated settings changes skip unchanged report and league writes. The domain
cache still loads saved reports at startup; this is not a full rewrite of the persistence API.

## Navigation and recovery

Pages use static-bundle-compatible hash URLs, such as
`#/reports?league=<league-id>&report=<report-id>`. Bookmarks, reload, Back, and Forward retain
the selected workspace and review. Unsaved Settings and report changes require an explicit
discard before navigation. A renderer error boundary offers retry and a return to the desk.
Memory/import/backup requests use the shared client, payload guards, and bounded deadlines;
long import or backup operations allow up to three minutes. A client timeout does not prove
that server-side work stopped, so inspect saved results before retrying.

## Diagnostics

Settings → Storage & desktop offers **Refresh diagnostics** and **Download diagnostics**.
The summary contains runtime versions, queue counts/age, retained-job failure categories,
storage sizes, backup status, and a bounded sanitized log tail. HTTP failures have independently
generated UUID reference headers; caller-provided references are ignored. Job/run correlation
fields accept UUIDs only. Downloads discard free-form log strings and omit filesystem paths,
league/manager names, report bodies, conversation text, and credential values. Failure counts
cover retained recent jobs, not every historical receipt. Sources without file logs still
provide live counts and status.

## Scheduled encrypted backups

Settings → Storage & desktop → Scheduled encrypted backups provides an explicit opt-in.
Choose daily or weekly capture and retain 3, 7, or 14 copies. Supply and confirm a 12–200-character
passphrase on first enable. Its exact value, including whitespace, stays in the OS credential
store under the `backup-encryption` account. Keep the passphrase separately: losing the OS
store must not also make downloaded copies unrecoverable. Existing copies must decrypt with
the chosen passphrase before the schedule can be re-enabled.

The schedule runs only while the local app/service is running. A minute check captures a due
copy, with a one-hour retry delay after failure. **Back up now** can retry explicitly. Capture
includes the database and generated images, encrypts with the same AES-GCM/scrypt portable
format used by manual exports, authenticates/parses it, and validates a disposable database
copy before publishing. Rotation happens only after success and never deletes manual exports
or pre-restore/pre-upgrade safety copies. The latest newly created copy is always retained.

Routine files and non-secret schedule/status live in the private `routine-backups/` folder
beside SQLite. Desktop data-folder moves copy that folder. The schedule is machine-local and
is excluded from portable exports; restore disables it and requires explicit re-enabling.
Copies on the same disk protect against mistakes, not disk loss. Download copies to another
device. Database and archive limits remain 50 MiB and 200 MiB; Settings warns at 40 MiB and
180 MiB respectively, including WAL/image sizes as a conservative estimate. Large individual
images and image-count limits can still prevent an archive below those totals.

**Validate backup** checks an encrypted `.ssb`, ZIP, or legacy SQLite file without replacing
current data or creating an owner safety copy. Its passphrase field is shared with Restore.
Validation checks authentication, archive/image bounds, SQLite integrity, supported schema,
and stored domain data, including archived request identities. It migrates only a disposable
private copy. Passing validation does not verify image rendering or the quality of imported data.

## Native verification

After building a current packaged artifact, run:

```sh
npm run desktop:verify -- "/absolute/path/to/packaged/executable" "/absolute/path/to/evidence"
```

This uses an isolated temporary data folder and Playwright's Electron driver to launch the
actual GUI, check rendered desk/storage/diagnostics, save screenshots, stop from the dashboard,
and check flushed shutdown logs. Evidence includes runtime architecture/version and executable
SHA-256. Run it on an interactive Mac or Windows device; it does not install the app, change
provider credentials, register login items, sign artifacts, or test published upgrades.
The command requires source-checkout dependencies and does not ship in the installer.

The existing manual Desktop packages workflow includes an Intel Mac build lane. Its workflow
and GitHub protections are unchanged by this work. Windows hosted builds still skip Electron
launch because that runner previously failed to initialize it. Current-source native verification,
credentialed signing/notarization, a signed published upgrade, and owner-selected live private
providers remain separate release gates; see [release status](release-status.md).
