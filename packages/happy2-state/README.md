# happy2-state

`happy2-state` is Happy (2)'s framework-independent, memory-only product-state boundary. A host may
attach an already authenticated transport, but authentication, desktop persistence, framework hooks,
and the decision to create a process-global instance stay outside this package.

## Parallel surface stores

`HappyState` is a registry and action router, not a render store. It has no aggregate snapshot.
Mounted product surfaces subscribe to independent coarse stores:

```ts
const state = happyStateCreate({ transport });
await state.syncStart();

const sidebar = state.sidebar();
using chat = state.chatOpen(chatId);
const composer = state.composer(chatId);
using workspace = state.workspaceOpen(chatId);
using file = state.workspaceFileOpen(chatId, "src/index.ts");
```

Other complete surface stores are `directory()`, `search()`, `files()`, `settings()`, `admin()`,
`agentImages()`, `agentSecrets()`, `notifications()`, `threads()`, `calls()`, and retained
`threadOpen(id)`.
Rendering thousands of messages or avatar occurrences still creates one chat subscription; messages
contain canonical `{ id, displayName, kind, photoFileId }` sender projections and deliberately omit
presence. Rare identity changes replace only affected rows. Presence updates only stores that render
it.

Sidebar rows are also render-ready: channels expose their display label directly, while direct
messages cache canonical participant/name/avatar projections by membership epoch. A normal sync
difference reuses that projection; only a newly seen DM or actual membership change reloads members.

Every public snapshot is deeply readonly. A semantic no-op retains the snapshot reference. A real
change replaces only its changed leaf and ancestors inside that one store; unrelated stores neither
evaluate nor notify. Zustand vanilla is an internal synchronous setter only—no Zustand hook, selector,
shallow wrapper, transaction API, or engine type appears in the public contract.

## Local actions, output, and authoritative input

Stores expose safe, explicit local commands. They synchronously update their own snapshot, return
`void`, then optionally emit a closed typed output event to their creator:

```ts
composer.textUpdate("hello");
composer.attachmentAdd({ id: "local-1", name: "design.png" });
composer.textSubmit();

settings.displayNameUpdate("Ada", "Lovelace");
settings.desktopNotificationsUpdate(true);
```

Settings retain saved values plus `clean/dirty/saving/error` state for every explicit field. The
coarse settings subscription therefore renders the whole screen without one store per control, while
an in-flight response can confirm submitted fields without overwriting newer edits.

The owner routes output through product actions. Server confirmations, failures, reconciliation, and
test-fixture input enter through separate package-private closed unions. Application code cannot
manufacture a saved message, successful secret mutation, confirmed file write, or other authoritative
state. There is no generic `getField`, `setField`, string path, or catch-all operation-result cache in
the new model.

Network retries generate one idempotency key per logical mutation and reuse it across every retry.
Explicitly awaited actions reject with displayable `UserError`; optimistic/background commands
return immediately and report terminal failure through state events, with the retained store or
configured background-error observer providing the corresponding notification surface.

## Leases and optional resources

`chatOpen`, `threadOpen`, `workspaceOpen`, and `workspaceFileOpen` return ref-counted disposable
handles. The final release drops their denormalized payload and makes in-flight completions harmless.
Chat members, pins, reaction actors, and agent effort are discriminated loadables fetched only after
their explicit retain action; an SSE hint never materializes an unloaded resource.

Workspace trees preserve adaptive preload, retained directory depth, stale-cursor recovery, and ETag
revalidation. Editor files have a separate lease and serialized save/delete queue. Conflicting saves
fetch the latest version and conservatively rebase non-overlapping UTF-16 patches; unsafe overlap is a
typed `WorkspaceFileConflictError`.

Realtime events are delivery hints. Durable data advances through global/per-chat differences or an
area refetch. Typing, agent activity, presence, and call signalling are explicitly ephemeral and own
ordering/expiry/lifetime rules.

## UI adapters

The core contract is `ReadonlyStore<T>`, so adapters stay trivial and live in the consuming UI:

```ts
// React
const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);

// Solid
const [snapshot, setSnapshot] = createSignal(store.get());
onCleanup(store.subscribe(() => setSnapshot(store.get())));

// Svelte 5
const snapshot = createSubscriber((update) => store.subscribe(update));
const value = $derived.by(() => {
    snapshot();
    return store.get();
});
```

Blueprint fixtures can construct unconnected stores and use the exact same commands without auth,
transport, timers, or a live server.

## Product boundary

`HappyState` and its independent surface stores are the only product-state API. The former aggregate
`createClientState` model, whole-root snapshot, generic operation dispatcher, and result cache were
removed after all application and UI consumers migrated; there is no compatibility shim, mirror,
bridge, or dual-write path.

## Testing

`happy2-state/testing` exports a programmable fake server with request history, deferred handlers,
queued responses, failures, and realtime events. `gym/state` exercises the same boundary against the
real in-memory Fastify/SQLite server.
