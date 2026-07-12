# Agent Instructions

## Project

Rigged is a desktop work and coding app that evolves by adopting itself. It is
desktop-only: do not assume mobile use, add mobile-specific behavior, or adapt
layouts for mobile viewports.

## Sync to main

When asked to “sync to main,” commit the current work, fetch and rebase it onto
the latest `origin/main`, then push the resulting `HEAD` to `main` with a normal
non-force push. If `main` advances or the push is rejected, fetch, rebase again,
and retry until the push succeeds. Never force-push `main`.

## Server principles

`@slopus/rigged` is a small desktop-app backend that may run as the complete
server or as a separately deployed authentication service. Its behavior is
configured from a TOML file; do not add deployment-specific switches to code.

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
