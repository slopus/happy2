# `@slopus/rigged`

The Rigged Fastify server is publishable as `@slopus/rigged` and runs either as
one service (`server.role = "all"`), a dedicated authentication service
(`"auth"`), or an API-side token validator (`"api"`). All useful endpoints are
versioned under `/v0`; `/` is only a small service-status response.

## Run

```sh
# Development, with reload and no configuration file:
pnpm dev:server

# Production package:
cp packages/server/rigged.example.toml rigged.toml
pnpm --filter @slopus/rigged build
pnpm --filter @slopus/rigged start -- --config ../../rigged.toml
```

Without a TOML file, development starts an `all`-role server on
`127.0.0.1:3000` with SQLite, self-service password registration, and local
JWT/pepper generation. Provide a custom TOML with `--config /path/to/rigged.toml`
or `RIGGED_CONFIG=/path/to/rigged.toml` to override those defaults.

Clients can discover the selected issuance method at `GET /v0/auth/methods`.
The response includes the server role and one `method` value: `password`,
`magic_link`, `oidc`, or `null` in validation-only API mode. Password responses
also report `signupEnabled`; OIDC responses report `oidcProvider`.

## Profiles and avatar files

Authentication creates an inactive account. `POST /v0/me/createProfile` (with the
temporary bearer token) creates the product-level User profile—first name,
optional last name, username, optional email, and optional phone—and activates
the account. `GET /v0/me` reads the active profile and
`POST /v0/me/updateProfile` replaces its editable state. Product routes reject
accounts that do not yet have an active profile.

`POST /v0/me/uploadAvatarFile` accepts one multipart image after profile
creation. Its required `visibility` field is `public` or `private`. Images over
2048px on either side or 10 MB are rejected. The server records the uploader,
stores an unguessable CUID2-backed file record plus a JPEG file, converts the
image to a 1024×1024 JPEG, and records a ThumbHash.

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
docker build -f packages/server/Dockerfile -t slopus/rigged .
docker run --rm -p 3000:3000 -v "$PWD/rigged.toml:/app/rigged.toml:ro" slopus/rigged --config /app/rigged.toml
```

Mount a writable directory containing `rigged.toml` when using generated key
material, because the adjacent `.env` file is the durable key store.

## Authentication

Choose exactly one of password, magic-link, or OIDC in `rigged.toml`; startup
rejects configurations that enable more than one method. Clients can learn the
selected method from `GET /v0/auth/methods`.

- Password registration is disabled unless `signup_enabled` is true. Every
  password has its own random salt; a server-wide password pepper is also used.
- Magic-link SMTP credentials are exclusively `EMAIL_SMTP_HOST`,
  `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, and `EMAIL_SMTP_PASSWORD` environment
  variables. The configured `redirect_url` should be the desktop app’s link
  handler; it submits the token to `POST /v0/auth/magic-link/verify`.
- OIDC uses discovery, PKCE, a nonce, and remote JWKS validation. Provider
  secrets are referenced by environment-variable name in TOML.

On initial startup, external environment values win. If an auth-capable server
has no JWT private key configured, it generates a 3072-bit RS256 key pair and
adds base64-encoded `RIGGED_JWT_PRIVATE_KEY_B64` and
`RIGGED_JWT_PUBLIC_KEY_B64` to the `.env` file beside its TOML file. It likewise
adds `RIGGED_PASSWORD_PEPPER` when password auth is enabled. Preserve that file
as a secret; replacing it invalidates existing passwords and sessions. You may
instead supply those variables through the deployment environment or mount PEM
key files via the `jwt` config.

Sessions are signed JWTs with a 30-day default lifetime and a stable `sid`.
`POST /v0/auth/refresh` re-signs the same session ID and advances the database
expiry. All authenticated requests check the shared SQLite session row, so a
missing, expired, or revoked row is rejected regardless of JWT validity.

## Collaboration API

The API is HTTP-only. Durable reads and actions use JSON GET/POST endpoints;
live hints, typing, presence, and WebRTC signaling use Server-Sent Events. All
product routes require an active User profile. An `auth`-role server does not
serve collaboration routes; `all` and `api` roles do.

The main route groups are:

| Area                | Routes                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chats               | `GET /v0/chats`, `GET /v0/chats/:chatId`, `POST /v0/chats/createDirectMessage`, `POST /v0/chats/createChannel`                                                                                                   |
| Membership          | `POST /v0/chats/:chatId/join`, `leave`, `addMember`, and `removeMember`                                                                                                                                          |
| Messages            | `GET /v0/chats/:chatId/messages`, `POST /v0/chats/:chatId/sendMessage`, `POST /v0/messages/:messageId/deleteMessage` and `forwardMessage`                                                                        |
| Replies and threads | `quotedMessageId` on a normal send creates an explicit quoted reply in the main chat; `POST /v0/messages/:messageId/sendThreadMessage` and `GET /v0/messages/:messageId/thread` use the separate thread timeline |
| Reactions and emoji | `POST /v0/messages/:messageId/addReaction` / `removeReaction`; `GET /v0/customEmoji`, `POST /v0/customEmoji/createCustomEmoji`, and `deleteCustomEmoji`                                                          |
| Discovery           | `GET /v0/contacts`, `/v0/directory`, `/v0/directory/users`, `/v0/directory/channels`, and `/v0/search?q=...`                                                                                                     |
| Preferences         | `POST /v0/chats/:chatId/setStar` and `POST /v0/chats/reorderStarred`                                                                                                                                             |
| Files               | `POST /v0/files/upload`, `GET /v0/files`, `GET /v0/files/:fileId`, and `POST /v0/files/:fileId/createSignedUrl`                                                                                                  |
| Admin               | `GET /v0/admin/users`, user ban/unban/delete/update actions, `POST /v0/admin/updateServer`, and `POST /v0/admin/sendAutomatedMessage`                                                                            |
| Realtime            | `GET /v0/sync/events`, typing/presence POSTs, and `POST /v0/calls/:callId/sendSignal`                                                                                                                            |

Channels are `public_channel` or `private_channel`; DMs have exactly two fixed
members. Public channels can be discovered and read by every active server
member, but posting requires joining. Private channels and DMs require current
membership. The first active profile is a server administrator. Administrators
can change the server profile and user titles/roles, inspect durable last-access
times, revoke all sessions by banning a user, soft-delete and anonymize users,
and send audited automated messages.

`POST /v0/files/upload` streams one file to storage and returns a stable CUID2
file ID. JPEG, PNG, WebP, GIF, MP4, and WebM signatures are recognized; other
uploads are safe opaque files. Image dimensions and ThumbHash are recorded when
available. File downloads support byte ranges for video playback. A file is
visible to its uploader, as a public profile image, or through at least one live
message the requester can currently read. Forwarding creates another attachment
reference in the destination chat, so it grants destination members access
without changing the file to globally public. Deleting/expiring the last visible
message reference removes that derived access. The files directory uses the same
query and therefore cannot leak private-channel or DM attachments.

Message sends accept an optional `clientMutationId`; retries by the same user in
the same chat return the originally committed message. A send may contain text,
attachment file IDs, `quotedMessageId`, `threadRootMessageId`, and a bounded
self-destruction duration. Deletion and expiry leave syncable tombstones rather
than hard-deleting message identity.

## Sync protocol

The protocol adapts Telegram's independent update sequences, state snapshots,
and paginated differences, as described in its official
[Working with Updates](https://core.telegram.org/api/updates),
[`updates.getState`](https://core.telegram.org/method/updates.getState), and
[`updates.getDifference`](https://core.telegram.org/method/updates.getDifference)
documentation.

Rigged has two durable cursor levels:

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
2. `POST /v0/sync/getDifference` takes `generation`, `fromSequence`, optional
   fixed `untilSequence`, and `limit`. It returns changed chat summaries with
   their latest `pts`, removed private-chat IDs, changed global areas, an
   intermediate state, and the fixed target state. A slice is repeated with its
   intermediate cursor and the same target until complete.
3. For every changed chat, `POST /v0/chats/:chatId/getDifference` takes the
   cached `membershipEpoch` and `fromPts`. It returns ordered pointers plus
   current message projections/tombstones. A changed membership epoch or pruned
   cursor returns a reset/too-long result; the client discards that cached chat
   and fetches current history.
4. The client advances its common cursor in the same local transaction that
   stores pending target `pts` values. It advances a chat cursor only with the
   corresponding projections/tombstones. Duplicate projections are safe.

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
