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

## Repeat check at 06:16 UTC

`npm run news:smoke` again returned 10 parseable headlines and a citation URL from each feed:
ESPN, PFF, and FOX Sports. The first returned citation URLs matched the links in the earlier
table. This second result is a separate availability sample, not evidence of long-term uptime
or independent corroboration.

## Four-feed check at 06:19 UTC

After adding CBS Sports NFL, `npm run news:smoke` returned 10 parseable headlines and a
citation URL from all four selectable feeds. The returned CBS citation was
[an NFL Week 3 grades story](https://www.cbssports.com/nfl/news/nfl-week-3-grades-patriots-stumble-commanders-shine/).
ESPN, PFF, and FOX Sports also returned 10 each. CBS is presented as a headline and
attributed link; the app does not retrieve its article text. This is a point-in-time check.

## Retry behavior and feed check at 06:45 UTC

A pre-change live check at 06:44 UTC saw a transient FOX Sports request failure while ESPN,
PFF, and CBS returned headlines. A separate request to the FOX feed endpoint succeeded, and
the next smoke run returned 10 headlines from all four sources. RSS GET requests now retry
bounded network failures and HTTP 429/5xx responses up to three times, with capped backoff,
before marking a source unavailable. The post-change `npm run news:smoke` at 06:45 UTC
returned 10 parseable headlines and citation URLs from ESPN, PFF, FOX Sports, and CBS Sports.
The successful repeat does not establish long-term availability.

The official NFL news page at `https://www.nfl.com/news?service=rss` returned a 200 HTML
document, not an RSS document, during a direct check. It was not added as a feed or scraped;
revisit only if NFL publishes a usable feed or documented API.

## Four-feed repeat check at 07:50 UTC

A further `npm run news:smoke` run returned 10 parseable headlines from each feed. The first
citation URLs were:

- ESPN: https://www.espn.com/nfl/story/_/id/50047972/bucs-qb-baker-mayfield-dislocated-thumb-undergo-mri
- PFF: https://www.pff.com/news/nfl-scores-and-recaps-for-every-week-3-game-2/
- FOX Sports: https://www.foxsports.com/stories/nfl/2026-super-bowl-odds
- CBS Sports: https://www.cbssports.com/nfl/news/nfl-week-3-grades-patriots-stumble-commanders-shine/

This additional point-in-time sample does not establish uptime or independent corroboration.

## Pro Football Talk feed check at 08:08 UTC

NBC Sports lists a Pro Football Talk main RSS feed in its [official feeds directory](https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/feeds-1).
The old FeedBurner URL linked there returned an HTML page in the live check, so the adapter
uses NBC Sports' current `https://www.nbcsports.com/profootballtalk.rss` endpoint, which
returned XML RSS with HTTPS story links and publication dates. On 2026-09-28 at 08:08 UTC,
`npm run news:smoke` returned 10 parseable stories and citations from this endpoint and from
ESPN, PFF, FOX Sports, and CBS Sports. Pro Football Talk is displayed as an attributed,
link-only source; this smoke check does not establish uptime or reuse permissions beyond
published terms.

## Five-feed repeat check at 08:32 UTC

`npm run news:smoke` returned 10 parseable headlines with citation URLs from all five feeds.
The first citation URLs were:

- ESPN: https://www.espn.com/nfl/story/_/id/50047972/bucs-qb-baker-mayfield-dislocated-thumb-undergo-mri
- PFF: https://www.pff.com/news/nfl-scores-and-recaps-for-every-week-3-game-2/
- FOX Sports: https://www.foxsports.com/stories/nfl/2026-super-bowl-odds
- CBS Sports: https://www.cbssports.com/nfl/news/nfl-week-3-grades-patriots-stumble-commanders-shine/
- Pro Football Talk: https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/sunday-night-football-broncos-complete-comeback-defeat-rams-30-26

Each feed reported a latest publication timestamp between 04:13 and 07:27 UTC. This sample
confirms current fetch and parsing behavior only; it does not establish uptime, source
independence, factual accuracy, or reuse permissions beyond published terms.

## Five-feed repeat check at 09:26 UTC

The current-tree `npm run news:smoke` run returned 10 parseable headlines and a citation URL
from each selected source:

- ESPN: https://www.espn.com/nfl/story/_/id/50047972/bucs-qb-baker-mayfield-dislocated-thumb-undergo-mri
- PFF: https://www.pff.com/news/draft-stock-report-week-4/
- FOX Sports: https://www.foxsports.com/stories/nfl/2026-super-bowl-odds
- CBS Sports: https://www.cbssports.com/nfl/news/nfl-week-3-grades-patriots-stumble-commanders-shine/
- Pro Football Talk: https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/matthew-stafford-says-ive-got-to-be-better-after-nfl-record-33rd-career-pick-six

All five source requests reported `ok` and 10 headlines. Latest publication times ranged from
05:01 to 09:15 UTC. This confirms a live fetch and parse at this time only; repeated availability,
editorial accuracy, source independence, and reuse rights still need separate review.

## Current-tree repeat check at 10:40 UTC

The current `npm run news:smoke` run returned 10 parseable headlines from each of the five
selected sources. All requests reported `ok`; latest publication times ranged from 05:01 UTC
to 10:29 UTC. Returned citations were:

- ESPN: https://www.espn.com/nfl/story/_/id/50047972/bucs-qb-mayfield-dislocated-thumb-undergo-mri
- PFF: https://www.pff.com/news/new-faces-unexpected-contributors-fueling-raiders-stingy-defense-amid-3-0-start/
- FOX Sports: https://www.foxsports.com/stories/nfl/2026-super-bowl-odds
- CBS Sports: https://www.cbssports.com/nfl/news/nfl-week-3-grades-patriots-stumble-commanders-shine/
- Pro Football Talk: https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/sean-payton-we-have-to-find-a-way-to-play-better-earlier

This remains a point-in-time availability and parser check; it does not establish source
independence, editorial accuracy, continued uptime, or reuse rights.

## Current-tree repeat check at 12:00 UTC

`npm run news:smoke` returned `ok`, 10 parseable headlines, a latest-publication timestamp,
and a citation URL for each of the five configured sources. Latest publication times ranged
from 09:30 UTC to 12:48 UTC.

| Feed              | First citation URL returned                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ESPN              | https://www.espn.com/nfl/story/_/id/50049468/chiefs-patrick-mahomes-play-action-passes-dolphins-travis-kelce-kenneth-walker-iii |
| PFF               | https://www.pff.com/news/new-faces-unexpected-contributors-fueling-raiders-stingy-defense-amid-3-0-start/                       |
| FOX Sports        | https://www.foxsports.com/stories/nfl/how-to-watch-eagles-vs-bears-tv-channel-live-stream-time-2026-week-3                      |
| CBS Sports        | https://www.cbssports.com/nfl/news/bears-vs-eagles-preview-pick-prediction-how-to-watch/                                        |
| Pro Football Talk | https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/robert-saleh-cam-ward-has-to-be-smarter-with-the-football         |

This confirms one live fetch/parse sample only; it does not establish source independence,
editorial accuracy, continued availability, or reuse rights.

## Future-date filter repeat check at 12:02 UTC

The 12:00 UTC sample above included an ESPN item timestamped 12:48 UTC, ahead of that
request's local check time. The RSS parser now excludes publication timestamps more than five
minutes in the future to allow minor publisher clock skew without presenting scheduled stories
as current news. After this change, the live smoke returned six accepted ESPN headlines and 10
each from PFF, FOX Sports, CBS Sports, and Pro Football Talk. All five requests reported `ok`
and returned citation URLs. Accepted latest publication times were 03:06 UTC (ESPN), 09:30
UTC (PFF), 11:39 UTC (FOX Sports), 11:42 UTC (CBS Sports), and 11:57 UTC (Pro Football Talk).

This verifies one parser and availability sample; it does not establish source independence,
editorial accuracy, continued availability, or reuse rights.
