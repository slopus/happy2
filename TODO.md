# Happy (2) active product backlog

This is the single source of truth for unfinished product work. Completed work, historical
evidence, superseded implementation plans, and already-merged migrations do not belong here.
Each item below must be removed when its acceptance criteria are met and the change is in `main`.

## Product bar

- [ ] Every visible control performs a truthful, durable action or is absent.
- [ ] Every primary surface stays current through SSE plus `happy2-state` reconciliation; secondary
      surfaces may poll only while visible and only until they receive realtime support.
- [ ] Long-running work exposes progress, failure, retry, completion, and restart recovery without a
      manual refresh.
- [ ] Every reusable visual belongs to `happy2-ui`, has Blueprint coverage, and is testable at the
      desktop 1024×704 viewport in Chromium, Firefox, and WebKit at 2×.
- [ ] The application has no production dependency on representative/mock fixture data.

## P0. UI ownership and Blueprint integrity

### P0.A — Finish the verified Blueprint catalog

- [ ] Keep the catalog grouped into Primitives, Components, Surfaces, Overlays, and Full screens.
- [ ] Build the catalog-wide TypeScript browser test with the existing Vitest/Playwright
      infrastructure. It must check manifest/export ownership, deterministic IDs, 100% scale,
      dimensions, gutters, clipping, visible text/focus-ring fit, declared overflow, and true host
      compositing in all three browsers at 2×.
- [ ] Make specimens inspectable without hidden clipping: use a scrollable outer workbench, opaque
      production host, declared safe inset, and flex layouts rather than centering grids or forced
      equal-width columns.
- [ ] Add Full-screen fixtures at exactly 1024×704 for every implemented application route and its
      important overlays/states. The fixture must keep the underlying screen mounted behind overlays.
- [ ] Add the missing Blueprint/test ownership for currently bundled public visual contracts and
      split a component only where the resulting child is independently renderable and testable.

Acceptance: a missing Blueprint owner or a clipped/unscaled production fixture fails CI with an
actionable component/page/edge report.

### P0.B — Keep app code as lifecycle glue

- [ ] Enforce that application routes attach authentication, routing, window, and live-state
      lifetimes but compose visuals only from `happy2-ui` surfaces. The root host sizing/background is
      the sole app stylesheet exception.
- [ ] Keep leaf visual primitives props-only; complete `happy2-ui` screens may consume the explicit,
      side-effect-free `happy2-state` surface stores directly.
- [ ] Add minimal architecture checks for app-owned visual DOM/CSS, public visual exports without a
      Blueprint owner, and theme violations. Do not use arbitrary line-count limits as enforcement.
- [ ] Complete accessibility primitives shared by all later screens: modal Escape hierarchy, initial
      focus, trap and focus return; menu roving focus, arrows, typeahead, and accessible activation.

## P0. Installation and personal onboarding

### P0.4 — Centered onboarding UI and route guards

- [ ] Replace the split auth panel with a centered desktop setup card on the shared onboarding
      background; do not add mobile layouts.
- [ ] Render stable routes for bootstrap account, sign-in, profile, sandbox provider, base image,
      build progress, and completion, all driven by the durable server/user onboarding status.
- [ ] Redirect a manually entered later route to the first incomplete prerequisite and resume the
      exact durable step after reload/restart.
- [ ] Block the main application while required server setup is incomplete. Show a non-admin waiting
      surface that advances through SSE when the administrator advances setup.
- [ ] Explain the selected sandbox provider and that agent code runs inside its sandbox. Surface
      Docker/Podman health, remediation, and the durable image build's live progress/log/failure/retry
      state using reusable onboarding-sized `happy2-ui` components and Blueprint fixtures.
- [ ] On the final setup step, let the bootstrap administrator choose whether registration opens.
      Until setup completes, allow only the single bootstrap account/profile promised by the server.
- [ ] Preserve form state across transient failures and provide retry without `location.reload()`.

Acceptance: a fresh installation always resumes the correct centered setup screen and enters the main
application only after a ready default image and final registration policy exist.

### P0.5 — First profile and user onboarding

- [ ] Collect optional Last name separately in initial profile creation and Settings; never derive it
      by splitting display text. Keep First name and Username required with field-specific server
      errors.
- [ ] Show whether the new profile is the bootstrap administrator without allowing the client to
      assign that role.
- [ ] Define durable user steps for profile creation, avatar upload or explicit skip, desktop
      notification permission allowed/denied/not-asked, and user-onboarding completion.
- [ ] Ensure later optional user steps can be introduced without replaying finished work or trapping
      older clients.
- [ ] Add Gym/AuthGate/app coverage for Last name, validation, skip behavior, refresh/resume, and
      stale-client routing.

### P0.6 — Square avatar crop without remounting the application

- [x] Define and enforce server limits for a decodable, orientation-normalized square avatar with
      size and pixel bounds. Revalidate/re-encode any client crop; never trust browser MIME/dimensions.
- [x] Backend approval gate:
    - [x] Require an explicit integer square crop in orientation-normalized source pixels on avatar
          upload; reject missing/malformed/out-of-bounds crops, corrupt or animated images, inputs
          over 10 MB, and source dimensions over 2048px before persisting anything.
    - [x] Auto-orient, extract the validated crop, and re-encode exactly one 1024×1024 JPEG with a
          ThumbHash while preserving the existing owner/public-file authorization boundary.
    - [x] Prove the contract end to end in a dedicated Gym behavior file, including oriented source
          coordinates and output pixels, then pass server architecture/type/lint checks and the
          required iterative Claude Opus review. Stop for explicit user approval before UI work.
    - Evidence: server architecture/type/lint and 89 unit tests passed; Gym typecheck and the full
      113-test Node/state suite passed. Claude Opus session
      `e1a76fea-2c17-4804-9338-967fc3f9b438` closed every finding with no task-blocking issue.
- [ ] Add a reusable `happy2-ui` cropper with zoom, pan, square output, and a circular in-product
      preview. Use it from onboarding and Settings.
- [ ] Reconcile the changed identity/avatar into already materialized sidebar, chat, search, profile,
      and rail projections without recreating the app, current route, chat, scroll, draft, or open
      panel. Revoke superseded object URLs safely.
- [ ] Add Gym coverage for corrupt/non-image/animated/non-square/oversized/oriented input and crop
      bounds, plus app/browser regressions for preserved DOM identity and state.

### P0.7 — One profile surface everywhere

- [ ] Define one reusable profile-detail surface for self, human teammate, agent, and bot variants.
- [ ] Use that same surface from message author, DM header, member list, search result, and current
      rail avatar. Compose edit controls only for self and authorized controls only where applicable.
- [ ] Apply workspace-managed Title consistently; keep availability/status only when the product
      actually renders it elsewhere.
- [ ] Hide notification/email controls without an operational delivery path, or make the complete
      behavior real and covered.
- [ ] Prove all entry points open the same component/data contract.

### P0.8 — Synchronized presence, availability, and last seen

- [x] Make realtime transport registration presence-neutral. A human becomes online only after an
      explicit client presence heartbeat, each heartbeat carries `lastSeenAt` and a 60-second
      `expiresAt`, and observers expire a silent lease locally; an explicit disconnect goes offline
      immediately without advancing last seen past the final heartbeat.
- [x] Persist each heartbeat's exact `lastSeenAt` without global sync fanout, then emit one durable
      `presence` difference when the final active lease expires or disconnects so offline profiles
      reconcile without a per-user 30-second refetch storm.
- [x] Define the later desktop activity policy as a heartbeat every 30 seconds only while the app
      window is visible and the user has been recently active through mouse or keyboard input.
- [x] Expose a human user's durable `lastSeenAt` in the ordinary contact/directory profile
      contract without exposing authentication-session telemetry; keep agents without server-owned
      online or last-seen state.
- [x] Prove in Gym that availability and custom status changes advance the `presence` sync area,
      survive restart, and are visible together with another human's durable `lastSeenAt`.
- [x] Stop after the server contract and Gym coverage for explicit backend approval before beginning
      the UI/state implementation.
- [ ] Reconcile the durable `presence` sync area into every already-materialized directory/profile
      projection, including status text/emoji, without a manual refresh or remount.
- [ ] Derive the avatar indicator consistently: an agent renders online as a UI-only rule; a human
      renders explicit online/away/DND when selected, otherwise automatic follows realtime
      online/offline presence.
- [ ] Show a human's last-seen value on the shared profile surface when offline; never show last seen
      for agents, and prove sidebar/profile updates plus preserved DOM identity in Chromium, Firefox,
      and WebKit.

Acceptance: a visible, recently active desktop client renews online presence every 30 seconds; a
silent lease expires after 60 seconds on observers even if SSE remains connected; changing
availability or custom status updates another open client through SSE plus a durable difference;
every avatar/profile uses the same derived indicator; offline human profiles show durable last seen;
and agents look online without the server fabricating presence.

## P0. Navigation, search, feedback, and authentication

### P0.9 — Global search and command palette

- [ ] Implement global `⌘K` with focus return, Escape, arrow navigation, Enter selection, and
      IME-safe input. It remains an overlay over the current surface.
    - [x] Present search as a centered route-owned palette with its own focused input; opening,
          querying, and closing it must preserve the exact primary-surface DOM, local state, and
          scroll rather than replacing the application tree.
    - [x] Open the empty palette from `⌘K` or the title-bar search well, keep it open when its query
          is cleared, close it with Escape/backdrop/close, and return focus to the invoking control.
    - [x] Add UI and application tests for the modal geometry, keyboard/focus lifecycle, IME-safe
          input, and primary DOM identity across open, query, result updates, and close.

  Progress (Claude UI implementation with Codex reciprocal review and verification complete for
  the modal/no-remount slice. Arrow/Enter selection and result routing above remain open, so the
  parent P0.9 item stays unchecked):
  - New reusable `happy2-ui` `CommandPalette` (C-060): a 640px ModalOverlay-hosted
    card with its own focused search input, ESC cap, and ghost close over a
    scrollable body. It autofocuses/selects its input on mount, returns focus to
    the invoking control on unmount (if still connected), closes on Escape, and
    coalesces IME composition so a controlled `query` never interrupts an active
    composition. Files: `packages/happy2-ui/src/CommandPalette.tsx`,
    `styles/command-palette.css`, blueprint `dev/pages/CommandPalettePage.tsx`.
  - `SearchResults`/`SearchPage` gained a `flush` variant (no card chrome) so the
    palette body fills full width; `SearchPage` shows a "Search Happy (2)" prompt
    for the empty query.
  - `TitleBar`/`SearchField` are now editable-vs-opener discriminated unions:
    editable requires `onChange` (no `onOpen`); opener requires `onOpen` (no
    `onChange`, read-only well opening on click/Enter/Space).
  - IME commit is a single path: intermediate composition `input` events are held
    back by both the local composition lifetime and the event hint; only the trailing
    post-`compositionend` `input` commits, so a value is never emitted twice; Escape
    stays suppressed while composing.
  - App wiring (`DesktopApp`, `DesktopOverlaySurface`, `SearchOverlay`): a global
    `⌘K`/`Ctrl+K` handler (on `window`) opens the empty search overlay without
    changing the primary route; the title-bar well opens it too; clearing the
    query keeps it open; Escape/backdrop/close dismiss it. The route-owned palette
    is a sibling of the primary surface, so opening/typing/closing never remounts
    the app tree nor the palette input node.
  - Tests authored: `packages/happy2-ui/src/CommandPalette.test.tsx` (card
    geometry; autofocus + focus-return; single-commit IME with realistic trailing
    input; close button); `TitleBar.test.tsx` opener click/Enter/Space + readOnly
    coverage; and `packages/happy2-app/src/App.test.tsx` ("opens with ⌘K, keeps
    open when cleared, restores focus" — asserting exact palette-input DOM identity
    across query/clear — plus a close-button/backdrop dismissal + focus-return
    test). Two existing primary-DOM identity tests updated for the opener flow.
  - Verified: `pnpm --dir packages/happy2-app test` (38/38),
    `pnpm --dir packages/happy2-ui test` (501/501 across Chromium, Firefox, and WebKit), and
    repository-wide `pnpm format`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`. Exact
    primary and palette-input DOM identities, local draft, keyboard/focus dismissal, and
    hinted/hintless IME composition are covered. The persisted Claude Opus review found no
    task-blocking issue; the prior CodeRabbit findings were addressed or classified, while its final
    rerun was externally rate-limited before analysis.
- [ ] Carry each result's type and ID into routing: channel open/join, person shared profile and DM,
      message exact chat/thread/page/centering/highlight, and file viewer focus.
- [ ] Add searchable create/join-channel and new-agent-chat commands with people/agents/channels
      autocomplete.
- [ ] Add paged/cancellable result loading; never fetch the complete file index for every query.
- [ ] Add server permission/cursor coverage and app tests for all result types, stale-query
      cancellation, keyboard use, and no-remount behavior.

### P0.10 — Unified feedback and errors

- [ ] Provide reusable `happy2-ui` field errors, inline banners, toasts/background notifications,
      destructive confirmations, progress notifications, and optional user-relevant sound cues.
- [ ] Apply one decision matrix: field/button validation stays local, recoverable surface failures
      stay inline, blocking failures use a modal, and background failures use toast/activity.
- [ ] Add accessible invalid-submit shake behavior that respects reduced motion, keeps focus, and
      pairs animation with visible text/ARIA announcement.
- [ ] Map `UserError` codes to stable display copy/remediation; do not render raw server errors.
- [ ] Replace all production `window.prompt`, `window.alert`, and `window.confirm` interactions with
      the shared accessible primitives while preserving user input on validation failures.

### P0.11 — Complete authentication and account lifecycle

- [ ] Implement real password, magic-link, OIDC, and Cloudflare Access client flows for the enabled
      server configuration; remove passive instructions that do not start the corresponding flow.
- [ ] Provide password requirements, confirmation, field-specific errors, pending/retry state, and
      preserved email.
- [ ] Add logout that revokes the session, stops state/SSE, clears sensitive UI state, and routes to
      authentication without a reload.
- [ ] Handle expired/revoked sessions without refresh/auth loops, retaining only safe navigation
      intent.
- [ ] Resolve the profile-email versus authentication-email semantic mismatch and define recovery,
      password change, and session management before exposing controls.

## P1. Sidebar, chats, messages, and Happy

### P1.2 — Fast creation and discovery

- [ ] Replace exact-name/browser-prompt DM creation with one autocomplete flow for human DM, agent
      chat, join channel, and create channel.
- [ ] Support group DMs with member autocomplete, duplicate prevention, naming, and a clear channel
      distinction.
- [ ] Navigate directory selection to the chosen person/channel and distinguish preview, join, and
      open. Support “New chat with Happy” without creating another agent identity.
- [ ] Reuse server validation while exposing field-level errors and preserving user data on failure.

### P1.2a — Complete channel and message workflows

- [ ] Add authorized channel member/role/visibility/archive/delete workflows, pins, bookmarks, and
      exact navigation to their messages/files.
- [ ] Keep existing reply/edit/delete behavior but add Quote, Forward, Pin, Bookmark, and revision
      history menus with authorization and confirmations.
- [ ] Support attachments and previews in thread replies, cursor pagination in both directions,
      anchored scroll, searched-message paging, and verified root-timeline filtering.
- [ ] Represent concurrent typers as an expiring per-chat set, and show delivery/generation/edit/
      delete/forward state truthfully under permission/deletion races.

## P1. Files, media, mentions, reactions, and emoji

### P1.4 — Video metadata and poster pipeline

- [ ] Generate and persist a trustworthy video poster plus media metadata during normal file handling.
- [ ] Reconcile poster/metadata into messages and Files live, with safe failure/retry behavior and
      Gym coverage for malformed, oversized, restarted, and concurrent processing.

### P1.5 — Complete media/file viewer

- [ ] Build one reusable modal viewer for images, videos, GIFs, and files with zoom, pan, gallery
      navigation, sharing/download, keyboard/focus behavior, and signed-URL expiry/retry.
- [ ] Preserve underlying chat/gallery, focus, and scroll when the viewer closes.
- [ ] Add browser geometry/interaction and app authorization/range-playback tests.

### P1.6 — Forward messages and files

- [ ] Add Forward in channel and thread message actions with a searchable legal-destination picker,
      source attribution, attachment preview, confirmation, and retry-safe idempotency.
- [ ] Define and implement thread-to-thread semantics explicitly; reconcile destinations live and
      navigate only on request.

### P1.7 — Mentions and agent-visible authorship

- [ ] Add `@here`, `@channel`, and `@everyone` autocomplete with scope warnings; decide `@all`.
- [ ] Render server-provided mention ranges and supply sender display name/username plus bounded
      channel membership/context to agents.
- [ ] Let agent-authored mentions create normal notifications. Only real direct/special mentions
      increment mention counters; ordinary unread stays an unread style.

### P1.8 — Reactions and emoji

- [ ] Implement the residual server prerequisite for bounded, authorized, paginated reaction-actor
      lookup and differences for already retained actor lists. Cover concurrent mutation, deletion,
      custom-emoji deletion, cursors, authorization, and retries in Gym.
- [ ] Replace the 16-item emoji list with efficient searchable/categorized Unicode data plus custom
      workspace emoji and per-user recents.
- [ ] Preserve reaction actor identity through state/UI and show names/avatars on hover, focus, or
      click, including a full large-count list.
- [ ] Share one catalog/search primitive across composer, reaction, status, and custom emoji; reconcile
      concurrent add/remove without stale counts.

## P1/P2. Agent conversations and execution

### P1.9 — Agents in channels and audience mode

- [ ] Route channel messages to the configured default agent and explicitly selected additional agents,
      with persisted `people`/`agents`/explicit-agent audience and authorization.
- [ ] Guarantee one Rig session/container per agent and conversation, deterministic multi-agent queue,
      thread audience semantics, bounded channel context, author identity, attachments, prompts, and
      restart-safe retries.

### P1.10 — Composer agent controls

- [ ] Add a clear People/Agents composer mode; Shift-Tab toggles it without breaking normal Tab
      accessibility. Persist/display the selected audience per conversation.
- [ ] Show active default/additional agents without requiring mentions.
- [ ] Add model, provider, and effort controls with correct creator/admin permission handling.

### P1.11 — AI provider and model configuration

- [ ] Expose live Rig providers/models/current model/effort levels through server and state.
- [ ] Define server, agent, channel, and session default/override scopes; validate every choice against
      live capability and never expose credentials.
- [ ] Apply changes to future turns only and cover disappearing providers, missing secrets, concurrent
      changes, existing sessions, and restart.

### P1.12 — Compact durable agent run trace

- [ ] Persist bounded ordered run events for tool calls, approvals, workflow phases, subprocesses,
      subagents, usage, files, completion, and errors; enforce retention/redaction and restart safety.
- [ ] Keep chat compact with one live activity card per run and expandable grouped events; provide
      paged/raw debugging access without unbounded DOM growth.
- [ ] Bind existing run/approval/diff components to real state and cover all event races in Gym/state/UI.

### P1.13 — Session terminal

- [ ] Add an authorized interactive terminal bridge to the exact Rig session container with bounded
      PTY transport, resize/stdin/stdout/stderr/exit/reconnect, limits, audit metadata, cleanup, and
      immediate revocation on membership/session loss.
- [ ] Build a reusable `happy2-ui` terminal panel with copy/search/clear and visible container/session
      identity, plus security/lifecycle and desktop interaction coverage.

### P2.1 — Happy-to-Rig durable tool bridge

- [ ] Define a versioned allowlisted session tool manifest and durable request/result/error events with
      correlation, idempotency, deadlines, cancellation, authorization, and audit.
- [ ] Dispatch only bounded Happy capabilities: create chat/channel/subchannel, post a message, attach
      a known file, inspect allowed channel metadata, and request a clone.
- [ ] Authorize as the configured agent principal plus initiator/channel policy; never grant blanket
      administrator authority. Cover replay, timeout, restart, malformed data, concurrency, and audit.

### P2.2 — Safe files from Rig to Happy and back

- [ ] Add an allowlisted multi-file attachment tool restricted to the session workspace. Reject path
      traversal, escaping symlinks, devices, sockets, mutable reads, and excessive totals.
- [ ] Copy bytes to Happy storage through normal quota/malware/media/hash processing and store source
      session/run/path/hash provenance without exposing host paths.
- [ ] Map same-session known files back to their still-matching sandbox paths; materialize safe ingress
      for another session after forwarding. Reconcile created media/files live.

## P2. Subchannels, secrets, environments, and administration

### P2.3 — Subchannels and project forks

- [ ] Add parent lineage to channels and a cycle-safe `createSubchannel` action that snapshots selected
      members, agent, prompt/configuration, secret references, and workspace.
- [ ] Run workspace copy as a durable progress/cancel/retry/restart-safe job. Copy files safely,
      decide Git-history policy explicitly, and keep partial clones invisible until committed.
- [ ] Expose lineage/status through sync APIs, then build compact header/sidebar lineage UI, preflight,
      progress, navigation, and agent-created-child notification.

### P2.5 — User-owned versioned secrets

- [ ] Move secrets from admin-only APIs to owned/authorized user workflows with owner/creator/times,
      version, variable names, bindings, rotation history, and audit metadata.
- [ ] Keep values write-only. Make update/add/remove/replace create a validated new version and rotate
      live bindings atomically; support owner rotation/deletion and administrator emergency revocation.
- [ ] Define channel/agent binding permissions and reconcile metadata/rotation live.

### P2.6 — Environments versus secrets

- [ ] Define Environment as reusable non-secret configuration and Secret as write-only sensitive data.
- [ ] Define creation/share/edit/binding permissions, move personal/shared environments and secrets to
      permissioned Settings, retain global provider/image/server policy in Admin, and show safe owner/
      binding/rotation metadata with update/rotate/revoke feedback.

### P2.7 — Administration redesign

- [ ] Move authorized admin navigation near Settings/profile, not the primary rail.
- [ ] Load admin resources independently so one forbidden/failed resource does not blank another.
- [ ] Keep only truthful, wired administration workflows; hide unimplemented tables/tabs. Add
      confirmations, progress/errors, per-row permissions, pagination, and live updates.

## P2. Remaining product destinations

### P2.8 — Activity and notifications

- [ ] Route Activity from live notifications with SSE reconciliation, exact navigation targets,
      mention-only counters, mark-read behavior, pagination, and truthful empty/loading/error state.
- [ ] Round-trip every fine-grained notification preference and initialize desktop/sound state from live
      user data. Define background delivery/sound policy and multi-window behavior.

### P2.9 — Followed threads

- [ ] Route Threads from live thread data, add follow/unfollow/notification-level controls, and
      navigate to the exact unread reply without losing the source surface. Model every thread as a
      normal chat whose `parentMessageId` links it to the message in its parent chat; because a
      thread message can itself own a child chat, this forms an arbitrary-depth tree without a
      separate thread-only message model.
    - [x] Server: replace the special root/reply thread persistence and endpoints with normal chat
          behavior plus the parent-message relation. Prove creation at multiple depths, membership
          and visibility, message send/list/sync behavior, and parent linkage in Gym.
        - Implemented migration `0018_threads_are_chats.sql`, ordinary child-chat creation/get/follow
          actions, recursive ancestor access, descendant membership/ownership/delete propagation,
          follower-gated unread/notifications, exact live reply counts, and delete/recreate semantics.
        - Evidence: repository `pnpm format` + `pnpm format:check`; server typecheck, lint,
          `architecture:check`, and 92/92 tests; full server Gym 119/119 tests, including four
          arbitrary-depth/concurrency/ownership/delete-recreate thread workflows. Claude Opus review
          session `82334149-ae29-4961-968a-f25cb35efacd` ended with no actionable or task-blocking
          issue in the exact backend diff.
    - [ ] After explicit backend approval, UI: open a thread as the central conversation surface,
          expose its parent context, and allow any message in that thread to open another child
          thread while preserving navigation history.

### P2.10 — Calls

- [ ] Decide whether calls are a near-term desktop product. If not, remove calls from production.
- [ ] If retained, connect live signaling/media/session state with permissions, devices, reconnect,
      decline/end semantics, and multi-client desktop coverage.

### P2.11 — Home/agent desk

- [ ] Decide whether Home has a distinct product workflow. If not, remove it from production.
- [ ] If retained, derive every stat, notification, and run from live state and route every card; use
      the durable run model rather than decorative local counters.

## P3. Product-wide completion

### P3.1 — State, feedback, and truthfulness audit

- [ ] Inventory every route, panel, modal, menu, and async button and prove relevant loading,
      incremental loading, empty, populated, denied, offline, retry, validation, background failure,
      and success states.
- [ ] Remove no-op/dead controls, production mock fallbacks, hard-coded identity fallbacks, and manual
      refresh controls. Make long work understandable after reload/navigation in an activity center.

### P3.2 — Desktop accessibility audit

- [ ] Verify keyboard navigation, visible focus, Escape hierarchy, focus trapping/return, menu
      navigation, shortcuts, screen-reader names/roles/live regions, reduced motion, and terminal
      accessibility.
- [ ] Test macOS controls/drag regions and the 1024×704 minimum desktop window; add no mobile layout.

### P3.3 — Performance and reactivity audit

- [ ] Prevent remount/refetch storms for search, avatar changes, streaming replies, agent activity,
      sidebar updates, and route overlays.
- [ ] Virtualize long message/search/activity/file lists while preserving focus and anchored navigation.
- [ ] Bound URLs, timers, subscriptions, SSE listeners, terminal connections, media decoders, and jobs
      on unmount/logout. Remove N+1 DM-member refreshes through a correct bulk/sync contract.
- [ ] Add deterministic races for stale responses, navigation during load, reconnect, rollback, and
      multi-window changes; set budgets for workspace load, search response, message DOM, and long-run
      memory.

### P3.4 — Release verification

- [ ] Confirm every remaining item is merged, explicitly deferred, or removed from the product.
- [ ] Restore parallel Gym execution after isolating the streamed-turn, workspace-cursor, and
      magic-link shared-resource races; keep serial mode only with a measured documented reason.
- [ ] Run repository checks, Gym/state suites, all changed three-browser UI suites, and saved screenshot
      review.
- [ ] Run a fresh-install walkthrough and a two-human/two-agent collaboration walkthrough covering
      channels, agents, mentions, files, forwarding, reactions, terminal, subchannel cloning, and
      restart recovery.
- [ ] Perform a security review of bootstrap, providers, terminal, durable tools, sandbox file egress,
      secrets, signed URLs, and authorization revocation.

## Decisions due at feature boundaries

- [ ] Decide whether `@all` aliases `@channel` or is rejected (P1.7).
- [ ] Decide thread-to-thread forwarding semantics (P1.6).
- [ ] Decide whether subchannel workspace snapshots include Git history (P2.3).
- [ ] Decide whether Calls and Home are retained product destinations (P2.10–P2.11).
