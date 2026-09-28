# Dashboard visual direction

The dashboard takes visual cues from [Bakers Studio's “wave + gradient” post](https://x.com/studiobakers/status/2101998189889122451?s=46), reviewed in the in-app browser on 2026-09-28. The visible frames use a warm cream canvas, soft-focus pale blue and butter-yellow gradients, quiet floating white surfaces, pastel accents, and editorial serif display type. The working dashboard adapts that mood to a local fantasy-football control panel; it does not reproduce the reference layout or copy its product screens.

The app uses a warm off-white sidebar and canvas, thin neutral dividers, ink-colored text, and restrained clay accents. The home hero uses a locally bundled generated gradient-wave image with a light overlay so its text remains legible. Operational pages retain their existing information hierarchy and controls. Decorative motion is omitted from the hero; the rest of the app honors reduced-motion preferences, visible keyboard focus, and contrast requirements.

`apps/dashboard/design-source/images/soft-gradient-waves.png` is the high-resolution source for the locally served `apps/dashboard/public/images/soft-gradient-waves.webp` derivative. Regenerate it with `cwebp -q 88 -m 6 apps/dashboard/design-source/images/soft-gradient-waves.png -o apps/dashboard/public/images/soft-gradient-waves.webp`. The 1774 × 887 WebP is about 28 KB, compared with 1.4 MB for the PNG source, and preserves the same composition for the decorative hero. A dashboard test keeps the served asset below 64 KB and checks that the hero CSS uses the derivative. Neither file is a screenshot or a source of product facts. `dashboard-concept.png` is a separate visual concept; its example teams, scores, reports, and news are synthetic and must never appear as seeded application data.

## Acceptance criteria

- The interface feels warm, quiet, and editorial while keeping league status and controls easy to scan.
- The hero artwork is bundled locally, decorative, and does not obscure content.
- Navigation, controls, empty/loading/error states, responsive layouts, keyboard focus, and reduced-motion behavior remain usable.
- Review the implemented dashboard at desktop and narrow widths after visual changes.
