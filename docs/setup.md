# Setup

For contributor workflows and the repeatable local performance smoke benchmark, see
[`AGENTS.md`](../AGENTS.md) and [`performance.md`](performance.md).
For common install, connection, scheduling, delivery, recovery, and MCP problems, see the
[troubleshooting guide](troubleshooting.md).

To verify the current user's OS credential store without touching saved Sidekick credentials,
run `npm run credentials:smoke`. It stores a random temporary value in an isolated service
namespace, reads it back, deletes it, and repeats cleanup on failure.
On Linux, credential storage requires a Secret Service provider such as GNOME Keyring or
KWallet to be available on the current user's D-Bus session. This also applies to a
headless background-service account; the smoke command reports failure when no usable
credential service is available.

To check current ESPN, PFF, and FOX Sports RSS availability, run `npm run news:smoke`. This
opt-in live check reports a headline count, latest publication timestamp, and one citation
URL per feed. It is not run in CI because feed availability and terms are controlled by their
publishers.

## Local development

Install Node.js 22.13+ and npm, clone the repository, run `npm ci`, then `npm run dev`. On Linux, source builds need the distribution's `libsecret` development package before `npm ci` (`libsecret-1-dev` on Debian/Ubuntu); [Keytar documents the platform dependency](https://github.com/github/node-keytar#on-linux). The start, development, build, and service commands check the Node.js version and print an upgrade instruction when it is too old. `npm ci` installs the exact dependency versions in the lockfile and replaces any existing `node_modules` directory. Visit `http://127.0.0.1:5173`; the API is available at `http://127.0.0.1:4173`. The API currently runs directly without a file watcher so the dashboard's **Stop app** control can stop the combined development session cleanly. API code changes require restarting `npm run dev`; Vite still hot-reloads dashboard changes.

Use **Stop app** at the bottom of the dashboard sidebar to stop the API, scheduled jobs, and development dashboard process. Confirm the prompt to exit. Start again with `npm run dev` from the repository directory.

## Local production-style launch

After `npm ci`, run `npm start` from the repository directory. This builds the
workspaces, starts the local API with its built dashboard, waits for `/api/health`, and
opens `http://127.0.0.1:4173` in the default browser. Keep the terminal window open.
Use **Stop app** in the dashboard to stop the service and scheduled tasks; the launcher
exits when the service exits. Launch it again with `npm start`.

Before building, `npm start` checks that the local API port is available. If another app
already uses port 4173, stop it and retry; Sunday Sidekick cannot share that port with a
second local instance.

## Desktop installer

The packaging pipeline creates a self-contained desktop app, so users do not need to
install Node.js to run an already-built installer. A contributor builds for the current
OS and architecture with `npm ci` followed by `npm run desktop:make`. The installer
appears in `apps/desktop/out/make/`. Packaging stages a clean standalone runtime tree,
rebuilds native modules for Electron, and runs smoke checks against the packaged API,
dashboard, tray icon, and MCP client before keeping the artifact. The MCP check completes a
stdio handshake, discovers tools, and calls `list_leagues` against a temporary loopback API.
These checks do not replace interactive OS install and lifecycle checks.

Linux packaging produces both Debian `.deb` and Fedora/RHEL `.rpm` packages. On Debian or
Ubuntu build hosts, install `fakeroot`, `dpkg-dev`, `rpm`, and `xvfb` before running the
desktop packaging command. Electron Forge documents the RPM maker's [RPM build requirement](https://www.electronforge.io/config/makers/rpm).

The desktop app writes its SQLite database under Electron's per-user application data
directory and stores secrets in the operating system credential manager. Use the in-app
backup and restore screen to move an existing SQLite backup between the source-checkout
and desktop versions. In desktop Settings, enable **Launch at sign-in** to open the app
automatically on macOS, Windows, or Linux. Closing the dashboard window hides the app to the
system tray so scheduled jobs continue. Choose **Quit Sunday Sidekick** from the tray menu to
stop its local API. The **Start hidden in the system tray** option applies at the next sign-in;
it starts the service without opening the dashboard window. For headless operation,
use the source-checkout service commands instead.

If the desktop app cannot open its SQLite database, it checks the five most recent valid local safety copies and offers an explicit restore choice. The app preserves the failed database and journal files in a recovery folder, then restores the chosen copy with automatic sends paused and custom AI/CLI runtimes reset for review. If no valid safety copy exists, it leaves the data folder unchanged and displays source-checkout recovery guidance.
Packages are unsigned and are not published for end users yet. Version tags create a draft
GitHub Release with a ZIP for Linux and Windows, plus separate Apple Silicon and Intel macOS
ZIPs, and a `SHA256SUMS` file; an owner must complete
the release review and publish it. After downloading the archive and checksum file, run
`shasum -a 256 -c SHA256SUMS` on macOS or `sha256sum -c SHA256SUMS` on Linux to check for
accidental corruption or incomplete downloads. On Windows, use `Get-FileHash <archive> -Algorithm
SHA256` and compare its `Hash` value with that archive's line in `SHA256SUMS`. Checksums alone
do not authenticate who published the files. Apple Silicon is the only Mac installer build
verified locally. Push and pull-request CI smoke-checks Apple Silicon macOS, Windows, and
Linux packages; the on-demand and tag release workflow now also builds Intel Mac packages,
which still need hosted verification. Successful runner results and interactive installation
checks on each OS are still required before claiming support.

On the League desk, choose **Guided setup** to walk through league connection, AI runtime
settings, and optional voice/schedule customization. It resumes at the first incomplete
required step. Each step opens the existing setup screen, so you can return to the League desk
and reopen the guide after saving your changes. When multiple leagues are connected,
choose the active league in the top bar; report generation follows that selection.
The selection is remembered in this browser on this computer. The credential readiness indicator
checks whether an OpenAI key is saved or the selected CLI runtime has passed its data-free test.
The guide does not configure credentials or providers on its own. In the desktop app, its
personalization step can take you directly to the local data-folder setting; keeping the default
folder is valid, and changing it copies local data and restarts the app. The guide also links to
the optional delivery-provider credentials in Settings; configure only the channels you plan to
use, and automatic sending remains controlled separately by each report action.

For an OpenAI-compatible API, enter the endpoint and key under Settings → AI runtime. **Discover
models** sends an authenticated, data-free model-list request to that endpoint and adds returned
IDs as suggestions; you can still type a model name manually when the endpoint does not expose a
model list. **Save and test runtime** separately sends a fixed data-free prompt. API settings also let you choose temperature (0–2; default 0.8), a maximum response size (128–16,384 tokens; default 1,200), and optional input/output prices in USD per million tokens. These API-only controls are sent to OpenAI-compatible endpoints; local CLIs use their own configuration. Reports display token counts when the provider returns them. Enter both current token rates to see an approximate cost; estimates exclude discounts, cached-token billing, and other provider adjustments. Missing provider usage or prices is shown as unavailable, not as zero cost.

For a local AI CLI, enter its executable and optional arguments under Settings → AI runtime.
Quote an argument containing spaces, for example `--config "Library/Application Support/ai.json"`.
The app passes the executable and parsed arguments directly to the process; it does not evaluate
shell substitutions or glob patterns.

On supported Macs running macOS 27 or later, select **Apple Foundation Models CLI** to use
Apple's built-in `fm respond` command. Sidekick passes its system instructions and prompt as
separate command-line arguments and runs the command without a shell. The option is only enabled
on macOS; **Save and test runtime** checks whether the command is available. See Apple's
[Foundation Models CLI guide](https://developer.apple.com/videos/play/wwdc2026/334/) for OS and
model availability details. The CLI receives the report content in process arguments, which may
be visible to local process-inspection tools while it runs. Use it on a trusted Mac. Choose a
stdin-based CLI for prompts you do not want passed in process arguments.

In Settings → Schedule, an action can run daily, weekly, monthly on a selected day from 1–28, or once on a selected date, time, and timezone. Fresh installs start with monthly offseason updates, Tuesday power rankings, and Wednesday matchup previews scheduled to the dashboard for review; each keeps the device's local timezone. Before played standings exist, a power-ranking report uses owner-imported season projections only when all teams have complete equal-size roster snapshots and every player matches in one scoring-confirmed source; an ID match must also agree on normalized player name, and name-only matches must be unique; totals include bench players and are labeled as roster-strength estimates, not starter scores or win forecasts. If that evidence is incomplete, rankings are withheld. These schedules refresh league data before deciding whether the report fits the confirmed season phase. Active leagues pause offseason updates, completed leagues pause weekly rankings and previews, and unknown phase stays eligible so sparse platform metadata does not silently suppress reports. Generated reports remain drafts unless you explicitly enable automatic delivery for an action. The league desk and report guidance label playoffs only when the current week and a playoff start are available. Yahoo and Sleeper use their league settings; ESPN derives an explicitly marked estimate from H2H schedule settings. Missing or unsupported values stay unconfirmed. In Automatic actions, use the suggested cadence to restore the monthly and weekly schedule recommendations after making custom schedule changes. The button changes only schedules; review and save them, and each action retains its timezone, league scope, channel, and draft-or-automatic policy. The league season calendar lets you add specific draft, season, or playoff milestones per league; each event refreshes just that league and creates a draft for review, even if the action's regular schedule is configured for automatic delivery. For Sleeper, Yahoo, and ESPN leagues, a future platform-reported draft start time can prefill a draft-hype event at the reported start time or a post-draft review and separate power-ranking event for the following day at 9:00 AM in the selected timezone. Review each suggestion, add it, and save Settings; calendar events never send automatically. ESPN support accepts only timezone-qualified ISO timestamps because the endpoint is undocumented. See the [Sleeper draft API](https://docs.sleeper.com/#get-a-specific-draft), [Yahoo Fantasy API documentation](https://sports.yahoo.com/developer/docs/), and [community ESPN API reference](https://github.com/pseudo-r/Public-ESPN-Fantasy-API/blob/main/docs/leagues.md#view-msettings) for source fields.
One-time events catch up later on that same local date if the service starts after the chosen
time; if the app starts after the scheduled local date, the report is skipped and a failed
run is recorded on the Schedule page. Keep the app or its background service running on
event day.

Settings → Schedule controls **Additional attempts** for temporary league refresh failures.
It is off by default and can add up to three short-backoff retries. Access and permission errors
stop immediately; report generation and delivery are never repeated by this setting.

When installed with `npm run service -- install`, background API events are also captured under
the user's `.sidekick/logs/service.log` folder in their home directory and shown from Settings →
Local runtime logs. Runs started directly from the terminal continue to write to that terminal.

Football news refreshes in the background using the interval configured under Settings →
News refresh. The League desk can also request an immediate refresh. If the news source is
unavailable, the dashboard and reports keep using the last cached headlines and show that
they are stale.

Matchup previews can optionally include NFL availability data from the [nflverse injury
reports](https://github.com/nflverse/nflverse-data), distributed under CC BY 4.0. This is off
by default; enable **Use nflverse injury reports in matchup previews** in Settings → Football
news sources. The app caches the public season CSV locally for six hours and includes only
current-week rows that exactly match a roster player's normalized name and NFL team. Each
report cites the source CSV and local retrieval time. Healthy rest-day labels marked “not
injury related” are filtered. These are source-reported availability labels, not medical advice;
an unavailable feed or no exact matches does not block the report. When you enable the source,
the matched player names and statuses are included in the prompt sent to your selected AI
runtime, as described by the data-sharing boundary on the Settings page.

The `.sidekick/` directory under the current user's home directory holds local application state and should not be committed. The app stores its current state in `state.sqlite`; existing `state.json` data is imported once and retained as a migration copy. Never paste provider credentials into source files or issue reports. Provider secrets are saved through the dashboard's OS-backed credential store integration.

Use **Settings → Local backup and restore** to download a portable `.ssb` backup containing the database and generated images. Enter and confirm a passphrase of 12–200 characters; the archive is encrypted with AES-256-GCM and a per-file scrypt-derived key. Keep the passphrase separately because it cannot be recovered. Restore accepts encrypted archives up to 201 MB, older ZIP archives up to 200 MB, and legacy SQLite files up to 50 MB. The service validates the archive before replacing local data and preserves the pre-restore database in `.sidekick/backups/`. Provider secrets are not included because they stay in the OS credential manager. Restored automatic actions return to draft mode with schedules disabled. Custom AI endpoints and local CLI runtimes return to the default API configuration, so a backup cannot silently choose an executable or a destination for your API key. Review AI and delivery settings, then explicitly re-enable any automation you want. Restoring an older SQLite-only backup clears the generated-image library. Local safety copies remain protected by filesystem permissions and are not passphrase-encrypted.

If the desktop app cannot open its database and neither salvage nor an existing safety copy works,
startup offers to start with an empty library. Choosing it moves the unreadable database and
SQLite journals into a private `recovery-*` folder first; data in those files will not appear in
the new library. Keep that folder if you may seek specialist data recovery later.

When SQLite can still read some normalized tables, startup first creates a labeled partial-salvage
backup from independently valid rows and offers it with the other safety copies. Malformed rows
are omitted; the original database and journals remain preserved. From a source checkout, run
`npm run build` followed by `npm run db:recover -- --salvage` to create that backup without
replacing the source database.

If a source-checkout database will not open, stop Sunday Sidekick and run `npm run db:recover -- --check` to inspect the current database and recognized safety copies. Use `--restore-backup <filename>` only with a listed, valid copy; the command validates it again and saves the previous database and any SQLite journal files in a private `recovery-*` folder before replacing `state.sqlite`. For a desktop install, use `--data-dir` with the selected local data folder shown in Desktop Settings. Keep the recovery folder until you have reviewed the restored data. This command does not reconstruct data when no valid safety copy exists; preserve the data folder and its recovery files for manual assistance rather than deleting them.

Generated GPT Image files are stored privately in the selected local data folder's `images/` directory. Use **Settings → Credentials → Saved images** to preview, download, or delete them. Encrypted Settings backups include both the SQLite database and generated images; older ZIP and SQLite-only backups can still be restored, and restoring an SQLite-only file clears the current generated-image library. Image prompts are sent to OpenAI when you generate an image, and generation may incur API charges.

Use **Settings → AI privacy → Imported source retention** to keep imported conversation text until you delete it, or purge it after 30, 90, or 365 days. Cleanup runs when you save the setting, when the app starts, and daily while it is running. The profile, editable notes, and banter preferences stay available after source text expires. The local database enables SQLite secure-delete and checkpoints its write-ahead log after purging. Retention does not alter downloaded backups or pre-restore safety copies: delete the copies in **Settings → Local backup and restore**, and manually delete downloaded files from wherever you saved them, if those copies should also be removed. Use **Enable member memory** to pause conversation imports, AI analysis of imports, and use of member notes with AI. Report prompts and group-chat reply prompts have separate sharing opt-ins in Settings; pausing member memory blocks both while keeping existing profiles stored locally for later review or re-enabling. **Members & memory → Delete all memory** removes every member profile and its imported source messages; deleting an individual profile removes its source messages too.

The import tool accepts BlueBubbles chat-message JSON responses as well as standard JSON, CSV, EML, and labeled text. [Twilio Console CSV exports](https://help.twilio.com/articles/223183588) use `Direction` to distinguish inbound participants from outbound messages, and outbound texts are assigned to your fallback name rather than the Twilio number. EML imports use the message's sender and date while excluding quoted earlier replies from that sender's style sample. Enter your own display name as the fallback name; BlueBubbles-authored messages are assigned to that name, while other participants initially appear under their phone number or email address. You can rename those profiles before enabling member context for AI prompts. Imported source text remains local unless you separately enable AI analysis, and the import screen describes what that opt-in shares.

When importing a new export, preview its participants first. For each author, choose an existing import-created profile to merge into or keep **Create a separate profile**. This explicit mapping avoids merging people just because they share a name. With AI analysis enabled, a merge includes the selected profile's existing notes and the new authored messages so notes can be updated; with analysis disabled, existing notes are preserved and only the local source archive changes. Re-importing the identical export for the same participant is skipped. Merged export blocks retain their own import dates, so a new export does not extend the retention period of earlier source text.

## Provider configuration

Connect a league using its provider and league ID. Sleeper leagues can be read without a key where the provider makes that league data public. Its adapter reads the league's current week and matchup endpoint only when the league season matches the NFL state season; see the [Sleeper API documentation](https://docs.sleeper.com/) for access, rate, and commercial-use terms. ESPN private league access needs a user-authorized session. Choose the ESPN season in the connection form; the saved league refreshes and scheduled reports continue reading that season until you reconnect it with another year.

The league connection dialog links directly to Yahoo OAuth setup when authorization is missing and to the ESPN credential entry for private leagues. Yahoo cannot be connected until its access token is saved; ESPN public leagues may connect without a session cookie.

For Yahoo, request Fantasy Sports API access and create an **Installed Application** with Fantasy Sports read access. Save its client ID and secret under Settings → Yahoo Fantasy connection, start authorization, approve the request in Yahoo, then paste the displayed code back into the dashboard. Yahoo's OAuth access and refresh tokens, as well as the app credentials, are stored in the OS credential manager. The app refreshes access tokens as needed. Yahoo may require an application review before granting Fantasy Sports API access; see [Yahoo's developer access requirements](https://sports.yahoo.com/developer/access/) and [official OAuth flow](https://developer.yahoo.com/oauth2/guide/flows_authcode/).

## Import draft and matchup projections

On **Imports**, select a connected league and import an authorized CSV with `player` and `projectedPoints` columns. Optional columns are `playerId`, `position`, `nflTeam`, `week`, and `adp` (average overall draft position). Leave `week` blank for season projections; use week 1–30 for matchup estimates. Each import replaces only a source set with the same source name and URL; up to eight sets can be stored per league. Source names are owner-entered, and the app cannot verify source independence or accuracy. Each source import must affirm that its points use the connected league scoring settings; unconfirmed or legacy sets stay local but are excluded from numeric analysis. For a player matched unambiguously in at least three source sets, draft reviews compare the platform pick with the median owner-supplied ADP as descriptive timing. A team process grade may be generated only for a platform-confirmed completed draft when every pick has multi-source ADP and positional replacement evidence; incomplete data withholds the grade. Source names, optional public HTTPS URLs, and import times stay local and are included in reports when used.

When a report is configured for email, **Send now** can send a new email or reply to an existing thread. For a reply, provide the original message's Message-ID and matching subject when prompted. The configured email recipient is used in either case.

To deliver to an iMessage group, install and configure [BlueBubbles Server](https://bluebubbles.app/install/) on a Mac signed into Messages. Enable its Private API because the adapter uses BlueBubbles' documented `message/text` endpoint and `private-api` send method. In Settings → Credentials, save JSON in this form (the URL and password are kept in the OS credential manager):

```json
{ "serverUrl": "https://your-secure-bluebubbles-host", "serverPassword": "your-server-password" }
```

Use HTTPS for a server reached over a network; plain HTTP is accepted only for loopback addresses. BlueBubbles documents password authentication and its REST API at [REST API & Webhooks](https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks). Copy the target group's chat GUID from the BlueBubbles server/API, enter it under **iMessage group chat ID**, and select **iMessage via BlueBubbles** for the report action. The companion can run on macOS, Windows, or Linux while the BlueBubbles server remains on the Mac that has Messages access. Automatic messages still require an action to be explicitly enabled and switched to automatic; dashboard **Send now** follows the configured channel.

To import live group context, set **Your name in the group chat**, then open **Imports → Sync messages now**. Each click requests at most 200 recent text messages from only that configured chat and skips message IDs already processed. To poll automatically, enable **Automatically sync this group chat** in Settings and choose a 5, 15, 30, or 60 minute interval. Polling is off by default, runs only while the app is open, and shows its last check or error in Settings. It uses the same memory, AI-analysis, and retention controls as manual sync; restoring a backup disables polling until you opt in again.

To have the companion join the conversation, set its **Group chat agent name or mention** and turn on **Draft a reply when someone directly addresses the agent** in Settings. This is a separate opt-in: the selected AI receives a newly addressed message plus the selected league data and creates a local draft. A message must begin with the configured name or `@name`; ordinary mentions later in a message do not trigger replies. The first history sync establishes a baseline and does not reply to old messages. Each later sync creates at most three reply drafts. Review and send them from **Schedule & drafts**. The separate **Send generated chat replies automatically** control is off by default; enable it only if you want addressed messages sent without review. Replies use the same configured group that supplied the message. If AI generation fails, the sync does not advance its cursor, so the addressed message can be retried. Member notes are included only when **Include member notes in group-chat reply prompts** is enabled; the report-sharing switch does not enable chat sharing. Restoring a backup turns these reply settings off; disable the first setting at any time to stop creating or sending replies.

For live triggers instead of polling, keep BlueBubbles and Sunday Sidekick running on the same computer, then use **Settings → Live message webhook → Create webhook URL**. Copy the one-time URL into the BlueBubbles server's webhook settings and subscribe to `new-message` events. It contains a random bearer secret and is stored in the OS credential manager; if lost, regenerate it and replace the configured URL in BlueBubbles. **Revoke webhook** immediately invalidates the current URL. This endpoint is loopback-only, so a BlueBubbles server on another computer cannot call it; use polling in that setup. The event is only a trigger: the companion then fetches its bounded recent history from the configured chat and applies the normal deduplication, memory, AI-analysis, and retention controls. Webhook payload text is ignored. BlueBubbles documents webhook setup and event names in [REST API & Webhooks](https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks). With **Analyze imported conversations with AI** off, messages stay local. Turning that setting on sends each participant's new messages and up to 20,000 characters of recent group context to the selected AI runtime; sender phone numbers and email addresses are replaced with temporary labels in that context. Addresses that people include in their message text are not rewritten. Member context in generated reports remains controlled by its separate Settings option. Live message text follows the selected source-retention period and is pruned by each message timestamp.

To import inbound email, configure a Resend API key in Settings and enable inbound receiving for a domain in your Resend account. Open **Imports → Refresh Resend inbox** to fetch up to 50 recent message headers; choose **Import to memory** to fetch a selected body and add the sender-authored, unquoted text to that sender's local profile. Attachments are not downloaded. Resend credentials remain in the OS credential store, and the local app polls Resend only after an owner action; no webhook, public URL, or tunnel is needed. Imported email text stays local unless **Analyze imported conversations with AI** is enabled. The sender address is never selected as an outgoing recipient and no reply is sent automatically. Existing per-message retention removes received-email source entries by their received timestamp; profile notes remain for owner review. Local backups can contain imported source text and have separate deletion guidance.

Delivery attempts and provider receipts are saved with each report. A provider rejection is
shown as failed and can be retried after correcting settings. A timeout, connection loss,
provider error, or interrupted send is marked as uncertain because the provider may have
accepted it. Check the provider's delivery history before retrying; the dashboard requires
an explicit confirmation for an uncertain retry. Resend email requests use the same key
when retrying an uncertain attempt; [Resend retains idempotency keys for 24 hours and
requires the retry payload to match](https://resend.com/docs/dashboard/emails/idempotency-keys).
Keep the recipient and email thread details unchanged during that retry.
SMS requests do not currently use a provider idempotency key, so check Twilio's message
history before every retry.

For an existing Twilio Conversations group, paste its `CH…` Conversation SID in **SMS recipient or Twilio group SID**. Reports are sent to that existing conversation through the [Twilio Conversations Messages API](https://www.twilio.com/docs/conversations-classic/api/conversation-message-resource). The app does not create a conversation or add participants. On **Imports**, **Sync next page** imports up to 100 existing text messages in chronological pages; repeat it to continue through the chat. The first backfill does not trigger replies. Later polls scan pages from the beginning until they reach the saved latest message, so newly appended messages remain discoverable as the conversation grows. The page cursor and imported messages stay local, message IDs deduplicate repeats, and media attachments are not downloaded. AI analysis still requires its separate opt-in, and imported text follows the selected retention period. In Settings, owners can optionally enable automatic sync every 5, 15, 30, or 60 minutes for the configured group. Each poll imports one bounded page through the same cursor and retention path; it is off by default and pauses when member memory is disabled.

## MCP

See the [MCP client setup guide](mcp.md) for Claude Desktop, Cursor, and VS Code configuration examples, tool behavior, and troubleshooting.

## Production dashboard

`npm start` builds the workspaces and runs the API, which serves the built dashboard from `apps/dashboard/dist`.

## Platform service installation

From the repository directory, install a per-user background service with:

```sh
npm run service -- install
```

The command builds the app and registers a LaunchAgent on macOS, a systemd user unit on Linux, or a Task Scheduler logon task on Windows. The service starts at the next user sign-in and immediately after installation. It runs the local API without opening a browser; open `http://127.0.0.1:4173` yourself. Do not install a second instance while `npm start` or `npm run dev` is already using the port.

Manage it with `npm run service -- status`, `npm run service -- start`, and `npm run service -- stop`. **Stop app** in the dashboard also stops the service process; it remains installed and will start at the next sign-in. Remove the startup entry with `npm run service -- uninstall`. Logs are written to `~/.sidekick/logs/` and rotated on service startup.

The service refers to the current repository directory and installed Node.js runtime. Keep both in place while it is installed. To update the compiled app, pull the new version, run `npm ci` if dependencies changed, and then run `npm run service -- update`; this rebuilds the code and reinstalls/restarts the per-user service. This provides background operation from a source checkout; signed installers and a bundled runtime are still not included. The source service writes its process output under `~/.sidekick/logs/`. The desktop app stores structured API JSON events under `<selected data folder>/logs/api.log` and keeps three rotated copies; unstructured API stderr is discarded. Log fields use an allowlist and omit request bodies, prompts, credentials, and raw provider error text.
