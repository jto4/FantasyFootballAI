# Dashboard visual review — 2026-09-28

## Scope

Reviewed the warm editorial dashboard adaptation against the visible frames from Bakers
Studio's “wave + gradient” post. The reference is a mood source; the application keeps its own
navigation, copy, controls, and league workflow.

Manual browser review covered:

- Home / first-run setup at 1280 × 720 and 390 × 844.
- Initial local-state loading at 1280 × 720 and 390 × 844, using a delayed browser route; after
  the delay, the original request completed and the dashboard recovered to the home view.
- The local-state error screen at 1280 × 720 and 390 × 844, using a browser-mocked 503 response.
- Invalid local-state handling at 1280 × 720 and 390 × 844, using a mocked `200 {"invalid":"shape"}` response; after removing the mock, **Try again** restored the dashboard.
- Settings at 1280 × 720 and 390 × 844, including Yahoo connection and local backup cards.
- Leagues at 390 × 844 and 320 × 800.
- Schedule, Imports, and Members & Memory at 390 × 844.
- Empty league and member states and the live-news area on the home page.
- Populated home, Leagues, and Schedule pages using a temporary in-memory browser fixture with standings, matchup scores, draft reports, scheduled-run history, and cited news. No live league credentials or real local league records were used.

At 320 pixels, the Leagues page's document and body widths matched the viewport. The 390-pixel
Settings page also measured exactly 390 pixels wide. During the populated-fixture review, the
390-pixel home and Schedule pages also measured exactly 390 pixels for both document and body
width. Navigation remained available across the six destinations at the reviewed narrow width.

## Findings and changes

- The first light-theme pass left white page headings, Settings labels, and dark input surfaces
  against pale backgrounds. Those were changed to ink-colored headings, muted readable labels,
  and light form surfaces.
- A later review found the brand wordmark still inherited white text; the base brand style now
  uses the same ink color as the page headings.
- The light palette is now defined in `design.css` rather than layered over the former dark
  theme. This keeps cards, forms, alerts, and responsive styles in one theme stylesheet.
- The hero's wave artwork is a bundled local image with a light overlay. It does not depend on a
  remote image request.
- The first malformed-response review found the mobile **Try again** button extending beyond the
  alert border. The alert now uses a flexible layout, and the button remains inside the alert at
  390px. Retrying after removing the mock restored the dashboard.

## Verification

- `npm test` passed: 464 tests passed, 2 platform-specific tests skipped, 0 failed.
- `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and
  `git diff --check` passed.
- Automated security scans were not run, as excluded by repository instructions.

## Loading and error-state observations

The initial loading message remained clear while the state request was delayed. Releasing it
restored the dashboard to its home view. The 503 state displayed a readable message and retry
control at desktop and mobile sizes. After removing the mock route, selecting **Try again**
successfully reloaded the home page and local state. The error-state console contained only the
two expected 503 request errors and no warnings. The malformed-response state was visually held at desktop and mobile. Populated home, Leagues,
and Schedule views were reviewed at 390px with an in-memory fixture; rankings, matchup scores,
news links, report activity, and league refresh controls were visible, with no page-wide overflow.
The browser recorded no warnings or errors. This mock-data review does not verify live provider data.
