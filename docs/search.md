# Finding your way around

Use **Search settings, reports, and more** at the top of any page. Type the words you would
normally use, then choose a result. You can also open search with Command-K on Mac or
Control-K on Windows/Linux. Arrow keys choose a result, Enter opens it, and Escape closes search.

Try these examples:

| Search                  | Opens                                                      |
| ----------------------- | ---------------------------------------------------------- |
| How do I stop swearing? | Settings → Voice → Allow profanity                         |
| Make reports shorter    | Settings → Voice → Report length                           |
| Change my email address | Settings → Delivery & access → Email recipient             |
| Automatic backups       | Settings → Storage & desktop → Scheduled encrypted backups |
| Delete old messages     | Settings → Privacy → Imported source retention             |
| Assistant nickname      | Settings → Delivery & access → Group chat agent name       |

Settings results open the correct section, scroll to the control, and highlight it. Search does
not toggle settings, save changes, generate reports, or send messages. If a control is disabled,
its surrounding label/explanation remains reachable. AI controls that depend on API mode lead
to AI connection when the current mode does not expose them; search never changes the mode.
Desktop-only results appear only in the desktop app.

Setting links include a `setting` parameter, for example `#/settings?setting=profanity`.
You can bookmark or reload them. Choosing a different Settings tab clears the searched
setting from the URL. Leaving unsaved Settings or report edits requires confirmation;
rejecting it keeps the search and edits open. Accepting a Settings navigation discards those
pending edits, including when the destination is another setting on the same page.

Search also finds connected leagues and saved report titles. It checks the full report history,
including older reports outside the latest dashboard summaries. Report title/type matching uses
literal words; small typo tolerance applies to the setting/page catalog and recent metadata.
When many reports match, add words from their title to narrow the list. Imported message text,
report bodies, credentials, and unsaved forms are not searched.

## Implementation and privacy

`search-catalog.ts` owns reviewed setting destinations, descriptions, everyday aliases, and
desktop visibility. `search.ts` ranks exact titles, words, prefixes, aliases, and bounded single
character edits/transpositions. It ignores common question words and requires every remaining
query token to match. The catalog is deterministic; this is not an AI chatbot.

`WorkspaceSearch` combines that catalog with current league/report metadata. After a short
debounce, `/api/report-history?search=...` checks all saved title/type metadata and returns at
most 50 body-free summaries. The dialog shows at most 16 results and explains when narrowing
is needed. Queries are limited to 120 characters and 12 words, SQL parameters are bound,
LIKE punctuation is escaped, and stale requests are aborted/ignored. Existing deadline,
response-validation, loopback/origin, and error boundaries apply.

Queries stay in temporary browser memory and travel only to the local service for report
lookup. They are not saved in URLs, local storage, logs, analytics, or provider prompts.
Search requires no model, credentials, or new dependency. Catalog matching remains available
if report-history lookup fails. No automated security scan is part of this feature or its checks.

## Tasks and Help & FAQ

Search also indexes the in-app Help & FAQ answers, with validated `#/help?answer=`
bookmarks, expanded/focused answers, and direct page/setting recovery links. A shared
content module owns answers and aliases. Exact FAQ titles remain findable while
non-exact help matches rank below strong settings matches, preserving phrases such
as “make reports shorter.”

A local bounded task parser retains negation independently of keyword normalization.
It proposes report schedules, previews enabling/stopping automatic report delivery,
and routes failed-send questions to help. Search never applies mutations. Unsupported
or contradictory instructions do not become executable tasks; ambiguous/missing
schedule details require review of the editor's visible defaults. Named report/channel
scope is preserved, enabled scheduled sends require recipients, and changed delivery
revisions block stale enable previews. See [Everyday use](usability.md) for examples,
manual-copy semantics, and separate-section save limits. No passive query telemetry
or remote AI search service is added.

Schedule task proposals currently support weekly cadence only. Explicit daily,
monthly, one-time, or relative-date requests do not become weekly proposals; use
the offered Schedule page link to choose the available daily, monthly, or one-time
timing explicitly in its editor. Unsupported cadences such as alternate weeks still
require choosing an available frequency; the link does not implement those cadences.
Requests naming multiple delivery channels
do not choose one of them. Compact AM/PM times such as `9am` and `9:30pm` are accepted;
multiple or invalid times leave the editor's visible time for the user to choose.

Command/Ctrl-K is suspended while another dialog is active so it cannot cover
unfinished work or move keyboard focus into a second overlay. It resumes when the
current dialog closes; the shortcut still opens and closes search itself.
