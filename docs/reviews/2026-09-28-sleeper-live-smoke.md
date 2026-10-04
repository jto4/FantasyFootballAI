# Sleeper live connector smoke

## Scope

Ran the compiled `SleeperConnector` against the historical public Sleeper sample league
listed in the [official API documentation](https://docs.sleeper.com/#get-a-specific-league).
The API is read-only and requires no API token. This check used only that published sample
ID and did not query or retain a user's account.

## Result

On 2026-09-28, the connector returned a normalized 2018 league with 12 teams, all 12 roster
records, 81 normalized scoring fields, and 180 draft picks. The live NFL state was 2026 week
3, so current-week matchups were correctly omitted for this prior-season league. The current
NFL player catalog did not contain its historical roster player IDs, so zero roster players
could be named from that catalog; this is recorded as a limitation of testing against a
historical league, not as evidence that current-season roster mapping works.

## Limits

This smoke proves a read-only live request path and basic response normalization for the
official sample league. It does not verify current-season player matching, actual user league
permissions, scoring accuracy, live matchup behavior, or data quality across league formats.
Those require an owner-authorized current league and additional fixtures.

## Current player-catalog check at 12:09 UTC

The separate opt-in `npm run sleeper:catalog:smoke` fetched only Sleeper's public NFL
player catalog. The decoded response was 14,661,302 bytes and contained 12,229 normalized
players. The adapter's previous 6,000,000-byte cap rejected that current response; it is now
bounded at 20,000,000 decoded bytes and still rejects larger payloads. The post-change smoke
verified the catalog's player IDs, names, and positions for Patrick Mahomes (4046), Josh Allen
(4984), and Justin Jefferson (6794). It requests no league or user account data.

This verifies current public-catalog normalization and corrects the prior note that player
catalog mapping was wholly unverified. It still does not verify mapping against an owner league,
league permissions, scoring accuracy, or current live rosters.
