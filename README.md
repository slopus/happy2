# Happy (2)

Happy (2) is a desktop work and coding app that evolves by adopting itself. This
pnpm monorepo delivers its shared Solid UI through a web app and an Electron
desktop app. Happy (2) is desktop-only; its UI must not assume mobile use or adapt
for mobile viewports.

## Packages

- `happy2-app` contains the shared Solid component and its tests.
- `happy2-web` imports `happy2-app` and creates a browser build.
- `happy2-desktop` imports `happy2-app` in an Electron renderer and builds its
  Electron main process with Vite.
- `happy2-server` is the Fastify server and authentication-service package.
- The root `happy2` package bundles the server and built web app into the complete
  distributable.
- `happy2-gym` is the isolated end-to-end testing environment. Its server harness runs
  black-box HTTP tests against disposable in-memory server instances; see
  [`packages/happy2-gym/README.md`](packages/happy2-gym/README.md) for usage.

## Requirements

- Node.js 24 or later (required by Portless)
- pnpm 10.28 or later

TypeScript is on the v7 release line throughout the workspace.

## Commands

```sh
pnpm install
pnpm dev                # Server + web app on stable Portless URLs
pnpm dev:desktop        # Electron app connected to the server from pnpm dev
pnpm --dir packages/happy2-gym test # Server end-to-end tests
pnpm check              # Type-check, test, and build every package
```

`pnpm build` emits browser files to `packages/happy2-web/dist` and an Electron renderer
plus main process to `packages/happy2-desktop/dist`. Start the latter after building
with `pnpm --filter happy2-desktop start`.

`pnpm dev` runs the server and web app through Portless with interleaved logs.
The main checkout uses `https://happy2.localhost` and
`https://happy2-api.localhost`; linked worktrees automatically receive unique
branch-prefixed hostnames. The generated development TOML, database, files,
keys, and password pepper stay under `.context/dev` in each workspace.

With `pnpm dev` running, start `pnpm dev:desktop` in another terminal. It resolves
the same workspace-specific `happy2-api` URL and passes it to the Electron
renderer. Portless assigns the renderer an available workspace-specific port;
set `PORT=xxxx` only when you need to choose it explicitly.

Start only a local server with `pnpm dev:server`. Without a TOML file it enables
self-service password registration and login, creates its SQLite database under
`packages/happy2-server`, and generates durable local JWT keys plus password pepper in
`packages/happy2-server/.env` on first start. Pass `--config path/to/happy2.toml` (or
set `HAPPY2_CONFIG`) to override the defaults; copy the example TOML before
production deployment. See the server package README for deployment and auth
configuration.

## Publishing

Authenticate with npm once using `pnpm login`, then publish the all-in-one `happy2`
from a clean, up-to-date `main` branch:

```sh
pnpm release 0.1.0
```

The release command also accepts semantic version bumps such as `patch`,
`minor`, and `major`. It checks the branch, working tree, and npm
authentication; runs the full workspace check; creates the release commit and
tag; previews the package; pushes to `main`; and publishes it publicly. If
publishing is interrupted after the tag is created, rerun the command with the
exact version to resume safely.

## Working convention

“Sync to main” means to commit the current work, rebase it onto the latest
`origin/main`, and push the resulting `HEAD` to `main` without force. If `main`
advances or the push is rejected, fetch and rebase again before retrying. Never
force-push `main`.
