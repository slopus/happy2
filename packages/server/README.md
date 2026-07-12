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
