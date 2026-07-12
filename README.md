# Rigged

Rigged is a desktop work and coding app that evolves by adopting itself. This
pnpm monorepo delivers its shared Solid UI through a web app and an Electron
desktop app. Rigged is desktop-only; its UI must not assume mobile use or adapt
for mobile viewports.

## Packages

- `@rigged/app` contains the shared Solid component and its tests.
- `@rigged/web` imports `@rigged/app` and creates a browser build.
- `@rigged/desktop` imports `@rigged/app` in an Electron renderer and builds its
  Electron main process with Vite.
- `@slopus/rigged` is the publishable Fastify server and authentication service.
- `gym` is the isolated end-to-end testing environment. Its server harness runs
  black-box HTTP tests against disposable in-memory server instances; see
  [`packages/gym/README.md`](packages/gym/README.md) for usage.

## Requirements

- Node.js 24 or later (required by Portless)
- pnpm 10.28 or later

TypeScript is on the v7 release line throughout the workspace.

## Commands

```sh
pnpm install
pnpm dev                # Server + web app on stable Portless URLs
pnpm dev:desktop        # Electron app; set PORT=xxxx to choose its Vite port
pnpm --dir packages/gym test # Server end-to-end tests
pnpm check              # Type-check, test, and build every package
```

`pnpm build` emits browser files to `packages/web/dist` and an Electron renderer
plus main process to `packages/desktop/dist`. Start the latter after building
with `pnpm --filter @rigged/desktop start`.

`pnpm dev` runs the server and web app through Portless with interleaved logs.
The main checkout uses `https://rigged.localhost` and
`https://rigged-api.localhost`; linked worktrees automatically receive unique
branch-prefixed hostnames. The generated development TOML, database, files,
keys, and password pepper stay under `.context/dev` in each workspace.

Start only a local server with `pnpm dev:server`. Without a TOML file it enables
self-service password registration and login, creates its SQLite database under
`packages/server`, and generates durable local JWT keys plus password pepper in
`packages/server/.env` on first start. Pass `--config path/to/rigged.toml` (or
set `RIGGED_CONFIG`) to override the defaults; copy the example TOML before
production deployment. See the server package README for deployment and auth
configuration.

## Working convention

“Sync to main” means to commit the current work, rebase it onto the latest
`origin/main`, and push the resulting `HEAD` to `main` without force. If `main`
advances or the push is rejected, fetch and rebase again before retrying. Never
force-push `main`.
