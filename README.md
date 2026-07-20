<div align="center">

<p><img src="./.github/logo.png" alt="Happy (2)" width="640" /></p>

<h3>A self-hosted, Slack-like workspace where people and coding agents build together.</h3>

<p>
  Following the success of <a href="https://github.com/slopus/happy">Happy</a>,
  Happy (2) is a ground-up next chapter built on the lessons learned from
  bringing coding agents into real daily workflows. It brings conversations,
  files, workspaces, and coding agents into one focused web and desktop app.
</p>

<p>
  Built by the authors of
  <a href="https://github.com/slopus/happy">Happy</a> and
  <a href="https://github.com/slopus/rig">Rig</a>.
</p>

<p>
  <a href="#quick-start">Quick start</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#why-happy-2">Why Happy (2)?</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#project-components">Project components</a> ·
  <a href="packages/happy2-server/README.md">Server docs</a>
</p>

</div>

Happy (2) is a self-hosted, Slack-like work and coding app that evolves by
adopting itself. It gives teams and coding agents a shared home instead of
scattering work across chat windows, terminals, file browsers, and one-off
dashboards.

The same React application runs in the browser and in Electron. A small Fastify
server provides authentication, durable collaboration state, files, realtime
updates, and agent execution. The complete server and web app are also bundled
as one `happy2` package.

## Quick start

Happy (2) requires Node.js 24 or later. Start the complete app with one command:

```sh
npx happy2
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser. Happy (2)
stores its database, files, generated secrets, agent workspaces, and private Rig
runtime under `.happy2` in the directory where you start it.

Run it in the background without installing an operating-system service with:

```sh
npx happy2 daemon start
npx happy2 daemon stop
```

The daemon stores `happy2.pid`, the combined `happy2.log`, and the error-only
`server-error.log` under `./.happy2`. Stopping it terminates the daemon process
tree and removes the PID file.

Keep Happy (2) running across reboots with:

```sh
npx happy2 service start
npx happy2 service stop
```

On macOS this installs a per-user LaunchAgent without `sudo`; it starts when the
user logs in. On Linux it writes and prints `./happy2.service`, then shows the
exact `sudo` commands you can run to install and start it as a system-wide
systemd unit. `service stop` prints the corresponding systemd removal commands;
it never invokes `sudo` itself. The generated file remains in the current
directory so you can inspect or reinstall it. Add
`--config /absolute/or/relative/happy2.toml` to `service start` to preserve an
explicit configuration file; otherwise the service keeps the current directory
as its working directory and uses its `.happy2` state. When started through
`npx`, the generated service runs `npx --yes happy2` instead of depending on an
evictable `_npx` cache path.

## Configuration

Happy (2) uses the following configuration precedence:

1. `--config /path/to/happy2.toml`
2. `HAPPY2_CONFIG=/path/to/happy2.toml`
3. `./.happy2/happy2.toml`, when it exists
4. Built-in defaults

TOML configuration is partial. Happy (2) recursively merges the supplied fields
over the built-in defaults, so this is enough to expose the public listener:

```toml
[server]
host = "0.0.0.0"
```

The managed path is relative to the directory where Happy (2) starts. Relative
database, file, plugin, key, and agent paths are also resolved from that working
directory, not from the TOML file's directory. The standalone `happy2` and
`happy2 backend` commands use this configuration; `happy2 web` has its own CLI
options because it only serves the SPA and proxies `/v0`.

### Complete TOML reference

All supported keys are shown below. Uncomment optional keys only when needed.
The active values are equivalent to the built-in local defaults. For readability,
paths are shown relative to the working directory; generated defaults store those
same locations as absolute paths.

```toml
[server]
# all: authentication + product API; auth: authentication only; api: validation only
role = "all"
host = "127.0.0.1"
port = 3000
public_url = "http://127.0.0.1:3000"
# Number of trusted proxies outside Happy (2). Keep 0 for direct connections.
trusted_proxy_hops = 0

[database]
url = "file:.happy2/happy2.db"
# Name of the environment variable containing a remote libSQL auth token.
# auth_token_env = "HAPPY2_DATABASE_AUTH_TOKEN"

[agents]
enabled = true
# These default to the private Rig runtime under .happy2/rig.
# socket_path = ".happy2/rig/server.sock"
# token_path = ".happy2/rig/token"
# command = "/absolute/path/to/rig"
default_cwd = ".happy2/workspaces"

[files]
provider = "local"
directory = ".happy2/files"
signed_url_expiry_seconds = 300
max_upload_bytes = 536870912
resumable_chunk_bytes = 8388608
# Zero disables the corresponding quota.
per_user_quota_bytes = 0
server_quota_bytes = 0
incomplete_upload_expiry_seconds = 86400
quarantine_retention_seconds = 2592000
# malware_scanner_command = "/usr/local/bin/clamscan"
malware_scanner_arguments = []
malware_scan_timeout_seconds = 120
malware_scan_failure_mode = "deny" # deny or allow

[plugins]
directory = ".happy2/plugins"
# Capability-only API used by plugin containers. Firewall it from untrusted networks.
host_api_host = "0.0.0.0"
host_api_port = 3001

# Omit this table to disable public agent-port sharing. Configure wildcard DNS
# and TLS for *.preview.example.com to reach the same Happy web listener.
[port_sharing]
public_domain = "preview.example.com"
# Optional; defaults to https://preview.example.com.
# public_url = "http://preview.example.com:8080"

[security]
# Name of the environment variable containing the integration encryption secret.
integration_secret_env = "HAPPY2_INTEGRATION_SECRET"

[security.rate_limit]
enabled = true
reads_per_minute = 1200
writes_per_minute = 300
auth_per_minute = 30

[security.idempotency]
enabled = true
lease_seconds = 30
retention_seconds = 86400

[jwt]
issuer = "http://127.0.0.1:3000"
audience = "happy2-desktop"
key_id = "local-generated"
expiry_days = 30
# PEM files may replace environment or generated keys.
# private_key_path = "/run/secrets/happy2-jwt-private.pem"
# public_key_path = "/run/secrets/happy2-jwt-public.pem"

# Password is the default. Set it to false before enabling magic link, OIDC,
# or Cloudflare Access; exactly one authentication method may be enabled.
[auth.password]
enabled = true

[auth.dev_tokens]
# This augments the selected authentication method; it is not a separate method.
enabled = false

[auth.magic_link]
enabled = false
# from = "Happy (2) <noreply@example.com>"
# redirect_url = "happy2://auth/magic-link"

# Replace "example" with a stable provider ID.
[auth.oidc.example]
enabled = false
# discovery_url = "https://id.example.com/.well-known/openid-configuration"
# client_id = "happy2"
# client_secret_env = "HAPPY2_OIDC_EXAMPLE_CLIENT_SECRET"
# scopes = ["openid", "email", "profile"]
# redirect_path = "/v0/auth/oidc/example/callback"

[auth.cloudflare_access]
enabled = false
# team_domain = "https://team.cloudflareaccess.com"
# audience = "cloudflare-access-application-aud"
```

For a reverse-proxied deployment such as `https://happy.example.com`, the
listener can remain on `127.0.0.1`; set `server.public_url` and `jwt.issuer` to
the public HTTPS origin and set `server.trusted_proxy_hops` to the exact number
of trusted proxies in front of Happy (2). Binding `server.host = "0.0.0.0"` is
only necessary when another machine or container must connect directly.

### Secrets and environment

Real process environment values take precedence over values loaded from the
private `.env` beside the selected TOML path. If no explicit config is selected,
that file is `./.happy2/.env`, whether or not `./.happy2/happy2.toml` exists.

For an `all` or `auth` server without configured JWT key files or environment
keys, Happy (2) generates a 3072-bit RS256 key pair and stores
`HAPPY2_JWT_PRIVATE_KEY_B64` and `HAPPY2_JWT_PUBLIC_KEY_B64` in that `.env`.
It also generates `HAPPY2_PASSWORD_PEPPER` when password auth is enabled and the
configured integration secret when missing. The file is created with mode
`0600`; back it up and keep it private. Replacing the JWT keys invalidates
existing session tokens, while replacing the password pepper prevents existing
password hashes from verifying. An `api`-only server must be given the matching
public key because it does not generate a signing pair.

Supported server and runner environment settings are:

| Variable | Purpose |
| --- | --- |
| `HAPPY2_CONFIG` | Selects a TOML file when `--config` is absent. |
| `HAPPY2_JWT_PRIVATE_KEY`, `HAPPY2_JWT_PUBLIC_KEY` | PEM keys; literal `\n` sequences are accepted. |
| `HAPPY2_JWT_PRIVATE_KEY_B64`, `HAPPY2_JWT_PUBLIC_KEY_B64` | Base64-encoded PEM keys used by generated local configuration. |
| `HAPPY2_PASSWORD_PEPPER` | Server-wide password pepper. |
| `HAPPY2_INTEGRATION_SECRET` | Default integration encryption secret; the variable name is configurable. |
| `RIG_HOME` | Absolute path for Happy's private Rig runtime. |
| `RIG_SERVER_SOCKET_PATH`, `RIG_SERVER_TOKEN_PATH`, `RIG_COMMAND` | Override omitted agent socket, token, and command fields. |
| `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD` | Required SMTP credentials for magic-link auth. |
| `EMAIL_FROM` | Overrides `auth.magic_link.from`. |
| `HAPPY2_BACKEND_URL` | Backend origin for the separate `happy2 web` command. |
| `HAPPY2_WEB_HOST`, `HAPPY2_WEB_PORT`, `HAPPY2_WEB_TRUSTED_PROXY_HOPS` | Listener settings for `happy2 web`. |
| `HAPPY2_PORT_SHARING_DOMAIN` | Wildcard port-sharing domain forwarded by a separately deployed `happy2 web` gateway. |

`database.auth_token_env`, `security.integration_secret_env`, and each OIDC
provider's `client_secret_env` may name additional environment variables.

## Why Happy (2)?

- **People and agents share the same workspace.** Conversations, threads,
  files, approvals, and agent activity live together instead of becoming a pile
  of disconnected tools.
- **Self-hosted by design.** Run the complete app with one command and keep its
  database, files, secrets, agent workspaces, and Rig runtime under your control.
- **Web and desktop.** Use the same full collaboration experience in a browser
  or through the Electron app.
- **Reactive by default.** Realtime events reconcile durable state so focused
  surfaces stay current without refresh buttons.
- **Flexible deployment.** The backend can run as an all-in-one server or as a
  separately deployed authentication service.
- **Built to adopt itself.** Happy (2)'s own server, state layer, component
  workbench, browser tests, and coding-agent workflows are part of the product's
  development loop.

## How it works

Happy (2) keeps the product boundaries explicit:

1. `happy2-server` owns authentication, persistence, files, collaboration, and
   agent execution.
2. `happy2-state` turns authenticated HTTP and realtime transports into
   immutable, independently materialized surface stores.
3. `happy2-ui` owns the reusable visual system and its cross-browser blueprint
   coverage.
4. `happy2-app` composes product state and UI for both the web and Electron
   entry points.

Local development data stays under `.context/dev` in each workspace, including
the generated TOML configuration, SQLite database, files, signing keys, and
password pepper.

## Project components

- **[Happy App](packages/happy2-app)** — Shared React application and product
  composition.
- **[Happy UI](packages/happy2-ui)** — Reusable design system, component
  workbench, and cross-browser visual coverage.
- **[Happy State](packages/happy2-state)** — Framework-independent client state
  and realtime reconciliation.
- **[Happy Web](packages/happy2-web)** — Browser entry point and production web
  build.
- **[Happy Desktop](packages/happy2-desktop)** — Electron renderer and desktop
  main process.
- **[Happy Server](packages/happy2-server)** — Fastify server, authentication
  service, persistence, and agent runtime.
- **[Happy Gym](packages/happy2-gym)** — Isolated black-box server, state, and
  browser testing environment.

## Development

The repository uses pnpm 10.28 or later. For local development:

```sh
pnpm install
pnpm dev                                 # Server + web app
pnpm web                                 # Token-gated preview against happy.bulkovo.com
pnpm dev:desktop                         # Electron app
pnpm dev:server                          # Server only
pnpm --dir packages/happy2-gym test      # End-to-end tests
pnpm check                               # Format, lint, test, coverage, build
```

For production server configuration, authentication modes, and deployment, see
the [Happy Server documentation](packages/happy2-server/README.md).
