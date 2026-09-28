# Encrypted portable backup review — 2026-09-27

## Scope

Manual review of passphrase-encrypted portable backup export and restore in
`apps/api/src/backup-archive.ts`, the API routes, and the Settings controls. No automated
security scan was run.

## Review notes

- Export requires a 12–200-character passphrase and confirms it in the dashboard before
  making a request. The server validates it again; it is not written to SQLite, the
  credential store, or a URL.
- Each file uses a random 16-byte salt and 12-byte nonce. Scrypt derives a 256-bit key;
  AES-256-GCM authenticates the fixed format header and payload. The key buffer is cleared
  after each operation.
- The consistent SQLite snapshot is written under an exclusive temporary directory; cleanup
  removes that directory after archive creation. This avoids applying private permissions to
  a shared system temp root.
- Restore decrypts before ZIP parsing and database replacement. Authentication failure and
  malformed data preserve the current database. Existing ZIP and SQLite formats remain
  supported.
- Archive size and expansion limits continue to apply after decryption. The passphrase is
  cleared from dashboard state after a successful export or restore.

## Known limits

- A forgotten passphrase cannot be recovered. The UI and setup guide state this before use.
- Local automatic safety copies and the desktop data-folder migration archive remain
  unencrypted; private filesystem permissions and the loopback-only service protect those
  local copies. This remains a release hardening decision to revisit.
- The legacy local `/api/backup` route still returns a ZIP for desktop data-folder migration;
  Settings uses the encrypted export route. The service remains bound to loopback and checks
  browser origins.

## Verification

- `apps/api/src/backup-archive.test.ts`: archive round trip, wrong passphrase, tamper rejection,
  and passphrase bounds.
- `scripts/backup-archive.integration.test.mjs`: encrypted export, encrypted restore, wrong
  passphrase rejection, legacy ZIP restore, and temporary-directory cleanup through the API
  process.
- Full `npm test`, `npm run typecheck`, and `npm run lint` passed on the local checkout. The
  focused formatting check passed after formatting the touched files.
