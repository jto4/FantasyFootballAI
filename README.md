# Sunday Sidekick

Sunday Sidekick is a local-first fantasy football companion for league commissioners. It is designed to run on the commissioner's computer, keep league context on that machine, and send updates through integrations the commissioner configures.

**Public repository:** [github.com/jto4/FantasyFootballAI](https://github.com/jto4/FantasyFootballAI)

Clone and run the local app:

```sh
git clone https://github.com/jto4/FantasyFootballAI.git
cd FantasyFootballAI
npm ci
npm start
```

> **Showcase:** Sunday Sidekick is featured on Jimmy's project site at [sdeqst.app/projects/sunday-sidekick](https://www.sdeqst.app/projects/sunday-sidekick), with an overview, screenshots, and setup steps.

> Early development: desktop packages include a bundled runtime for Apple Silicon and Intel Macs, Windows, and Linux. The Apple Silicon Mac, Windows, and Linux builds have passed hosted or local smoke checks; Intel Mac packaging is now in the release workflow and needs hosted verification. Version tags assemble platform packages and a SHA-256 manifest into a draft GitHub Release for manual review; public releases, code signing, Windows/Linux interactive verification, and platform lifecycle checks remain open. See the [implementation plan](docs/implementation-plan.md) and [task status](docs/tasks.md) for current gaps before connecting accounts or enabling automatic delivery.

## Requirements

- Node.js 22.13 or newer and npm
- macOS, Windows, or Linux

## Start the development app

```sh
npm ci
npm run dev
```

Open the dashboard at `http://127.0.0.1:5173`. The API listens only on `127.0.0.1:4173`. Local state is stored in `.sidekick/state.sqlite` under the current user's home directory; an existing `state.json` is imported once and preserved as a migration copy. Provider secrets use the operating system credential store.

## Start the app

After installing Node.js and dependencies once, run:

```sh
npm start
```

This builds the dashboard and service, starts the local production service, waits for its health check, and opens the dashboard at `http://127.0.0.1:4173`. Keep the terminal window open while the app is running. Choose **Stop app** in the dashboard to stop scheduled work and the local service; the launcher then exits. Start it again with `npm start`.

To stop the API, scheduled tasks, and the combined development session, choose **Stop app** at the bottom of the dashboard sidebar and confirm. Start the development version again with `npm run dev` from the repository directory. The development API runs without a file watcher to support a clean shutdown; dashboard edits still hot-reload, while API edits require a restart.

To run from a source checkout in the background after sign-in, use `npm run service -- install`. Manage it with `npm run service -- status`, `npm run service -- start`, `npm run service -- stop`, and `npm run service -- uninstall`. After pulling a new version, run `npm run service -- update` to rebuild and restart the installed service. This registers a per-user LaunchAgent, systemd user service, or Windows logon task. See the [setup guide](docs/setup.md) for details and limitations; Node.js and the repository checkout must stay installed.

## Build a desktop installer

Desktop packages include the runtime and do not require Node.js on the computer where
they are installed. To build an installer for the current computer's operating system and
architecture, install the development requirements above and run:

```sh
npm ci
npm run desktop:make
```

The installer is written to `apps/desktop/out/make/`. Apple Silicon macOS packaging and the
bundled API/dashboard smoke check have been verified locally; the dedicated GitHub Actions
workflow builds Intel macOS, Windows, and Linux packages. Packages are currently
unsigned, and hosted Intel Mac verification is pending. This repository does not yet publish
user-ready releases. Desktop Settings
can enable launch at sign-in on macOS, Windows, and Linux and choose to start hidden in the
tray on the next sign-in. Closing the desktop window hides it to the system tray while scheduled tasks continue. Use the tray menu to reopen the
dashboard or choose **Quit Sunday Sidekick** to stop the local service. Headless background
startup from an OS service is available from a source checkout.

## Integrations

Platform access must be authorized by the league owner. Sleeper uses its public league API. ESPN private-league access requires user-supplied ESPN session credentials. Yahoo uses its owner-authorized OAuth flow after API access is approved. API and CLI AI providers, Resend, Twilio, image generation, and MCP are configured through provider adapters. Optional iMessage delivery and manual or opt-in interval history sync use an owner-managed BlueBubbles server running on a Mac. Resend inbound emails can be refreshed and imported by an owner without exposing a webhook. See [setup](docs/setup.md) for connection requirements.

Compatible local AI clients can use the stdio MCP server and reusable skill. MCP sending is a separate tool and stays disabled until the owner opts in through Settings. See the [MCP setup guide](docs/mcp.md) for Claude Desktop, Cursor, and Visual Studio Code configuration examples and the current desktop-app limitation.

See the [support matrix](docs/support-matrix.md), [setup guide](docs/setup.md), [troubleshooting guide](docs/troubleshooting.md), [desktop release installation guide](docs/release-install.md), [performance checks](docs/performance.md), [architecture](docs/architecture.md), [security policy](SECURITY.md), [contribution guide](CONTRIBUTING.md), and [MIT license](LICENSE).

## Development

See [AGENTS.md](AGENTS.md) for project conventions, [tasks](docs/tasks.md) for current work, and [memory](docs/memory.md) for durable project facts.
Use the [documentation guide](docs/README.md) to find the current plan, setup, support claims, decisions, and review records.
