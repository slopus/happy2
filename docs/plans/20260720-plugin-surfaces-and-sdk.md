# Plugin Surfaces, SDK, and Collaborative Apps

## End result

Happy (2) plugins can publish durable, reactive product integrations without injecting arbitrary
HTML into native chrome:

- one installation can create multiple MCP App instances that appear in an **Apps** sidebar
  section; each user can hide, unhide, and order visible instances without changing shared plugin
  definitions;
- plugins can create, update, move, invalidate, and delete strictly typed contributions for user
  settings/profile sections, sidebar menus, chat menus, composer buttons and static/async menus,
  and message menus;
- definitions may target all users or one user and may optionally be limited to one chat;
- every native action is bound to one exact MCP tool, re-authorized as the current viewer, and may
  open its tool-linked MCP App in a standard dialog or full-window overlay;
- model exposure continues to use the standard `_meta.ui.visibility` rules. Happy does not add a
  second model-visibility flag;
- mounted apps reconcile on durable realtime invalidations without polling or iframe remounts;
- built-in plugins are normal `happy2-plugin-*` workspace packages written in TypeScript and React,
  built through a small `happy2-plugin-sdk`, validated by the existing package trust boundary, and
  assembled into the server distribution;
- a polished collaborative TODO plugin proves multiple list instances, a reactive list selector,
  native contributions, user preferences, current-viewer authorization, modal/full-window app
  presentation, and live updates between viewers.

Acceptance is verified by strict parser/unit coverage, black-box `happy2-gym` server and state tests,
the real built TODO package, Blueprint fixtures, and lifecycle/geometry tests in Chromium, Firefox,
and WebKit at DPR 2.

## Product and protocol model

- **Plugin package**: immutable installable artifact and manifest.
- **Installation**: one configured/running copy of a plugin package.
- **App resource**: a discovered, snapshotted `ui://` HTML resource using
  `text/html;profile=mcp-app`.
- **App instance**: a durable app-resource instantiation with a plugin-owned context payload; many
  instances may reuse one app definition. `sidebar` instances are destinations while `detached`
  instances exist only for modal/fullscreen opening.
- **Contribution**: a separate durable typed native control or menu at a Happy-owned placement.
- **Action binding**: the one installation-local MCP tool a contribution may call.
- **Audience**: all users or one user, optionally constrained to one chat where the placement
  supports chat context.
- **Preference**: per-user hidden/order presentation state; never an authorization grant.

Persistent product surfaces are a Happy vendor extension around standard MCP Apps; they do not
pretend to be standard MCP resource discovery. The extension is negotiated under an experimental
`happy2/surfaces` capability. App iframe communication remains the official MCP Apps lifecycle and
method set.

## Closed definition contract

App instances and contributions are intentionally separate entities: destinations have navigation
identity, reactivity, availability, and per-user preferences that controls do not need. Every
contribution has a stable plugin `externalKey`, `location`, required `title` and
`description`, audience, sort position, and revision. Definitions are one of:

- button: required monochrome asset, tool binding, optional `modal | fullscreen` app presentation;
- checkbox: checked value and tool binding;
- checkbox group: concrete options and selected option IDs plus tool binding;
- input: concrete value, optional placeholder, and tool binding;
- text: non-interactive native copy for a profile/settings section;
- static menu: bounded typed button items, each with its required monochrome asset;
- async menu: one bound resolver tool whose result is parsed as the same bounded typed menu union;
- sidebar menu: a bounded button/static-or-async-menu contribution, distinct from an app instance;
- profile/settings section: a bounded ordered array of text/button/checkbox/checkbox-group/input
  controls.

All nested actions also require stable ID, title, and description. Every button action requires a
declared transparent monochrome PNG. The built asset is exactly 40×40 px; nontransparent pixels are
normalized to uniform black while partial alpha retains antialiasing. Happy validates dimensions,
alpha, checksum, and package ownership and renders the authenticated blob URL as a `currentColor`
mask. Definitions cannot include HTML, CSS,
class names, scripts, remote image
URLs, arbitrary route strings, or arbitrary tool names supplied by the browser.

`text` controls are plain text only, capped at 2 KiB, and accepted only in profile/settings
sections. Contribution placements are the closed set `sidebarMenu`, `profileSection`,
`pluginSettings`, `chatMenu`, `composerIcon`, `composerMenu`, and `messageMenu`.

## Durable/server approach

Migration `0037_app_platform.sql` adds:

- `plugin_ui_assets`: validated package-owned monochrome PNG metadata and checksums;
- `plugin_app_instances`: installation/instance key, snapshotted `ui://` resource reference,
  title/description/icon, bounded context JSON, data and definition revisions, audience, optional
  chat intersection, `sidebar | detached` presentation, ordering, creator, sync sequence, and
  timestamps;
- `plugin_contributions`: installation/contribution key, closed placement/spec JSON, audience,
  optional chat intersection, ordering, revision, sync sequence, and timestamps;
- `app_presentation_preferences`: `(instance_id,user_id)` hidden/user-order state.

An action opens an existing installation-local app instance in `primary`, `modal`, or `fullscreen`
presentation. It does not create a transient second app-session model and cannot invent a resource
URI from the browser. Message-embedded inline apps remain the existing message-call mechanism.

All mutations use entity-first executor-first actions, top-level `withTransaction`, CUID2 IDs,
idempotent natural-key puts, current membership/profile rechecks, and durable sync events in the
same transaction. Optional expected-revision guards apply only to definition-shape changes.
`dataRevision` invalidation is always an unconditional server-side monotonic increment so concurrent
collaborators cannot lose an update. A `user` audience owner is always derived from the delegated
viewer capability, never plugin input. Uninstall, user deletion, and chat deletion cascade their
owned definitions and preferences.

Native actions and async menu resolution may invoke only the exact cached installation-local binding
whose standard visibility includes `app`. Model tool catalogs include only bindings whose visibility
includes `model`. Current actor/chat/message capabilities are minted for each interaction, expire
quickly, and are delivered only in protected MCP `_meta`, never app HTML or plugin-controlled
arguments.

## Package/build approach

`happy2-plugin-sdk` wraps, rather than forks, `@modelcontextprotocol/sdk` and
`@modelcontextprotocol/ext-apps`:

- `happy2-plugin-sdk/server`: `McpServer`/stdio startup, typed tool/app registration, host API client,
  surface builders, and current-context helpers;
- `happy2-plugin-sdk/app`: strict official `useApp`, host styles, tool input/result hooks, server
  calls, and surface invalidation context;
- `happy2-plugin-sdk/build`: typed config, TypeScript/React bundling, single-file app HTML, generated
  manifest/Dockerfile, normalized 40×40 action assets, a generated `package.json` containing
  `{ "type": "module" }`, asset copying, and package validation. Runtime output is bundled ESM
  `server.js` on Node 24 Alpine.

Each `happy2-plugin-*` package emits `dist/plugin`. The server assembly validates and copies these
outputs into `happy2-server/dist/plugins`; development and published runtime load that assembled
catalog. The current server-owned `plugins/` source directory is removed after all built-ins migrate.

## Implementation steps

### Task 1: Finalize the reviewed platform contract

- [x] Incorporate Fable's architecture memo and the official stable MCP Apps spec into this plan.
- [x] Resolve audience composition, native-action visibility, invalidation notification, and app
      instance semantics decisively.
- [x] Record security limits, validation bounds, and cleanup behavior.
- [x] Run a read-only major-model critique before schema implementation.

### Task 2: Build the plugin SDK and assembled package pipeline

- [x] Add `happy2-plugin-sdk` server/app/build entrypoints and strict public types.
- [x] Add configless TypeScript server and single-file React app builds.
- [x] Generate and validate plugin manifests, Dockerfiles, app resources, and monochrome assets.
- [x] Add server catalog assembly and update root/server/Docker packaging.
- [x] Migrate every existing built-in to a dedicated `happy2-plugin-*` package with no handwritten
      MCP wire protocol.
- [x] Add SDK/build/package validation tests and run them before Task 3.

### Task 3: Implement durable plugin surfaces and host authorization

- [x] Add migration/tables/indexes/check constraints in authoritative schema.
- [x] Add strict definition/audience/asset/result parsers under `plugin/impl`.
- [x] Add one documented public server action per durable create/update/move/invalidate/delete/list,
      preference, asset, and app-instance boundary.
- [x] Add host permissions and capability-only container routes with idempotency/revision guards.
- [x] Add current-viewer/chat/message authorization rechecks and short expiry to delegated tokens.
- [x] Add unit tests for parsers/actions and run architecture/type/unit checks before Task 4.

### Task 4: Add product APIs, MCP action execution, realtime, and gym coverage

- [x] Add authenticated GET/POST `/v0` routes for visible apps/contributions, preferences, assets,
      action/menu invocation, app calls, and resource reads.
- [x] Reuse snapshotted app resources and cached standard tool metadata; bind each request to its
      installation/surface/action/current viewer.
- [x] Add durable sync events/differences for global, user, and chat-scoped changes.
- [x] Add async menu bounds, tool timeouts/concurrency limits, invalidation rate limits, and audit
      fields.
- [x] Add black-box gym tests for scope, preferences, move/delete, app-only/model-only calls,
      current-viewer revocation, malformed menus, multiple apps, resource snapshots, and uninstall.
- [x] Run focused gym, server typecheck, and architecture checks before Task 5.

### Task 5: Build and prove the collaborative TODO plugin backend

- [x] Create `happy2-plugin-todos` with durable installation workspace data and atomic writes.
- [x] Implement semantic model tools and separate app-visible interaction/snapshot tools.
- [x] Create/invalidate sidebar instances and typed contributions through the SDK host API.
- [x] Prove two lists, a selector instance, two viewers, live invalidation, and meaningful text-only
      fallback through the real built plugin in gym.
- [x] Generate and inspect a new original plugin icon.
- [x] Run plugin build/check and focused real-package gym coverage before Task 6.

### Task 6: Implement client state surfaces

- [x] Add independently materialized navigation, chat-action, profile/settings, and app-instance
      stores with closed snapshots/actions/inputs.
- [x] Reconcile durable changes from sync differences and preserve unchanged references.
- [x] Add stale async-menu generation handling and exact app-handle lifetimes.
- [x] Extend the MCP host for standard display-mode/context-change behavior and negotiated Happy
      surface revision hints without remounting.
- [x] Add fake-server state tests plus real `gym/state` coverage before UI implementation.

### Task 7: Opus first-pass UI and polished TODO React apps

- [x] Have Claude Opus implement reusable `happy2-ui` app view/page/overlay, monochrome glyph,
      contribution controls/sections, plural sidebar app section, and typed chat/composer/message
      seams.
- [x] Add route-driven sidebar app pages and modal/full-window app overlays in `happy2-app` glue.
- [x] Add user plugin settings with hide/unhide/order plus profile/settings contribution sections.
- [x] Build the TODO selector/list React apps using the official SDK with a distinct, restrained,
      collaborative visual direction matching Happy's design system.
- [x] Add Blueprint fixtures and three-browser geometry/lifecycle/accessibility tests for every new
      component and insertion point.
- [x] Run UI/app typecheck, lint, and Chromium/Firefox/WebKit tests before review.

### Task 8: Major-gate review and repository verification

- [x] Codex reciprocally reviews the complete Opus UI and sends actionable findings back to the same
      persisted Opus session.
- [x] Claude Opus reviews the complete server/API/security diff read-only; Codex fixes server
      findings and resumes the same reviewer session until both agree.
- [x] Run CodeRabbit once on the complete feature and address critical/warning findings.
- [x] Run repository-wide format, lint, typecheck, architecture, build, focused gym/state/browser,
      and full practical test suites.
- [x] Update this plan so every delivered item and any known unrelated failure is recorded.

## Threat and abuse limits

- Only predeclared, snapshotted `ui://` resources can be opened; contribution JSON never carries
  executable markup or external URLs.
- Assets are bounded package-owned PNGs, validated for dimension/bytes/transparency/monochrome and
  served through authenticated Happy routes.
- App/contribution/menu/control counts, JSON bytes, string lengths, mounted app operations per actor,
  concurrent tool calls, and result sizes are bounded.
- Browser callers cannot choose installation, tool, resource, audience, viewer, chat, message, or
  protected metadata.
- App-only tools stay installation-local; cross-server calls remain blocked.
- Every invocation rechecks active profile, installation readiness, audience visibility, chat/message
  access, current cached visibility, and current surface revision where relevant.
- Per-user hide/order state cannot widen audience visibility.
- Removing an app, contribution, or installation closes/reconciles open UI, releases stores, and
  tears down affected iframes without retaining viewer-specific bootstrap data.

## Review provenance

The contract is being designed jointly from:

- Claude Fable's repository/spec architecture pass;
- Codex's server and security synthesis;
- independent GPT audits of the server schema/package runtime, official SDK/spec, and UI insertion
  points;
- Claude Opus as the eventual UI implementer and server reviewer.
