# White default and optional dark appearance

Reviewed by Codex on October 13, 2026 against the working tree. This is a dashboard
source and desktop preference change; existing unrelated work was retained. No installer was rebuilt or
published, and no prediction model or production data was changed.

The dashboard defaults to white and provides an immediate Dark mode switch in the
header plus native Light/Dark radios in Settings → Appearance. Semantic tokens
cover text, surfaces, statuses, dialogs, and the decorative hero overlay. The
versioned browser preference accepts only `dark`, otherwise defaults to light,
and handles unavailable storage. A local blocking script restores the choice
before rendering under the existing production CSP.

Electron stores an independent private app-data `appearance.json` so theme choice
survives a changing loopback port. The isolated preload exposes an allowlisted
theme read/write interface. Synchronous reads return cached memory only;
asynchronous atomic writes serialize rapid changes and drain on graceful quit.

## Rendered verification

Used the Playwright CLI with headed Chrome on macOS, because the Browser plugin
was unavailable. Served the production build through `e2e/api-fixture.ts` with an
isolated temporary SQLite workspace and mocked external providers. Tested
1440 × 1000 desktop and 390 × 844 mobile; screenshots were captured outside the
repository in `/tmp/sidekick-theme-*.png` and visually inspected.

| Check                                                               | Result |
| ------------------------------------------------------------------- | ------ |
| App identity, Home and Settings content, no blocking overlay        | Pass   |
| Default white canvas and complete dark palette                      | Pass   |
| Header switch and Settings radios synchronize immediately           | Pass   |
| Reload retains dark mode; browser `color-scheme` matches            | Pass   |
| Native radio ArrowRight selects dark mode                           | Pass   |
| Another tab's preference synchronizes the current tab               | Pass   |
| Unavailable storage defaults to light and permits session switching | Pass   |
| Malformed preference defaults to light with a dark OS setting       | Pass   |
| Mobile switch accessible by name; no horizontal page overflow       | Pass   |
| Sample dialog readable and dismissible in both themes on mobile     | Pass   |
| Browser console errors and warnings                                 | None   |

The console had one existing informational autocomplete suggestion on a Settings
input. Browser verification does not certify native installer behavior.

An isolated Electron 44.4.5 ARM macOS harness executed the exact theme IPC handlers
and trusted-dashboard check from `main.mjs`, the real sandboxed `preload.cjs`, and
the production dashboard served by the temporary API fixture. It verified white
default, switching to dark, reload, closing/relaunching against a different port,
rapid light/dark/light writes retaining light, rejection of an invalid IPC value,
and no renderer errors. It used a temporary app-data directory and the cached
Electron runtime, without launching the owner's app or rebuilding an installer.

## Source validation and ordinary manual review

- Type checking, lint, formatting, full production build, all 84 dashboard tests,
  and the desktop/service suite (60 passed, two platform-specific skips) passed.
  The build retains the existing Vite main-chunk size warning. The desktop
  preference test covers missing/malformed values, exact persistence, rejected
  invalid writes, and private POSIX file permissions.
- Read the scoped theme changes and reviewed the React subscription cleanup,
  radio/switch accessibility, responsive layout, CSS cascade, and contrast of the
  visible controls, text, and dialog surfaces. Broader CSS restructuring was not
  necessary for this request.
- Reviewed the applicable `SECURITY.md` checklist manually. The only added stored
  value is an allowlisted appearance primitive. The desktop IPC uses the existing
  sender/frame-origin check, allows no renderer-provided paths, and writes only a
  fixed private app-data file through an exclusive temporary file and atomic
  rename. Reviewed write ordering, cleanup, and graceful shutdown. No secrets,
  provider payloads, database writes, external network calls, dependencies, or
  new privileges were introduced. The startup script is local and does not relax
  the CSP. Existing loopback and origin boundaries are unchanged.
- Desktop staging includes the new preference module. Full installer rebuilding,
  scheduler, imports/exports, outbound integrations, and broader platform
  lifecycle checks are outside this change. No automated security scans were run.

The cached read uses Electron's documented [IPC API](https://www.electronjs.org/docs/latest/api/ipc-renderer); its reply does not perform filesystem work or change renderer privileges.

## Black dark-mode refinement

The owner clarified that dark mode should use black. Replaced the blue-tinted
canvas with `#000000`, and the sidebar, cards, dividers, and text with neutral
grays. Browser theme color, startup restoration, and Electron window backgrounds
now use black. The white palette and theme persistence behavior are unchanged.

Rebuilt the dashboard and checked formatting, desktop JavaScript syntax, and diff
whitespace. Headed Chrome at 1440 × 1000 and 390 × 844 against a fresh isolated API
fixture verified white default, switching to exact RGB(0, 0, 0), neutral sidebar
and cards, black browser chrome, persisted dark mode after reload, no horizontal
overflow, and no console errors or warnings. Inspected both screenshots stored
outside the repository as `/tmp/sidekick-black-desktop.png` and
`/tmp/sidekick-black-mobile.png`. No installer was rebuilt for this color change.
