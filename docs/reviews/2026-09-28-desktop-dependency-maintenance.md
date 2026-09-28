# Desktop dependency maintenance review

Date: 2026-09-28

## Scope and method

Reviewed the deprecation messages emitted by the isolated desktop packaging install against
`apps/desktop/runtime-package-lock.json`. This is a manual lockfile and upstream-release review,
not an automated security or vulnerability scan.

## Findings

The current Electron Forge 7.11.2 packaging install reports deprecated transitive packages:

| Package warning                          | Parent in the desktop runtime lock                          |
| ---------------------------------------- | ----------------------------------------------------------- |
| `glob@7` and its `inflight@1` dependency | `@electron/asar`, `electron-installer-common`, and `rimraf` |
| `rimraf@2`                               | `temp`                                                      |
| `gar`                                    | `get-folder-size`                                           |
| `lodash.get`                             | `get-package-info`                                          |
| `prebuild-install`                       | `better-sqlite3` and `keytar`                               |
| `boolean@3`                              | `global-agent` and `roarr`                                  |

These are transitive dependencies of the packaging and native runtime stacks; they are not
used directly by Sunday Sidekick application code. Broad major-version npm overrides could
change CLI or module APIs expected by Electron Forge 7 and its makers, so they were not applied
without a cross-platform package matrix to validate them.

The latest stable Forge 7 release available during this review is 7.11.2. Forge 8 is still
published as an alpha and its maintainers describe alpha releases as active development and
not ready for general consumption ([Forge releases](https://github.com/electron/forge/releases),
[Forge 8 release plan](https://github.com/electron/forge/issues/4082)). Keep the tested Forge 7
toolchain for now and revisit these transitive warnings when Forge 8 reaches a stable release or
upstream parent packages ship compatible dependency updates.

## Follow-up

- Re-run the isolated desktop package build on macOS ARM/Intel, Windows, and Linux after any
  Forge or maker upgrade; verify `.dmg`, Squirrel, `.deb`, and `.rpm` outputs and packaged API,
  MCP, and headless runtime checks.
- Review the dependency paths again during the next desktop packaging upgrade.
- Do not add or run automated security scans; they are excluded by the repository owner.
