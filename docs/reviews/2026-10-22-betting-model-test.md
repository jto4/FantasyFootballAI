# Betting model test — October 22, 2026

Production game method: `market-context-v3` for moneyline and spread, `health-weather-total-v4`
for totals. Data: public nflverse schedules with archived prices, fetched 2026-10-22.
Commands: `npm run betting:model-audit` (now with a 2026 holdout section and log loss) and the
new `npm run betting:paper-simulate`.

## Accuracy

Lower is better. "Book" is the sportsbook's own price with its margin removed.

| Sample                                                  | Outcomes | Model Brier | Book Brier | Model log loss | Book log loss | Model − book interval |
| ------------------------------------------------------- | -------: | ----------: | ---------: | -------------: | ------------: | --------------------- |
| 2022–2025 (reused; seen during development)             |    3,221 |     0.23660 |    0.23667 |        0.66439 |       0.66450 | −0.00042 to +0.00054  |
| 2026 weeks 1–7 (untouched holdout; no version tuned on) |      272 |     0.24396 |    0.24439 |        0.68158 |       0.68243 | −0.00081 to +0.00167  |

2026 by market: moneyline 0.23345 vs book 0.23340, spread 0.24768 vs 0.24891, total 0.25087 vs
0.25103. Each interval includes zero. In 2022–2025, 5 of 12 season/market cells beat the book and
none does so after the simultaneous correction.

Calibration matches the book bin for bin (for example 2022–2025, 60–80%: model 0.690 predicted,
0.689 observed; book 0.691/0.690).

## Paper betting at archived prices

Flat one unit on the side whose modeled chance beats that side's break-even rate by more than the
edge; pushes excluded.

| Edge    | 2022–2025 bets | Net units | Return | 2026 bets | Net units | Return |
| ------- | -------------: | --------: | -----: | --------: | --------: | -----: |
| > 0     |            434 |     +3.75 |  +0.9% |        20 |     +1.07 |  +5.4% |
| > 1 pt  |            118 |     +5.10 |  +4.3% |         6 |     +1.70 | +28.3% |
| > 2 pts |             17 |     +0.26 |  +1.6% |         0 |         — |      — |
| > 3 pts |              0 |         — |      — |         0 |         — |      — |

These returns are well within chance: 64 wins in 118 bets at roughly −110 is about 0.4 standard
errors above break-even. The model almost never differs from the book by more than two points, so
the app's Tentative-choice gate (a lower-band advantage above two points) correctly never fires.

## Conclusion

The model is a calibrated, lightly adjusted copy of the closing market. It is not broken and
needs no fix, and another tuned version on the same archive would be fitting noise. Consistent
with the pause recorded in `decisions.md`, changes this round improve measurement instead:

- `betting:model-audit` scores the current season as an untouched holdout and adds log loss.
- `betting:paper-simulate` reports paper returns at archived prices and calibration by bin.
- The in-app **Test historical market prices** adds "This season so far (untouched holdout)".

Re-run both commands as the season completes; a holdout interval that stays above zero for a full
season would be the first evidence worth acting on. Price shopping across books (Compare
sportsbooks) and closing line value remain the measurable levers.
