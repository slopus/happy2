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

## Requirements

- Node.js 22.16 or later
- pnpm 10.28 or later

TypeScript is on the v7 release line throughout the workspace.

## Commands

```sh
pnpm install
pnpm dev                # Web app at http://127.0.0.1:5173
pnpm dev --port 4321    # Web app on a chosen port
pnpm dev:desktop        # Electron app; set PORT=xxxx to choose its Vite port
pnpm check              # Type-check, test, and build every package
```

`pnpm build` emits browser files to `packages/web/dist` and an Electron renderer
plus main process to `packages/desktop/dist`. Start the latter after building
with `pnpm --filter @rigged/desktop start`.

Start a local server with `pnpm dev:server`. Without a TOML file it enables
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
