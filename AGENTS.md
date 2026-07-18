# Agent Instructions

## Project

Happy (2) is a desktop work and coding app that evolves by adopting itself. It is
desktop-only: do not assume mobile use, add mobile-specific behavior, or adapt
layouts for mobile viewports.

## Feature development workflow

Treat each feature as one atomic, independently mergeable change, not as the
lifetime of a Conductor workspace. A worktree may contain only one unmerged
feature at a time. Do not begin the next feature until the current feature has
been reviewed and pushed or merged to `main`.

After that merge, reuse the same workspace/worktree when convenient. It does
not need to be recreated, checked out directly on `main`, or have a branch tip
identical to `origin/main` before work starts. The next feature must remain a
separate, reviewable diff and must be rebased onto the latest `origin/main`
during the normal sync-to-main workflow. Create another Conductor workspace
only for parallel work or when another feature must begin while the current one
is still unmerged.

Build each feature in isolation, with an explicit boundary between its server
and UI work. Do not mix unrelated features into the same implementation.

## Claude Opus review workflow

Never interrupt, terminate, cancel, or replace a running Claude reviewer because
it is slow or has not produced intermediate output. Wait for Claude to finish,
then use its completed result. Run review turns with Claude Opus at medium
effort and streaming/verbose output so progress is visible.

Every task in `TODO.md` uses the following completion loop:

1. Finish the isolated implementation and its required tests.
2. Start a Claude Opus review of the complete task diff. Do not use
   `ultrareview`/Ultracode for this gate.
3. Address every actionable finding, rerun the relevant checks, and resume the
   same persisted Opus session with a concrete account of the fixes. Do not
   replace the reviewer with a fresh session.
4. Repeat implementation/review turns until both Codex and Opus explicitly
   agree that no task-blocking issue remains.
5. Run repository-wide `pnpm format`, then the final required checks. Update
   `TODO.md` with the final evidence and sync the task to `main` using
   the workflow below. Only after that merge may the same worktree begin the
   next `TODO.md` task.

For Claude-owned UI tasks, Claude Opus performs the implementation and Codex
performs the reciprocal review; resume the same Opus session for fixes until
both agree. For GPT-owned server tasks, Opus is a read-only reviewer and must
not implement server behavior.

Backward compatibility is not a default product requirement. Prefer the clean
new-server/backend and UI design unless the current task explicitly requires a
compatibility or data-preservation contract; do not add legacy branches solely
to preserve obsolete behavior.

## Single backlog

Record every planned task, discovered problem, implementation step, acceptance
criterion, deferral, and progress update in the repository-root `TODO.md`.
`TODO.md` is the only planning source of truth. Do not create additional todo,
roadmap, audit-plan, or implementation-plan files elsewhere in the repository.

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

## Solid UI reactivity and identity

Solid does not re-render a component into a Virtual DOM tree and structurally
diff that tree after every state change. Components and JSX render children
normally run once per mounted identity; signals, memos, stores, and render
effects update the specific expressions that read them. Write Solid code in
that model rather than porting React render patterns literally.

- A framework adapter for a `happy2-state` surface must own one coarse store
  subscription and mount its child tree once per store identity. Pass the
  snapshot as an `Accessor<Snapshot>` and read `snapshot()` inside JSX, a memo,
  or an effect. Never call a render child with `snapshot()` from a reactive
  expression: doing so constructs new DOM and loses focus, selection, scroll,
  and component-local state.
- Treat a change of store identity as an explicit lifetime boundary. A keyed
  boundary may dispose the old subscription and remount for a genuinely new
  store. Ordinary notifications from the same store must retain the existing
  component and DOM identities.
- Keep reactive props reactive. Do not freeze a changing prop with
  `const value = props.value`, destructure changing props, or read an accessor
  outside a tracking scope. Use `props.value`, an accessor such as
  `const value = () => props.value`, or `splitProps`. A one-time read is allowed
  only when the value is an explicit lifetime invariant.
- Use `createMemo` for reactive derived values and cached projections. Use
  `createEffect` only for effects such as subscription coordination, imperative
  browser APIs, or resource loading, and always register cleanup. Do not use an
  effect merely to copy one reactive value into another signal.
- Use `<For>` for reorderable entity collections and preserve each item's value
  identity. `<For>` reconciles by item identity, not by an arbitrary `id` field.
  Do not put a whole-list `.map()` in front of `<For>` if it creates fresh
  wrapper objects for unchanged entities.
- For immutable snapshots whose changed entity receives a new reference, keep
  an ID-keyed row slot per materialized entity. `<For>` iterates the stable slot
  objects; the slot exposes a lightweight accessor for the current entity. A
  difference updates only the affected slot accessor, so the row component and
  its local menu, reaction, focus, and measurement state stay mounted. Prune
  slots immediately when their entities leave the materialized list.
- A row-local signal/accessor is not a product-store subscription. Thousands of
  repeated rows may have the normal Solid render bindings needed for their DOM,
  but they must not call `store.subscribe()` individually, mirror authoritative
  product state, start transport work, or own server synchronization. One
  surface subscription fans out only to changed row slots.
- Use `<Index>` only for genuinely position-stable primitive/value lists where
  an index, rather than an entity, owns the row lifetime. Do not use it for
  messages, users, files, notifications, or another reorderable entity list.
- Treat `<Show>`, `<Switch>`, and `<Match>` branch changes as potential mount and
  disposal boundaries. Use `keyed` only when a reference change intentionally
  means a new lifetime. Do not put focused controls or stateful panels behind a
  changing keyed boundary unless resetting them is the product behavior.
- Changing one entity field must not replace its owning row DOM. Pass the row
  accessor through reactive component props so a body, reaction, delivery, or
  menu expression updates inside the existing component. Preserve sibling row
  references and DOM identities as well.
- Virtualize collections that can contain thousands of entries. Fine-grained
  reactivity avoids unnecessary update work but does not make thousands of
  simultaneous DOM nodes, layout boxes, images, or observers free.
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
