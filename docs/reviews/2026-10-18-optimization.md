# Optimization pass — October 18, 2026

Structure, bundle and documentation cleanup with no feature removals. Measured on local
macOS ARM with Node.js 22.23.3.

## Changes

- **Dashboard bundle:** Settings, Leagues, Reports, Schedule and Members pages are lazy-loaded
  and prefetched while idle after state loads. The main chunk dropped from 577 KB to 404 KB
  (174 KB to 127 KB gzipped). Built CSS dropped from 71 KB to 63 KB after removing 113 rules
  for 45 class names that no component renders, plus the unused hero WebP.
- **Research separation:** twelve core and five integrations modules used only by research
  scripts moved to `src/research/`, outside both package indexes. Seventy-one research scripts
  moved to `scripts/research/`.
- **Large files:** `advice-service.ts` 1,374 → about 1,110 lines (prompt, player pool and
  post-review selection extracted); `App.tsx` 1,662 → about 1,550 (sidebar/topbar in
  `AppChrome.tsx`); `AdvicePage.tsx` 1,531 → 1,207 (`BetFields.tsx`, `PlayerPicker.tsx`); API
  `index.ts` 1,119 → 977 (scheduled-run retry router).
- **Retry behavior:** scheduled-run retry now reuses the scheduled league fetch, so a manual
  snapshot import is not refreshed from its provider during a retry. Three new route tests.
- **Home:** the empty state shows one next-step card with the sample league inside it,
  instead of four overlapping setup prompts.
- **Tasks:** `tasks.md` keeps only the 56 open items; full history is in
  [2026-10-18-task-history.md](2026-10-18-task-history.md).

## Checks

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` and all 254 Playwright
desktop/mobile cases pass. `npm run perf:smoke` before the changes: API startup 225 ms, full
state p50 2.3 ms, report pipeline p50 39 ms, working set 135 MiB.

## Not changed

- `docs/research/` (68 MB) stays in the tree. Deleting it would not shrink clones without a
  history rewrite, and sealed research records reference those files.
- Sealed research JSON records hash scripts and modules by their old paths; re-verifying an
  old seal needs the pre-move paths.
- `SettingsPage.tsx` and `MemoryPage.tsx` already delegate to section components and were not
  split further.
