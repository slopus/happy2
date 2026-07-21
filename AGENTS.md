# Agent Instructions

## Project

Happy (2) is a desktop work and coding app that evolves by adopting itself. It is
desktop-only: do not assume mobile use, add mobile-specific behavior, or adapt
layouts for mobile viewports.

## Feature development workflow

Treat each feature as one atomic, independently mergeable change, not as the
lifetime of a Conductor workspace. A worktree may contain only one unmerged
feature at a time. Do not begin the next feature until the current feature has
been pushed or merged to `main`; obtain review when its scope or risk warrants
it under the review workflow below.

After that merge, reuse the same workspace/worktree when convenient. It does
not need to be recreated, checked out directly on `main`, or have a branch tip
identical to `origin/main` before work starts. The next feature must remain a
separate, reviewable diff and must be rebased onto the latest `origin/main`
during the normal sync-to-main workflow. Create another Conductor workspace
only for parallel work or when another feature must begin while the current one
is still unmerged.

Build each feature in isolation, with an explicit boundary between its server
and UI work. Do not mix unrelated features into the same implementation.

## Review workflow

Review is not required for every edit. Reserve Claude Opus review for sizable
or critical changes: security or authorization behavior, durable data or
migrations, server API contracts, complex concurrency or synchronization,
substantial UI flows, or broad/high-risk diffs. Opus is deliberately slow, so
do not invoke it early, before the implementation and relevant tests are
complete, or for a small, isolated, low-risk change.

For a quick independent review, ask GPT Luna at high effort instead. Use that
option for focused, low-to-medium-risk diffs when a fast second look is useful.
Routine mechanical, small, and low-risk changes may rely on the implementer's
own verification and relevant automated checks without a separate review.

When an Opus review is warranted:

1. Finish the isolated implementation and its required tests, then review the
   complete task diff with Claude Opus at medium effort and streaming/verbose
   output. Do not use `ultrareview`/Ultracode for this gate.
2. Address every actionable finding, rerun the relevant checks, and resume the
   same persisted Opus session with a concrete account of the fixes.
3. Repeat until both Codex and Opus explicitly agree that no task-blocking issue
   remains. Never interrupt, terminate, cancel, or replace a running Claude
   reviewer merely because it is slow or has not produced intermediate output.
4. Run repository-wide `pnpm format`, then the final required checks and sync
   the task to `main` using the workflow below. Only after that merge may the
   same worktree begin the next feature.

For Claude-owned UI tasks that warrant review, Codex performs the reciprocal
review and Opus resumes the same session to address actionable findings. For
GPT-owned server tasks, Opus is a read-only reviewer and must not implement
server behavior.

Backward compatibility is not a default product requirement. Prefer the clean
new-server/backend and UI design unless the current task explicitly requires a
compatibility or data-preservation contract; do not add legacy branches solely
to preserve obsolete behavior.

## Model ownership

Model ownership is strict:

- GPT models, and only GPT models, implement the server behavior and its `gym`
  coverage.
- Claude Opus implements the UI portion only after the server behavior is
  complete and the user has explicitly approved the backend.

Development starts with the server feature. Design its API and data model
carefully, implement it, and prove its observable behavior with thorough `gym`
tests. Then stop and ask the user to review and approve the backend. Do not
begin or hand off any UI work until that approval is given. Favor simple,
durable boundaries that will not create foreseeable maintenance or
compatibility problems. Do not add abstractions, options, or behavior solely
for hypothetical future use cases; solve the feature currently being built
well.

## Design system

Before creating or changing any user interface, read and follow `DESIGN.md`.
It is the authoritative contract for component ownership, blueprint coverage,
layout dimensions, icon preparation, optical alignment, and cross-browser
rendering tests. Reusable visual components belong in `happy2-ui`; application
packages may only compose them and supply product state and event handlers.

Use flexbox for layout almost all of the time — it is the default for every row,
column, stack, toolbar, and centered box. Use another mechanism (CSS Grid, and
only for a genuine two-dimensional grid) solely when flexbox cannot express the
layout at all; never fall back to floats, `inline-block` hacks, or layout tables.
See `DESIGN.md` → "Layout with flexbox".

## Generated images

Whenever a feature needs a new raster image, generate an original image for
that feature. Never copy or reuse another feature's image as a placeholder.
Every new built-in plugin must include its own newly generated `plugin.png`
whose visual identity matches that plugin.

## Reactivity

Every surface must stay current on its own. A manual "Refresh" button (or any
control whose only job is to re-fetch) is not allowed — if the user has to ask
for fresh data, the screen is broken. Data updates arrive one of two ways:

- Full reactivity via the realtime SSE stream. The primary, focused surface
  reconciles live: subscribe to sync events and reconcile durable state through
  the `happy2-state` difference APIs (realtime events are delivery hints, never
  durable state — see "Client state principles"). This is the default; prefer it.
- Polling only for a secondary surface that has no realtime channel yet. While
  that surface is on screen, poll every few seconds; stop polling the moment it
  unmounts or is no longer visible so a backgrounded view does no work. Polling
  is a stopgap — if a surface matters enough to keep open, give it SSE.

Asynchronous server work (a build, an export, a job) must stream its status
changes to the UI through the same mechanism, not wait for a user-initiated
reload.

## React UI reactivity and identity

React surfaces render immutable `happy2-state` snapshots. Keep component and
DOM identity stable across ordinary store notifications so focus, selection,
scroll, measurements, and local UI state survive updates.

- A framework adapter for a `happy2-state` surface owns one coarse
  `useSyncExternalStore` subscription per materialized store. Repeated rows must
  not subscribe to the product store individually.
- Treat a change of store identity as an explicit lifetime boundary. A changing
  React `key` may remount a tree for a genuinely new store. Notifications from
  the same store must retain existing component and DOM identities.
- Read changing values from props or the current external-store snapshot. Do
  not mirror props or product snapshots into component state, and do not use an
  effect to keep duplicated state synchronized.
- Let React Compiler handle ordinary render memoization. Add manual memoization
  only for a measured identity or performance contract, and document that
  contract beside the code.
- Product state belongs in `happy2-state`. `happy2-app` may not use `useState`
  or `useEffect`; reusable `happy2-ui` components may own narrowly scoped local
  UI state, but may not use `useEffect`. Use an event handler, external-store
  subscription, ref callback, or render-time derivation instead. An imperative
  browser integration may use `useLayoutEffect` only when no declarative or
  event-driven boundary exists, with complete cleanup.
- Key reorderable entity collections by stable entity ID, never by array index.
  Preserve references for unchanged entities; changing one field must update
  its row without replacing that row's DOM node or its siblings.
- Thousands of repeated rows may have normal render bindings, but they must not
  mirror authoritative product state, start transport work, or own server
  synchronization. One surface subscription fans out through immutable props.
- Treat conditional branches and changing keys as potential mount/disposal
  boundaries. Do not place focused controls or stateful panels behind a
  changing key unless resetting them is the product behavior.
- Virtualize collections that can contain thousands of entries. Efficient
  reconciliation does not make thousands of simultaneous DOM nodes, layout
  boxes, images, or observers free.
- Browser tests for a store adapter or repeated-row projection must prove the
  lifecycle contract, not only visible text: assert child mount count,
  subscription cleanup, exact DOM-node identity, `document.activeElement`,
  selection/local value where relevant, and open local panels or menus across
  local and authoritative store updates. Run those tests in Chromium, Firefox,
  and WebKit.

## Sync to main

When asked to “sync to main,” commit the current work, fetch and rebase it onto
the latest `origin/main`, then push the resulting `HEAD` to `main` with a normal
non-force push. If `main` advances or the push is rejected, fetch, rebase again,
and retry until the push succeeds. Never force-push `main`.

Keep sync validation proportional to the packages that changed. When a diff is
client-only and limited to `happy2-app`, `happy2-state`, and `happy2-ui` (plus
their docs, assets, or development tooling), run only the package-level checks
that are directly relevant; do not run server gym, server coverage, or another
repository-wide test pass solely because the work is being synced. These UI and
client-state changes cannot corrupt durable server data or migrations. If the
user explicitly asks to sync without tests, skip tests and limit the sync gate
to formatting and non-test repository/diff checks before committing and
rebasing. Any server, schema, migration, authentication, or durable-state change
still follows the full server validation requirements above.

## Server principles

`happy2-server` is a small desktop-app backend that may run as the complete
server or as a separately deployed authentication service. Its behavior is
configured from a TOML file; do not add deployment-specific switches to code.

Server behavior must be tested end to end in `gym`, the repository's isolated
black-box testing environment. Add or update coverage under
`packages/happy2-gym/tests/server` whenever changing server HTTP behavior; unit tests
do not replace this end-to-end coverage. Name each test file after the observable
behavior it proves so the directory reads like an index of supported workflows;
do not use generic names such as `server.test.ts`, `integration.test.ts`, or
issue numbers. Read `packages/happy2-gym/README.md` before writing gym tests for the
full naming, organization, harness, and lifecycle instructions.

- Keep `/` deliberately minimal. Versioned, useful HTTP APIs live under `/v0`.
- Exactly one authentication mechanism is enabled in TOML at a time: OIDC,
  password, or email magic links. SMTP credentials always come from environment
  variables, never the TOML file.
- Session JWTs are RS256 signed and intentionally long lived, but they are not
  self-validating authority. Every authenticated request must confirm that the
  session row still exists and is active in the shared Drizzle/SQLite database.
- Do not make process-local state authoritative. Multiple server instances may
  issue and validate sessions concurrently; use database transactions/locks for
  one-time tokens and migrations.
- Preserve request-security telemetry for each issued, refreshed, and revoked
  session: proxy-aware client IP, provider location headers when supplied,
  device, app version, and user agent. Only trust forwarded headers through the
  configured proxy boundary.
- Password hashes retain a unique random salt per user and use a server-wide
  pepper. The pepper and JWT key pair may come from the environment; otherwise
  they are generated once and persisted to the `.env` beside the TOML file.
- Prefer CUID2 for every newly generated identifier, including accounts, users,
  sessions, files, and other persisted records.
- Keep every Drizzle table in the single authoritative
  `packages/happy2-server/sources/modules/schema.ts` file. Persistence behavior
  must not use `Database`, `*Repository`, store superclasses, or another
  initialized database facade.
- Put each durable server action in its own product-module file. The lower-camel
  filename and exported async function must match exactly, with the entity first
  and operation second (`userCreateProfile`, never `createUserProfile`). Pass the
  `DrizzleExecutor`/transaction as the first argument, followed only by explicit
  plain dependencies and input values.
- Compose action transactions with `withTransaction`: it opens and retries one
  complete top-level SQLite transaction, while a nested action reuses the outer
  transaction and never starts or retries its own partial write. Do not wrap
  `withTransaction` in an additional busy retry.
- Put shared module-private SQL, projections, parsers, and caches only in that
  module's `impl/` or `utils/` directory. Routes and long-lived services call
  public actions, never persistence helpers. Keep helpers focused; do not
  reconstruct a repository as a giant utility or barrel file.
- Run `pnpm --dir packages/happy2-server architecture:check` for server changes;
  it enforces the schema, facade, filename/export, entity-first, executor-first,
  comment, and direct-mutation boundaries.
- Every exported per-file server action must have a short doc comment directly
  above the function. State its observable semantic purpose, the durable state
  or invariant it changes, material side effects/transaction expectations, and
  why this action boundary exists. The comment must be specific enough to
  review the implementation against its promise without merely paraphrasing
  the code.
- Profiles are the product-level `User` model. Authentication `accounts` exist
  only for credentials, activation, and session management; an account without
  an active profile must not be usable by product routes.
- Server URL paths must not use `me` (or other identity placeholders) as a
  nested path segment. For the current authenticated user, use `/v0/me` and
  its action routes directly.
- Server APIs use only GET and POST. POST paths name explicit actions rather
  than CRUD semantics: use `updateProfile`, for example, rather than PATCHing
  a profile object.

## Client state principles

`happy2-state` is the in-memory product-state boundary between application code
and the server. Keep authentication, UI framework bindings, persistence, and the
decision to create a process-global instance outside this package.

- The package receives an already authenticated low-level HTTP/realtime
  transport. Its public actions must not expose URLs, tokens, or wire response
  shapes to application code.
- Realtime events are delivery hints. Reconcile durable state through the sync
  difference APIs; never treat receipt of a realtime event as durable state.
- Every retried mutation must reuse one idempotency key across all attempts.
  Promise actions reject with a displayable `UserError`; optimistic background
  actions return immediately and surface terminal failure through state events.
- State remains memory-only and framework-independent: immutable `get()`
  snapshots plus typed subscriptions are the UI integration contract.
- Split product state into independently constructible, on-demand surface stores
  selected by UI lifetime and update cadence. A store constructor must not open
  transport, persistence, timers, or authentication resources. Repeated rows
  and entities must not require one store or subscription each.
- A surface store may publicly expose synchronous, local `void` actions such as
  `textUpdate`, `attachmentAdd`, `attachmentRemove`, or `textSubmit` alongside
  `get()` and `subscribe()`. Name every action entity-first in lower camel case,
  including actions on an already scoped store. Each action mutates only that
  store first, then may emit a typed output event to the listener supplied by
  its creator. Name output and private-input variants entity-first as well, for
  example `textUpdated`, `textSubmitted`, `attachmentAdded`, and
  `displayNameSaveSucceeded`. The listener is optional and defaults to a no-op,
  so the same concrete store works standalone in Blueprint and tests.
- Keep public snapshot, action, output, and private-input contracts as explicit,
  closed TypeScript trees. For statically known product fields, do not expose
  generic `getField`/`setField`/`updateField` APIs, string paths, `keyof` mutation
  dispatch, `unknown` values, or catch-all record payloads. Give every editable
  field its own typed entity-first actions and event variants, such as
  `displayNameUpdate(value: string)` and
  `notificationLevelUpdate(value: NotificationLevel)`. Genuinely dynamic
  collections remain equally strict: use their branded ID type and concrete
  value type, for example `ReadonlyMap<MessageId, MessageSnapshot>`; dynamic
  cardinality never permits an untyped key or value.
- Store updates and subscriptions are synchronous and require no transaction
  API. A local action performs its store's `set`, then emits output in the same
  call stack; the owner may synchronously update other already materialized
  stores before the action returns. Independent stores notify independently and
  have no cross-store atomic-snapshot contract. State that must be observed
  atomically belongs in one surface store. Do not create a missing store merely
  to deliver an event.
- Do not mirror local state across stores merely to keep them synchronized. An
  output event may feed persistence or a server queue without changing another
  UI store. Update another already materialized store only when that surface
  actually renders a projection changed by the event; keep common high-frequency
  actions on one owning store.
- `HappyState` feature stores are the only client product-state system. Do not
  reintroduce an aggregate root snapshot, generic operation/result facade,
  compatibility shim, adapter, dual-write path, event bridge, or snapshot
  mirroring between surfaces.
- Framework adapters may batch or schedule rendering after several synchronous
  store notifications, but state correctness must not depend on one render or
  DOM commit. A subscriber or derived value that requires a coherent combination
  must read one owning surface store rather than join independent stores.
- Keep authoritative input separate from public local actions. Server results,
  persistence results, differences, and reconciliation enter through a private
  typed writer and must not re-emit store output events. Public actions may
  express intent or optimistic local state, but must not fabricate confirmed,
  saved, pinned, or otherwise server-authoritative state.
- Cover deterministic races and failures with the programmable fake server in
  `happy2-state/testing`, and cover the same boundary against the real in-memory
  server through `gym/state`.
