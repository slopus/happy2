<div align="center">

<p><img src="./.github/logo.png" alt="Happy (2)" width="640" /></p>

<h3>A self-hosted, Slack-like workspace where people and coding agents build together.</h3>

<p>
  Following the success of <a href="https://github.com/slopus/happy">Happy</a>,
  Happy (2) is a ground-up next chapter built on the lessons learned from
  bringing coding agents into real daily workflows. It brings conversations,
  files, workspaces, and coding agents into one focused web and desktop app.
</p>

<p>
  Built by the authors of
  <a href="https://github.com/slopus/happy">Happy</a> and
  <a href="https://github.com/slopus/rig">Rig</a>.
</p>

<p>
  <a href="#quick-start">Quick start</a> ·
  <a href="#why-happy-2">Why Happy (2)?</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#project-components">Project components</a> ·
  <a href="packages/happy2-server/README.md">Server docs</a>
</p>

</div>

Happy (2) is a self-hosted, Slack-like work and coding app that evolves by
adopting itself. It gives teams and coding agents a shared home instead of
scattering work across chat windows, terminals, file browsers, and one-off
dashboards.

The same React application runs in the browser and in Electron. A small Fastify
server provides authentication, durable collaboration state, files, realtime
updates, and agent execution. The complete server and web app are also bundled
as one `happy2` package.

## Quick start

Happy (2) requires Node.js 24 or later. Start the complete app with one command:

```sh
npx happy2
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser. Happy (2)
stores its database, files, generated secrets, agent workspaces, and private Rig
runtime under `.happy2` in the directory where you start it.

## Why Happy (2)?

- **People and agents share the same workspace.** Conversations, threads,
  files, approvals, and agent activity live together instead of becoming a pile
  of disconnected tools.
- **Self-hosted by design.** Run the complete app with one command and keep its
  database, files, secrets, agent workspaces, and Rig runtime under your control.
- **Web and desktop.** Use the same full collaboration experience in a browser
  or through the Electron app.
- **Reactive by default.** Realtime events reconcile durable state so focused
  surfaces stay current without refresh buttons.
- **Flexible deployment.** The backend can run as an all-in-one server or as a
  separately deployed authentication service.
- **Built to adopt itself.** Happy (2)'s own server, state layer, component
  workbench, browser tests, and coding-agent workflows are part of the product's
  development loop.

## How it works

Happy (2) keeps the product boundaries explicit:

1. `happy2-server` owns authentication, persistence, files, collaboration, and
   agent execution.
2. `happy2-state` turns authenticated HTTP and realtime transports into
   immutable, independently materialized surface stores.
3. `happy2-ui` owns the reusable visual system and its cross-browser blueprint
   coverage.
4. `happy2-app` composes product state and UI for both the web and Electron
   entry points.

Local development data stays under `.context/dev` in each workspace, including
the generated TOML configuration, SQLite database, files, signing keys, and
password pepper.

## Project components

- **[Happy App](packages/happy2-app)** — Shared React application and product
  composition.
- **[Happy UI](packages/happy2-ui)** — Reusable design system, component
  workbench, and cross-browser visual coverage.
- **[Happy State](packages/happy2-state)** — Framework-independent client state
  and realtime reconciliation.
- **[Happy Web](packages/happy2-web)** — Browser entry point and production web
  build.
- **[Happy Desktop](packages/happy2-desktop)** — Electron renderer and desktop
  main process.
- **[Happy Server](packages/happy2-server)** — Fastify server, authentication
  service, persistence, and agent runtime.
- **[Happy Gym](packages/happy2-gym)** — Isolated black-box server, state, and
  browser testing environment.

## Development

The repository uses pnpm 10.28 or later. For local development:

```sh
pnpm install
pnpm dev                                 # Server + web app
pnpm dev:desktop                         # Electron app
pnpm dev:server                          # Server only
pnpm --dir packages/happy2-gym test      # End-to-end tests
pnpm check                               # Format, lint, test, coverage, build
```

For production server configuration, authentication modes, and deployment, see
the [Happy Server documentation](packages/happy2-server/README.md).
