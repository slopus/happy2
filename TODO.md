# Happy (2): full-product completion plan

## Outcome

When this program is complete, a new Happy (2) installation will guide its first administrator from account creation through profile setup, sandbox-provider validation, and a live base-agent-image build before exposing the main application. Every later visit will resume the correct durable server or user onboarding step. The main desktop application will then provide complete, reactive workflows for people, channels, agents, files, profiles, search, notifications, administration, and long-running agent work without remounting unrelated surfaces or requiring manual refreshes.

The observable completion bar is:

- every visible control performs a real action or is removed;
- every server mutation is idempotent where retry is possible and is covered by `happy2-gym`;
- every primary surface reconciles through SSE and `happy2-state` difference APIs;
- asynchronous work exposes progress, completion, failure, retry, and restart recovery;
- every result can be navigated to with a stable desktop route and keyboard flow;
- errors appear next to the responsible control when recoverable, in a blocking dialog when the workflow cannot continue, and in a non-blocking notification for background failures;
- reusable visuals live in `happy2-ui`, have blueprint coverage, and pass Chromium, Firefox, and WebKit Retina geometry tests;
- every complete production screen is a deterministic `happy2-ui` composition rendered at exactly 1024×704 and 100% scale in the Blueprint Full screens section; visual primitives remain props-only, while product surfaces may consume explicit `happy2-state` store contracts backed by static Blueprint fixtures;
- the Blueprint itself proves catalog completeness, safe insets, production backgrounds, dimensions, text fit, focus geometry and absence of accidental clipping/overflow;
- the application contains no production dependency on `mockData.ts` and no disconnected showcase-only destination.

## Delivery rules

This is a program backlog, not authorization to implement all items in one worktree.

- [ ] Use one Conductor workspace/worktree per independently mergeable feature below. Do not start the next feature until the current feature is merged to `main`.
- [ ] For every feature with server behavior, GPT implements the server contract and `packages/happy2-gym/tests/server` coverage first.
- [ ] Stop after the server phase and obtain explicit backend approval.
- [ ] Only after approval, Claude Opus implements the UI portion, following `DESIGN.md`; application packages compose reusable `happy2-ui` components rather than defining visuals locally.
- [ ] Add or update `happy2-state` fake-server race/failure tests and real `gym/state` boundary tests whenever the state boundary changes.
- [ ] Keep realtime events as hints; refetch/reconcile durable state through difference APIs.
- [ ] End every feature with focused tests, `pnpm check`, relevant gym suites, and a manual desktop acceptance pass at the 1024×704 minimum window.
- [ ] Before merging each task, complete the persisted Claude Opus review/fix/resume loop from `AGENTS.md` until Codex and Opus agree it is ready; then sync it to `main` before starting the next task.
- [ ] Update this document immediately when scope or evidence changes; mark completed work only after it is merged.

## Terminology and recommended product decisions

- **Sandbox provider** is the user-facing term. It describes where code executes: Docker, Podman, and later remote providers such as E2B or Daytona. Internally, a provider can expose one or more **sandbox runtimes/drivers**.
- **AI provider/model** is separate from the sandbox provider. Model selection must never be presented as part of Docker/Podman configuration.
- Server onboarding blocks the product until the installation is usable. Before it completes, exactly one bootstrap human account/profile may exist; every other registration attempt is rejected.
- User onboarding blocks only that user and resumes independently of server onboarding.
- The immutable system/service identity should remain distinct from the executable default agent for audit safety. The visible default executable agent is **Happy**; system membership notices can be attributed to **Happy System** and need not appear as a chat peer.
- Creating a new chat with an agent always creates a new conversation context. It must not reuse the existing deduplicated human/agent DM merely because the participants match.
- A subchannel is a snapshot fork at creation time, not live inheritance. It records its parent, copies the selected configuration/workspace, and then evolves independently.
- “People mode” posts a normal chat message. “Agent mode” posts the message and schedules the channel’s selected agent(s). The audience is persisted on the message for transparency.
- Secret values remain write-only. Rotation creates a new version and atomically moves bindings; old versions can be retired without ever returning plaintext to the client.

## Audited baseline on 2026-07-16

The following is already present and should be reused rather than rebuilt:

- [x] The first active profile becomes a server administrator transactionally in `packages/happy2-server/sources/modules/database.ts`; later profiles become members.
- [x] Profile-less password sessions survive refresh and return to profile creation through `profileRequired` in `AuthGate.tsx`.
- [x] `lastName` is already supported by auth validation, database, state types, search, and profile updates; the initial profile form simply does not collect it.
- [x] Avatar uploads are decoded and normalized to a 1024×1024 JPEG by the server. The missing pieces are an explicit client crop and an invariant/regression contract.
- [x] The session object in `AuthGate.tsx` uses reactive getters, which is the intended foundation for avatar/profile updates without remounting the app. The reported restart still needs a regression test and reproduction audit.
- [x] Immutable agent images, two built-in definitions, durable build state/logs/progress, restart recovery, SSE reconciliation, and existing admin UI are implemented.
- [x] Message/file forwarding exists end to end on the server and state operation surface; no production UI invokes it.
- [x] Image thumbnail/preview generation, thumbhashes, message image lightbox, and signed file URLs exist. Video metadata parsing exists, but video poster generation and a real media viewer do not.
- [x] Agent reasoning effort is implemented from server through UI for existing agent DMs.
- [x] Agent DM bindings already key Rig sessions and Docker containers by agent + chat. Only direct one-to-one agent DMs trigger turns.
- [x] Agent phase, elapsed time, and token count stream ephemerally and render in `AgentActivityIndicator`.
- [x] The backend parses user mentions plus `@channel`, `@here`, and `@everyone`, maintains unread and mention counts, and returns reaction `userIds`.
- [x] Happy System is automatically present in every channel and cannot be removed. It is currently a non-executable service identity and is not pinned in the sidebar.
- [x] The durable main channel, channel starring, group DMs, message reply/edit/delete, and service-notice substrate already exist; completion work should extend these contracts rather than replace them.
- [x] Server/state contracts exist for notifications, threads, calls, search, moderation, integrations, exports, backups, retention, and many admin operations.
- [x] `AgentImagesView`/`AgentSecretsView` already demonstrate a useful existing boundary: focused app glue maps state/actions into props-only `happy2-ui` Panel/Detail components with Blueprint coverage. Retain that pattern for leaf components while future complete surfaces may consume independent `happy2-state` stores directly.

The following structural gaps are confirmed:

- [x] Durable server-onboarding and user-onboarding state/API landed in P0.1.
- [x] P0.2 replaced the hard-coded local `docker` runtime with Docker/Podman discovery, durable provider selection, and a provider boundary capable of later remote implementations.
- [ ] `App.tsx` uses component signals instead of routes. A refresh cannot restore a destination, and opening global search unmounts the current feature.
- [ ] Selecting search results discards the result ID and only switches to Chat or Files, so people/messages/channels/files cannot be focused correctly.
- [ ] `⌘K` is decorative text in `TitleBar`; no global shortcut or command palette behavior is wired.
- [ ] Files open as downloads from `FilesView`; video has no poster/player and image viewing has no zoom, pan, share, or gallery navigation.
- [ ] Live agent messages do not expose Rig tool calls, workflows, subprocesses, approvals, subagents, or durable run traces. Showcase run cards are not backed by live message data.
- [ ] There is no terminal API or UI for an agent session.
- [ ] There is no Happy-to-Rig durable tool bridge and no safe agent-file egress path.
- [ ] Channels have no default executable agent, agent/human composer mode, parent/child relation, or cloning job.
- [ ] UI drops `mentionCount` and reaction `userIds`; it shows every unread as a numeric badge and cannot reveal who reacted.
- [ ] The emoji source contains only 16 hard-coded items and does not load custom emoji or a complete searchable Unicode catalog.
- [ ] Agent secrets are admin-only, have no owner/creator/timestamps/version history, and cannot be updated or rotated.
- [ ] Admin is a top-level rail destination shown to everyone; its initial `Promise.all` makes one forbidden resource fail the entire surface.
- [ ] `HomeView`, `InboxView`, `ThreadsView`, and `CallsView` are not routed by `App.tsx`; several still use mock/local state despite existing server operations.
- [ ] Production Settings still imports mock profile, presence, tone, and notification data; several app/chat fallbacks hard-code `Steve`/`ST`, producing inconsistent identity and initials.
- [ ] `FilesView` fetches one snapshot capped at 60 items, with no pagination or live reconciliation, so the list and counts become stale.
- [ ] New-DM discovery uses `window.prompt` plus exact matching; message edit/delete still use browser-native prompt/confirm dialogs.
- [ ] Notification autosave collapses the server's fine-grained preferences into a smaller lossy shape, while desktop/sound switches are seeded from mock state.
- [ ] Message images cache signed URLs indefinitely even though those URLs expire; typing state represents only one actor and has stop-event races with no expiry timeout.
- [ ] Workspace refresh performs an N+1 `getChatMembers` request for every DM, and initial thread loading may briefly mix replies into the root timeline until its filtering contract is verified.
- [ ] There is no shared toast/notification/error orchestration layer, field shake contract, sound policy, or background-job failure center.
- [ ] Whole production screens are still visually assembled in `happy2-app`; `ChatView.tsx` alone is 3,103 lines with 57 signals and more than 50 unrelated workflow functions.
- [ ] The Blueprint has 59 flat pages for 69 public visual functions, no Full screens category, and no catalog-level coverage/integrity test.
- [ ] Generic Blueprint specimens use zero padding and hidden overflow; current Rail, Tabs, Modal and ProfileCard fixtures visibly exceed their stages, while transparent chrome shows the measurement grid through its production surface.
- [ ] Global search unmounts Chat and its active TitleBar on the first typed character, losing local draft/panel/attachment state and focus before remount/hydration.
- [ ] Connected Chat still presents local-only approval resolution and mock emoji/hints; identity tone algorithms diverge between Chat and Search, and per-row message grouping performs O(n²) work.
- [ ] ModalOverlay lacks a complete Escape/focus-trap/focus-return contract and Menu lacks roving focus, arrow navigation and typeahead.

## Program sequence

The dependency order is intentional. The UI architecture foundation is a prerequisite for every new UI phase but does not block independent GPT-owned server work:

0. `happy2-state` functional micro-model foundation, materialized chat lifetime, and structural-sharing contract.
1. UI ownership guardrails, verified Blueprint specimens, and a Full screens catalog.
2. Installation bootstrap and server-onboarding contracts.
3. Stable route foundation, required before the onboarding UI and reused by every later overlay/deep link.
4. User onboarding, profile, avatar, global search, command palette, and feedback primitives.
5. Functional chat/channel creation and discovery, then sidebar information architecture and always-available Happy agent.
6. Complete files/media/forwarding workflows.
7. Mentions, unread semantics, reactions, and emoji.
8. Agent conversations in channels plus provider/model controls.
9. Agent execution trace, terminal, durable tools, and file egress.
10. Subchannels and workspace cloning.
11. Secrets/environment/admin information architecture.
12. Activate or remove remaining product destinations.
13. Cross-product polish, accessibility, performance, and release certification.

---

## P0.S — Refactor `happy2-state` into functional, lazy micro-models

The user approved this architecture and authorized implementation on 2026-07-17. Implement it as a
sequence of independently reviewable features, completing the Opus review/fix loop and syncing each
feature to `main` before starting the next one. `happy2-state` owns framework-independent product stores and
the `HappyState` orchestration actions around them. `happy2-ui` may depend on and render those public
store contracts, but it must never
own transport, authentication, SSE/difference reconciliation, retry, or server lifecycle.

### Target contract

- [ ] Replace the 73 KB `ClientStateModel` and flat catch-all files with product modules whose
      immutable snapshots, public local actions, typed output, reconciliation inputs, and private
      helpers have explicit ownership.
- [ ] Introduce one small `HappyState` top-level facade. Its public surface is a flat, discoverable
      list of store accessors such as `sidebar()`, `chat(chatId)`, `composer(scopeId)`,
      `workspace(chatId)`, and `file(chatId, path)`, plus entity-first orchestration functions such
      as `draftUpdate` and `messagePin`. Component-local actions such as `composer.textUpdate` live on
      the returned store and may emit output back to this owner. `HappyState` holds the shared
      dependencies and store registry but contains no product reducer or workflow implementation itself.
- [ ] `HappyState` is not a coherent render store and exposes no aggregate product snapshot. Sidebar,
      one materialized chat, composer, workspace, editor file, search, settings, and other surfaces
      use parallel stores with independent snapshots, subscriptions, loading, and disposal.
- [ ] Choose store boundaries by mounted surface, lifetime, and update cadence—not by entity. One
      sidebar store covers the sidebar segment; one chat store covers the materialized conversation;
      one composer store isolates per-keystroke draft updates. Never create a UI subscription/store
      per message, avatar, reaction chip, row, or other repeated entity.
- [ ] Treat every feature store as a render-ready surface projection. Include the IDs, names,
      avatars, labels, counters, permissions, and other values that surface actually renders, using
      shared immutable projection objects by reference where repeated. Deliberately exclude unrelated
      volatile data—for example, do not put presence/online state into messages that never display it.
- [ ] Make live connectivity optional at construction/attachment time. The same `HappyState` and
      concrete feature-store implementations can exist unconnected with deterministic seeded data;
      Blueprint, static fixtures, and isolated UI tests never open transport or auth lifecycles.
- [ ] Give each public action one entity-first, lower-camel file/function, with the action context
      first and only explicit plain dependencies/inputs after it. Expose the exact same function name
      as a top-level `HappyState` method that only forwards into that module. Document the observable
      state transitions, side effects, retry/idempotency behavior, and reason for the action boundary.
- [ ] Make synchronous state commands such as `composer.textUpdate`,
      `profileSettings.displayNameUpdate`, and top-level integration actions return `void`, not a
      snapshot, status object, or forwarded implementation result. Before the method returns, apply
      the complete local transition and synchronously notify subscribers; later persistence/server
      outcomes flow back as typed inputs. Use `Promise<void>` only for an explicitly awaited operation
      whose product contract requires the caller to handle a displayable `UserError`.
- [ ] Give each store two input capability levels. Its public application/UI interface contains
      immutable `get()`/subscribe plus safe synchronous local entity-first `void` actions such as
      `textUpdate`, `attachmentAdd`, `attachmentRemove`, `textSubmit`, `displayNameUpdate`, or
      `displayNameSave`. A separate package-private writer applies a closed TypeScript union of
      authoritative inputs and can mutate only that store's snapshot; neither path performs API calls,
      retries, queueing, timers, cross-store writes, or synchronization policy.
- [ ] Make every known snapshot path, action parameter, output variant, and authoritative input an
      explicit closed TypeScript type. Do not introduce public `getField`/`setField`/`updateField`,
      string-path mutation, `keyof` dispatch, `unknown` field values, or catch-all records for a known
      product schema. Give every editable field its own typed entity-first operation. Collections such
      as chats, messages, attachments, and server-defined items still require branded ID keys and one
      concrete value type; dynamic cardinality does not weaken their typing.
- [ ] Let a public local store action optionally emit a closed typed output event after changing its
      own state. Accept the listener at construction, default it to a no-op, and keep standalone stores
      fully interactive without `HappyState`, transport, persistence, or test mocks. Output describes
      local intent/change; it is not a durable server event.
- [ ] Keep output and input event unions distinct. A creator such as `HappyState` may listen to
      `ComposerOutput` or `SettingsOutput` and route it through an integration action; server,
      persistence, and reconciliation results return through private `ComposerInput`/`SettingsInput`
      writers without emitting output again or creating a feedback loop.
- [ ] Put only thin forwarding methods on `HappyState`; put orchestration in same-named module action
      functions. A durable operation such as send/edit/pin creates or updates the operation queue,
      emits optimistic/confirmed/failed typed events only to already materialized relevant stores,
      calls the server with the correct idempotency/retry behavior, and updates an existing
      composer/sidebar/other projection when the workflow requires it. Store writers never expose a
      way for application code to fake a durable success locally.
- [ ] Each store exposes its own immutable `get()` snapshot and subscription. A semantic no-op keeps
      that store's snapshot reference; a real change replaces only the changed leaf and ancestors
      inside that store while unaffected siblings and every unrelated store remain `===`.
- [ ] Use Zustand-like synchronous `set` semantics with no transaction API. A public store action
      updates and notifies its own store, then emits typed output in the same call stack; its owner may
      synchronously update other already materialized stores before the original action returns.
      Independent stores notify independently and provide no cross-store atomic-snapshot guarantee.
      Put state that must be observed atomically in the same surface store.
- [ ] Keep network and persistence work outside the synchronous setter/output chain. Optimistic,
      confirmed, failed, and reconciled changes are separate explicit store updates; never create a
      missing store merely to propagate one of them.
- [ ] Keep realtime events as delivery hints. Durable entities advance only through the global and
      per-chat difference APIs; typing, agent activity, call signalling, and presence remain
      explicitly ephemeral with ordering, expiry, and disposal rules.
- [ ] Keep explicitly awaited promise actions displayably fallible with `UserError`; synchronous local
      and optimistic background commands return `void` immediately and surface terminal failure
      through state events. Every retried mutation reuses one idempotency key across its attempts.
- [ ] Select the internal reactive primitive through the P0.S0 Happy-specific performance gate. The
      target is a few coarse surface subscriptions with structurally shared row data, not thousands
      of fine-grained atoms/selectors. Benchmark a minimal Happy-owned store, `alien-signals`,
      `@preact/signals-core`, Nano Stores, and `zustand/vanilla` under identical surface-store
      topology rather than favoring a library's preferred decomposition.
- [ ] Hide the selected engine behind one tiny Happy-owned `ReadonlyStore<T>` contract (`get()` plus
      subscribe) that public product stores extend with their safe local actions and that
      `happy2-ui` can consume directly. Never expose
      engine-specific hooks, setters, shallow/equality wrappers, or product actions in reactive
      cells, and never delegate resource lifetime, reconciliation, retry, output routing, or product
      policy to the engine. Reusable derived projections belong to the owning store with stable references.

### Proposed module and lifetime boundaries

- [ ] Add `src/kernel/` only for the common `ReadonlyStore<T>`/internal writer, synchronous setter and
      notification semantics, action dependencies, request generations, cancellation, and
      deterministic clock/ID/scheduler test seams; it must not contain a root product snapshot.
- [ ] Add a small `src/happyState.ts` facade that binds shared dependencies and the store registry,
      exposes same-named top-level forwarding functions for integration operations, constructs stores
      with typed output listeners, deduplicates keyed instances, and releases them at the end of their
      declared lifetime. Product reconciliation, routing decisions, event fan-out, and mutations
      remain in module action files, never as branches in this object.
- [ ] Add a focused draft coordinator/module. `draftUpdate` synchronously projects the new draft into
      every already materialized composer/chat/sidebar surface that displays it, then schedules the
      local save through an injected persistence port. The concrete desktop persistence adapter stays
      outside `happy2-state`; retry/coalescing and typed state transitions belong to the draft action,
      not to `HappyState` or an individual store writer.
- [ ] Add `src/modules/sidebar/` for the independently materialized ordered chat summaries, unread and
      mention counters, membership removal, starring, and global chat-difference cursor.
- [ ] Add one internal `src/modules/identity/` projection catalog supplied through the shared action
      context: one canonical immutable user presentation object per identity containing ID, display
      name, agent/human kind, and avatar/file reference or resolved shared avatar asset. Surface
      projections reuse those objects by reference instead of allocating a new user/avatar object for
      every row.
- [ ] Merge identity and presence changes outside stores. Same-named identity/presence action modules
      convert server/difference input into typed surface events only for materialized stores that
      render the changed field; `HappyState` only forwards the call. A rare avatar change may replace
      sender projections in retained chat/sidebar/search stores; frequent presence changes update only
      surfaces that actually display online state and never touch message timeline stores that do not.
- [ ] Add `src/modules/chat/` for an on-demand, surface-complete `ChatSnapshot`: chat summary,
      materialized message window/pages, optimistic delivery state, loaded threads/members, reaction
      counters/details, typing, and agent activity needed by one open chat surface.
- [ ] Make stored messages render-ready: attach the canonical sender projection with ID, display name,
      avatar, and other message-visible identity fields. Do not attach an entire server `UserSummary`
      or presence/online fields the timeline does not render. Maintain private indexes as needed so a
      rare external identity event can replace only affected message/sender references.
- [ ] Make `chatOpen(chatId)` acquire a disposable/ref-counted handle and create the micro-model on
      demand. Until loaded it exposes an explicit `unloaded/loading/ready/error` state; the final
      handle release aborts obsolete work, unsubscribes owned timers/resources, and removes the
      denormalized chat snapshot from memory.
- [ ] Model each optional chat capability as a discriminated loadable resource rather than optional
      ambiguous fields. Load message pages, threads, members, reaction actors, workspace folders,
      and files only after a consumer explicitly retains/requests them; reconcile only retained
      resources and never materialize an unloaded resource because an SSE hint arrived.
- [ ] Keep reaction `count`/`reacted` summaries in materialized messages, but keep actor lists in a
      separately retained per-message/per-reaction resource. Recommend retaining loaded actor lists
      until the chat handle closes to prevent hover thrash; allow an explicit earlier release where
      memory measurement justifies it.
- [ ] Add `src/modules/composer/` as an independent local store for draft text, selected audience,
      mentions, attachments, upload intent, validation, and send state. Public methods such as
      `textUpdate`, `audienceUpdate`, `attachmentAdd`, `attachmentRemove`, and `textSubmit` mutate the
      local projection and emit
      optional `ComposerOutput`; its private writer applies only `ComposerInput`. `HappyState` listens
      when connected and forwards output into draft/send integration modules. With the default no-op
      listener, the exact store remains usable in Blueprint and isolated UI tests.
- [ ] Add on-demand settings surface stores rather than one permanent settings branch. A settings
      snapshot tracks current value, saved value, and `clean/dirty/saving/error` state per field while
      keeping one coarse subscription per mounted settings segment—not one subscription/store per
      control. Each known field has explicit operations such as `displayNameUpdate`,
      `displayNameReset`, `displayNameSave`, and `notificationLevelUpdate`; there is no generic keyed
      field API. These actions work standalone and emit field-specific typed output; private inputs
      apply equally specific save-started/succeeded/failed and remote-change variants.
- [ ] Add `src/modules/workspace/` for requested directory pages, aggregate tree projection,
      stale-cursor restart, and workspace hint reconciliation, and `src/modules/workspace-file/` for
      open-file leases, version bases, serialized writes, conservative patch rebase, and conflicts.
- [ ] Add focused modules for presence, typing, agent activity, calls, users, notifications, files,
      agents, administration, and other product domains as they migrate. Replace the untyped global
      `operationResults` cache with typed lazy resources owned by those modules; retain a named raw
      request facade only for operations intentionally not represented as state.
- [ ] Split transport request specs, wire types, and public projection types by the same product
      modules. Application code must continue to see product actions and snapshots, never URLs,
      tokens, response envelopes, or transport retry mechanics.

### `happy2-ui` dependency and fixture contract

- [ ] Add explicit side-effect-free `happy2-state` subpath exports for store contracts, product
      stores, and deterministic `HappyState` fixture construction. The package root may expose the
      live server-backed constructor, but importing a store type or constructing an in-memory state
      graph must not open a connection, start timers, or require auth.
- [ ] Let `happy2-ui` depend on the store/contracts subpaths. Visual primitives remain props-only;
      complete product surfaces may accept one or a few concrete store models such as
      `SidebarStore`, `ChatStore`, `ComposerStore`, and an on-demand `SettingsStore`, subscribe inside
      the surface, and call their safe public local actions instead of receiving a giant mapped view
      model or dozens of callbacks.
- [ ] Enforce a constant-size subscription budget per mounted surface. `ChatScreen` subscribes once
      to its render-ready `ChatStore` and separately to high-frequency independent stores such as its
      composer only when needed; it does not subscribe to identity/presence per row. Thousands of
      `Message`, `Avatar`, and reaction leaf components receive stable props and create zero state
      subscriptions.
- [ ] Export public store actions and output event contracts normally, but export authoritative input
      writer machinery only through package-private imports. Expose a controlled fixture driver from
      `happy2-state/testing` so Blueprint can apply save/server success and failure inputs without a
      server; add architecture checks forbidding `happy2-app` production and `happy2-ui/src`
      production components from importing testing/internal mutation capabilities.
- [ ] Keep the dependency direction acyclic: `happy2-state` contains its server/API bridge and stores
      but never imports `happy2-ui`; `happy2-ui` imports only side-effect-free state contracts/stores;
      `happy2-app` imports both, creates/attaches the live `HappyState`, and owns authentication,
      routing, and window lifecycle.
- [ ] Export deterministic in-memory store fixture builders from a side-effect-free fixture subpath.
      Blueprint and `happy2-ui` browser tests instantiate the real store implementations with static
      snapshots and drive their private writers through the controlled typed-event fixture driver,
      so every loading, empty, populated, optimistic, failure, and streaming state renders without a
      server or duplicated mock shape.
- [ ] Keep transport payload types private to the runtime. Public store snapshots are stable product
      contracts suitable for production UI and fixtures; presentation-only geometry, colors, icons,
      and DOM state remain owned by `happy2-ui`.

### Server prerequisite for lazy reaction actors

- [ ] Before implementing lazy reaction actors, define a server contract that returns reaction
      counters/`reacted` in message projections without eagerly expanding all actor IDs, plus a
      bounded authorized GET for the actors of one message/reaction and a difference signal that can
      reconcile an already retained actor list.
- [ ] Implement that backend contract as its own GPT-owned server feature with architecture checks
      and named Gym coverage for pagination, authorization, concurrent add/remove, deletion, custom
      emoji deletion, stale cursors, and idempotent retries; stop for explicit backend approval before
      wiring the client/state consumer.

### Mergeable implementation sequence

#### P0.S0 — Select the reactive primitive with Happy workloads

Status: complete; included in the P0.S0 sync to `main`.

- [x] Build one isolated benchmark harness with identical immutable reducers and data shapes for a
      minimal Happy-owned surface store, `alien-signals`, `@preact/signals-core`, Nano Stores, and
      `zustand/vanilla`; model many parallel sidebar/chat/composer stores rather than one global
      snapshot, and exclude framework rendering from the first core-engine comparison.
- [x] Measure sidebar update, one message update in a long materialized timeline, streamed
      message replacement, reaction-counter update, optional reaction-actor load/reconcile/release,
      workspace-folder replacement, and repeated chat open/close/disposal.
- [x] Record mutation and notification p50/p95/p99, selectors/computations executed, allocations,
      retained heap after disposal, GC pressure, cold creation cost, and exact structural-sharing
      references. Include semantic no-ops, one-store multi-leaf setters, and synchronous output-driven
      propagation across several independent stores.
- [x] Add a render-first stress fixture with thousands of stable message objects, repeated authors,
      and at least 100 visible avatar occurrences backed by canonical shared sender projections. Record
      initial projection/mount cost, committed rows, total state subscriptions/effects, allocations,
      and retained heap; subscription count must remain constant as message/avatar count grows.
- [x] Measure rare avatar/identity replacement separately and accept broader surface invalidation if
      the common initial render, scroll, message append, and stream-update paths remain faster and
      simpler. Drive the replacement through external typed surface events and do not add per-avatar
      subscriptions to optimize a change expected only occasionally.
- [x] Measure presence churn with and without a presence-rendering surface. When presence is not
      displayed, `HappyState` must not dispatch presence events to the chat store, and the timeline
      must perform zero projections, notifications, or reference changes.
- [x] Run a second integration benchmark for the two finalists through thin Solid, React, and Svelte
      adapters, measuring committed row/component updates rather than only JavaScript loop throughput.
      Cover a synchronous output chain triggered from a framework event and from an external
      realtime/timer callback; record subscriber calls, render attempts, DOM commits, and whether any
      intermediate cross-store combination becomes visible. Correctness must not rely on batching.
- [x] Choose the engine only from reproducible repository results. Prefer the simplest candidate that
      maintains the surface subscription budget, preserves repeated row references, releases store
      graphs completely, and stays within a narrow measured margin of the fastest finalist on initial
      render and common chat paths; store the benchmark and accepted regression thresholds with
      `happy2-state` tests.

Selection decision (2026-07-17): `zustand/vanilla`. The Happy-owned reference and Zustand reached
identical observable states through the React, Solid, and Svelte probes and were within benchmark
noise on common paths. Alien Signals was also fast in the core loop, but its effect graph adds
lifecycle machinery unused by this coarse snapshot topology; Preact Signals and Nano Stores were
slower on common paths. Between the finalists, the smallest source file is the Happy-owned reference,
but the simplest production ownership boundary is the maintained, battle-tested synchronous
get/set/subscribe implementation in `zustand/vanilla`. Happy keeps it private behind
`ReadonlyStore<T>`: no Zustand hook, selector, setter, `useShallow`, or equality wrapper enters public
state/UI contracts. Exact per-operation allocation counts are not portable in Node; the harness uses
root-snapshot/notification counts, exact reference-identity tests, retained heap after disposal, and
forced-GC duration as allocation/GC proxies. Selector/computation count is exactly zero by design.
The loose timing/heap regression limits run automatically as part of the package `test` script.

Completion evidence (2026-07-17): five engines share one 4,096-message/64-author fixture and the
same immutable reducers; 61 package tests cover engine semantics, exact reference identity, rare
avatar fan-out, disposal, and React/Solid/Svelte integration. The selected Zustand gate verifies
semantic no-ops, ignored presence, p99 update limits, retained heap, fixture size, and the constant
four-subscription budget during every package test. `pnpm --dir packages/happy2-state typecheck`,
`test`, `lint`, and `format:check` pass. CodeRabbit's repeated complete-diff review returned zero
findings, and the persisted Claude Opus review/fix/resume session explicitly reported no remaining
actionable or task-blocking issue and declared P0.S0 ready to merge.

#### P0.S1 — Characterize invariants and introduce the state kernel

Status: completed on `ex3ndr/refactor-happy2-state` (2026-07-17).

- [x] Add characterization tests around current initialization, retry/idempotency, realtime hints,
      optimistic confirmation races, workspace conflict behavior, stop/disposal, and public errors.
- [x] Add an explicit reference-identity matrix: no-op, one chat summary, one message, one reaction
      counter, one reaction actor list, one identity/avatar, one presence event, one workspace folder,
      one open file, and one unrelated domain. Prove a rare identity/avatar event updates only
      affected render projections, while presence changes do not touch surfaces that do not display it.
- [x] Implement the common per-store kernel and subscription contract without changing product behavior;
      freeze each newly created node in tests/development without cloning the whole tree on every
      commit.
- [x] Introduce the small `HappyState` registry/sync shell and prove that it returns stable keyed store
      instances, can run unconnected for fixtures, and contains no product-specific mutation or
      routing branches. Prove each top-level integration method has an exact same-named module function
      and is only a typed forwarding binding into the shared action context; state commands discard
      the implementation result and expose `void`.
- [x] Introduce store-specific public local actions, typed output unions, authoritative input unions,
      and package-private writers. Prove public actions mutate only their store and emit output once,
      private inputs never re-emit output, semantic no-ops do not notify, and authoritative writers
      are unavailable from production package exports; exercise both directions through Blueprint.
- [x] Keep legacy `createClientState` and new `HappyState` stores independently usable in parallel
      while consumers migrate. Do not add shims, adapters, dual writes, event bridges, or state
      mirroring between them. Move each UI surface wholly to its new store and then delete that
      surface's legacy reads/writes; temporary divergence between old and new state is acceptable.
- [x] Run `happy2-state` tests/typecheck/lint/format checks and the relevant `gym/state` suite before
      review and sync.

Completion evidence (2026-07-17): `happy2-state` now has a Zustand-backed private kernel with a
deep-readonly public snapshot contract, synchronous no-op-aware notification, development freezing,
ref-counted keyed lifetimes, a thin unconnected `HappyState`, entity-first composer actions, closed
typed output/input, package-private authoritative writers, and a test-only Blueprint fixture. Legacy
`createClientState` remains independently usable with no shim, bridge, mirroring, or dual write. The
package passes format, typecheck, lint, 13 test files/77 tests, and the state-kernel benchmark gate;
`happy2-ui` passes format/typecheck/lint/build; full Gym passes 44 files/107 server tests and 3 files/18
browser state tests. CodeRabbit's actionable lifetime, readonly, naming, race, and disposal findings
were fixed and re-reviewed; its repeated branded composer-scope suggestion was rejected because the
repository has no branded-ID convention for generic UI scopes and no scope validation rule. The same
persisted Claude Opus review session verified every fix, concurred with that rejection, and explicitly
reported P0.S1 ready to merge with no task-blocking issue.

#### P0.S2 — Complete the entire `happy2-state` product-state architecture

Status: full state implementation, colocated unit-test matrix, complete-diff review, and final checks
complete on `ex3ndr/refactor-happy2-state` (2026-07-17); awaiting user approval and sync. This is one
large state-only feature by explicit user direction. Do not run incremental domain reviews; finish
the complete replacement state package, fake-server coverage, Gym/state coverage, and architecture
enforcement first, then review the complete diff once.

- [x] Move chat summaries/global difference projection into the independent `sidebar` state/reducer;
      keep difference fetching, ordering, and multi-store dispatch in a same-named sync action module
      reached through the thin `HappyState` facade.
- [x] Introduce disposable `chatOpen`, explicit load states, initial message loading, per-chat
      difference reconciliation, optimistic send, and message identity preservation in `chat`.
- [x] Add fake-server race/failure tests and real `gym/state` coverage, including an SSE hint during
      initial load, sync-before-mutation-response deduplication, unload during an in-flight request,
      and exact reference changes.
- [x] Project message reactions as summary-only state and load actor identities on demand through a
      retained reaction-detail resource. The dedicated bounded/paginated server endpoint remains the
      separately approval-gated backend prerequisite below; this state-only feature uses the existing
      authorized message resource and never retains eager actor IDs in a timeline snapshot.
- [x] Reconcile counters for every materialized message, reconcile actor membership only when that
      detail resource is retained, and keep unloaded details absent.
- [ ] Complete server-backed reaction actor pagination/concurrent mutation/membership-loss coverage in
      the approval-gated backend prerequisite below; the state feature covers unloaded/retained actor
      resources, hover deduplication, message removal, identity replacement, and stable references.
- [x] Move the existing useful immutable `WorkspaceRecord` transformations into workspace-owned
      state/actions and preserve adaptive preload, requested-folder paging, and ETag reconciliation.
- [x] Give workspace trees and editor files separate leases so closing an editor releases its base
      contents without unloading the visible tree.
- [x] Preserve serialization, idempotency, stale cursor handling, patch rebase, typed conflicts, and
      live reconciliation with deterministic race/failure and Gym coverage.
- [x] Move typing, presence, agent activity, and call signals into focused micro-models with their own
      clocks, ordering keys, expiry timers, selectors, and disposal tests.
- [x] Provide typed retained replacements for every current production domain while leaving the
      explicitly parallel legacy model untouched; P0.S3 migrates all consumers at once and then
      deletes `operationResults` rather than introducing a bridge or partial dual-write cleanup.
- [x] Keep one product owner for every SSE area name and make unknown/unowned areas observable in
      development/tests instead of silently becoming stale.
- [x] Complete every replacement state/action contract without changing or bridging the parallel
      legacy `model.ts`; freeze new legacy callers so the later all-UI migration can delete the old
      facade, whole-root cloning/freezing, and catch-all `operationResults` in one operation.
- [x] Add `happy2-state` architecture checks for action filename/export parity, direct semantic action
      comments, owner-only module `*Input` export leaks, generic known-field/key-dispatch mutation APIs,
      and framework imports; do not enforce arbitrary line limits. Keep the stricter action shape,
      context-first boundaries, legal writes, and module ownership explicit in the documented design
      and colocated tests instead of claiming regex enforcement the gate does not provide.
- [x] Document the parallel-store/lease/action/snapshot pattern with sidebar, chat, composer,
      reaction detail, and workspace examples, plus direct `happy2-ui` fixture usage and minimal
      React, Solid, and Svelte adapters that do not become core dependencies.
- [x] Add colocated unit coverage for every new product module (`admin`, `agent-images`,
      `agent-secrets`, `calls`, `chat-actions`, `chat`, `composer`, `directory`, `draft`, `files`,
      `identity`, `message`, `notifications`, `reaction`, `runtime`, `search`, `settings`, `sidebar`,
      `sync`, `thread`, `threads`, `workspace`, and `workspace-file`). Exercise each store's local
      actions/input branches and each action/route's success, displayable failure, stale completion,
      and disposal behavior where applicable; keep the existing cross-module race and Gym tests as a
      separate integration layer. Run complete-diff reviewers only after this matrix passes.
- [x] Run repository-wide `pnpm format`, `pnpm check`, all `happy2-state` tests, all `gym/state`
      tests, and affected app tests; record final evidence here and complete the persisted Opus
      review/fix loop before syncing to `main`.

Implementation evidence (2026-07-17): the new framework-independent package exposes
coarse sidebar, retained chat/thread/workspace/editor, composer, settings, search, files, directory,
notifications, threads, calls, admin, agent-image, and write-only secret stores behind immutable
`get()`/subscribe contracts. Sidebar DM projections cache canonical names/avatars by membership epoch;
chat messages share canonical senders, omit presence and reaction actors, and retain pins/actor details
only on demand. Settings track saved and save-state values per explicit field and preserve newer edits
across load/save races. The runtime owns retry/idempotency, realtime hint reconciliation, expiry, and
background lifetime without exposing transport to stores. `happy2-state` format/typecheck/lint and its
architecture gate pass (148 source files, 49 actions); all 23 product modules have a colocated
`module.test.ts`, 40 files/141 tests plus the selected-engine benchmark gate pass, and the focused
real-server Gym/state boundary passes. The colocated matrix covers local actions, authoritative
inputs, route success/failure, stale completions, semantic no-ops, and disposal as applicable; it
raises package-wide coverage (including the parallel legacy model and benchmark sources) to 74.37%
statements, 61.72% branches, 79.36% functions, and 79.02% lines. It exposed and fixed files pagination
without a cursor, page failures replacing usable state, sidebar semantic no-ops replacing snapshots,
and disposed stores continuing to emit local output. The complete-diff CodeRabbit passes exposed
action retry/stop, stale-load, pagination, field-merge, workspace idempotency, sync lifecycle,
optimistic provenance, pending-operation, notification/call/image races, and state-local failure
findings; every actionable item was fixed together and covered by deterministic tests. Repeated
branded-ID/ReadonlyMap requests were rejected because this repository has no branded-ID convention
and the package-private bindings are not production exports; Promise-returning local call actions were
also rejected because they contradict the approved synchronous `void` store contract. The final
CodeRabbit pass added six findings: wire-level upload/URL methods were removed, files/search became
strictly on-demand, action/export enforcement was strengthened, and authoritative settings results now
merge per field without clobbering concurrent edits or avatars. Its reconnect suggestion was rejected
because `StateRuntime` transport is constructor-fixed and an unconnected store is intentionally
memory-only; Opus independently verified and accepted that rationale.

The persisted medium-effort Claude Opus review inspected the complete state diff after the unit matrix,
reported no blocking correctness issue, and requested two non-blocking corrections: make the
architecture-gate claim exact while dynamically preventing every module-owned `*Input` export, and
remove the unused `messagesReconciled` input with unsafe partial-merge semantics. Both were corrected;
the same persisted session verified them and ended `READY` with no actionable finding. Repository-wide
`pnpm format` and `pnpm check` then passed: state 40 files/141 tests, server 21/89, Gym server 45/108,
Gym browser 3/18, UI 171/435, app 8/67, server coverage baseline, and all production builds. The
focused real-server state boundary passed again; generated Composer screenshot artifacts were restored
to their pre-check contents. One parallel-suite rare-avatar benchmark sample exceeded its p99 budget;
the immediate isolated rerun and the subsequent complete `pnpm check` both passed. Only sync/merge
evidence remains before P0.S2 is closed.

#### P0.S3 — Integrate every application and UI surface with the completed state architecture

Status: blocked on P0.S2. Claude Opus owns this complete UI implementation after GPT finishes and
the user approves the state package. Do not migrate or review one surface at a time: convert every
production consumer and its Blueprint fixtures in one integration feature, then run one reciprocal
Codex review/fix loop on the complete application/UI diff.

- [ ] Replace every production `createClientState`, aggregate snapshot, typed legacy event, generic
      `execute`/`result`, and legacy workspace/message access with the relevant `HappyState` surface
      store or explicit orchestration action; add no shim, adapter, bridge, mirror, or dual write.
- [ ] Move Chat, sidebar, composer, search, files, settings, people/presence, notifications, threads,
      calls, workspace/editor, agent images/secrets, and administration as complete mounted surfaces,
      preserving each surface's lifetime and coarse subscription boundary.
- [ ] Keep `happy2-ui` directly usable with the concrete public store contracts and deterministic
      fixtures, while application packages own authenticated transport attachment and process-global
      instance choice rather than visual or product-state behavior.
- [ ] Delete all remaining legacy consumers and package exports, update affected app/Blueprint tests,
      then delete `model.ts`, generic whole-root cloning/freezing, and catch-all `operationResults`;
      run repository-wide checks and complete one reciprocal Codex review/fix loop before sync.

### Acceptance criteria

- [ ] No product behavior or resource lifetime is owned by a god class or catch-all result cache.
- [ ] `HappyState` is the only shared synchronization/store-registry object, but it has no aggregate
      render snapshot; feature stores own their snapshot, safe local actions, output contract, and
      private input reducer and can be consumed independently. Its flat integration methods only route
      into same-named action modules, which own coordinated workflows and side effects.
- [ ] One action can synchronously update composer and emit output that updates chat, sidebar, and any
      other already materialized projection before the action returns, without introducing a root
      snapshot or creating a missing store. Each independent store notifies on its own setter; no
      cross-store transaction or atomic-snapshot behavior is implied.
- [ ] Calling a synchronous state command returns `void`; the updated state is observable through
      `get()` and subscriptions before control returns to the caller, never through an action result.
- [ ] There is no coherent root product snapshot: updating chat or composer does not evaluate or
      notify sidebar, workspace, settings, or another chat store.
- [ ] Opening a chat creates exactly one denormalized chat micro-model; closing its final handle frees
      its messages, optional reaction actors, threads/members, timers, and in-flight ownership.
- [ ] An unloaded optional resource occupies no entity payload memory and is not fetched or updated by
      a realtime hint; a retained resource reconciles automatically without a Refresh action.
- [ ] Tests prove exact upward-only structural sharing within every migrated store, zero unrelated
      store notifications, and no notification/reference change for semantic no-ops or duplicate
      differences.
- [ ] Rendering N messages or avatar occurrences does not create O(N) state subscriptions/effects.
      Message rows contain render-ready canonical sender projections with ID/name/avatar but omit
      unused presence; external orchestration sends identity/presence events only to materialized
      surfaces that render those fields.
- [ ] Production application/UI code may call safe local store actions but cannot apply authoritative
      inputs or manufacture confirmed, pinned, saved, edited, or other durable states. Only the private
      action context reached through store output/`HappyState` integration and the explicitly test-only
      Blueprint fixture driver hold writer capabilities.
- [ ] The state core has no UI-framework runtime dependency; `happy2-ui` renders the same concrete
      stores with live connectors or deterministic in-memory fixtures and never requires a server.
- [ ] Existing retry, idempotency, error, workspace-conflict, realtime-hint, and real-server behavior
      remains covered at the state boundary throughout the migration.

---

## P0. UI architecture and Blueprint foundation

This section incorporates independent full-tree audits by Codex and Claude Fable. It is the complete UI-architecture source of truth; no separate audit or implementation-plan file is authoritative. This planning work does not authorize implementation in the current worktree.

### P0.A — Enforce `happy2-ui` ownership before adding more screens

- [ ] Make application routes thin lifecycle/connectivity adapters that attach live runtime sources
      to independent state stores and render `happy2-ui` screens from those stores; prohibit
      app-owned visual layout, inline component styling and alternate UI primitives.
- [ ] Keep leaf visual primitives props-only. Allow complete `happy2-ui` product surfaces to consume
      side-effect-free `happy2-state` store contracts directly so the app does not rebuild large
      view-model prop trees on every update.
- [ ] Preserve the existing host-only app stylesheet exception for root sizing/background.
- [ ] Split work by independent state/lifetime and visual contracts rather than an arbitrary line limit.
- [ ] Use `AgentImagesView` and `AgentSecretsView` as the current reference pattern.
- [ ] Add architecture checks only in their dedicated implementation feature, not as part of this plan-only change.

### P0.B — Make the Blueprint a verified product catalog

- [ ] Add a typed manifest grouped into Primitives, Components, Surfaces, Overlays and **Full screens**.
- [ ] Give every public visual export separately addressable Blueprint ownership.
- [ ] Replace clipped zero-padding stages with an outer measurement surface, opaque production host, declared safe inset and 100%-scale content frame.
- [ ] Plan the catalog-wide integrity suite entirely in existing TypeScript/Vitest Browser/Playwright infrastructure; do not add Python or another browser harness.
- [ ] Check export/page completeness, exact dimensions, safe gutters, scale, overflow, clipping, line-box/visible-ink fit, focus rings and declared intentional ellipsis/scroll exceptions in all three browsers at 2×.
- [ ] Add exact 1024×704 full-screen fixtures for every retained production route and important overlay/state.

### P0.C — Decompose Chat and the remaining app views safely

- [ ] Characterize current observable behavior before extraction, especially stable streaming rows, drafts, scroll, routing, threads, file conflicts and subscription cleanup.
- [ ] Extract pure presenters and focused navigation, conversation, thread, workspace-file, attachment, activity, membership and dialog controllers with no visual JSX.
- [ ] Move Chat panels/dialogs and the complete ChatScreen into `happy2-ui`, with their own Blueprint fixtures/tests, before replacing app rendering.
- [ ] Decompose Auth, Settings, Files, Search and Admin into focused independent stores plus
      `happy2-ui` full-screen surfaces that can use live or deterministic in-memory store instances.
- [ ] Decide retain versus delete for unrouted Home, Inbox, Calls and Threads before investing in them.
- [ ] Perform each numbered task in the detailed sequence below in its own Conductor workspace and merge before starting the next.

### P0.D — Verified UI audit evidence and ownership boundaries

- [ ] Treat `ChatView.tsx` (3,103 lines, 57 signals, 10 memos, 4 effects, more than 50 workflow functions and 9 state subscriptions) as a graph of independent navigation, conversation, thread, files, attachments, membership, agent, activity and dialog responsibilities—not as one component to cosmetically split into arbitrary files.
- [ ] Treat `SettingsView.tsx` (728 lines) as separate profile, avatar, status, notification-preference, autosave and screen-rendering concerns.
- [ ] Review `AuthGate.tsx` (375 lines), `AgentSecretsView.tsx` (426), `AdminView.tsx` (331), `AgentImagesView.tsx` (273), `FilesView.tsx` (264), `SearchOverlay.tsx` (214) and `App.tsx` (159) against the same state/lifetime/visual boundary.
- [ ] Split public visual contracts currently bundled in `Message.tsx` (738 lines), `Composer.tsx` (661), `AgentSecretPanel.tsx` (430), `FileTree.tsx` (397), `AgentImagePanel.tsx` (394) and `Sidebar.tsx` (264) only where the child can render, behave and be tested independently.
- [ ] Preserve good existing foundations: id-keyed `reconcile` stores and stable streaming rows; hardened Message Markdown; `AppShell`, `Rail`, `Sidebar`, `TitleBar`, `ChannelHeader`; current message/composer/run primitives; and the AgentImages/AgentSecrets glue-to-panel pattern.
- [ ] Do not move state ownership, routing, authorization, server operations, transport, SSE
      subscriptions or product policy into `happy2-ui` merely to shrink an app file. UI surfaces may
      subscribe to injected `happy2-state` stores, invoke their safe local actions, and use separately
      injected narrow `HappyState` integration ports where needed, but cannot access authoritative
      writers or create/attach live connectors.
- [ ] Do not replace one god component with one god controller or a single unbounded prop object.

Verified behavioral/code defects to resolve during the relevant isolated feature:

- [ ] Global search switches away from the `Show` fallback containing Chat on the first character, destroying Chat, its draft, pending attachments, panels, selection and the active TitleBar/SearchField focus before remounting and rehydrating later.
- [ ] Live approval controls, some run expansion and fallback reactions only update local presentation state; never show durable success until an explicit state/server action succeeds.
- [ ] Chat and Search use different identity tone arrays, so the same user can change avatar color between surfaces.
- [ ] `groupedWithPrevious(conversationEntries(), …)` repeats a full active-entry filter for each row, producing O(n²) work during streaming updates.
- [ ] Whole-record signals for file URLs, run expansion, approvals, reactions and read-through invalidate every reader when one key changes; use keyed state where measurement proves a material boundary.
- [ ] `refreshWorkspace` calls navigation application twice; sidebar/member mappings create fresh objects broadly; signed URL and object URL lifetimes sit beside unrelated workflows.
- [ ] Files, Admin and Settings are one-shot mount loads rather than self-reconciling live surfaces.
- [ ] Settings contains three near-identical debounce/fingerprint/single-flight autosave machines and seeds real sessions from mock profile/settings values.
- [ ] Name/initial/tone/date/byte/error helpers are duplicated and divergent; standardize semantics through pure app presenters.
- [ ] ModalOverlay lacks Escape, initial focus, focus trap and focus return; Menu lacks roving focus, arrow navigation and typeahead; `⌘K` is advertised without a handler.
- [ ] Home, Inbox, Calls and Threads are unrouted; large mock datasets, the unused app Tailwind import and ignored legacy Admin/Files props remain dead production code.

### P0.E — Exact Blueprint catalog, specimen and Full screens contract

The typed Blueprint manifest must record for every visual export:

- [ ] stable ID, exported component name, human label and category;
- [ ] one of Primitives, Components, Surfaces, Overlays or Full screens;
- [ ] intended production host (`chrome`, `app`, `surface`, `raised` or scrim);
- [ ] exact fixture viewport/content-frame dimensions and required safe inset;
- [ ] supported sizes, variants, interaction states and content states;
- [ ] explicit legal exceptions for scrolling, popover overflow, focus-ring overflow, wrapping or intentional ellipsis.

The `Specimen` contract must provide:

- [ ] annotation/header outside the measured component area;
- [ ] a scrollable outer workbench stage when the real component exceeds the available viewport;
- [ ] an opaque inner host using the declared Happy production surface so the measurement grid never shows through transparent chrome;
- [ ] a declared safe inset, defaulting to 24 px unless a full-screen edge contract explicitly requires zero;
- [ ] a 100%-scale content frame with explicit width/height and no `zoom`, `scale()` or scale-bearing transform;
- [ ] visible overflow during authoring, with the integrity test—not `overflow: hidden`—deciding whether it is legal;
- [ ] content-aware flex wrapping or one specimen per row instead of forcing fixed-width 360/480/640 modals and 520 px tabs into equal narrow columns.

The future manifest-wide test must be TypeScript using current Vitest Browser, `createRenderer` and repository Playwright geometry helpers. It must automatically render every entry in Chromium, Firefox and WebKit at 2× and check:

- [ ] each public visual export has exactly one discoverable Blueprint owner and separately addressable specimen;
- [ ] page and specimen IDs are unique/deterministic;
- [ ] host, frame dimensions, safe inset and overflow policy are declared;
- [ ] scale is exactly 1 and required roots remain fully inside the content frame;
- [ ] required edge gutters match the manifest;
- [ ] scroll width/height cannot exceed the frame unless the precise exception is declared;
- [ ] no hidden-overflow ancestor clips required content, popovers or focus rings;
- [ ] leaf text line boxes and visible ink fit; intentional ellipsis/wrapping is annotated and tested with short, normal, long-unbroken, multiline, Unicode, emoji and localized strings as applicable;
- [ ] fixed dimensions are exact and fluid components are exercised in fixed, nested and constrained hosts;
- [ ] transparent chrome is composited over its true host surface;
- [ ] every full screen is exactly 1024×704 and unscaled;
- [ ] failure output names page, specimen, part, edge and signed overflow distance;
- [ ] all three Retina screenshots are saved using existing infrastructure.

The Full screens section must eventually contain deterministic, network-free fixtures backed by
props for leaf components and in-memory `happy2-state` stores for connected product surfaces:

- [ ] authentication loading, server unavailable, password sign-in, registration, magic link, OIDC handoff and session expiry;
- [ ] onboarding profile, avatar crop/skip, sandbox provider, image choice, build progress/failure/retry and completion;
- [ ] Chat no-selection, empty channel, populated channel, human DM, agent DM, streaming, long run, upload, thread, profile inspector, channel settings, files inspector, editor conflict and every create/edit/forward dialog;
- [ ] global Search/Command Palette over an intact underlying route;
- [ ] Files loading, empty, gallery, filtered-empty, preview failure and viewer;
- [ ] Settings loading, normal, dirty/saving, validation, confirmation and failure;
- [ ] Admin unauthorized, partial-resource failure, tables, images and secrets;
- [ ] Activity and Threads if retained;
- [ ] Calls and Home only if explicitly retained.

### P0.F — Target `happy2-ui` screens and app lifecycle adapters

New `happy2-ui` contracts should keep leaf visuals props-only and allow complete product surfaces to
consume the relevant independent store contracts when their feature is implemented:

- [ ] `ApplicationScreen`/`WorkspaceScreen` for the exact persistent title/rail/sidebar/workspace/panel composition;
- [ ] `ChatScreen`, `ChatTimeline`, `ChatMessage`, `ChatActivityStrip` and `ChatInspectorHost`;
- [ ] `ChannelDetailsForm`, `AgentEffortSection` and `WorkspaceEditorDialog`;
- [ ] `ChannelDirectoryDialog`, `TeammatePickerDialog`, `CreateChannelDialog`, `CreateAgentDialog`, `EditMessageDialog`, `ConfirmDialog` and `ForwardMessageDialog`;
- [ ] `AuthFlowScreen`, `CredentialForm` and `ProfileSetupForm`;
- [ ] `SettingsScreen`, `PageColumn`, `ProfileSettingsSection`, `NotificationSettingsSection` and `SaveStateBanner`;
- [ ] `FilterableSurface`, `FilesScreen`, `SearchScreen` and full media viewer;
- [ ] `AdminScreen` plus truthful per-resource surfaces;
- [ ] `ActivityScreen`, `ThreadsScreen`, `CallsScreen` and `HomeScreen` only for retained destinations.

Independent `happy2-state` stores and thin app lifecycle modules should include:

- [ ] `SidebarStore` for render-ready chats, directory, DM peers, starring, unread presentation,
      selection, and the identity/presence fields the sidebar actually displays;
- [ ] one internal canonical identity/avatar projection catalog used by action modules when
      constructing typed events for retained surfaces; it is not another store that every row or
      screen subscribes to;
- [ ] one `ChatStore` per materialized chat for message pages, optimistic sends, read-through, typing and reactions;
- [ ] retained thread stores for root/replies, paging, send, races and subscriptions;
- [ ] workspace tree and versioned editor-file stores with independent lifetimes;
- [ ] attachment/viewer stores for uploads, provenance, signed/object URL lifetime, downloads and viewer intent;
- [ ] agent-activity stores for activity state and timer lifetime;
- [ ] chat-membership stores for members, roles, join/leave and channel settings;
- [ ] one small local store per complex dialog where state outlives a leaf component;
- [ ] pure identity/time/file/message presenters with explicit locale/time-zone inputs;
- [ ] one reusable autosave store/action module for debounce, fingerprint, single flight, trailing changes and disposal.

Stores expose immutable snapshots/subscriptions plus safe synchronous local actions publicly. Those
actions may emit typed output to an optional owner listener; closed authoritative inputs enter through
package-private writers and never emit output. Stores never expose DOM nodes, transport payloads, or
side effects. `HappyState` methods only forward into same-named integration modules; those modules own
queues, requests, reconciliation, timers, signed/object URL lifetimes, and multi-store dispatch. Thin
app lifecycle modules attach authentication, live connectors, routing, and window resources.

### P0.G — Detailed isolated implementation sequence

Each item below is a separate feature/worktree and must merge before the next begins.

#### UI-01 — Typed Blueprint manifest and export coverage

- [ ] Define manifest metadata/categories without changing production rendering.
- [ ] Register all existing public visual exports, including CountBadge, ReactionChip, KeyCap, ContextChips, MentionPicker, MessageList, DayDivider, SystemNotice, SearchField and WindowDragRegion as separately addressable contracts.
- [ ] Group the workbench selector by category.
- [ ] Add the TypeScript manifest/export coverage test.
- [ ] Run all `happy2-ui` browser tests.

Acceptance: exporting a visual component without Blueprint ownership fails CI.

#### UI-02 — Production-hosted, non-clipping specimen frame

- [ ] Implement outer measurement stage, opaque production host, safe inset and exact content frame.
- [ ] Replace one-child centering Grid with flexbox and replace fixed equal-column size pages with content-aware layout.
- [ ] Fix confirmed Rail (+24 px vertical), Tabs (+195 px horizontal), Modal (+107/+267 px horizontal) and ProfileCard (+28 px horizontal) fixture overflow without scaling.
- [ ] Add three-browser geometry coverage for the specimen frame.

Acceptance: every fixture is inspectable at 100% and transparent Rail chrome looks identical to its real app host.

#### UI-03 — Blueprint integrity audit suite

- [ ] Implement manifest-wide bounds, safe inset, scale, overflow, clipping and host checks in the existing TypeScript browser infrastructure.
- [ ] Add explicit annotations for legal ellipsis, scroll regions, popovers and focus-ring overflow.
- [ ] Use line-box/visible-ink measurement rather than naive `scrollHeight` for text.
- [ ] Save deterministic three-browser Retina screenshots and actionable failures.

#### UI-04 — Close current component coverage holes

- [ ] Give the ten bundled public exports their own Blueprint ownership.
- [ ] Add dedicated FilePanel, InfoPanel, Lightbox and ThreadPanel geometry/interaction tests.
- [ ] Add missing Fade screenshots and verify overlapping-layer bounds.
- [ ] Keep MessageMarkdown private with indirect Message coverage or promote it to a separately tested contract—decide explicitly.
- [ ] Split oversized tests by exported component/observable behavior without reducing coverage.

#### UI-05 — Full screens Blueprint infrastructure

- [ ] Add an exact 1024×704 full-screen fixture inside a scrollable Blueprint card at 100% scale.
- [ ] Add deterministic in-memory `happy2-state` store fixtures under a side-effect-free fixture
      export consumed by `happy2-ui/dev`; production never imports representative fixture data.
- [ ] Add each screen/state from P0.E only when its real screen component exists.
- [ ] Test overlays without replacing their underlying screen.

Acceptance: all visible product UI can eventually be reviewed without starting the app or server.

#### UI-06 — Split compound `happy2-ui` modules

- [ ] Split Badge/CountBadge/ReactionChip/KeyCap while preserving public imports.
- [ ] Split SearchField and WindowDragRegion from TitleBar.
- [ ] Split ContextChips and MentionPicker from Composer; extract additional composer contracts only where independently reusable.
- [ ] Split Message, MessageList, DayDivider and SystemNotice; extract media/actions/reactions only where they form reusable contracts.
- [ ] Move CSS/tests/pages with ownership without changing geometry in the first pass.

#### UI-07 — Extract pure app presenters

- [ ] Move identity, time/date, byte and message view-model mapping into pure tested app modules.
- [ ] Choose one identity tone algorithm and prove the same user has the same tone everywhere.
- [ ] Standardize file sizes including GB and deterministic locale/time-zone behavior.
- [ ] Remove mock visual types from live mappings.
- [ ] Preserve durable row IDs and stable streaming DOM.

#### UI-08 — Connect the independent Sidebar store

- [ ] Move summaries, directory, contacts, peers, starring, unread and selection into the
      independent `SidebarStore` and render it directly from the `happy2-ui` sidebar surface.
- [ ] Subscribe the sidebar surface once to its render-ready snapshot. `HappyState` embeds canonical
      ID/name/avatar projections and only the presence fields this surface renders; repeated rows and
      avatars create no subscriptions of their own.
- [ ] Preserve hydration coalescing while removing duplicate navigation application.
- [ ] Resolve N+1 DM peers only through an appropriate state/server bulk contract, not a UI abstraction.
- [ ] Split focused navigation tests from `LiveStateViews.test.tsx`.

#### UI-09 — Connect Chat, Composer, and thread stores

- [ ] Project loading/paging, optimistic send, read-through, typing, reactions and durable approvals
      into one retained `ChatStore` per chat and an independent `ComposerStore`; keep the workflows,
      queues, server calls, and event fan-out in integration action modules reached by the stores'
      typed output listeners and the thin `HappyState` facade.
- [ ] Precompute grouping once in the ordered view model; remove per-row full-list filtering.
- [ ] Use keyed state for independent message/chat UI values.
- [ ] Move thread load/reconcile/send/stale-response protection into its own retained store lifetime.
- [ ] Preserve current stable-row streaming and thread race tests.

#### UI-10 — Connect workspace, attachment, and activity stores

- [ ] Isolate workspace paging and conflict-safe editor state.
- [ ] Isolate upload, signed URL expiry, object URL cleanup, previews/downloads and viewer intent.
- [ ] Isolate activity filtering and ticking timers.
- [ ] Stop all work immediately when the owned chat/panel unmounts or changes.
- [ ] Add deterministic cleanup and race tests.

#### UI-11 — Move Chat panels/dialogs into `happy2-ui`

- [ ] Build the P0.F channel, effort, workspace editor and chat dialog components.
- [ ] Replace browser prompt/confirm only after controlled UI exists.
- [ ] Cover loading, validation, disabled, error and success/closing states.
- [ ] Add geometry, keyboard, focus-trap/return and Blueprint coverage in every browser.

#### UI-12 — Introduce the store-driven `ChatScreen`

- [ ] Compose shell/sidebar/header/timeline/activity/composer/inspector/overlays in `happy2-ui` from
      injected `SidebarStore`, `ChatStore`, `ComposerStore`, and other narrowly lived stores; keep
      leaf visual components props-only.
- [ ] Render complete Chat states in Blueprint from deterministic in-memory store fixtures before
      rewiring the app.
- [ ] Reduce the app Chat route to store lifetime, live connector attachment, routing, and one
      `ChatScreen` render.
- [ ] Preserve route, scroll, draft, thread/panel and streaming row identity.
- [ ] Remove live mock branches only after equivalent Blueprint fixtures exist.

Acceptance: the Chat route reads as wiring and the exact UI is independently reviewable.

#### UI-13 — Decompose Auth and Settings

- [ ] Separate Auth session/state machine from AuthFlowScreen/forms.
- [ ] Move credentials/profile setup visuals and all auth/onboarding states to `happy2-ui`/Blueprint.
- [ ] Create profile/status/preferences/avatar settings stores on demand with one render-ready snapshot
      per mounted section and explicit current/saved/clean/dirty/saving/error state per editable field.
- [ ] Give each settings store standalone field-specific actions such as `displayNameUpdate`,
      `displayNameReset`, `displayNameSave`, and `notificationLevelUpdate`, plus equally explicit typed
      output variants. Reject generic keyed field APIs; use the private fixture driver to toggle typed
      save success, failure, stale completion, and remote reconciliation in Blueprint without a live server.
- [ ] Replace triplicated autosave with a tested shared store/action module.
- [ ] Reconcile external status/preferences while open.
- [ ] Move the complete Settings screen/sections to `happy2-ui` and prove profile/avatar changes do not remount.

#### UI-14 — Decompose Files, Search and Admin

- [ ] Move full visual trees into `happy2-ui`; retain routing/auth in the app and put pagination,
      permission, and data state in independent `happy2-state` stores with optional live connectors.
- [ ] Add live Files/Admin reconciliation and independent Admin resource failures.
- [ ] Keep preview URL lifetime in focused app ownership.
- [ ] Add all full-screen states and browser coverage.

#### UI-15 — Resolve remaining destinations and dead code

- [ ] Decide retain/remove for Home, Inbox, Calls and Threads.
- [ ] Retained destinations require a `happy2-ui` screen, independent state store(s), live connector,
      in-memory Full screen fixtures, and browser tests.
- [ ] Removed destinations delete app view, mock data, exports and fixtures together.
- [ ] Remove unused Tailwind import and ignored legacy props after proving no consumer.
- [ ] Ensure production routes never import representative Blueprint/mock data.

#### UI-16 — Continuous architecture enforcement and final gate

- [ ] Reject app-owned visual CSS, raw visual DOM, inline layout styling and icon copies with a minimal documented root-host allowlist.
- [ ] Reject public UI exports missing Blueprint/test ownership.
- [ ] Reject component colors outside `theme.css`, including literal shadow/scrim colors needing tokens.
- [ ] Enforce dialog/menu Escape hierarchy, initial focus, trap/return, arrow navigation and typeahead contracts.
- [ ] Document props-only leaf and store-driven surface examples using AgentImages/Secrets and
      refactored Chat.
- [ ] Use complexity metrics as review signals, never arbitrary line gates.
- [ ] Run `pnpm check`, every `happy2-ui` browser suite, app/state tests and relevant gym coverage.

UI architecture acceptance gate:

- [ ] No production app route imports `mockData.ts` or owns visual layout outside the root-host exception.
- [ ] Every public visual export and retained production screen is discoverable in Blueprint.
- [ ] Every specimen declares host, safe inset, dimensions and overflow policy and passes all three browsers at 2×.
- [ ] Every Full screen is exactly 1024×704 at 100% scale.
- [ ] No unexplained bounds, text, focus-ring or popover clipping remains.
- [ ] Search/profile/file/thread/command overlays preserve the underlying route, focus, scroll and drafts.
- [ ] Chat streaming retains DOM nodes without remounting the screen.
- [ ] Stores have bounded UI subscriptions, while `HappyState` and app lifecycle adapters have bounded
      timers, requests, signed URLs, and object URLs; none of these counts grows with rendered
      message/avatar rows.
- [ ] Visual redesign is performed only as a separately approved feature after behavior-preserving extraction.

---

## P0. Installation bootstrap and server onboarding

### P0.1 — Durable bootstrap/status model (server feature)

- [x] Add a server-owned setup model with an explicit schema version and step states (`pending`, `in_progress`, `complete`, `failed`), timestamps, last error, and safe step metadata.
- [x] Track at minimum: bootstrap administrator claimed, sandbox provider selected/validated, base image selected, base image build requested, base image ready, and server setup complete.
- [x] Add per-user onboarding step state keyed by user and step, including `complete` and `skipped`, for extensible steps such as avatar and desktop-notification permission.
- [x] Make every transition transactional and idempotent; a restart during any step resumes from durable state.
- [x] Expose a minimal unauthenticated bootstrap status that does not leak accounts/configuration and authenticated combined onboarding state for routing.
- [x] Ensure only the one-time bootstrap path can claim the first administrator; close it atomically once claimed, including under concurrent server instances.
- [x] Before server onboarding completes, allow exactly one bootstrap account/profile and reject every additional registration attempt across password, magic-link, OIDC, and Cloudflare Access authentication.
- [x] Make registration policy the final server-onboarding step: the bootstrap administrator explicitly chooses whether new registrations are open or closed, and that durable choice completes server onboarding.
- [x] Emit sync hints for every durable setup/user-onboarding transition.
- [x] Add gym tests for fresh install, concurrent bootstrap claims, refresh/resume, restart recovery, completed setup, registration-open/closed final choices, and forbidden transition ordering.

Acceptance: a fresh database has exactly one legal bootstrap path; no client-local flag can bypass incomplete server setup.

Merged evidence (2026-07-16, `60db7cc`):

- migration `0015_durable_server_and_user_onboarding.sql` persists versioned server and per-user step state, bootstrap ownership, and the final registration policy;
- public `GET /v0/setup/status`, authenticated `GET /v0/setup`, user step mutation, and administrator registration-policy action expose the routing contract and emit sync hints;
- password, magic-link verification, OIDC, and Cloudflare Access all share the atomic bootstrap/registration gate; two independent server instances over one SQLite database prove exactly one concurrent winner;
- restart/resume, transition ordering, skipped/completed user steps, final open/closed policy, and closed-registration non-disclosure are covered by the complete 100-test server Gym suite;
- the persisted Claude Opus medium-effort review/fix/resume loop ended `READY` with no blocking or actionable findings;
- repository-wide `pnpm check` passed formatting, lint, typecheck, all unit/Gym/browser tests, and production builds before merge.

### P0.1a — Server unit/Gym coverage measurement and regression gate

- [x] Land this as the next independently mergeable server-infrastructure task after P0.1 and before the functional-action refactor; do not mix coverage plumbing with either feature's behavior.
- [x] Use Vitest's V8 coverage provider and the repository's TypeScript/pnpm infrastructure only; do not add Python or a parallel test runner.
- [x] Define one authoritative server source universe covering every production file under `packages/happy2-server/sources`, including files no test imports, while excluding test files, generated declarations/build output, and test/fixture helpers.
- [x] Add a server-unit coverage command that runs only `happy2-server` unit tests and writes isolated text, HTML, LCOV, JSON, and JSON-summary reports under `packages/happy2-server/coverage/unit`.
- [x] Add a Gym integration coverage command that runs the complete non-Playwright `happy2-gym` server suite, instruments the aliased `happy2-server/sources` files rather than compiled output, and writes the same reports under `packages/happy2-server/coverage/gym`.
- [x] Add a TypeScript report/merge command that combines unit and Gym coverage by canonical server source path and produces a third union report under `packages/happy2-server/coverage/combined`; merging must not double-count a line covered by both suites.
- [x] Print side-by-side unit, Gym, and combined statement/branch/function/line percentages plus uncovered files/lines in terminal output so integration coverage is distinguishable from unit coverage at a glance.
- [x] Check in a small machine-readable baseline containing the three metric sets, not generated HTML/LCOV/raw coverage artifacts; make all generated report directories gitignored and removable through the existing clean commands.
- [x] Add explicit non-regression thresholds for unit, Gym, and combined coverage after measuring the initial baseline. A change may deliberately lower a threshold only in the same reviewed commit with a written rationale in `TODO.md`; rounding must never let a real regression pass.
- [x] Add one root command for local/CI use and wire it into `pnpm check` so missing instrumentation, an empty source universe, a failed suite, a failed merge, or coverage below any stored threshold fails the check.
- [x] Add focused tests for the coverage tooling itself: canonical path merging, overlapping hit counts, an entirely uncovered production file, malformed/missing input, and threshold pass/fail behavior.
- [x] Document exact commands, report locations, included/excluded files, metric definitions, and how to inspect separate Gym integration gaps before starting P0.1b.

Acceptance: one command proves how much of the complete server is exercised by unit tests alone, Gym alone, and their union; all three views are reproducible, separately inspectable, and enforced against regression in `pnpm check`.

Merged evidence (2026-07-16, `5345c7e`):

- one shared TypeScript source-universe definition currently validates all 72 production server files in both raw maps and rejects empty, missing, malformed, or incomplete inputs;
- `pnpm coverage:server` produces text, HTML, LCOV, JSON, and JSON-summary reports for unit, Gym, and boolean-union combined coverage, then enforces exact-ratio thresholds from `coverage-baseline.json`;
- unit coverage was stable across review runs at 4101/10968 statements, 2470/7757 branches, 783/2003 functions, and 3907/9801 lines, so its stored thresholds remain those exact ratios;
- five unchanged-tree Opus review runs exposed timing-dependent Gym variance: 8029–8036 statements, 4830–4837 branches, 1655 functions, and 7538–7544 lines; their combined union ranged from 8878–8885 statements, 5431–5438 branches, 1799 functions, and 8324–8330 lines;
- the reviewed Gym thresholds are therefore narrow one-decimal floors below those measured minima: 8018/10968 statements, 4825/7757 branches, 1655/2003 functions, and 7528/9801 lines; combined floors are 8874/10968, 5422/7757, 1799/2003, and 8312/9801 respectively. This deliberate margin absorbs the observed lease/retry/SSE timing noise while the gate still compares exact integer ratios, so display rounding cannot decide pass/fail;
- nine focused tooling tests cover canonical paths, overlapping-hit union semantics without input mutation, an entirely uncovered production file, source enumeration/exclusions, malformed/missing/incomplete maps and baselines, empty universes, and a true display-rounding collision in exact threshold pass/fail behavior;
- a pre-existing streamed-agent Gym race was made deterministic by waiting for the durable user message before injecting Rig deltas and by persisting the agent-turn checkpoint through the repository transactional write boundary; the focused test passed 20/20 locally and 12/12 under Opus review;
- the normal Gym suite exposed three cross-file timing failures around streamed turns, workspace cursors, and magic-link delivery. It is temporarily serialized (`fileParallelism: false`), making the reviewed 43-file/100-test run take 82.8 seconds instead of 8.8 seconds; restoring safe parallel execution after isolating those shared-resource races is explicitly deferred to P3.4 rather than treated as solved;
- the magic-link profile workflow now verifies the link response and token before continuing, preventing an opaque downstream failure;
- the coverage gate, all workspace typechecks, repository-wide formatting, and the 43-file/100-test normal Gym suite pass locally; the persisted Claude Opus medium-effort review/fix/resume loop ended `READY` after independently validating the measured noise floors and every correction, with no blocking or actionable findings.

### P0.1b — Functional server action architecture (server refactor)

- [x] Perform this as the immediately following, independently mergeable server task after P0.1a; do not mix it into coverage plumbing or begin P0.2 until it is merged.
- [x] Keep the complete Drizzle schema in one authoritative schema file, while removing `Database`, `*Repository`, and similar stateful/superclass concepts from application behavior.
- [x] Represent every server mutation as one exported async function in its own file; the filename must exactly match the function name (for example, `userCreateProfile.ts` exports `userCreateProfile`).
- [x] Put a short semantic doc comment above every exported action describing its observable purpose, changed durable invariant, material side effects/transaction expectations, and why the action boundary exists; review the implementation against that promise.
- [x] Name actions in lower camel case with the entity first and the operation second: `userCreateProfile`, `chatSendMessage`, `agentImageBuild`; never verb-first forms such as `createProfileUser`.
- [x] Organize action files by coherent product module (`user`, `chat`, `agent`, `file`, `setup`, `auth`, and so on); replace the ambiguous catch-all `collaboration` module with explicit ownership boundaries.
- [x] Pass a Drizzle executor/transaction as the first argument whenever an action reads or writes durable state; actions that do not touch durable state must not receive a fake database dependency.
- [x] Define one small transaction-composition abstraction that lets an outer action call nested actions using the same executor and lets a top-level action run transactionally or directly without duplicating business logic.
- [x] Keep module-private shared implementation only under that module's `impl/` or `utils/` directory. Caches, parsers, projections, SQL helpers, and other shared details must not become global service classes.
- [x] Do not require action initialization, lifecycle methods, process-global mutable instances, or dependency containers. Construction should be plain dependency values passed to functions.
- [x] Split queries into focused entity-first functions as well when doing so removes a repository/database facade; do not replace one giant class with one giant utility file or barrel containing business logic.
- [x] Preserve authorization, idempotency, transactions, sync sequence/event writes, realtime hints, restart behavior, and observable HTTP contracts exactly while moving behavior.
- [x] Add compile-time architecture checks that reject new `*Repository`/`Database` behavior classes, mismatched action filenames/exports, verb-first mutation names, and direct mutation SQL outside approved action/`impl` files.
- [x] Migrate incrementally by module with focused existing gym coverage after every slice, then delete the old class only when no production caller remains; never keep permanent dual implementations.
- [x] Update `AGENTS.md` with the final action/file/module/transaction rules once the architecture is proven, so all later server features use it by default.

Acceptance: every production server mutation has one discoverable entity-first function in a same-named file, composes through an explicit executor/transaction boundary, and no stateful database/repository superclass or initialization lifecycle remains.

Coverage-baseline adjustment for this refactor (2026-07-16): splitting the existing
behavior into same-named per-action files expands the authoritative production source
universe from 72 to 555 files while removing facade/class boilerplate and consolidating
duplicate sync actions, so the instrumented totals change to 10,900 statements, 7,704
branches, 1,970 functions, and 9,786 lines. The post-refactor measurement is
4,050/2,446/759/3,869 for unit coverage, 7,970/4,798/1,622/7,509 for Gym, and
8,819/5,397/1,766/8,296 for the union (in statement/branch/function/line order). Unit
thresholds use those exact stable ratios. Gym and combined retain the same small absolute
timing-noise margins established and reviewed in P0.1a: 7,959/4,793/1,622/7,499 and
8,815/5,388/1,766/8,284 respectively. This is a reviewable source-layout baseline
regeneration, not an exclusion change; all production files, including files no test
imports, remain in the coverage universe.

Completion evidence (2026-07-16): the server now has 555 instrumented production source
files with the complete Drizzle schema still owned by one file. Stateful database and
repository behavior facades are gone; durable behavior is exposed as documented,
entity-first, same-named action functions grouped by product module, with private shared
code contained by each module and no cross-module private implementation imports.
`DrizzleExecutor`, `DrizzleTransaction`, and `withTransaction` preserve direct and nested
transaction composition, while the architecture checker enforces these boundaries.
Verification passed with 23/23 architecture-tooling tests, 87/87 server unit tests,
100/100 server Gym tests, 18/18 browser tests, 435/435 `happy2-ui` tests, and 67/67
`happy2-app` tests, plus clean workspace typechecking, linting, formatting, and diff
checks. Coverage measured 10,900 statements, 7,704 branches, 1,970 functions, and 9,786
lines: unit 4,050/2,446/759/3,869 (exact floor), Gym 7,971/4,800/1,622/7,509 against
7,959/4,793/1,622/7,499, and combined 8,820/5,399/1,766/8,296 against
8,815/5,388/1,766/8,284. Six medium-effort review rounds in one persisted Opus session
ended with `READY` after the final independent audit and full behavior rerun.

### P0.2 — Sandbox-provider discovery and selection (server feature)

- [x] Define the provider interface around capabilities the current product needs: health probe, image build, container/session create, file ingress/egress, terminal attach, cleanup, and status reporting.
- [x] Implement local Docker and local Podman drivers without adding deployment-specific code switches; select the configured provider through durable setup/config state.
- [x] Probe Docker and Podman safely with bounded timeouts and return displayable version, health, and remediation details.
- [x] If exactly one healthy provider exists, recommend it but still explain that agent code runs inside its sandbox.
- [x] If both exist, require an explicit choice; if neither exists, show install/start guidance and continue probing reactively while setup is on screen.
- [x] Keep the public contract capable of later remote providers, but do not implement E2B/Daytona until a concrete feature requests them.
- [x] Replace direct `LocalAgentDockerRuntime` construction with the selected provider boundary while preserving current security settings and cleanup behavior.
- [x] Add gym tests for Docker only, Podman only, both, neither, unhealthy daemon, version probe timeout, persisted choice, and restart.

Acceptance: server setup can prove where code will run, remembers the choice, and all agent image/container operations use that choice.

Implementation evidence in progress (2026-07-17):

- the server now exposes fresh, bounded Docker/Podman discovery through `GET /v0/setup/sandboxProviders` and administrator-only durable selection through `POST /v0/setup/selectSandboxProvider`; selection atomically completes the selected/validated setup steps, emits one setup sync hint, survives restart, is idempotent for the same provider, and rejects replacement;
- `SandboxProvider` owns health/status, image build, sandbox create/remove, file ingress/egress and terminal attachment. The local Docker and Podman drivers preserve the readonly root, init, shared-memory, tmpfs, mount, lifecycle, cleanup and Docker Desktop retry contract, while the agent service resolves the durable provider for every image/container operation rather than caching process-local authority;
- the focused provider unit suite passes 4/4 tests, including exact hardened container argv, Docker-only BuildKit behavior, Podman behavior, file and terminal operations, cleanup/retry, unavailable/unhealthy/timed-out probes, and a valid UTF-8 512-byte version bound;
- the focused Gym suite passes 7/7 tests and covers anonymous/non-administrator non-disclosure, Docker-only, Podman-only, both healthy, both unavailable, unhealthy and timed-out status, explicit choice, rejected/repeated/replacement selection, provider routing, durable restart recovery, and reactive re-probing;
- final-tree coverage measured unit 4,150/11,071 statements, 2,504/7,826 branches, 786/2,005 functions, and 3,960/9,939 lines; Gym 8,065/11,071, 4,858/7,826, 1,639/2,005, and 7,599/9,939; combined 8,988/11,071, 5,504/7,826, 1,803/2,005, and 8,452/9,939. Unit thresholds use those exact ratios. Gym floors retain the reviewed P0.1a timing margins at 8,053/4,851/1,639/7,589, and combined floors at 8,983/5,493/1,803/8,440. The Gym statement/line ratio is slightly diluted because P0.2 deliberately introduces the complete file/terminal provider boundary required by this task before later HTTP workflows consume those capabilities; absolute Gym coverage still rises, every currently observable provider workflow has black-box coverage, and combined coverage improves materially;
- repository-wide `pnpm format` and `pnpm check` pass, including architecture/lint/typecheck gates, coverage tooling 23/23, server unit 89/89, normal and coverage Gym 44 files/107 tests, browser Gym 18/18, `happy2-state` 24/24, `happy2-ui` 435/435, `happy2-app` 67/67, the regenerated coverage gate, and every production build. The first persisted medium-effort Fable review requested five corrections; all were implemented, independently rerun, and confirmed `READY` in the same session with no blocking or actionable finding remaining.

### P0.3 — Base image selection/build orchestration (server feature)

- [ ] Reuse existing immutable agent-image records and build workers; expose onboarding-specific selection of `daycare-minimal`, `daycare-full`, or a custom definition.
- [ ] Make “download/build” wording reflect the chosen image source while keeping one durable job/status contract.
- [ ] Prevent setup completion until the selected default image is `ready` and has been atomically promoted.
- [ ] Surface progress, current log line, full log, failure reason, retry, and restart recovery through existing SSE/difference mechanisms.
- [ ] Define rollback when promotion fails and avoid leaving setup pointing at a failed/missing image.
- [ ] Add gym coverage for successful build, cached/reused immutable image, failure/retry, server restart mid-build, and setup completion gating.

Acceptance: refreshing during a build returns to the same progress screen; a ready default image unlocks the application exactly once.

### P0.4 — Centered onboarding/router UI (Claude Opus after backend approval)

- [ ] Land the P0.8 route foundation before, or as the first isolated prerequisite to, this UI so onboarding does not create a second temporary navigation system.
- [ ] Replace the split right-side auth panel with a centered desktop setup card on the shared onboarding background; do not add mobile layouts.
- [ ] Give each step a stable route: bootstrap account, sign-in, profile, sandbox provider, base image, build progress, and completion.
- [ ] Route guards derive the next legal page only from server/user onboarding state; manually entering a later URL redirects to the first incomplete prerequisite.
- [ ] Keep the entire main application inaccessible while required server setup is incomplete.
- [ ] Show a non-admin waiting surface that updates through SSE when the administrator advances setup.
- [ ] Reuse `AgentImagePanel`/`AgentImageDetail` concepts where appropriate, but create onboarding-sized reusable `happy2-ui` components and blueprint fixtures rather than importing admin layout.
- [ ] Preserve form state through transient network loss and show retry without using `location.reload()`.
- [ ] Add app routing tests plus happy2-ui Chromium/Firefox/WebKit Retina geometry and keyboard/focus tests.

Acceptance: reload/deep link always lands on the correct centered step, build progress advances live, and completion enters the main route without a full-page reload.

## P0. User profile, avatar, and personal onboarding

### P0.5 — First profile and user onboarding contract

- [ ] Add optional Last name as its own field to initial profile creation and Settings; never infer first/last name by splitting a display-name string.
- [ ] Keep First name and Username required with server-authoritative validation and field-specific error codes.
- [ ] Return whether this is the bootstrap administrator so the UI can explain the role without letting the client assign it.
- [ ] Define initial user steps: profile created, avatar uploaded or explicitly skipped, desktop notifications allowed/denied/not asked, and user onboarding complete.
- [ ] Ensure later optional steps can be added without replaying completed steps or trapping old clients.
- [ ] Add auth gym tests and AuthGate tests for optional last name, skip semantics, refresh on every step, and stale/older-client behavior.

### P0.6 — Avatar crop and no-remount update

- [ ] Specify a server invariant that every stored avatar is square, decodable, within size/pixel limits, and normalized after orientation.
- [ ] Accept the client crop result (or explicit crop rectangle) and revalidate/re-encode it server-side; never trust browser MIME or dimensions.
- [ ] Add a reusable `happy2-ui` cropper/editor with zoom and pan, square crop output, and a circular mask preview showing actual in-product appearance.
- [ ] Use the same cropper in onboarding and settings.
- [ ] Add a regression test proving avatar change preserves the current route, chat, scroll position, draft, open thread/panel, and existing DOM/state instance.
- [ ] Revoke superseded object URLs without blanking other avatar instances during the swap.
- [ ] Reconcile the changed avatar once into the internal canonical identity projection catalog, then
      let `HappyState` dispatch typed projection events to already materialized sidebar, chat, search,
      profile, and rail stores that render it. Replacing affected sender/message references is allowed
      on this rare path; do not add per-avatar subscriptions.
- [ ] Add gym tests for non-image, corrupt image, animated input, orientation, non-square input, oversized dimensions, crop bounds, and square stored output.

Acceptance: the user chooses the exact crop, sees a circular preview, and every visible avatar changes without any application restart/remount.

### P0.7 — One profile surface everywhere

- [ ] Define one reusable profile detail contract for self, human teammate, agent, and bot variants.
- [ ] Use it from message avatar/name, DM header/title/avatar, member list, search result, and the current-user rail avatar.
- [ ] Compose edit controls only for self; compose agent controls only where authorized; do not fork the identity layout.
- [ ] Preserve the already-implemented read-only workspace-managed Title treatment and apply it consistently on every profile entry point; keep status/availability only if the product displays them elsewhere.
- [ ] Remove all Settings/profile imports from `mockData.ts`; use the authenticated profile and reactive workspace state without hard-coded identity fallbacks.
- [ ] Hide email/desktop notification controls until their delivery path is genuinely operational, or label them accurately and prove the behavior end to end.
- [ ] Add navigation and component tests showing all entry points open the same underlying component and data.

## P0. Desktop navigation, search, commands, and feedback foundation

### P0.8 — Persistent routes without surface remounts

- [ ] Introduce a desktop route model for chat/channel, thread, profile, files/file, settings, admin subsection, onboarding, and modal overlays.
- [ ] Preserve the mounted primary surface when opening search, profile, file viewer, thread, or command palette.
- [ ] Restore route, selected chat, thread, inspector, and safe local UI state on refresh; do not persist secrets or unsent uploads.
- [ ] Support browser/Electron back/forward semantics and deep links.
- [ ] Move route ownership out of ad-hoc `activeFeatureId` signals while keeping `happy2-state` framework-independent.
- [ ] Add regression tests for search, avatar change, panel open/close, back/forward, refresh, and concurrent SSE updates without remount.

### P0.9 — Global search and `⌘K`

- [ ] Turn `⌘K` into a real global command palette shortcut with focus return, Escape behavior, arrow navigation, Enter selection, and IME-safe input.
- [ ] Keep search in an overlay/palette over the current surface rather than replacing/unmounting it.
- [ ] Carry the selected result’s type and ID through navigation.
- [ ] Channel result: open that channel, joining only through an explicit action when required.
- [ ] Person result: open the shared profile surface and offer/start a DM.
- [ ] Message result: open its chat/thread, load the required page, and center/highlight the message.
- [ ] File result: open the real file viewer focused on that file.
- [ ] Add create/join channel and new agent-chat commands with autocomplete over people, agents, and channels.
- [ ] Add pagination/infinite result loading and cancellation; do not fetch the full file index on every query.
- [ ] Add server search coverage for permission filtering/cursors and app tests for every result type, stale-query cancellation, keyboard use, and no-remount behavior.

### P0.10 — Unified feedback and error behavior

- [ ] Create reusable `happy2-ui` feedback primitives: field error, actionable banner, toast/background notification, destructive confirmation dialog, progress notification, and optional sound cue.
- [ ] Define a decision matrix: validation stays at the field/button; recoverable surface errors stay inline; blocking failures use a modal; background failures use a toast/activity center.
- [ ] Add an accessible shake animation only for invalid submit attempts, respect reduced-motion, retain focus, and pair motion with visible text/ARIA announcement.
- [ ] Add sound only for user-relevant background completion/failure/mentions, with a preference and no duplicate sounds across windows.
- [ ] Map `UserError` codes to stable display copy and remediation actions rather than rendering raw server messages.
- [ ] Ensure optimistic background-action failures are centrally subscribed and never disappear into `statusHint` text.
- [ ] Replace browser-native `window.prompt`, `window.alert`, and `window.confirm` interactions with the shared accessible dialog/form primitives while preserving typed input on validation failure.
- [ ] Add component/blueprint/browser tests for focus, live regions, reduced motion, stacking, dismissal, repeated errors, and sound suppression.

### P0.11 — Complete authentication and account lifecycle

- [ ] Implement real client flows for every configured authentication method: password, email magic link request/verification, OIDC browser redirect/callback, and Cloudflare Access.
- [ ] Do not render passive “Check your email” or “Continue in your browser” copy without the action that actually starts that flow.
- [ ] Give password creation visible requirements, confirmation, field-specific failures, pending state, and safe retry while preserving the email.
- [ ] Add Logout to the profile/settings surface, revoke the server session, stop state/SSE, clear sensitive UI state, and return to the correct auth route without `location.reload()`.
- [ ] Add session-expired handling that preserves only safe navigation intent and never loops refresh/auth requests.
- [ ] Resolve the current semantic mismatch where Settings labels the profile email as sign-in email even though password login uses the authentication account email. Either add a verified account-email change flow or relabel profile email accurately.
- [ ] Define account recovery/password change/session management before exposing controls for them; do not imply unsupported capabilities.
- [ ] Add server/app tests for every auth method, popup/browser cancellation, expired/consumed magic link, OIDC error, logout, revoked session in another window, and account/profile email behavior.

## P1. Sidebar, chats, and Happy

### P1.1 — Sidebar information architecture

- [ ] Start this visual reorganization only after the P1.2 creation/discovery flow is functional, so compact empty states always have a working destination.
- [ ] Put people channels and human direct messages before agent chats; keep agent DMs in the lowest section.
- [ ] Pin the default Happy agent entry so it is always visible and cannot be hidden, archived, or removed from navigation.
- [ ] Replace oversized empty cards inside sections with one-line hints and a compact action/icon.
- [ ] Ensure no section is visually empty without a useful next action.
- [ ] Distinguish unread chat (stronger label/dot) from direct mention (numeric mention badge); do not use total unread count as the mention counter.
- [ ] Keep starred behavior without duplicating or accidentally hiding the pinned Happy entry.
- [ ] Move administration out of the main feature rail into a subtle settings entry near the profile/plus area, visible only to authorized users.
- [ ] Add exact sidebar order/empty/unread/mention/pinned-Happy tests in `happy2-ui` and live app tests.

### P1.2 — Fast creation/discovery flows

- [ ] Replace the current `window.prompt` plus exact-name lookup for new DMs with the real autocomplete flow before doing sidebar-only polish.
- [ ] Provide one autocomplete dialog/command for new human DM, new agent chat, join channel, and create channel.
- [ ] Support group direct messages through the existing server contract, including member autocomplete, duplicate prevention, naming, and a clear distinction from channels.
- [ ] Make directory selection navigate to the selected person/channel and clearly distinguish preview, join, and open.
- [ ] Allow “New chat with Happy” from the plus menu and command palette without creating another agent identity.
- [ ] Reuse existing name/slug/username derivation and validation where correct, then add missing field-level errors and preserve entered data on server failures.
- [ ] Remove the product expectation that users create many agent identities just to obtain fresh context.
- [ ] Add app tests for all keyboard/mouse flows, duplicate names, authorization, and route results.

### P1.2a — Complete channel and message workflows

- [ ] Add live channel member management for authorized roles: invite/add, remove, leave, transfer/change role, visibility/listing, archive/unarchive, and destructive delete where supported.
- [ ] Expose pins and bookmarks using existing server operations and navigate them to exact messages/files.
- [ ] Keep the existing Reply/Edit/Delete server and state wiring; replace their browser-native dialogs and add the missing Quote, Forward, Pin, Bookmark, and revision-history UI with authorization-aware menus and confirmations.
- [ ] Add scheduled-message composition/cancellation only if it remains a launch feature; otherwise keep the server capability out of the production UI.
- [ ] Support attachments and rendered image/file previews in thread replies, not only the main composer/message list.
- [ ] Add cursor pagination in both directions for long chats/threads, preserve scroll anchors during prepend/live append, and load a searched message’s containing page.
- [ ] Verify the initial message-page contract excludes thread replies from the root timeline before rendering, eliminating any reply flash or duplicate while thread state loads.
- [ ] Represent concurrent typers as an expiring per-chat set, ignore stale stop events, and clear abandoned typing state after a bounded timeout.
- [ ] Show delivery/generation/edit/delete/forward source state truthfully and handle an action racing with deletion or permission loss.
- [ ] Add gym/state/app tests for every exposed action, long-history pagination, scroll anchoring, membership changes, and concurrent edits/deletes.

### P1.3 — Executable default Happy agent (server feature)

- [ ] Add a server-managed default executable agent distinct from the immutable service identity.
- [ ] Give every channel a default-agent assignment, initially Happy, with an authorized action to change it.
- [ ] Allow multiple new chats with the same agent by creating conversation instances with independent Rig bindings/contexts instead of deduplicating by participant pair.
- [ ] Define lifecycle/ownership for server-managed Happy so it cannot be deleted while still allowing image/model/policy updates by administrators.
- [ ] Add gym coverage for always-available Happy, independent contexts, default-agent changes, permissions, deletion protection, and restart.

## P1. Files, media, and forwarding

### P1.4 — Video poster and media metadata pipeline (server feature)

- [ ] Generate a deterministic poster/thumbnail from the first useful video frame and a preview variant suitable for the gallery.
- [ ] Compute and persist SHA-256 for every uploaded original and expose only the metadata needed by authorized clients.
- [ ] Keep metadata extraction bounded by time, bytes, pixels, and container complexity; malformed video must remain a safe downloadable file.
- [ ] Record width, height, duration, codec/container where available, poster state, and processing failure.
- [ ] Stream async processing status if poster generation is moved out of the upload request.
- [ ] Add gym tests for MP4/WebM/AVI, rotation, empty/black first frame policy, malformed/truncated files, hashing, restart, and unauthorized variants.

### P1.5 — Full media/file viewer

- [ ] Build one `happy2-ui` viewer shell for image, video, GIF, text/code preview, and generic file detail.
- [ ] Images support fit, actual size, zoom, pan, reset, keyboard shortcuts, download, share/forward, and previous/next gallery navigation.
- [ ] Video supports poster, play/pause, seek, volume, duration, fullscreen, keyboard controls, and authenticated range requests.
- [ ] Generic files show safe metadata and explicit download/open actions; unsupported content is never injected into the DOM.
- [ ] Open the viewer from messages, thread messages, Files, search, and forwarded content using one route/modal contract.
- [ ] Replace the one-shot 60-file `FilesView` snapshot with cursor pagination and SSE/difference reconciliation; derive counts from durable state rather than the currently loaded page.
- [ ] Make signed-file URL caching expiry-aware and retry once with a freshly authorized URL instead of retaining dead URLs indefinitely.
- [ ] Preserve the underlying chat/gallery and return focus/scroll position when closed.
- [ ] Add `happy2-ui` browser geometry/interaction tests and app tests for signed-URL expiry/retry, range playback, and authorization loss.

### P1.6 — Forward message/file UI

- [ ] Add Forward to message actions in channels and threads.
- [ ] Provide a searchable multi-destination picker covering channels, DMs, agent chats, and the current thread where legal.
- [ ] Show source attribution and attachment preview before confirmation.
- [ ] Invoke the existing `forwardMessage` state operation with one idempotency key across retries.
- [ ] Reconcile every destination live and navigate to it only when the user asks.
- [ ] Clarify thread-to-thread semantics: forward as a new root or as a reply to a selected thread root; persist that relationship explicitly if the current server API cannot represent it.
- [ ] Add app/state tests for attachments, inaccessible destinations, duplicate retry, partial destination failure policy, thread targets, and deleted source.

## P1. Mentions, unread state, reactions, and emoji

### P1.7 — Mention semantics and agent-visible authorship

- [ ] Add `@here`, `@channel`, and `@everyone` to composer autocomplete with clear scope/warnings; decide whether `@all` is an alias or rejected.
- [ ] Render mentions from server-provided ranges rather than reparsing display text in the browser.
- [ ] Persist and present the sender’s display name and username to agent context for every message so agents understand group authorship.
- [ ] Add channel member/role/context information to the agent system prompt with bounded size and clear mention instructions.
- [ ] Allow agent-authored `@username` output to create normal mention notifications through the existing parser.
- [ ] Apply direct-mention counters only to actual user/special mentions; ordinary unread messages use the unread style without a numeric mention badge.
- [ ] Add gym/state/UI tests for Unicode-adjacent syntax, case-insensitive usernames, special mentions, edits/deletes, agent mentions, threads, muted channels, and read reconciliation.

### P1.8 — Complete reactions and emoji

- [ ] Replace the 16-item mock list with a complete, searchable, categorized Unicode emoji dataset loaded efficiently.
- [ ] Load custom workspace emoji from the existing server endpoint and merge it with Unicode results.
- [ ] Maintain recent/frequent emoji per user without leaking the list between accounts.
- [ ] Preserve reaction `userIds` through the app mapping and show names/avatars on hover/focus/click, including a full list for large counts.
- [ ] Make reaction picker, composer picker, status picker, and custom emoji share the same catalog/search primitives.
- [ ] Reconcile add/remove concurrently without double increments or stale optimistic state.
- [ ] Add component tests for search/categories/keyboard/virtualization and gym/state/app tests for custom emoji permissions, concurrent reactions, user lists, and deletion.

## P1. Agent conversations and execution controls

### P1.9 — Agents in channels and audience mode (server feature)

- [ ] Extend agent-turn selection beyond direct DMs to a channel’s configured default agent and explicitly selected additional agents.
- [ ] Add persisted message audience (`people`, `agents`, or explicit agent IDs) and authorization rules.
- [ ] Guarantee one independent Rig session/container per agent + conversation context.
- [ ] Queue multiple agents deterministically and prevent one failed agent from blocking other chat delivery.
- [ ] Define thread behavior: inherit channel agent by default, with explicit audience override.
- [ ] Include bounded channel history, author usernames, attachments, prompts, and configuration in the Rig submission.
- [ ] Add gym coverage for people-only posts, default-agent posts, multi-agent posts, DMs, threads, concurrency, retries, agent removal, and restart recovery.

### P1.10 — Composer agent mode and controls (Claude Opus after approval)

- [ ] Add a clearly labeled People/Agents mode to `Composer`; Shift-Tab toggles it without stealing normal Tab accessibility navigation.
- [ ] Change composer color/chrome and placeholder so the active audience is unambiguous.
- [ ] Show the active default agent and allow selecting additional agents without requiring `@mentions`.
- [ ] Preserve mode per conversation locally and expose the persisted audience on sent messages.
- [ ] Add model, AI provider, and effort controls in the composer/session surface using values returned by Rig/server; honor both creator and server-administrator permissions instead of the current creator-only UI check.
- [ ] Add keyboard, screen-reader, focus, and accidental-send tests.

### P1.11 — AI provider/model configuration (server feature)

- [ ] Expose Rig-reported providers, models, current model, supported effort levels, and availability through a typed server/state contract.
- [ ] Persist defaults at the correct scope: server allowed providers, agent default, channel default override, and session/chat override.
- [ ] Validate every choice against the live Rig capability set and return displayable fallback/error information when a provider disappears.
- [ ] Never return provider credentials to the client; integrate credential presence with the secret system.
- [ ] Apply changes to future turns without silently rewriting already-running work.
- [ ] Add gym/state coverage for defaults/overrides, unavailable model, provider secret missing, concurrent update, existing session, and restart.

## P1/P2. Agent execution visibility, terminal, and tools

### P1.12 — Durable compact agent run trace (server feature)

- [ ] Persist a bounded run/event model for tool calls, approvals, workflow phases, subprocesses, subagents, usage, files, completion, and errors instead of collapsing all Rig events to phase only.
- [ ] Preserve ordering and idempotency using Rig event IDs/run IDs; resume safely after server restart and stream changes as hints.
- [ ] Store summarized display data separately from sensitive/raw payloads and enforce retention/redaction limits.
- [ ] Keep the main message stream compact: one live activity card per run with elapsed time, phase, token use, and expandable grouped events.
- [ ] Provide pagination/raw trace access for debugging without rendering thousands of tokens into the chat by default.
- [ ] Connect existing `AgentRunCard`, `ApprovalCard`, `DiffSnippet`, and activity components to real state rather than mock attachments.
- [ ] Add gym/state tests for every Rig event class, duplicate/out-of-order events, restart, redaction, long runs, and terminal failure.
- [ ] Add UI virtualization/expansion tests and prove a ten-hour/high-event-count run does not grow the main DOM without bound.

### P1.13 — Session terminal (server feature, then UI)

- [ ] Add an authenticated, authorized interactive terminal bridge to the exact Rig session container, using a bounded PTY protocol and GET/WebSocket upgrade or another explicitly documented transport.
- [ ] Authorize by active chat membership and agent-session access on every connection; revoke immediately on membership/session loss.
- [ ] Enforce container boundary, terminal size limits, idle timeout, rate limits, audit metadata, and cleanup on disconnect/server restart.
- [ ] Support resize, stdin, stdout/stderr, exit status, reconnect semantics, and clear read-only/unavailable errors.
- [ ] Build a reusable `happy2-ui` terminal panel opened from the agent/session header, with copy/search/clear and visible container/session identity.
- [ ] Add gym security/lifecycle tests and desktop UI tests for focus, resize, reconnect, multiple windows, and expired session.

### P2.1 — Happy-to-Rig durable tool bridge (server feature)

- [ ] Define a versioned allowlisted tool manifest attached to a Rig session; tools are described in the agent context as normal callable tools.
- [ ] Transport tool request/result/error through durable Rig events with correlation IDs, idempotency, deadlines, cancellation, authorization, and audit records.
- [ ] Dispatch on Happy server capabilities rather than exposing arbitrary HTTP paths or tokens to Rig.
- [ ] Start with narrowly scoped tools: create chat/channel, create subchannel, post message, attach known file, inspect allowed channel metadata, and request clone.
- [ ] Evaluate authorization as the configured agent principal plus initiating user/channel policy; never inherit blanket administrator authority.
- [ ] Return structured, bounded, displayable failures over the same session channel.
- [ ] Add gym tests for replay, timeout, restart between request/result, unauthorized tool, malformed payload, concurrent calls, and audit trail.

### P2.2 — Safe files from Rig to Happy and back (server feature)

- [ ] Add an allowlisted file-attachment tool accepting one or many paths only from the session workspace.
- [ ] Resolve real paths and reject traversal, symlinks escaping the workspace, devices, sockets, oversized totals, and changing files during read.
- [ ] Copy bytes out of the sandbox into Happy file storage, run normal quota/malware/media/hash processing, and attach the resulting durable file IDs.
- [ ] Store provenance: source session, run/tool event, sandbox-relative path, content hash, and creation time; do not expose host paths.
- [ ] When the same session later references its own exported file, map the Happy file ID back to the original sandbox-relative path if it still matches the stored hash.
- [ ] When a file is forwarded to another session, materialize it through normal safe ingress and provide the new session path; never assume the original path exists.
- [ ] Reconcile generated photos/videos/files into the message and Files surfaces live.
- [ ] Add gym tests for multiple files, large files, mutation race, symlink escape, malware/quota failure, same-session reference, cross-session forwarding, deletion, and restart.

## P2. Subchannels and project forks

### P2.3 — Subchannel data model and clone job (server feature)

- [ ] Add nullable `parentChatId` plus lineage metadata and indexes to channels; prevent cycles and invalid cross-visibility parentage.
- [ ] Define a `createSubchannel` action that snapshots selected members, default agent, prompt/configuration, secret bindings (references only), and workspace.
- [ ] Run workspace copy as a durable asynchronous job with bytes/files progress, cancellation, failure/retry, and restart recovery.
- [ ] Copy files plainly but safely: preserve relative paths/modes needed for coding, reject sockets/devices/escaping symlinks, and avoid copying ephemeral runtime/home directories.
- [ ] Decide explicitly whether git history is copied, shared, or reinitialized; default recommendation is a full independent workspace snapshot including `.git` only if the parent workspace contract already owns it.
- [ ] Make partial clones invisible/unusable until committed, and clean failed temporary copies recoverably.
- [ ] Expose lineage and clone status through sync APIs.
- [ ] Add gym tests for nested subchannels, permissions, secret reference policy, large progress, concurrent source changes, cancellation, restart, cleanup, and cycle rejection.

### P2.4 — Subchannel UI and agent workflow

- [ ] Show parent/children compactly in channel header/sidebar without turning the sidebar into a deep uncontrolled tree.
- [ ] Add Create subchannel/Clone current channel actions for users and the durable agent tool.
- [ ] Present a preflight summary of copied workspace/config/secrets and the new channel name/visibility.
- [ ] Stream clone progress in place and navigate only when ready.
- [ ] Show lineage/breadcrumb and make the independent post-clone state clear.
- [ ] Add UI tests for progress, failure/retry/cancel, deep lineage, unread state, and agent-created child notification.

## P2. Secrets, environments, and administration

### P2.5 — User-owned versioned agent secrets (server feature)

- [ ] Move secret APIs out of `/v0/admin` and introduce ownership/permission rules allowing a user to create and manage their own secrets.
- [ ] Persist secret metadata in Happy: owner/creator, created/updated timestamps, current version, variable names, bindings, rotation timestamps, and audit actor.
- [ ] Keep values write-only in Rig/secret storage; Happy stores only encrypted/reference metadata required for reconciliation.
- [ ] Add update semantics for adding/removing/replacing variables by creating a new version, validating it, and atomically rotating live bindings.
- [ ] Allow owner deletion/rotation and administrator emergency revocation without revealing values.
- [ ] Define channel binding permission (channel owner/admin) and agent binding permission (agent owner/admin).
- [ ] Stream metadata/binding/rotation changes through existing state hints.
- [ ] Add gym/state tests for ownership, admin override, rotation success/failure rollback, concurrent rotation, binding authorization, audit metadata, and restart.

### P2.6 — Environments versus secrets information architecture

- [ ] Define **Environment** as a reusable non-secret agent/channel configuration bundle; define **Secret** as write-only sensitive values. Do not mix them in Admin.
- [ ] Decide who can create/share/edit environments and how they bind to agents/channels/sessions.
- [ ] Put personal/shared environments and secrets in a workspace Settings area available by permission, not under Admin.
- [ ] Keep agent images and global provider/server policies administrator-only.
- [ ] Show creator, owner, timestamps, bindings, last rotation, and safe variable names on each secret detail.
- [ ] Add clear update/rotate/revoke actions with confirmation and live status.
- [ ] Add component and app tests for every role/ownership variant.

### P2.7 — Administration redesign

- [ ] Make admin navigation role-aware and place it near Settings/profile rather than as a primary rail feature.
- [ ] Split resources so one forbidden/failed request does not blank unrelated admin tabs.
- [ ] Turn the current read-only tables into truthful workflows only when their server mutations are wired: users/roles, reports, automations, integrations, images, audits, bans, exports, backups, retention, and access telemetry.
- [ ] Remove tabs that are not ready instead of presenting decorative read-only administration.
- [ ] Keep agent images/provider/server setup under admin; move user-owned secrets/environments out.
- [ ] Add destructive confirmations, progress/error feedback, per-row permission states, pagination, and reactive updates.
- [ ] Add per-resource app tests and gym coverage for any newly exposed mutation.

## P2. Remaining destinations and production truthfulness

### P2.8 — Notifications/Activity

- [ ] Route `InboxView` or replace it with a live Activity surface backed by `getNotifications`/`markNotificationsRead`.
- [ ] Reconcile new/read notifications through SSE and navigate each notification to its exact message/thread/file/call/run.
- [ ] Implement mention-only counters and mark-read behavior consistently with sidebar state.
- [ ] Remove local mock copies and add pagination, empty/loading/error states, and background desktop/sound delivery policy.
- [ ] Round-trip every fine-grained server notification preference without collapsing it into the current smaller autosave shape; initialize desktop/sound state from live user data, not mock defaults.
- [ ] Add gym/state/app tests for notification kinds, ordering, read races, route targets, and multiple windows.

### P2.9 — Followed threads

- [ ] Route `ThreadsView` using the already-present `getThreads`, subscription, and mark-read operations.
- [ ] Add follow/unfollow/notification-level UI on thread panels.
- [ ] Navigate a thread result to the root and exact unread reply without losing the source surface.
- [ ] Remove the outdated comment claiming no endpoint exists.
- [ ] Add gym/state/app coverage for pagination, unread mentions, subscription changes, deletion, and live replies.

### P2.10 — Calls

- [ ] Decide whether calls are in the intended near-term desktop product. If not, remove mock view/components from production scope.
- [ ] If retained, connect `CallsView` to existing call routes/signaling, route incoming/active/history states, and define a real media provider/client implementation.
- [ ] Replace local timers/mute/video state with call-session state and reactive signaling.
- [ ] Add permissions, device selection, reconnect, decline/end semantics, and error handling.
- [ ] Add gym signaling tests plus desktop multi-client acceptance tests.

### P2.11 — Home/agent desk

- [ ] Decide whether Home is a product destination. If retained, derive stats, notifications, and agent runs from live state and route every card.
- [ ] Replace mock `deskRunning/Queued/Done` with the durable agent run model.
- [ ] If Home duplicates Activity/Chat without a clear daily workflow, remove it rather than ship a decorative dashboard.
- [ ] Add app tests or delete the unused production code and exports.

## P3. Cross-product completion and release gate

### P3.1 — Empty/loading/error/progress audit

- [ ] Inventory every route, panel, modal, menu, and async button in a tracking matrix.
- [ ] For each, prove initial loading, incremental loading, empty, populated, permission denied, offline, retry, validation error, background failure, and success feedback where applicable.
- [ ] Remove every no-op/dead control and every production mock fallback.
- [ ] Remove hard-coded user names/initials (`Steve`, `ST`) and derive one consistent fallback from the authenticated user on every surface.
- [ ] Ensure no manual Refresh control is introduced; primary surfaces use SSE and secondary visible-only surfaces use bounded polling only where no realtime channel exists.
- [ ] Ensure every long operation remains understandable after navigation/reload and appears in a background activity center.

### P3.2 — Desktop interaction/accessibility audit

- [ ] Verify full keyboard navigation, visible focus, Escape hierarchy, focus trapping/return, menu roving focus, and non-conflicting shortcuts.
- [ ] Verify screen-reader names, roles, live regions, `aria-busy`, validation association, mention/reaction descriptions, and terminal accessibility.
- [ ] Respect reduced motion while preserving non-motion feedback.
- [ ] Test macOS desktop window controls/drag regions and the 1024×704 minimum; do not add mobile breakpoints or touch substitutes.
- [ ] Add shortcut discoverability and a command list.

### P3.3 — Performance/reactivity audit

- [ ] Instrument and prevent remount/refetch storms for search, avatar changes, streaming replies, agent activity, sidebar updates, and route overlays.
- [ ] Virtualize long message/search/activity/file lists while preserving focus and anchored navigation.
- [ ] Bound object URLs, signed URLs, timers, subscriptions, SSE listeners, terminal connections, media decoders, and background jobs on unmount/logout.
- [ ] Eliminate workspace-refresh N+1 DM-member requests by including peer summaries in the sync contract or adding one authorized bulk directory lookup.
- [ ] Add deterministic race tests for stale responses, navigation during load, reconnect, optimistic rollback, and multi-window updates.
- [ ] Establish budgets for initial workspace load, search response, message stream DOM size, and memory during a long agent run.

### P3.4 — Final verification

- [ ] Confirm every requirement in this document is either merged, explicitly deferred with rationale, or removed from the product surface.
- [ ] Re-enable parallel Gym files after isolating and fixing the streamed-turn, workspace-cursor, and magic-link shared-resource races; preserve the serial mode only if a measured, documented invariant proves parallel execution unsafe.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm --dir packages/happy2-gym test` and all `gym/state` tests.
- [ ] Run every changed `happy2-ui` component in Chromium, Firefox, and WebKit at 2× and review saved screenshots.
- [ ] Run a fresh-install desktop walkthrough: bootstrap admin → profile → provider → image build → main app.
- [ ] Run a two-human/two-agent collaboration walkthrough covering channels, agent mode, mentions, files, forwarding, reactions, terminal, subchannel clone, and restart recovery.
- [ ] Run security review for bootstrap race, provider commands, terminal, durable tools, sandbox file egress, secrets, signed URLs, and authorization revocation.
- [ ] Remove stale comments, mock fixtures from production imports, unused destinations, and obsolete APIs.

## Product questions that must be answered at the relevant feature boundary

These do not block writing the plan, but implementation must not silently guess:

1. Is the default visible Happy agent globally configured, copied per workspace/channel, or a single server-managed identity with per-chat sessions? The recommendation above is one managed identity with independent chat sessions.
2. Should `@everyone` and `@channel` notify all members while `@here` notifies only currently present members? The current backend treats all three as notify-all and needs refinement if presence semantics matter.
3. Should channel Agent mode address only the default agent or allow multiple selected agents in the first release? Recommendation: default plus optional explicit selection, but serialize the first implementation if multi-agent scheduling materially expands scope.
4. Does a subchannel clone include full git metadata/history, ignored files, and untracked files? A precise copy policy is required before server work.
5. Are Calls and Home intended launch features? Keeping disconnected mock surfaces is not acceptable; either fund the live implementation or remove them.
6. Which notification channels are real for the first release: in-app, desktop, email, and sound? Settings must expose only implemented channels.
7. Is a user’s profile email distinct from the authentication account email? If yes, Settings copy must say so; if no, changing it requires verification and credential migration.

## First implementation recommendation

Create a new Conductor workspace for **P0.1 Durable bootstrap/status model**. Its backend-only deliverable should be the migration, typed setup/user-onboarding state, GET/POST contracts, SSE hints, and complete gym coverage. Stop there for review and explicit backend approval before any onboarding UI begins.
