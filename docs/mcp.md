# Connect an MCP client

Sunday Sidekick includes a local stdio MCP server and a reusable skill. The server reads
league data from the local API and can create reviewable report drafts. It can send a selected
existing draft only after the owner explicitly enables MCP sending in Settings.

## Start the local API

For the current source-checkout setup, install dependencies and start the app from the
repository root:

```sh
npm ci
npm start
```

Keep the app running while the MCP client is using it. The MCP server defaults to
`http://127.0.0.1:4173`. For a different local API port, set `SIDEKICK_API_URL` in the MCP
client configuration. The API only accepts loopback addresses; do not expose it to a
network interface.

## Configure an MCP client

The client launches the server over standard input/output. Replace the repository path with
the absolute path to your clone. Do not add API keys to this configuration; Sunday Sidekick
keeps provider credentials in the operating system credential store.

### Claude Desktop and Cursor

Add the following entry to the client's MCP configuration, preserving any existing servers:

```json
{
  "mcpServers": {
    "sunday-sidekick": {
      "command": "npm",
      "args": ["--silent", "--prefix", "/absolute/path/to/FantasyFootballAI", "run", "mcp"],
      "env": {
        "SIDEKICK_API_URL": "http://127.0.0.1:4173"
      }
    }
  }
}
```

On Windows, use `cmd` as the command and put `/c`, `npm`, `--silent`, `--prefix`, the clone
path, `run`, and `mcp` in `args`; keep the path with spaces as one JSON string. The `--silent`
flag suppresses npm's normal startup banner, which would otherwise corrupt the MCP stdio
protocol. Restart or reload the MCP client after saving its configuration. See the official [Claude Desktop MCP guide](https://docs.anthropic.com/en/docs/mcp)
and [Cursor MCP guide](https://docs.cursor.com/context/model-context-protocol) for their
current configuration locations and controls.

### Visual Studio Code

VS Code's `.vscode/mcp.json` format uses a top-level `servers` object and a `type` field:

```json
{
  "servers": {
    "sunday-sidekick": {
      "type": "stdio",
      "command": "npm",
      "args": ["--silent", "--prefix", "/absolute/path/to/FantasyFootballAI", "run", "mcp"],
      "env": {
        "SIDEKICK_API_URL": "http://127.0.0.1:4173"
      }
    }
  }
}
```

Use **MCP: List Servers** to start the server and inspect its output. See the official
[VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

## Use the skill and tools

Install or reference [`skills/sunday-sidekick/SKILL.md`](../skills/sunday-sidekick/SKILL.md)
in the AI client that will use the tools. The skill explains which tools to call, how to
preserve news citations, and how to handle missing or untrusted data.

Available tools:

- `list_leagues` and `get_league` inspect connected league snapshots.
- `get_football_news` returns cached NFL news with source links.
- `list_reports` returns report metadata without report bodies; `get_report` reads one
  selected report and its citations.
- `create_report_draft` creates one of the supported report types for a selected league.
  It always requests a draft and never sends email, SMS, or iMessage.
- `send_report_draft` sends one existing draft through the configured report channel. It is
  disabled by default and requires **Allow MCP clients to send reports** in Settings. Each
  explicit tool call approves one send. If delivery is uncertain, MCP refuses a retry; inspect
  provider status and confirm any retry in the dashboard. Email thread replies also remain a
  dashboard action.

### Packaged desktop app

The packaged app supports MCP without requiring Node.js or npm. Start Sunday Sidekick first,
then configure the MCP client to run the installed app executable with `--sidekick-mcp`:

```json
{
  "mcpServers": {
    "sunday-sidekick": {
      "command": "/absolute/path/to/Sunday Sidekick",
      "args": ["--sidekick-mcp"]
    }
  }
}
```

Use the installed executable path from the app shortcut or application bundle. On macOS,
the executable is inside `Sunday Sidekick.app/Contents/MacOS/`. The MCP helper checks the
private local service-port file and health endpoint, then connects to the existing desktop
API. It never starts a second API or scheduler. If the app is not running, start it before
connecting; an absent or stale endpoint produces a startup error on standard error. If the
desktop was launched with `SIDEKICK_USER_DATA_DIR`, provide the same value to the MCP client.

## Troubleshooting

- If tools cannot reach the API, confirm the app is running and that
  `SIDEKICK_API_URL` points to its local port.
- If the client cannot start the command, confirm `npm ci` completed and `npm` is on the
  client's PATH. Some desktop clients launched from Finder or the Start menu do not inherit
  the same PATH as a terminal; configure an absolute npm path when needed.
- MCP diagnostics use standard error so they do not corrupt the protocol stream on standard
  output.
