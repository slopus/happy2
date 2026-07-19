# `happy2-server`

`happy2-server` is the Fastify backend for deployments that run one service
(`server.role = "all"`), a dedicated authentication service (`"auth"`), or an
API-side token validator (`"api"`). All useful backend endpoints are versioned
under `/v0`; the backend's `/` remains only a small service-status response.

## Run

```sh
# Published backend package
npx happy2-server --config ./happy2.toml

# Published all-in-one web app and API on http://127.0.0.1:3000
npx happy2

# Install or remove automatic startup for the all-in-one app
npx happy2 service start --config ./happy2.toml
npx happy2 service stop

# Start or stop it as a background process in the current directory
npx happy2 daemon start --config ./happy2.toml
npx happy2 daemon stop

# Development, with reload and no configuration file:
pnpm dev:server

# Locally built backend:
cp packages/happy2-server/happy2.example.toml happy2.toml
pnpm --filter happy2-server build
pnpm --filter happy2-server start -- --config ../../happy2.toml

# Locally built complete package:
pnpm build
pnpm start -- --config ./happy2.toml
```

The all-in-one `happy2` executable starts the API on an ephemeral loopback port, serves the
packaged SPA on the configured public port, and streams `/v0` requests through
an internal reverse proxy. The web app therefore uses one origin for normal
HTTP, uploads, and server-sent events. The configured `trusted_proxy_hops`
continues to describe only proxies outside Happy (2); the private loopback hop is
handled internally.

Without a TOML file, the package starts an `all`-role app on `127.0.0.1:3000`
with SQLite, password authentication, and generated JWT/pepper
material. Database, files, generated secrets, agent workspaces, and Rig runtime
state live under `.happy2` in the invoking directory. Add `.happy2` to the
project's ignore rules and preserve it as private application state. The
package starts its bundled `@slopus/rig` executable with a private Rig home under
`.happy2/rig` by default, containing configuration, runtime settings, session
state, socket, and token. Set `RIG_HOME` to an absolute path to relocate it. The
package never connects to the user's global Rig daemon. Provide
`--config /path/to/happy2.toml` or
`HAPPY2_CONFIG=/path/to/happy2.toml` to override the defaults.

`happy2 service start` keeps the all-in-one app running across restarts. On
macOS it installs `~/Library/LaunchAgents/com.slopus.happy2.plist` without
`sudo`, starts at login, and writes logs under `~/Library/Logs/Happy2`. On Linux
it writes `happy2.service` in the current directory, prints the complete unit,
and prints the exact `sudo install` and `systemctl` commands required to install
and enable it. The command never invokes `sudo`. The Linux unit is system-wide
but runs the process as the user who generated it; logs go to the systemd
journal. The generated file remains in the current directory for inspection or
reinstallation. `happy2 service stop` directly stops and removes the macOS LaunchAgent,
while on Linux it prints the `sudo` commands that stop, disable, and remove the
systemd unit.

`happy2 daemon start` starts the all-in-one app in a detached process group and
returns immediately. It writes `.happy2/happy2.pid` and appends output to
`.happy2/happy2.log` in the current directory. `happy2 daemon stop` sends the
whole process group a graceful termination signal, force-stops it if necessary,
and removes the PID file. Unlike `service start`, daemon mode does not arrange
automatic startup after a login or reboot.

The service preserves the installation-time working directory, `PATH`, and
optional `RIG_HOME`. When `--config` is supplied, its path is made
absolute before installation. Put service secrets and SMTP environment values
in the private `.env` beside the TOML configuration rather than expecting an
interactive shell environment to exist during boot. An npx invocation generates
a service that runs `npx --yes happy2`, avoiding a dependency on the disposable
`_npx` cache directory. A global installation resolves `happy2` from the saved
`PATH`; regenerate and reinstall the service after changing that path.

Clients can discover the selected authentication method at `GET /v0/auth/methods`.
The response includes the server role, the durable `registration` availability
(`bootstrap`, `open`, or `closed`), and one `method` value: `password`,
`magic_link`, `oidc`, `cloudflare_access`, or `null` in validation-only API mode.
Password responses also report the derived `signupEnabled`; OIDC responses report
`oidcProvider`.

The built-in plugin package, installation, container lifecycle, health, and MCP
HTTP contracts are documented in [`PLUGINS.md`](./PLUGINS.md).

## Server and user onboarding

Every new database begins with durable server onboarding. `GET /v0/setup/status`
is the intentionally minimal public routing status. It exposes only the setup
schema version, phase, and registration availability. An authenticated account
uses `GET /v0/setup` for the combined server/user step state and exact next route.

Before server onboarding completes, exactly one new authentication account may
be created across password, magic-link, OIDC, or Cloudflare Access. Magic-link
requests do not create accounts: the first successfully verified link atomically
creates the account and claims the bootstrap slot, while other still-pending links
cannot claim it. The bootstrap account creates the only profile allowed during
setup and atomically becomes the administrator. All later registration attempts
are closed while that administrator selects and validates a sandbox provider and
builds the base agent image.

After the bootstrap profile exists, an administrator calls
`GET /v0/setup/sandboxProviders`. Each request performs fresh, time-bounded
Docker and Podman command/engine probes and returns displayable health, version,
and remediation details. The response always explains that agent code runs
inside the selected sandbox. It includes `recommendedProviderId` only when
exactly one provider is healthy; when both are healthy, the administrator must
choose explicitly.

`POST /v0/setup/selectSandboxProvider` with
`{ "providerId": "docker" | "podman" }` probes the requested provider again and
atomically completes both durable provider-selection and validation steps. An
unhealthy, missing, or timed-out provider is returned as a displayable conflict
and is not persisted. The provider choice is installation state, not a TOML
deployment switch. Docker and Podman are discovered from `PATH`; every image
build, agent sandbox creation, file transfer, terminal attachment, and cleanup
uses the selected provider boundary after selection and across server restarts.

The next screen reads `GET /v0/setup/baseImages`. It returns the immutable
Daycare Minimal and Daycare Full definitions plus custom definitions, the
durable selected/default identifiers, and full progress, current log line,
retained log, truncation, and failure details for the selected image. Built-ins
use the display action `Download and build` because they fetch the pinned
Daycare context; a custom Dockerfile uses `Build`. The administrator starts one
choice with `POST /v0/setup/selectBaseImage`, passing either
`{ "builtinKey": "daycare-minimal" | "daycare-full" }` or
`{ "custom": { "name": "...", "dockerfile": "..." } }`. An existing
immutable definition is reused. Otherwise the existing leased image worker owns
the single durable job, so refresh and restart reconstruct the same progress
screen without process-local state. A failed selected job is retried with
`POST /v0/setup/retryBaseImageBuild` and an empty object body.

Build completion, ready status, default-image promotion, setup completion,
audit, and sync evidence commit in one transaction. If promotion fails, that
transaction rolls back, the previous default remains unchanged, and the same
selection becomes a visible retryable failure. Registration policy selection
also revalidates that the setup selection is still the ready default instead of
trusting completion flags alone. Image progress, failure, and completion use the
normal `agent-images` plus `setup` SSE/difference areas.

The final server step is
`POST /v0/setup/chooseRegistrationPolicy` with `{ "enabled": true | false }`.
It succeeds only for an active server administrator after all preceding durable
steps are complete. The selection and `server_setup_complete` transition commit
atomically and become the sole registration policy; there is no TOML signup
switch. Server-owned provider/image work records its own step transitions rather
than trusting completion flags from a client.

Per-user onboarding is stored separately. A user records the supported
`avatar` or `desktop_notifications` outcome with
`POST /v0/me/updateOnboardingStep`; the outcome is `complete` or `skipped`.
Avatar completion is rejected until a durable avatar exists. Every transition
writes normal sync state and emits a realtime reconciliation hint.

## Profiles and avatar files

Authentication creates an inactive account. `POST /v0/me/createProfile` (with the
temporary bearer token) creates the product-level User profile—first name,
optional last name, username, optional email, and optional phone—and activates
the account. The first setup profile atomically becomes the bootstrap administrator;
later profiles are members after registration is opened. Successful token-issuance responses include `profileRequired`, so a
client can enter profile creation without probing a protected product route.
`GET /v0/me` reads the active profile and
`POST /v0/me/updateProfile` replaces its editable state. Product routes reject
accounts that do not yet have an active profile.

`POST /v0/me/uploadAvatarFile` accepts one multipart image after profile
creation. Its required `visibility` field is `public` or `private`; `crop` is a
JSON object with integer `x`, `y`, `width`, and `height` coordinates in the
orientation-normalized source image. The crop must be square and remain inside
the source. Corrupt and animated images, images over 2048px on either side, and
uploads over 10 MB are rejected. The server auto-orients and extracts the crop,
then records the uploader, stores an unguessable CUID2-backed file record plus
an exactly 1024×1024 JPEG, and records a ThumbHash.

`POST /v0/me/updateAvatar` takes a `fileId` and accepts only a public file the
current user uploaded. Public files are fetched directly with
`GET /v0/files/:fileId` plus the normal bearer header; they do not use signed
URLs. Private files are fetched using a five-minute signed URL produced by
`POST /v0/files/:fileId/createSignedUrl`.

The server applies the bundled Drizzle SQLite migrations at startup. `file:`
database URLs are suitable when all replicas share one local filesystem with
SQLite locking. For independently deployed auth and API services, configure a
shared `libsql:`/`https:` SQLite endpoint and, if needed, set its auth-token
environment variable named by `database.auth_token_env`.

Build the image from the repository root:

```sh
docker build -f packages/happy2-server/Dockerfile -t slopus/happy2 .
docker run --rm -p 3000:3000 -v "$PWD/happy2.toml:/app/happy2.toml:ro" slopus/happy2 --config /app/happy2.toml
```

Mount a writable directory containing `happy2.toml` when using generated key
material, because the adjacent `.env` file is the durable key store.

## Authentication

Choose exactly one of password, magic-link, OIDC, or Cloudflare Access in `happy2.toml`; startup
rejects configurations that enable more than one method. Clients can learn the
selected method from `GET /v0/auth/methods`.

- Password registration follows the durable setup registration policy. The first
  bootstrap account is allowed once; after setup, the administrator's final
  open/closed choice applies. Every password has its own random salt; a
  server-wide password pepper is also used.
- Magic-link SMTP credentials are exclusively `EMAIL_SMTP_HOST`,
  `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, and `EMAIL_SMTP_PASSWORD` environment
  variables. The configured `redirect_url` should be the desktop app’s link
  handler; it submits the token to `POST /v0/auth/magic-link/verify`.
- OIDC uses discovery, PKCE, a nonce, and remote JWKS validation. Provider
  secrets are referenced by environment-variable name in TOML.
- Cloudflare Access validates the signed `Cf-Access-Jwt-Assertion` that Access
  forwards after its policy permits the request. It uses the Access application
  session rather than issuing a Happy (2) bearer token.

### Cloudflare Access

Cloudflare Access can provide all interactive authentication for a deployment.
Create a **Self-hosted** HTTP application for the public Happy (2) hostname,
attach the intended Access policy and identity providers, then configure this
as the only enabled method:

```toml
[auth.password]
enabled = false

[auth.magic_link]
enabled = false

[auth.cloudflare_access]
enabled = true
team_domain = "https://your-team.cloudflareaccess.com"
# Zero Trust → Access controls → Applications → your application →
# Additional settings → Application Audience (AUD) Tag.
audience = "your-access-application-aud-tag"
```

The server fetches the signing keys from the configured team domain and accepts
only an RS256 application assertion whose issuer and audience match this
configuration. It requires the Access JWT's `type`, `sub`, `email`, and expiry
claims, then maps the `(team domain, sub)` identity to a Happy (2) account.
As with the other methods, a newly authenticated account cannot use product
routes until it has an active profile.

Do not expose the origin directly. Use Cloudflare Tunnel or a network firewall
that allows only Cloudflare to reach it; otherwise a captured valid assertion
could be replayed directly to the origin until it expires. Happy (2) validates
the assertion itself and deliberately does not trust identity headers or the
`CF_Authorization` cookie. Cloudflare's browser/logout flow owns the session;
use `https://your-happy-host/cdn-cgi/access/logout` to end it. Consequently,
`POST /v0/auth/refresh` does not apply and `POST /v0/auth/logout` returns
`cloudflare_access_manages_session`.

The web bundle must be served from the protected hostname so browser requests,
SSE, and the `CF_Authorization` cookie share one origin. To run the Electron
desktop shell against that deployed bundle, start it with:

```sh
HAPPY2_SERVER_URL="https://happy.example.com" pnpm --filter happy2-desktop start
```

Electron loads the protected hostname in its own browser session, so Access
performs its normal redirect before Happy (2) renders. Do not point the bundled
local renderer at this hostname: that cross-origin arrangement cannot safely
reuse Cloudflare's HttpOnly application cookie.

On initial startup, external environment values win. If an auth-capable server
has no JWT private key configured, it generates a 3072-bit RS256 key pair and
adds base64-encoded `HAPPY2_JWT_PRIVATE_KEY_B64` and
`HAPPY2_JWT_PUBLIC_KEY_B64` to the `.env` file beside its TOML file. It likewise
adds `HAPPY2_PASSWORD_PEPPER` when password auth is enabled. Preserve that file
as a secret; replacing it invalidates existing passwords and sessions. You may
instead supply those variables through the deployment environment or mount PEM
key files via the `jwt` config.

Sessions are signed JWTs with a 30-day default lifetime and a stable `sid`.
`POST /v0/auth/refresh` re-signs the same session ID and advances the database
expiry. All authenticated requests check the shared SQLite session row, so a
missing, expired, or revoked row is rejected regardless of JWT validity.

## Server test coverage

Run the complete server coverage gate from the repository root:

```sh
pnpm coverage:server
```

The command first tests the coverage tooling, then runs server unit tests and
the complete non-Playwright Gym suite with Vitest's V8 provider. It validates
both raw maps against one production-source universe, writes their boolean union,
prints unit/Gym/combined statement, branch, function, and line percentages side
by side, lists every uncovered file/line range, and compares exact covered/total
fractions with `coverage-baseline.json`. Threshold comparisons use integer cross
multiplication, so displayed percentage rounding cannot hide a regression. The
same gate runs inside `pnpm check`.

The authoritative universe is every `.ts` file under `sources`, including files
that no test imports. It excludes `*.test.ts`, `*.spec.ts`, generated `*.d.ts`,
and files inside `__tests__`, `testing`, `fixtures`, or `__fixtures__` directories.
Both Vitest configs consume the same TypeScript definition, and the merge command
fails if either report omits a production file or if the universe is empty.

Reports are generated under:

- `coverage/unit` for `happy2-server` unit tests;
- `coverage/gym` for Gym integration coverage of the aliased server sources;
- `coverage/combined` for the union, where a line hit by both suites is counted
  once.

Each directory contains `coverage.txt`, `index.html`, `lcov.info`,
`coverage-final.json`, and `coverage-summary.json`. Compare
`coverage/unit/index.html` with `coverage/gym/index.html` (or their
`coverage.txt` files) to find behavior that unit tests exercise but Gym does not.
Statements are executable statement regions, branches are control-flow outcomes,
functions are callable regions, and lines are source lines containing statements.
Generated coverage directories are gitignored and removed by `pnpm clean`.

The individual report commands are `pnpm coverage:server:unit` and
`pnpm coverage:server:gym`. `pnpm coverage:server:baseline` reruns the tooling and
both suites before replacing the checked-in exact-ratio thresholds with that
run's measurements. Timing-sensitive Gym paths may require a narrow reviewed
floor below a sampled measurement. Any deliberate threshold reduction must
include the measured range and rationale in the same reviewed change;
improvements do not require a rationale.

## Collaboration API

The API is HTTP-only. Durable reads and actions use JSON GET/POST endpoints;
live hints, typing, presence, and WebRTC signaling use Server-Sent Events. All
product routes require an active User profile. An `auth`-role server does not
serve collaboration routes; `all` and `api` roles do.

The main route groups are:

| Area                  | Route families                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Chats                 | `/v0/chats`, `createDirectMessage`, `createGroupDirectMessage`, `createChannel`, and channel update/archive/unarchive/delete actions      |
| Membership and policy | chat join/leave/add/remove/set-role actions, member lists, posting policy, retention policy, topic, and owner transfer                    |
| Messages              | history and message reads; send/edit/delete/forward actions; revision history; read receipts and unread state                             |
| Replies and threads   | `quotedMessageId` creates an explicit reply in the main timeline; thread send/list/subscription/read actions maintain a separate timeline |
| Message organization  | reactions, custom emoji, pins, chat and user bookmarks, scheduled messages, notifications, stars, and per-user ordering                   |
| Discovery             | contacts, directories, files, thread inbox, calls, and fuzzy global search across visible users, channels, and messages                   |
| Files                 | streaming and resumable uploads, upload state/cancel/complete, ranged downloads, image/video previews, deletion, and signed URLs          |
| Presence and calls    | durable user status/DND preferences, ephemeral presence and typing, call lifecycle, and ephemeral WebRTC signaling                        |
| Sync                  | state, paginated server/chat differences, consumer acknowledgement, compaction/reset, and SSE hints                                       |
| Operations            | audit logs, access telemetry, bans, reports/actions, data-export jobs, backup records, retention runs, and server/user administration     |
| Integrations          | bots, scoped API credentials, credential-authenticated posting, incoming/outgoing webhooks, slash commands, and delivery queues           |
| Automation            | scheduled messages plus schedule, durable event, authenticated webhook, outgoing-webhook, bot-message, and moderation automations         |

## AI agents

`POST /v0/chats/createAgent` requires a display name and unique username. It
creates an ordinary `User` with `kind = "agent"`, records the creating user, and
opens a normal two-member direct message with it. There is no agent-specific
chat kind. Creation is rejected until an administrator has built and selected a
ready default image.
Agents share the normal user profile, username, sender, directory, mention, and
typing paths; only their Rig execution bindings are agent-specific. The product
server—not the desktop or web client—creates and controls Rig sessions over its
authenticated Unix socket. Configure `[agents]` with the socket, token, Rig
executable, and server-owned `default_cwd`; clients cannot select filesystem
paths.

An agent's profile effort is the default for new chat sessions. Each bound chat
stores its own durable override, exposed to active chat members through
`GET /v0/chats/:chatId/agents/:agentUserId/effort` and
`POST /v0/chats/:chatId/agents/:agentUserId/changeEffort`. Changing one chat
updates only that chat's Rig session, survives restart, and appends an
`agent_effort_changed` service message to the same chat. Choosing the already
effective value is a no-op and does not add duplicate history. A newly bound
chat inherits the agent profile default rather than another chat's override.

The server seeds immutable `Daycare Minimal` and `Daycare Full` definitions from
the pinned upstream Daycare runtime Dockerfiles. Both use Ubuntu 24.04; Full adds
the Python, Rust, and Go toolchains. Administrators use
`GET /v0/admin/agentImages`, `GET /v0/admin/agentImages/:imageId`,
`POST /v0/admin/agentImages/:imageId/buildImage`,
`POST /v0/admin/agentImages/createImage`, and
`POST /v0/admin/agentImages/:imageId/setDefaultImage` to list concise build
summaries, inspect a definition's Dockerfile and latest build log, build a
built-in or custom persisted Dockerfile, and select a ready default. List rows
include a best-effort 0–100 step percentage and the last non-empty log line;
detail responses include the Dockerfile, log, and an explicit truncation flag.
Definitions and content-derived tags never change. Builds are leased in SQLite,
resume after server restart without clearing the interrupted attempt's progress
or log, use the administrator host's selected sandbox provider, and publish
durable `agent-images` sync hints over the existing SSE connection.
Docker output is persisted in 500 ms batches so progress remains live without
turning every process chunk into a SQLite transaction. The latest attempt's log
is capped at two million characters. An explicit retry begins a fresh log;
worker restart recovery retains and appends to the interrupted log.

Administrators can assign a ready image to an existing agent with
`POST /v0/admin/agents/:agentUserId/changeImage`. A real change starts a fresh
container and Rig session for every connected private workspace, atomically
switches the durable bindings, and then removes the old containers. Workspace
directories are preserved. Selecting the current image is a no-op, and changing
an image is rejected while the agent has pending or running work.

Each agent is rooted at `default_cwd/agents/<agent-user-id>`. Direct/private
conversations get separate `users/<human-user-id>/home` and
`users/<human-user-id>/workspace` directories below that root, preventing one
person's files and context from leaking into another's. The server starts one
long-lived container with a read-only root filesystem, writable tmpfs mounts at
`/tmp`, `/run`, `/var/tmp`, and `/var/run`, 1 GiB `/dev/shm`, init enabled, and
only the private home and workspace mounted read-write at `/home` and
`/workspace`. It then creates the Rig session with Rig's built-in existing
container configuration and `/workspace` working directory. For now, only
top-level messages in exact two-user DMs invoke Rig. Agents may be ordinary
members of group DMs and channels—including multiple agents in one channel—but
those conversations remain dormant until mention-based collaboration is
implemented.

Every public or private channel owns a shared server-side workspace at
`default_cwd/channels/<chat-id>`, created lazily on its first workspace request.
A DM with exactly one connected Rig environment instead resolves the
persisted `agent_rig_bindings.cwd` host path, which is the directory mounted
into that environment at `/workspace`. A current chat member can read its
file-tree snapshot from `GET /v0/chats/:chatId/workspace`. An unconnected DM or
ambiguous chat returns `404`, and public-channel discovery alone never reveals
workspace contents. Paths are canonical `@pierre/trees` input (directory paths
end in `/`), absolute server paths are never returned, and directory symlinks
are listed without being traversed.

The first request lazily creates a process-local partial index and starts its
recursive monitor before reading the root. Adaptive preload returns at most
2,500 paths, 192 KiB of encoded path data, three levels, and 128 inspected
directories. A directory with more than 400 direct children remains collapsed.
The default-deferred basenames are `.git`, `.next`, `.pnpm`, `.turbo`, `.yarn`,
`.cache`, `build`, `coverage`, `dist`, `node_modules`, `target`, and `vendor`.
These entries are visible and fully accessible; the preload simply does not
descend into them. `unloadedDirectories` identifies every visible directory
whose children still need to be loaded.

`GET /v0/chats/:chatId/workspace?directory=<canonical-directory>` pages one
directory's direct children, including the root when `directory` is empty. The
default page is 250 entries, callers may request up to 1,000, and an adaptive
128 KiB path-data ceiling can end a page earlier. `nextCursor` continues the
same directory; a filesystem change invalidates it with `409
workspace_cursor_stale`. All entries—including hidden files and the contents of
`.git/`—remain reachable through these pages.

Directory listings use a per-workspace LRU capped at 20,000 entries. Chats
connected to the same mounted host directory share one index and monitor. At
most 8 partial indexes stay warm; cooling an older index releases its directory
and Git caches but keeps its lightweight monitor active, and the next request
warms it again. Git status initializes and refreshes in the background, so a
cold tree response does not wait for Git. Responses expose `gitStatusPending`
and a process-local `revision`; completion publishes the same
`workspace.changed` SSE invalidation as a filesystem mutation. File changes are
coalesced for 20 ms,
invalidate only affected directory-cache branches when the watcher supplies a
path, and cause clients to reconcile through the HTTP snapshot. Successful
responses provide a private, revalidated `ETag`, allowing an unchanged
reconciliation to return no body over a slow connection. All indexes and
monitors close with the server.

If the configured socket is unavailable, Happy (2) runs `rig daemon start` without
a shell and passes the configured socket and token paths through Rig's standard
environment variables. User turns are ordinary chat messages. The message and
its durable `agent_turns` outbox row commit in one SQLite transaction; leased
workers then serialize turns per agent and chat and resume them after restart.
At startup the server enables Rig's durable global event queue when necessary.
It consumes the queue through one resumable global SSE connection and a numeric
cursor persisted in SQLite; it never polls the queue or opens per-session event
streams. Agent work is broadcast through the ordinary typing-presence event,
and persisted replies use the agent `User` as sender, update human unread
counts, and then publish normal sync hints. Agent users never accumulate unread
counters, receipts, or notifications. Applied Rig events are trimmed in batches
after 1,000 updates or one day. Remote clients use the same chat and sync APIs as
local clients and never need access to Rig itself.

Rig remains the source of truth for agent secret registrations and values.
Administrators use `GET /v0/admin/agentSecrets`,
`POST /v0/admin/agentSecrets/createSecret`, and
`POST /v0/admin/agentSecrets/:secretId/deleteSecret` through Happy (2); list and
mutation responses contain only the Rig ID, description, and environment-variable
names. Secret values are forwarded once to Rig and are never persisted in the
Happy (2) database or returned to a client. Happy (2) stores only assignments,
managed through the `attachToAgent`, `detachFromAgent`, `attachToChannel`, and
`detachFromChannel` actions. An agent assignment applies to every Rig session for
that agent; a channel assignment applies to every agent Rig session bound to that
channel. The union is reconciled before each turn and when Happy (2) starts, while
Rig still requires the model to select the needed bundle IDs on each shell command.
All secret-management routes require server-admin permission and publish durable
`agent-secrets` sync hints.

Channels are `public_channel` or `private_channel`. Direct chats support both
exact two-user DMs and membership-exact group DMs. Public channels can be
discovered and read by every active server member, but posting requires joining.
Private channels and DMs require current membership. Channel owners remain
canonical through leave, removal, role changes, and account deletion. The first
active profile is a server administrator. Administrators can change the server
profile and retention defaults, manage user titles/roles, inspect durable
last-access times, ban or delete users, moderate content and files, and send
audited automated messages.

`POST /v0/files/upload` streams one file to storage and returns a stable CUID2
file ID. Large clients use `createUpload`, ordered `appendUpload` calls, and
`completeUpload`; completion is replay-safe across a process crash. JPEG, PNG,
WebP, GIF, MP4, and WebM signatures are recognized, metadata is probed with
bounded work, previews/posters are tracked as derivatives, and downloads support
byte ranges. Storage and malware scanning are provider interfaces. Quota is
reserved while bytes are staged, rejected content is quarantined, scan results
are durable, and periodic maintenance releases abandoned reservations and
staging artifacts.

A file is visible to its uploader, through an explicit unexpired user/chat/server
grant, as a public profile or custom-emoji asset, or through a live message the
requester can currently read. Forwarding creates a destination attachment grant
without promoting the file globally. Deleting or expiring the last visible
message reference removes that derived access. The files directory and previews
use the same authorization query, so private-channel and DM attachments do not
leak.

Message sends accept an optional `clientMutationId`; retries by the same user in
the same chat return the originally committed message. A send may contain text,
attachment file IDs, `quotedMessageId`, `threadRootMessageId`, and a bounded
self-destruction duration. Deletion and expiry leave syncable tombstones rather
than hard-deleting message identity, remove searchable/revision plaintext, and
recompute thread projections. `after_read` destruction uses a send-time receipt
roster, so users who join later cannot block expiry.

HTTP write actions also accept `Idempotency-Key`. Keys are isolated by the
authenticated principal and concrete action path, conflicting payload reuse is
rejected, and completed responses survive restart. Request limiting and realtime
fanout use local adapter implementations; Redis-backed implementations can be
added without making process-local state authoritative.

## Sync protocol

The protocol adapts Telegram's independent update sequences, state snapshots,
and paginated differences, as described in its official
[Working with Updates](https://core.telegram.org/api/updates),
[`updates.getState`](https://core.telegram.org/method/updates.getState), and
[`updates.getDifference`](https://core.telegram.org/method/updates.getDifference)
documentation.

Happy (2) has two durable cursor levels:

- A database-generation ID and server-wide `sequence` identify durable objects
  that changed for reconnect discovery.
- Every chat has an independent `pts`. Messages, reactions, tombstones, thread
  activity, topics, and membership-visible changes advance that chat's `pts`.

Cursors are decimal strings in JSON, never JSON numbers; the current server
rejects cursor values outside its safe-integer operating range. Every mutation
allocates the common sequence, changes domain rows, advances affected chat
cursors, and appends update pointers in one database transaction. Pubsub happens
only after commit. The local pubsub implementation is intentionally replaceable
by a Redis adapter and is allowed to drop, duplicate, reorder, or coalesce events.

1. `GET /v0/sync/state` returns `{protocolVersion, generation, sequence}`. On a
   new installation this is a baseline, not the beginning of retained history.
2. `POST /v0/sync/getDifference` takes the last stored
   `state: {generation, sequence}`, optional fixed `untilSequence`, and `limit`.
   It returns changed chat summaries with
   their latest `pts`, removed private-chat IDs, changed global areas, an
   intermediate state, and the fixed target state. A slice is repeated with its
   intermediate cursor and the same target until complete.
3. For every changed chat, `POST /v0/chats/:chatId/getDifference` takes the
   cached `state: {membershipEpoch, pts}`. It returns ordered pointers plus
   current message projections/tombstones. A changed membership epoch or pruned
   cursor returns a reset/too-long result; the client discards that cached chat
   and fetches current history.
4. The client advances its common cursor in the same local transaction that
   stores pending target `pts` values. It advances a chat cursor only with the
   corresponding projections/tombstones. Duplicate projections are safe.
5. `POST /v0/sync/acknowledge` records a per-user, per-device durable consumer
   cursor. Compaction honors active acknowledgements and retention windows. A
   cursor older than retained history receives an explicit reset with the
   minimum recoverable sequence rather than an incomplete difference.

For a chat update with `ptsCount`, clients use the Telegram rule:

```text
localPts + ptsCount == update.pts  apply it
localPts + ptsCount >  update.pts  ignore the duplicate
localPts + ptsCount <  update.pts  stop and fetch the difference
```

`GET /v0/sync/events` is a deliberately lossy SSE stream. It first subscribes,
then emits `ready` with current durable state. `sync` events only hint at a newer
server sequence/chat `pts`; clients never advance a durable cursor from SSE.
`typing`, `presence`, and `call.signal` are ephemeral and never enter a
difference. Heartbeats include a fresh database state and revalidate the session,
so another local instance's commit, a missed publish, ban, or logout is detected.
Every reconnect runs the HTTP difference flow; `Last-Event-ID` is not a sync
cursor.
