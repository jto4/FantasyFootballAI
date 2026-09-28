# Repository Guide

## Project shape

- `apps/api`: localhost-only HTTP service, persistence, scheduling, and provider configuration.
- `apps/dashboard`: React dashboard served by Vite in development and built for static serving.
- `apps/desktop`: Electron shell, packaged runtime, and per-platform installer configuration.
- `packages/core`: shared domain types, league-aware analysis, and validation.
- `packages/integrations`: fantasy platform, AI, news, email, SMS, and MCP adapters.
- `docs`: architecture, setup, security, decisions, tasks, and durable project memory.

## Working agreements

- Keep platform and provider-specific behavior behind typed interfaces in `packages/integrations`.
- Keep secrets out of source, logs, exports, and ordinary configuration. Use the OS credential store.
- Bind the service to loopback only. Do not add remote access without an explicit threat model and authentication design.
- Validate imported data and remote responses at trust boundaries. Use request timeouts and bounded response sizes.
- Do not run automated security scans; the project owner explicitly excluded them. Continue ordinary manual code and security reviews.
- Use comments for security assumptions, non-obvious behavior, and trade-offs. Do not narrate straightforward code.
- Update `docs/tasks.md` and relevant architecture or decision notes when behavior changes.
- Use `docs/README.md` to find the documentation source of truth; keep durable guidance in `docs/memory.md` and current work/status in the task and support-matrix files.
- Before release, run the documented checks and complete both code and security review checklists.

## Commands

- `npm start`: build and launch the local production-style app; dashboard Stop app shuts it down.
- `npm run desktop:make`: build a self-contained installer for the current OS and architecture; requires the platform packaging tools and network access.
- `npm run service -- install|update|start|stop|status|uninstall`: manage the per-user background service from a source checkout.
- `npm run db:recover -- --check`: validate the local SQLite database and available safety backups; add `--restore-backup <filename>` to restore a validated copy after stopping the app.
- `npm run dev`: build shared runtime packages, then start local API and dashboard.
- `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`: validate code.
- `npm run build`: build shared packages before the API and dashboard so production imports resolve to compiled JavaScript.
- `npm run perf:smoke`: build and measure local API startup, representative state latency, dashboard assets, and API memory; see `docs/performance.md` for scope and release limitations.
- `npm run credentials:smoke`: build the API and round-trip a random temporary credential through the current OS credential store, then delete it; it does not touch saved Sidekick credentials.
- `npm run news:smoke`: check the configured ESPN, PFF, FOX Sports, CBS Sports, and Pro Football Talk RSS feeds directly; this is an opt-in live check, not part of CI.
