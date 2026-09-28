# Desktop CI follow-up review

Date: 2026-09-27 (local)

## Scope

Manually reviewed the desktop startup and package-smoke changes through commit `3d48e7c`,
including `apps/desktop/main.mjs`, `scripts/desktop-package.mjs`,
`scripts/packaged-mcp-smoke.mjs`, and the Windows-specific test and package configuration
changes. This was a source review; no automated security scans were run.

## Result

No new code findings were identified in the reviewed changes.

The hosted Windows runner repeatedly built the Squirrel package but did not reach the first
Electron startup marker when launching its GUI executable. The Windows CI package job therefore
checks that the generated executable exists and is nonempty. It does not establish that Windows
can launch, install, update, or run the application. Those checks still require an interactive
Windows machine.

The hosted Linux runtime smoke uses `--no-sandbox` because the runner cannot set the ownership
and mode required for Electron's SUID sandbox helper. That flag is passed only to CI smoke
processes; normal packaged Linux launches retain Electron's sandbox defaults. The smoke does not
verify the installed Linux desktop's sandbox configuration.

## Verification evidence

- Hosted CI run `36369251567` passed all source and package jobs. macOS and Linux package jobs
  completed the API/dashboard and MCP runtime smokes; Windows verified the generated executable.
- Local `npm test` passed under the bundled Node.js 24.19.0 runtime after rebuilding
  `better-sqlite3` for that Node ABI. Typecheck, lint, format check, and production build passed.
- Interactive Windows and Linux installation, upgrade, sign-in, and background-service lifecycle
  checks remain open.
