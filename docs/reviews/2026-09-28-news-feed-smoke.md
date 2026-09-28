# Live news feed smoke check

Checked 2026-09-28 at 05:18 UTC with `npm run news:smoke`. The command makes read-only
requests to each configured RSS source and reports parseable headline counts plus the first
citation URL.

| Feed       | Result | Headlines | First citation URL returned                                                                                              |
| ---------- | ------ | --------: | ------------------------------------------------------------------------------------------------------------------------ |
| ESPN       | Passed |        10 | [Open source item](https://www.espn.com/nfl/story/_/id/50049529/saints-again-losing-end-controversial-fumble-ruling)     |
| PFF        | Passed |        10 | [Open source item](https://www.pff.com/news/nfl-scores-and-recaps-for-every-week-3-game-2/)                              |
| FOX Sports | Passed |        10 | [Open source item](https://www.foxsports.com/stories/nfl/overreaction-monday-time-bench-drake-maye-chiefs-best-team-nfl) |

This is a point-in-time availability and parsing check. It does not establish continued
feed availability, source independence, factual accuracy, or permission beyond each source's
published terms.
