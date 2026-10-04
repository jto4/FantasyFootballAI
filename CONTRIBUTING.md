# Contributing to Sunday Sidekick

Sunday Sidekick is available under the [MIT License](LICENSE).

Thanks for helping improve Sunday Sidekick. Changes should keep the app local-first,
cross-platform, and clear about the data each integration can provide.

## Development setup

Use Node.js 22 LTS (22.13 minimum; use the version in `.nvmrc`). From a clean checkout, install the lockfile dependencies and
start the local development app:

```sh
npm ci
npm run dev
```

The dashboard runs at `http://127.0.0.1:5173`; the API runs at
`http://127.0.0.1:4173`. See [the setup guide](docs/setup.md) for provider setup,
background services, data storage, backups, and MCP configuration.

## Before opening a pull request

Run the same checks used by CI:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Add tests for changed behavior, especially connector response normalization, privacy
controls, scheduling, imports, delivery, and failure recovery. Keep provider-specific logic
behind the interfaces in `packages/integrations`; put shared domain rules in
`packages/core`.

Update `docs/tasks.md` and the relevant architecture, setup, decision, or memory document
when behavior or project guidance changes. Use comments to explain non-obvious behavior,
security assumptions, and trade-offs.

## Pull request checklist

- [ ] Describe the user-visible change and any provider or platform limitations.
- [ ] Include tests for changed behavior and report which checks you ran.
- [ ] Update relevant setup and project documentation.
- [ ] Confirm no secrets, private conversation exports, local database files, or generated
      user data are included.
- [ ] Keep the service bound to loopback; remote access requires a separate threat model
      and authentication design.
- [ ] Keep automated sending disabled unless the owner explicitly configures it.

Do not run automated security scans for this project. Before release, follow the manual
code and security review checklists in [SECURITY.md](SECURITY.md).

## Preparing a desktop release

Pushing a `v*` tag runs the macOS, Windows, and Linux packaging matrix. When every package
and smoke check succeeds, the workflow creates or updates a draft GitHub Release containing
one archive per OS. It does not publish the release. Before publishing, complete the manual
code/security review, review the generated notes, inspect each installer, and sign/notarize
packages where credentials are configured. Windows/Linux and interactive install checks
must be completed on their native systems before calling those platforms supported.

## Reporting issues

Include the operating system, Node.js version, the command or dashboard action, and the
observable error. Remove credentials, email addresses, phone numbers, league identifiers,
and private message content from issue text and attachments. For a provider-specific
failure, say whether it was reproducible with that provider's official interface.

## Browser interaction checks

Use the Node version in `.nvmrc`, run `npx playwright install chromium`, then
`npm run test:e2e`. The suite builds the dashboard and exercises first-run setup,
manual draft generation/editing/delivery review, scoped Settings saves, and unsaved
changes in desktop and mobile Chromium. It serves only loopback port 4201 and mocks
API responses, so it does not use saved credentials, modify your database, or send
provider messages. Traces/screenshots are written to the system temporary directory.
The normal `npm test` includes real local API/persistence/process regression checks.
