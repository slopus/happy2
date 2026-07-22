# Happy (2) desktop

The desktop package is macOS-only. Electron owns the window, update lifecycle,
and child-process supervision; it does not run Happy or Rig inside Electron's
event loop.

On first run the user chooses one of two durable connection modes. Happy
remembers that choice and starts it automatically on later launches. Local mode
offers the sidebar instance switcher; the native macOS **Instances** menu remains
available in both modes and can switch a saved target or return to the chooser.

- **Local on this machine** starts one private loopback Happy server, managed by
  its own Rig runtime, with a single durable product user and no account or
  session records. Electron mints a process-local bearer capability for it and
  never writes that capability to settings or Keychain. This mode needs no
  configuration fields.
- **Connect to cloud** loads the existing Happy web app from the supplied HTTPS
  origin with `?desktop=1`. It runs in a separate sandboxed Electron window with
  no preload or native IPC bridge. Authentication cookies, Cloudflare Access,
  API requests, SSE, WebSockets, and uploads therefore remain same-origin.

The remembered settings file has an active-topology pointer and a topology
collection shape; each topology ID owns a distinct runtime root, so its
database, files, plugins, Rig, configuration, and logs never merge with another
topology's. Only the process-memory local capability crosses the narrowly scoped
preload bridge, and it cannot be replaced from the renderer. Cloud credentials
remain owned by the remote origin's browser session and never cross that bridge.

## Development

```sh
pnpm dev:desktop
```

The bundled renderer and preload bridge are used only by the local shell and
topology chooser. Cloud mode loads the remote deployment's ordinary
cookie-authenticated web app instead.

## Packaging

```sh
pnpm desktop:assets
pnpm --dir packages/happy2-desktop dist:mac
```

`desktop:assets` generates `icon.icns` from the source artwork before packaging.

Tags matching the root version trigger `.github/workflows/desktop-release.yml`.
The workflow builds native arm64 and x64 DMG/ZIP artifacts, signs with Developer
ID, notarizes with Apple, combines both ZIPs into `latest-mac.yml`, and publishes
everything to GitHub Releases for `electron-updater`.

Required repository secrets are `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. The release job fails closed
when any signing or notarization credential is absent.
