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
- every complete production screen is a props-only `happy2-ui` composition rendered at exactly 1024×704 and 100% scale in the Blueprint Full screens section;
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
- [ ] Update this document immediately when scope or evidence changes; mark completed work only after it is merged.

## Terminology and recommended product decisions

- **Sandbox provider** is the user-facing term. It describes where code executes: Docker, Podman, and later remote providers such as E2B or Daytona. Internally, a provider can expose one or more **sandbox runtimes/drivers**.
- **AI provider/model** is separate from the sandbox provider. Model selection must never be presented as part of Docker/Podman configuration.
- Server onboarding blocks the product for everyone until the installation is usable. The bootstrap administrator can act; other authenticated users see a live waiting screen.
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
- [x] `AgentImagesView`/`AgentSecretsView` already demonstrate the preferred boundary: focused app glue maps state/actions into props-only `happy2-ui` Panel/Detail components with Blueprint coverage.

The following structural gaps are confirmed:

- [ ] There is no durable server-onboarding or user-onboarding state/API.
- [ ] The runtime is hard-coded to the local `docker` CLI; there is no Docker/Podman detection, provider selection, or remote-provider boundary.
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

## P0. UI architecture and Blueprint foundation

This section incorporates independent full-tree audits by Codex and Claude Fable. It is the complete UI-architecture source of truth; no separate audit or implementation-plan file is authoritative. This planning work does not authorize implementation in the current worktree.

### P0.A — Enforce `happy2-ui` ownership before adding more screens

- [ ] Make application routes thin controller/view-model adapters that render props-only `happy2-ui` screens; prohibit app-owned visual layout, inline component styling and alternate UI primitives.
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
- [ ] Decompose Auth, Settings, Files, Search and Admin into focused controllers plus props-only full-screen components.
- [ ] Decide retain versus delete for unrouted Home, Inbox, Calls and Threads before investing in them.
- [ ] Perform each numbered task in the detailed sequence below in its own Conductor workspace and merge before starting the next.

### P0.D — Verified UI audit evidence and ownership boundaries

- [ ] Treat `ChatView.tsx` (3,103 lines, 57 signals, 10 memos, 4 effects, more than 50 workflow functions and 9 state subscriptions) as a graph of independent navigation, conversation, thread, files, attachments, membership, agent, activity and dialog responsibilities—not as one component to cosmetically split into arbitrary files.
- [ ] Treat `SettingsView.tsx` (728 lines) as separate profile, avatar, status, notification-preference, autosave and screen-rendering concerns.
- [ ] Review `AuthGate.tsx` (375 lines), `AgentSecretsView.tsx` (426), `AdminView.tsx` (331), `AgentImagesView.tsx` (273), `FilesView.tsx` (264), `SearchOverlay.tsx` (214) and `App.tsx` (159) against the same state/lifetime/visual boundary.
- [ ] Split public visual contracts currently bundled in `Message.tsx` (738 lines), `Composer.tsx` (661), `AgentSecretPanel.tsx` (430), `FileTree.tsx` (397), `AgentImagePanel.tsx` (394) and `Sidebar.tsx` (264) only where the child can render, behave and be tested independently.
- [ ] Preserve good existing foundations: id-keyed `reconcile` stores and stable streaming rows; hardened Message Markdown; `AppShell`, `Rail`, `Sidebar`, `TitleBar`, `ChannelHeader`; current message/composer/run primitives; and the AgentImages/AgentSecrets glue-to-panel pattern.
- [ ] Do not move state, routing, authorization, server operations, transport, SSE subscriptions or product policy into `happy2-ui` merely to shrink an app file.
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

The Full screens section must eventually contain deterministic, network-free props-only fixtures for:

- [ ] authentication loading, server unavailable, password sign-in, registration, magic link, OIDC handoff and session expiry;
- [ ] onboarding profile, avatar crop/skip, sandbox provider, image choice, build progress/failure/retry and completion;
- [ ] Chat no-selection, empty channel, populated channel, human DM, agent DM, streaming, long run, upload, thread, profile inspector, channel settings, files inspector, editor conflict and every create/edit/forward dialog;
- [ ] global Search/Command Palette over an intact underlying route;
- [ ] Files loading, empty, gallery, filtered-empty, preview failure and viewer;
- [ ] Settings loading, normal, dirty/saving, validation, confirmation and failure;
- [ ] Admin unauthorized, partial-resource failure, tables, images and secrets;
- [ ] Activity and Threads if retained;
- [ ] Calls and Home only if explicitly retained.

### P0.F — Target `happy2-ui` screens and app controllers

New props-only `happy2-ui` contracts should include, when their feature is implemented:

- [ ] `ApplicationScreen`/`WorkspaceScreen` for the exact persistent title/rail/sidebar/workspace/panel composition;
- [ ] `ChatScreen`, `ChatTimeline`, `ChatMessage`, `ChatActivityStrip` and `ChatInspectorHost`;
- [ ] `ChannelDetailsForm`, `AgentEffortSection` and `WorkspaceEditorDialog`;
- [ ] `ChannelDirectoryDialog`, `TeammatePickerDialog`, `CreateChannelDialog`, `CreateAgentDialog`, `EditMessageDialog`, `ConfirmDialog` and `ForwardMessageDialog`;
- [ ] `AuthFlowScreen`, `CredentialForm` and `ProfileSetupForm`;
- [ ] `SettingsScreen`, `PageColumn`, `ProfileSettingsSection`, `NotificationSettingsSection` and `SaveStateBanner`;
- [ ] `FilterableSurface`, `FilesScreen`, `SearchScreen` and full media viewer;
- [ ] `AdminScreen` plus truthful per-resource surfaces;
- [ ] `ActivityScreen`, `ThreadsScreen`, `CallsScreen` and `HomeScreen` only for retained destinations.

Focused app modules should include:

- [ ] `chatNavigationController` for chats, directory, DM peers, presence, starring, unread presentation and selection;
- [ ] `conversationController` for message pages, optimistic sends, read-through, typing and reactions;
- [ ] `threadController` for root/replies, paging, send, races and subscriptions;
- [ ] `chatFilesController` for workspace tree, paging and versioned file conflict state;
- [ ] `chatAttachmentsController` for uploads, provenance, signed/object URL lifetime, downloads and viewer intent;
- [ ] `chatActivityController` for agent activity and timer lifetime;
- [ ] `chatMembershipController` for members, roles, join/leave and channel settings;
- [ ] one small controller per complex dialog, or a narrowly scoped chat dialog coordinator;
- [ ] pure identity/time/file/message presenters with explicit locale/time-zone inputs;
- [ ] one reusable `createAutosave` controller for debounce, fingerprint, single flight, trailing changes and disposal.

Controllers expose immutable snapshots/signals and narrow actions, never DOM nodes. Each subscribes only to its owned state and disposes timers, requests, subscriptions, signed URLs and object URLs itself.

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
- [ ] Add stable view-model fixtures under `happy2-ui/dev` that production never imports.
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

#### UI-08 — Extract Chat navigation controller

- [ ] Move summaries, directory, contacts, peers, presence, starring, unread and selection into one focused controller.
- [ ] Preserve hydration coalescing while removing duplicate navigation application.
- [ ] Resolve N+1 DM peers only through an appropriate state/server bulk contract, not a UI abstraction.
- [ ] Split focused navigation tests from `LiveStateViews.test.tsx`.

#### UI-09 — Extract conversation and thread controllers

- [ ] Move loading/paging, optimistic send, read-through, typing, reactions and durable approvals into conversation ownership.
- [ ] Precompute grouping once in the ordered view model; remove per-row full-list filtering.
- [ ] Use keyed state for independent message/chat UI values.
- [ ] Move thread load/reconcile/send/stale-response protection into its own lifetime.
- [ ] Preserve current stable-row streaming and thread race tests.

#### UI-10 — Extract workspace files, attachments and activity controllers

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

#### UI-12 — Introduce the props-only `ChatScreen`

- [ ] Compose shell/sidebar/header/timeline/activity/composer/inspector/overlays in `happy2-ui` using narrow grouped view models.
- [ ] Render complete Chat states in Blueprint before rewiring the app.
- [ ] Reduce the app Chat route to controller creation, view-model selection and one `ChatScreen` render.
- [ ] Preserve route, scroll, draft, thread/panel and streaming row identity.
- [ ] Remove live mock branches only after equivalent Blueprint fixtures exist.

Acceptance: the Chat route reads as wiring and the exact UI is independently reviewable.

#### UI-13 — Decompose Auth and Settings

- [ ] Separate Auth session/state machine from AuthFlowScreen/forms.
- [ ] Move credentials/profile setup visuals and all auth/onboarding states to `happy2-ui`/Blueprint.
- [ ] Separate Settings profile/status/preferences/avatar controllers.
- [ ] Replace triplicated autosave with tested `createAutosave`.
- [ ] Reconcile external status/preferences while open.
- [ ] Move the complete Settings screen/sections to `happy2-ui` and prove profile/avatar changes do not remount.

#### UI-14 — Decompose Files, Search and Admin

- [ ] Move full visual trees into `happy2-ui`; retain pagination, permission, data and routing controllers in the app.
- [ ] Add live Files/Admin reconciliation and independent Admin resource failures.
- [ ] Keep preview URL lifetime in focused app ownership.
- [ ] Add all full-screen states and browser coverage.

#### UI-15 — Resolve remaining destinations and dead code

- [ ] Decide retain/remove for Home, Inbox, Calls and Threads.
- [ ] Retained destinations require a props-only screen, live controller, Full screen fixtures and browser tests.
- [ ] Removed destinations delete app view, mock data, exports and fixtures together.
- [ ] Remove unused Tailwind import and ignored legacy props after proving no consumer.
- [ ] Ensure production routes never import representative Blueprint/mock data.

#### UI-16 — Continuous architecture enforcement and final gate

- [ ] Reject app-owned visual CSS, raw visual DOM, inline layout styling and icon copies with a minimal documented root-host allowlist.
- [ ] Reject public UI exports missing Blueprint/test ownership.
- [ ] Reject component colors outside `theme.css`, including literal shadow/scrim colors needing tokens.
- [ ] Enforce dialog/menu Escape hierarchy, initial focus, trap/return, arrow navigation and typeahead contracts.
- [ ] Document controller/view-model/screen examples using AgentImages/Secrets and refactored Chat.
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
- [ ] Controllers have bounded subscriptions, timers, requests, signed URLs and object URLs.
- [ ] Visual redesign is performed only as a separately approved feature after behavior-preserving extraction.

---

## P0. Installation bootstrap and server onboarding

### P0.1 — Durable bootstrap/status model (server feature)

- [ ] Add a server-owned setup model with an explicit schema version and step states (`pending`, `in_progress`, `complete`, `failed`), timestamps, last error, and safe step metadata.
- [ ] Track at minimum: bootstrap administrator claimed, sandbox provider selected/validated, base image selected, base image build requested, base image ready, and server setup complete.
- [ ] Add per-user onboarding step state keyed by user and step, including `complete` and `skipped`, for extensible steps such as avatar and desktop-notification permission.
- [ ] Make every transition transactional and idempotent; a restart during any step resumes from durable state.
- [ ] Expose a minimal unauthenticated bootstrap status that does not leak accounts/configuration and authenticated combined onboarding state for routing.
- [ ] Ensure only the one-time bootstrap path can claim the first administrator; close it atomically once claimed, including under concurrent server instances.
- [ ] Decide and document how normal post-bootstrap account creation works (open signup, invitation, or admin-created account) without reusing bootstrap UI.
- [ ] Emit sync hints for every durable setup/user-onboarding transition.
- [ ] Add gym tests for fresh install, concurrent bootstrap claims, refresh/resume, restart recovery, non-admin waiting, completed setup, and forbidden transition ordering.
- [ ] Add migration/backfill behavior so an existing installation with users and a ready default image is considered complete without regressing into onboarding.

Acceptance: a fresh database has exactly one legal bootstrap path; existing installations are not blocked; no client-local flag can bypass incomplete server setup.

### P0.2 — Sandbox-provider discovery and selection (server feature)

- [ ] Define the provider interface around capabilities the current product needs: health probe, image build, container/session create, file ingress/egress, terminal attach, cleanup, and status reporting.
- [ ] Implement local Docker and local Podman drivers without adding deployment-specific code switches; select the configured provider through durable setup/config state.
- [ ] Probe Docker and Podman safely with bounded timeouts and return displayable version, health, and remediation details.
- [ ] If exactly one healthy provider exists, recommend it but still explain that agent code runs inside its sandbox.
- [ ] If both exist, require an explicit choice; if neither exists, show install/start guidance and continue probing reactively while setup is on screen.
- [ ] Keep the public contract capable of later remote providers, but do not implement E2B/Daytona until a concrete feature requests them.
- [ ] Replace direct `LocalAgentDockerRuntime` construction with the selected provider boundary while preserving current security settings and cleanup behavior.
- [ ] Add gym tests for Docker only, Podman only, both, neither, unhealthy daemon, version probe timeout, persisted choice, and restart.

Acceptance: server setup can prove where code will run, remembers the choice, and all agent image/container operations use that choice.

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
- [ ] Reconcile the changed avatar through user sync so every sidebar, message, search result, profile card, and rail avatar updates live.
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
- [ ] Backfill existing channels and installations safely.
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
- [ ] Run `pnpm check`.
- [ ] Run `pnpm --dir packages/happy2-gym test` and all `gym/state` tests.
- [ ] Run every changed `happy2-ui` component in Chromium, Firefox, and WebKit at 2× and review saved screenshots.
- [ ] Run a fresh-install desktop walkthrough: bootstrap admin → profile → provider → image build → main app.
- [ ] Run an existing-install upgrade walkthrough proving onboarding backfill does not block established users.
- [ ] Run a two-human/two-agent collaboration walkthrough covering channels, agent mode, mentions, files, forwarding, reactions, terminal, subchannel clone, and restart recovery.
- [ ] Run security review for bootstrap race, provider commands, terminal, durable tools, sandbox file egress, secrets, signed URLs, and authorization revocation.
- [ ] Remove stale comments, mock fixtures from production imports, unused destinations, and obsolete APIs.

## Product questions that must be answered at the relevant feature boundary

These do not block writing the plan, but implementation must not silently guess:

1. After bootstrap, are new human accounts open-signup, invite-only, or administrator-created?
2. While server onboarding is incomplete, may non-admin users create profiles, or should they stop immediately after authentication?
3. Is the default visible Happy agent globally configured, copied per workspace/channel, or a single server-managed identity with per-chat sessions? The recommendation above is one managed identity with independent chat sessions.
4. Should `@everyone` and `@channel` notify all members while `@here` notifies only currently present members? The current backend treats all three as notify-all and needs refinement if presence semantics matter.
5. Should channel Agent mode address only the default agent or allow multiple selected agents in the first release? Recommendation: default plus optional explicit selection, but serialize the first implementation if multi-agent scheduling materially expands scope.
6. Does a subchannel clone include full git metadata/history, ignored files, and untracked files? A precise copy policy is required before server work.
7. Are Calls and Home intended launch features? Keeping disconnected mock surfaces is not acceptable; either fund the live implementation or remove them.
8. Which notification channels are real for the first release: in-app, desktop, email, and sound? Settings must expose only implemented channels.
9. Is a user’s profile email distinct from the authentication account email? If yes, Settings copy must say so; if no, changing it requires verification and credential migration.

## First implementation recommendation

Create a new Conductor workspace for **P0.1 Durable bootstrap/status model**. Its backend-only deliverable should be the migration, typed setup/user-onboarding state, GET/POST contracts, SSE hints, backfill rules, and complete gym coverage. Stop there for review and explicit backend approval before any onboarding UI begins.
