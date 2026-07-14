# Agent Instructions

## Project

Rigged is a desktop work and coding app that evolves by adopting itself. It is
desktop-only: do not assume mobile use, add mobile-specific behavior, or adapt
layouts for mobile viewports.

## Feature development workflow

Build each feature in isolation, with an explicit boundary between its server
and UI work. Do not mix unrelated features into the same implementation.

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
rendering tests. Reusable visual components belong in `rigged-ui`; application
packages may only compose them and supply product state and event handlers.

Use flexbox for layout almost all of the time — it is the default for every row,
column, stack, toolbar, and centered box. Use another mechanism (CSS Grid, and
only for a genuine two-dimensional grid) solely when flexbox cannot express the
layout at all; never fall back to floats, `inline-block` hacks, or layout tables.
See `DESIGN.md` → "Layout with flexbox".

## Sync to main

When asked to “sync to main,” commit the current work, fetch and rebase it onto
the latest `origin/main`, then push the resulting `HEAD` to `main` with a normal
non-force push. If `main` advances or the push is rejected, fetch, rebase again,
and retry until the push succeeds. Never force-push `main`.

## Server principles

`@slopus/rigged` is a small desktop-app backend that may run as the complete
server or as a separately deployed authentication service. Its behavior is
configured from a TOML file; do not add deployment-specific switches to code.

Server behavior must be tested end to end in `gym`, the repository's isolated
black-box testing environment. Add or update coverage under
`packages/gym/tests/server` whenever changing server HTTP behavior; unit tests
do not replace this end-to-end coverage. Name each test file after the observable
behavior it proves so the directory reads like an index of supported workflows;
do not use generic names such as `server.test.ts`, `integration.test.ts`, or
issue numbers. Read `packages/gym/README.md` before writing gym tests for the
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

`rigged-state` is the in-memory product-state boundary between application code
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
- Cover deterministic races and failures with the programmable fake server in
  `rigged-state/testing`, and cover the same boundary against the real in-memory
  server through `gym/state`.
