# Thin Local Rig Client with RigState

## Overview

Replace the desktop app's current private local Happy deployment with a thin client for the
user's normal system Rig installation. Local mode will not start `happy2-server`, create a Happy
database, manage users, expose Documents or Administration, run plugins, or require Docker.
Electron will connect to Rig's authenticated user-level daemon, while cloud mode will continue to
open the configured remote Happy web app in its sandboxed browser window.

The completed local experience will:

- detect a globally installed `rig` command through the user's login-shell environment;
- show a real, interactive local terminal when Rig is absent;
- require confirmation before automatically running `npm install --global @slopus/rig`;
- verify the installed command after the terminal command succeeds;
- connect to an existing normal Rig daemon or run `rig daemon start`, leaving it alive when Happy
  exits;
- list Rig sessions grouped by canonical working directory and keep the list live from Rig events;
- create, resume, rename, fork, and reset sessions through Rig's supported protocol;
- stream chat turns and support steering, aborting, user-input requests, permissions, models,
  effort, service tier, subagents, background activity, and session terminals;
- keep all local product state in a framework-independent, memory-only `RigState`;
- preserve the existing remote cloud-window behavior without introducing a local HTTP adapter.

Verification will cover command discovery, PTY lifecycle, daemon startup and reconnection, IPC
authorization and cleanup, immutable state identity, event reconciliation, session grouping,
streaming races, terminal behavior, and the rendered desktop lifecycle in Chromium, Firefox, and
WebKit where browser rendering is involved.

## Context

- Current local process ownership:
  `packages/happy2-desktop/src/main/desktopRuntime.ts`,
  `packages/happy2-desktop/src/main/serverChild.ts`, and
  `packages/happy2-desktop/src/serverProcess.ts` start a private Happy server and managed Rig.
- Current desktop contract:
  `packages/happy2-desktop/src/shared/desktopContract.ts`, preload IPC, and
  `packages/happy2-desktop/src/renderer.tsx` switch between bundled local rendering and a
  sandboxed remote cloud window.
- Current local UI incorrectly mounts the server-oriented `App` with an HTTP URL and bearer
  capability.
- Rig 0.0.45 publishes its CLI and protocol types, including sessions, global/session event
  streams, terminals, and `rig daemon start|stop|status|reload`. It does not export its reusable
  authenticated client implementation, so desktop imports the authoritative 0.0.45 types while
  isolating the wire-compatible 0.0.33 client runtime behind an internal adapter.
- Existing reusable chat, composer, activity, and terminal presentation belongs to `happy2-ui`;
  application packages may compose it but may not duplicate visual components.
- `happy2-state` is the repository's product-state package. `RigState` lives inside it as an
  independent direct-Rig state family; it must not translate Rig sessions into fake Happy chats,
  users, or sync areas.

## Chosen Architecture

### Electron main process

Electron owns every privileged local-machine operation:

- resolve the user's login shell and discover `rig` without trusting Electron's inherited `PATH`;
- inspect the installed version and normal Rig home/socket/token;
- start the normal daemon only when it is unavailable;
- host the install onboarding PTY and expose bounded input/resize/close operations;
- instantiate Rig's published protocol client and translate only serialization-sensitive values
  across preload IPC;
- close subscriptions, streams, and terminals when a renderer or local activation ends;
- never stop the normal daemon during application shutdown.

The renderer receives a narrow, context-isolated preload bridge. It never receives filesystem
paths to Rig credentials, bearer tokens, raw Node streams, shell-spawn authority, or arbitrary
command execution.

### RigState

Add `RigState` inside `packages/happy2-state`. It receives an already connected typed transport
supplied by the desktop composition root. Its public API follows the package's existing state
discipline without reusing server entities:

- immutable `get()` snapshots and synchronous typed subscriptions;
- independently materialized catalog, session list, session chat, activity, and terminal stores;
- closed entity-first action and output-event contracts;
- stable references for unchanged directory groups and sessions;
- one coarse subscription per rendered surface;
- event streams as delivery hints followed by authoritative Rig reads where required;
- no React, Electron, IPC, URLs, tokens, filesystem access, timers, or process globals.

### UI

The local UI is a separate desktop composition, not a conditional version of the full Happy app.
Reusable visuals are implemented and measured in `happy2-ui` first. The application surface shows
only:

- the local/cloud instance switcher and appearance control;
- directory groups with their Rig sessions and session status;
- new-session folder selection;
- the active session chat/composer;
- session controls, activity/subagents, permissions, and terminals.

There are no local profile, users, channels, documents, apps, plugins, administration, search
across server entities, or server onboarding surfaces.

## Development Approach

- Treat the non-UI Rig integration and the UI as explicit, independently reviewable boundaries.
- GPT models implement Electron main/preload behavior, `RigState`, and their non-visual tests.
- Stop for explicit backend/foundation approval before assigning UI implementation to Claude Opus.
- Claude Opus implements `happy2-ui` and `happy2-app`/desktop renderer composition after approval.
- Complete and test each task before moving to the next.
- Update this plan immediately when implementation scope changes.
- Backward compatibility with the obsolete private local Happy runtime is not required.

## Testing Strategy

- Unit-test command discovery, daemon state transitions, PTY lifecycle, IPC validation, and cleanup
  in `happy2-desktop`.
- Test `RigState` with a programmable fake Rig transport, including deterministic stream/reconcile
  races, failures, reference preservation, store lifetimes, and subscription cleanup.
- Add desktop integration tests with a fake local Rig daemon for install-present, daemon-stopped,
  reconnect, and session workflows.
- Add isolated browser rendering and geometry coverage for every new `happy2-ui` component in
  Chromium, Firefox, and WebKit.
- Add application lifecycle tests proving stable DOM identity, focus, selection, open panels, and
  cleanup across same-store updates.
- Run package typecheck, lint, format checks, and relevant builds after each boundary.

## Progress Tracking

- Mark completed items with `[x]` immediately.
- Add newly discovered tasks with a `+` prefix.
- Record blockers with a warning prefix.
- Do not begin UI implementation until the foundation approval checkpoint is complete.

## Implementation Steps

### Task 1: Establish the direct Rig protocol boundary in happy2-state

- [x] add RigState modules and public exports inside `packages/happy2-state`
- [x] define closed transport contracts for daemon health, catalogs, session summaries, session
      details, events, actions, activity, and terminal connections
- [x] define branded Rig session/terminal identifiers and serializable protocol projections
- [x] add a programmable fake Rig transport under `happy2-state/testing`
- [x] test transport contracts and fake behavior for success, failure, cancellation, and cleanup
- [x] run `happy2-state` tests, typecheck, lint, and format checks before Task 2

### Task 2: Replace private local-server startup with normal Rig discovery

- [x] remove the local topology's `happy2-server` child, generated TOML, private capability, private
      runtime root, and embedded Rig endpoint lifecycle
- [x] resolve `rig` using the user's login shell and validate it with `rig --version`
- [x] detect the normal daemon and run `rig daemon start` only when needed
- [x] retain cloud topology/window behavior and persist the local/cloud choice
- [x] leave the normal daemon running on topology changes and application shutdown
- [x] test installed, missing, stopped, stale, incompatible, failed-start, retry, and shutdown cases
- [x] run desktop tests, typecheck, lint, and format checks before Task 3

### Task 3: Add the confirmed installation terminal

- [x] add a constrained Electron-owned PTY using the user's login shell and normal environment
- [x] expose typed preload operations for opening, confirming installation, input, resize, exit,
      and disposal without arbitrary spawn capability
- [x] require renderer confirmation before writing
      `npm install --global @slopus/rig` to the terminal
- [x] keep the terminal interactive for password, npm, and shell prompts
- [x] re-run command and daemon detection after a successful install exit
- [x] preserve output and actionable retry state after installation failure
- [x] test confirmation gating, command escaping, streaming output, resize, exit, retry, renderer
      disposal, and app shutdown cleanup
- [x] run desktop tests, typecheck, lint, and format checks before Task 4

### Task 4: Implement RigState session catalog and grouping

- [x] implement the root `RigState` lifetime and on-demand directory/session-list store
- [x] project authoritative Rig session summaries into stable directory groups keyed by canonical
      `cwd`
- [x] subscribe once to global Rig events and reconcile affected session projections
- [ ] implement create, rename, fork, and reset actions supported by the current Rig protocol
      ⚠ Create, fork, and reset are implemented. Rename is blocked because the current Rig 0.0.45
      protocol exposes no authoritative rename operation.
- [x] define deterministic ordering for directories and sessions
- [x] test grouping, canonical paths, ordering, immutable identity, external changes, reconnect,
      action races, failures, and store disposal
- [x] run RigState tests, typecheck, lint, and format checks before Task 5

### Task 5: Implement RigState live session chat

- [x] implement an on-demand session store with messages, status, model, effort, service tier,
      permission mode, pending user input, and errors
- [x] reconcile initial session state and consume resumable session event streams
- [x] implement submit, steer, abort, answer-input, model, effort, service-tier, and permission
      actions
- [x] preserve message and session references when authoritative fields do not change
- [x] recover from dropped streams using event cursors and authoritative reads
- [x] test streaming, reconnection, duplicate events, stale responses, concurrent actions, errors,
      cancellation, and store disposal
- [x] run RigState tests, typecheck, lint, and format checks before Task 6

### Task 6: Implement the remaining complete-client RigState activity and terminals

- [x] implement on-demand subagent/background-activity projections
- [x] implement terminal create, list, attach, reconnect, input, resize, scrollback, stop, and cleanup
- [x] adapt Rig's duplex terminal connection at the Electron boundary without exposing Node streams
      to the renderer
- [x] reuse the existing Ghostty terminal driver protocol where its contracts match
- [x] test activity reconciliation, terminal lifecycle, reconnect, binary framing, concurrent
      terminals, failures, and cleanup
- [x] run RigState and desktop tests, typecheck, lint, and format checks

### Task 7: Basic foundation approval checkpoint

- [x] run all non-UI package tests and checks relevant to `happy2-desktop` and `happy2-state`
- [x] inspect the complete non-UI diff for security, process ownership, resource cleanup, and
      protocol correctness
- [x] present observable behavior, test evidence, known limitations, and API contracts to the user
- [x] obtain explicit user approval before beginning Task 8

### Task 8: Build reusable local-client UI components

- [x] add isolated `happy2-ui` components for Rig installation onboarding, confirmed terminal
      execution, directory/session navigation, session controls, and local empty/error states
- [x] reuse existing chat, composer, activity, model, permission, and terminal components where
      their contracts match direct Rig semantics
- [x] add every new component and state to Blueprint
- [x] add Chromium, Firefox, and WebKit geometry, keyboard, focus, overflow, and screenshot tests
- [ ] run `happy2-ui` tests, typecheck, lint, and format checks before Task 9

### Task 9: Compose the local Rig desktop surface

- [x] add one coarse React external-store adapter per materialized RigState surface
- [x] replace the local renderer's server-oriented `App` mount with the dedicated Rig client
      composition
- [x] wire onboarding confirmation and PTY controls through the preload bridge
- [x] wire directory/session navigation, creation folder picker, chat actions, activity, and
      terminals
- [x] keep cloud mode's remote sandboxed web-app window unchanged
- [x] remove local-only profile, Documents, Apps, Administration, plugins, and Happy server routes
- [ ] test exact DOM identity, focus, selection, scroll, open controls, store replacement, and
      cleanup across Rig notifications
- [ ] run app and desktop tests, typecheck, lint, and format checks before Task 10

### Task 10: Remove obsolete private-local packaging

- [ ] stop packaging the Happy server and built-in plugins solely for desktop local mode
- [ ] remove obsolete server worker, TOML generation, private capability IPC, assets, dependencies,
      tests, and documentation
- [ ] ensure the desktop package contains the Rig protocol/runtime dependencies required by the
      direct client without embedding a second managed Rig home
- [ ] verify arm64 and x64 packaging configuration and native PTY dependencies
- [ ] test production-path resolution and packaged application startup
- [ ] run desktop build and packaging smoke checks

### Task 11: Final verification and documentation

- [ ] verify every acceptance criterion in the Overview
- [ ] run repository formatting
- [ ] run all relevant package tests, typechecks, lint checks, and builds
- [ ] run desktop browser lifecycle coverage in Chromium, Firefox, and WebKit
- [ ] manually verify missing-Rig onboarding, installation confirmation, normal daemon reuse,
      grouped sessions, streaming chat, terminals, app restart, and cloud switching
- [ ] update root and desktop README documentation
- [ ] record any intentionally deferred complete-client controls in this plan

## Technical Details

### Installation and command discovery

- Spawn the user's configured login shell with a bounded command that prints a machine-readable
  `command -v rig` result; do not run untrusted renderer-provided shell text.
- Validate the resolved executable by spawning it directly with `--version`.
- The install terminal displays the fixed command
  `npm install --global @slopus/rig`, but writes it only after explicit confirmation.
- Installation success means a newly resolved `rig` executable passes version validation and its
  daemon protocol is compatible. A zero npm exit code alone is insufficient.

### Daemon ownership

- Connect through Rig's normal home, socket, and token resolution.
- Use Rig's supported client/daemon helpers rather than copying its authentication protocol.
- Do not require or enable Rig's optional durable global event queue. Load the complete directory
  when a connection is established; if a session connection is lost, rebuild the local Rig client
  and reload every surface authoritatively.
- Seed each session event subscription from an authoritative session read before opening it. An
  undefined cursor replays the session's complete history and can exhaust the daemon on a large
  normal Rig home.
- Starting the daemon is idempotent. If another process wins the race, connect to the resulting
  daemon.
- Never kill, reload, or replace a healthy daemon without an explicit compatibility reason and
  user confirmation.
- Closing Happy disposes its clients and streams but leaves the user-level daemon alive.

### IPC security

- Validate every renderer request against closed schemas in main.
- Installation IPC can execute only the fixed install command.
- Rig action IPC accepts typed entity IDs and concrete action inputs, never paths to credentials,
  URLs, arbitrary HTTP methods, or shell commands.
- Associate streams and terminals with the requesting web contents and dispose them on navigation,
  crash, topology replacement, or close.

### Session grouping

- Group by canonical absolute `cwd`; retain the original path for display when useful.
- Use the directory path as group identity and Rig session ID as session identity.
- Sort groups by most recent contained-session activity, then normalized path; sort sessions by
  recent activity, then stable ID.
- Missing or inaccessible directories remain visible because Rig history is authoritative.
- Session deletion is intentionally absent until Rig exposes an authoritative delete operation;
  local UI state must never pretend that a durable Rig session was deleted.

## Post-Completion

### Manual verification

- Test installation with npm configured through nvm, Homebrew Node, Volta, and a system Node.
- Verify authentication and permission prompts from supported providers inside a local session.
- Confirm an independently started terminal Rig session appears without restarting Happy.
- Confirm Happy can close and reopen without interrupting active Rig work.
- Confirm cloud cookies and browsing remain isolated from the local preload bridge.

### External dependency follow-up

- If the published Rig client lacks a stable API required by `RigState`, add that API to Rig first
  and pin the minimum compatible Rig version before shipping the desktop change.
- Signing and notarization must include every native PTY and terminal dependency for both arm64 and
  x64 artifacts.
