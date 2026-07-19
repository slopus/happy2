# Server plugins

Happy (2) plugins package Agent Skills, a persistent container command, an MCP
server, or any useful combination of those pieces. Administrators can install a
built-in package, upload one ZIP, download one ZIP over HTTPS, or import a GitHub
repository. Catalog discovery, verified preparation, durable system plugins,
immutable package/image snapshots, writable installation data, and independent
runtime installations remain separate boundaries. Individual runtime
installations can be uninstalled without removing the reusable system-plugin
snapshot.

Plugin management is system-wide and administrator-only. The first installation
of a catalog package creates one durable system-plugin record and one immutable
package snapshot; later installations reuse that plugin identity and snapshot.
Every installation has its own CUID2, variables, selected image, lifecycle, and
dedicated container when it has a local runtime. Remote MCP configuration is
persisted and health-checked independently per installation. Ready MCP
installations expose their durably cached tools to Rig as external functions on
every agent submission. Happy executes each durable call against the originating
installation and resolves the result back into the paused Rig run. This feature
does not yet inject installed skills or implement in-place upgrade, marketplace
discovery, or OAuth flows. Remote update checks report drift but deliberately do
not replace the installed snapshot.

MCP tools are discovered during each runtime activation and atomically replace
that installation's SQLite cache before it becomes ready. Local discovery runs
after every container creation, and remote discovery runs on every server
restart. Rig function discovery reads only this cache rather than opening every
MCP server again per submission. Each discovery page is bounded to 15
seconds, and one MCP tool execution is bounded to 30 seconds so a stalled plugin
cannot indefinitely block turn submission or Rig's global event consumer. Before
execution, Happy claims a 45-second database lease keyed by Rig session and call
ID. Other server instances wait for that lease or replay its completed result
instead of concurrently invoking the same tool. The first terminal outcome,
including an MCP error or timeout, is persisted and reused for every later event
delivery; Happy does not automatically retry an ambiguous failure because the
first request may already have produced an external side effect. A process crash
after the MCP side effect but before the outcome is committed can still cause one
lease-expiry replay, so plugin tools with external side effects should themselves
be idempotent.

Rig sessions use Full access so durable external functions are executable without
an unresolved permission prompt. Agent code still runs inside Happy's dedicated,
restricted OCI sandbox; plugin processes remain isolated in their own containers,
and only Happy crosses the boundary after matching the durable function identity
to a ready installation.

## Package anatomy

Each package has this shape. Built-ins live below
`packages/happy2-server/plugins`; installed snapshots live below the configured
`plugins.directory`:

```text
example-plugin/
├── plugin.json
├── plugin.png
├── data/                     # server-owned; absent from source ZIPs
│   └── <installation-id>/      # persistent writable workspace
├── container/                 # optional; used by bundled stdio runtimes
│   └── Dockerfile
└── skills/                    # optional
    └── example-skill/
        ├── SKILL.md
        ├── scripts/           # optional Agent Skills resources
        ├── references/
        └── assets/
```

`plugin.png` is required and must be a square PNG no larger than 4096×4096. A
1024×1024 source is preferred; smaller square icons remain valid. Catalog
validation calculates its byte size, dimensions, SHA-256 checksum, and
thumbhash. When the plugin first enters the system, those fields are persisted
on the plugin record and the exact PNG remains in the private package snapshot
on the filesystem.

Every direct child of `skills/` must follow the
[Agent Skills specification](https://agentskills.io/specification). In
particular, it needs `SKILL.md` with YAML frontmatter containing `name` and
`description`; `name` must match the skill directory. Package loading rejects
symlinks, unsafe relative paths, duplicate names, oversized packages, malformed
frontmatter, and unexpected manifest fields before the catalog becomes
available.

Uploaded and downloaded ZIPs are capped at 50 MiB compressed. Extraction also
bounds entry count, file count, individual and total uncompressed sizes, and
actual DEFLATE output. It rejects ZIP64, encryption, unsupported compression,
links, path traversal, duplicate paths, local/central filename disagreement,
invalid checksums, and ambiguous generic archives. A generic uploaded or remote
ZIP must contain exactly one `plugin.json`. GitHub archives may instead contain
one root `plugin.json` or multiple `plugins/<name>/plugin.json` packages; when
there are multiple packages, preparation returns each verified candidate so the
administrator can choose one.

`plugin.json` uses schema version 1:

```json
{
    "schemaVersion": 1,
    "version": "1.2.3",
    "displayName": "Project Search",
    "shortName": "project-search",
    "description": "Searches source code and project documentation.",
    "variables": [
        {
            "key": "PROJECT_API_TOKEN",
            "displayName": "API token",
            "description": "Token used by the MCP server.",
            "kind": "secret"
        },
        {
            "key": "PROJECT_REGION",
            "displayName": "Region",
            "description": "Region used for project queries.",
            "kind": "text"
        }
    ],
    "container": {
        "dockerfile": "container/Dockerfile",
        "command": "/plugin/bin/indexer",
        "args": ["--watch"],
        "permissions": ["plugins:list", "plugins:install", "plugins:uninstall"]
    }
}
```

`version` uses `x.y.z` SemVer syntax. `shortName` is the stable catalog/package
link and must match the package directory; it is not an installation identity.
The durable system plugin and every installation receive separate CUID2 IDs.
Variable keys are environment variable names. Every declared variable is
required for each installation. Secret values are encrypted with AES-256-GCM
and are never returned by catalog or installation reads; text values are stored
as ordinary configuration. Both kinds are supplied to configured local
processes as environment variables.

A package must contain at least one skill, `container`, or `mcp` definition.
`container.command` is optional when the same container exposes a stdio MCP;
otherwise it is required. A command and stdio MCP run alongside each other in
the same dedicated installation container. Container variables are supplied to
each configured process, not persisted in the image or container definition.

`container.permissions` declares the exact host API capabilities a package may
request. Permissions are grouped for presentation by API section: `chats:update`
is a mutating permission in `chats`, while `plugins:list` is read-only and
`plugins:install` and `plugins:uninstall` are mutating permissions in `plugins`.
Unknown and duplicate declarations are rejected when the package is loaded.

Declarations are not grants. Each install request may include a `permissions`
array containing any subset of the manifest declaration; omitted permissions
default to an empty grant. Installation responses expose `grantedPermissions`,
while catalog permission metadata is returned in `apiPermissions` sections with
separate `readOnly` and `mutations` arrays. Administrators can replace the grant
later with `POST /v0/admin/pluginInstallations/:installationId/updatePermissions`.
Changing a grant invalidates the current runtime token and restarts the local
container with a new token, so stale tokens cannot retain revoked access.

The isolated plugin host listener provides `GET /plugins`, `POST /plugins/install`,
and `POST /plugins/uninstall`. Each route requires its matching capability.
Plugin-triggered installs must also choose a subset of the target package's
declared permissions.

The bundled `hello` package is the minimal skill-plus-MCP example. It declares no
variables or MCP authentication, so an administrator can install it with an
empty POST body; each call still creates a separate installation and bundled
container.

## Stdio MCP with a bundled container

```json
{
    "mcp": {
        "type": "stdio",
        "command": "/plugin/bin/project-mcp",
        "args": ["--stdio"]
    },
    "container": {
        "dockerfile": "container/Dockerfile",
        "args": [],
        "permissions": []
    }
}
```

The Dockerfile path is package-relative. Creating the durable system plugin
copies the entire package once to `plugins.directory` before writing its
database record. Each installation lifecycle builds or resolves that exact
snapshot, excluding the server-owned `data/` subtree from the build context,
with the selected local Docker or Podman provider, using a
content-addressed `happy2-plugin:<sha256>` tag. It then creates a dedicated,
read-only container named from the installation CUID2, with `init`, all Linux capabilities
dropped, privilege escalation disabled, bounded shared memory, and ephemeral
`/tmp` and `/run` filesystems. Runtime resources are capped at 1 GiB of memory,
one CPU, and 256 processes per plugin container.

The resulting image must provide `/bin/sh`; Happy uses it only as the inert
container keepalive before starting the manifest command with OCI `exec`. A
bundled Dockerfile is responsible for copying or installing its MCP executable
and dependencies into the image. The MCP command itself must use newline-
delimited JSON-RPC on stdin/stdout and must not write non-protocol output to
stdout.
The fixed `HOME` and `TMPDIR` are `/tmp`. The server creates
`<plugins.directory>/<plugin-id>/data/<installation-id>` with private
permissions, bind-mounts it read-write at `/workspace`, and uses `/workspace` as
the container working directory. This is the plugin's persistent filesystem;
the image root remains read-only. Different installations never share a data
directory. Uninstalling the system plugin removes every linked installation,
container, immutable package asset, and data subtree.

Each installation container stays alive as that installation's plugin runtime.
The optional persistent command is started detached once for each container
incarnation and monitored through a PID marker in the container's ephemeral
`/run`. Server restart recovery adopts and resumes monitoring that same command
without double-starting it. Each HTTP MCP session starts
the configured command with `docker exec`/`podman exec`; variables reach that
process through Docker/Podman's environment-copy option. Values are never placed
in command arguments, Happy's process environment, the long-lived container
definition, or the image build; they exist only in the short-lived OCI CLI child
and the target persistent-command or MCP process. Variables that could alter the OCI client itself, such as
`DOCKER_*`, proxy, loader, or executable-path settings, are rejected. Happy
transparently bridges newline-delimited stdio JSON-RPC to MCP Streamable HTTP, so
the plugin itself does not need an HTTP server.

## Stdio MCP using a selected container image

Omit `container.dockerfile` when the plugin does not bundle its own Dockerfile:

```json
{
    "container": {
        "args": [],
        "permissions": []
    },
    "mcp": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@example/project-mcp"]
    }
}
```

The install request must then include `containerImageId`. It must identify an
agent image whose build status is already `ready`. The selected image belongs
only to that installation and creates that installation's dedicated container;
it does not share an agent container or another plugin installation's container.

## Remote MCP

```json
{
    "mcp": {
        "type": "remote",
        "url": "https://mcp.example.com/mcp",
        "headers": {
            "Authorization": "Bearer ${PROJECT_API_TOKEN}",
            "X-Project-Region": "${PROJECT_REGION}"
        }
    }
}
```

Remote URLs must be public HTTPS URLs without embedded credentials or fragments.
Header templates may reference only declared variables. The health worker
resolves templates in memory, rejects newline-bearing resolved values, applies
the same public-address/DNS-rebinding policy used by outgoing webhooks, pins the
approved destination address, and sends an MCP `initialize` request. The remote
URL and templates are persisted; resolved secret headers are not.

Remote MCP remains remote: Happy does not create a container or proxy its normal
traffic. OAuth is intentionally unsupported. Authentication is limited to the
custom static headers described above. Production remote requests are capped at
1,000,000 bytes and responses at 256,000 bytes, matching the bounded webhook
transport used for SSRF-safe address pinning.

## External package preparation

External installation is a two-step, administrator-only flow. Preparation does
all network and archive work before durable installation, and streams progress
as SSE:

- `POST /v0/admin/pluginPackages/preparePlugin` accepts either multipart form
  data with one `plugin` ZIP file, or JSON containing
  `{"source":{"kind":"zip_url"|"github","url":"https://..."}}`.
- The server downloads remote archives through its public-HTTPS SSRF policy,
  revalidates and pins DNS at every redirect, verifies package structure and
  metadata, and emits `progress` events.
- It emits `prepared` for one candidate or `selection_required` for multiple
  GitHub candidates. Each candidate includes a 15-minute, administrator-bound,
  one-use `preparedToken`, the immutable digest, source identity, version,
  display name, description, skill descriptions, variable definitions, MCP
  mode, and image metadata.
- `POST /v0/admin/pluginPackages/installPlugin` accepts the selected
  `preparedToken`, `variables`, and optional `containerImageId`. It returns HTTP
  202 after consuming the token and making the installation durable.

A GitHub URL may identify a repository or one `tree/<ref>` URL. The root
`plugin.json` wins when present; otherwise the server discovers direct
`plugins/<name>` children. ZIP URLs are stored as their normalized URL. Uploaded
packages have content-addressed source identities and cannot be checked for a
remote update.

`POST /v0/admin/systemPlugins/:pluginId/checkForUpdate` is also an SSE endpoint.
It downloads and verifies the same selected remote path, emits progress, then a
`checked` event containing installed and remote versions/digests plus
`updateAvailable`. Built-ins are compared with the current catalog. The check is
read-only; a changed package requires an explicit future upgrade flow.

## Installation and lifecycle

`POST /v0/admin/plugins/:shortName/installPlugin` accepts:

```json
{
    "variables": {
        "PROJECT_API_TOKEN": "secret value",
        "PROJECT_REGION": "us-west"
    },
    "containerImageId": "optional-ready-image-id"
}
```

The request body may be omitted when the manifest declares no variables and
does not require a selected container image.

`containerImageId` is required for every local container manifest without a
bundled Dockerfile, and it is rejected in every other case. Unknown, missing, empty, or
oversized variable values are rejected. The endpoint returns HTTP 202 after the
durable system plugin (created once), immutable package/image snapshot, new
installation, variables, audit entry, initial state, and sync event are durable.
Calling it again for the same `shortName` creates another installation with a
new CUID2 and its own parameters and runtime. Container preparation continues
asynchronously.

If the catalog later advertises an update, additional installations remain
pinned to the existing system plugin's immutable manifest and package until an
explicit upgrade action exists. Catalog reads therefore project the stored
variable and MCP requirements for the install form while retaining the newer
catalog version and `updateAvailable` indicator.

`POST /v0/admin/systemPlugins/:pluginId/uninstallPlugin` atomically removes the
system plugin, all linked installations and secrets, and publishes audit/sync
evidence. Runtime cleanup then stops linked containers and removes the entire
stored package directory, including images, descriptors, skills, and every
installation's persistent `data` directory.

An installation has one of these durable health states:

- `preparing`: copying/reconciling package and image/container state.
- `starting`: the container exists or remote endpoint is selected and MCP
  initialization/health checking is in progress.
- `ready`: a container-only command survived its startup probe; or a local or
  remote MCP server completed initialization, ping, and durable tool discovery.
  A skills-only plugin becomes ready immediately
  after its durable install.
- `broken_configuration`: stored variables, selected image state, manifest
  material, or resolved headers cannot form a valid runtime configuration.
- `failed`: package integrity, image build, container creation, process startup,
  protocol health, DNS, or network execution failed. `lastError` contains bounded
  diagnostic text.

Every transition updates `plugin_installations`, appends a `plugin.*` sync
event, and publishes the normal server SSE hint with the `plugins` area. Clients
must reconcile the durable catalog after a hint; the event itself is not state.
On server restart, every installation is reconciled again. Its package path and
SHA-256 digest are revalidated first; a running local container with matching
installation and incarnation labels is adopted, otherwise it is recreated from
the installed snapshot. Adopted persistent commands resume liveness monitoring.
Remote endpoints are rechecked.

## Read and MCP endpoints

- `GET /v0/admin/plugins` lists the validated built-in catalog, requirements,
  skill summaries, and MCP/container mode. When a catalog package exists in the
  system, `systemPlugin` contains its CUID2, persisted image metadata and URL,
  `updateAvailable`, and every independent installation with current health. It
  requires an active server administrator and never returns configured values.
- `GET /v0/admin/plugins/:shortName/icon` returns the package PNG to an active
  server administrator using the catalog link.
- `GET /v0/admin/systemPlugins` lists persisted system plugins independently of
  the catalog, including image metadata and every linked installation.
- `GET /v0/admin/systemPlugins/:pluginId/image` returns the persisted system
  plugin PNG from its private filesystem snapshot after validating the package
  digest, storage key, byte size, and image checksum.
- `POST /v0/admin/plugins/:shortName/installPlugin` performs the durable install
  and queues lifecycle work. It may be called any number of times; each call
  creates a distinct installation linked to the same system plugin.
- `GET|POST /v0/pluginInstallations/:installationId/mcp` is the authenticated
  Streamable HTTP bridge for one ready local stdio installation. It follows MCP
  session semantics via `Mcp-Session-Id`. Happy’s existing bearer session is
  required; there is no plugin-specific OAuth exchange.
- `GET /v0/admin/pluginInstallations/:installationId/mcpTools` returns the last
  successfully synchronized MCP tool schemas from SQLite. It never contacts the
  MCP server. Tool discovery is replaced atomically on every runtime activation,
  including each server restart.
- `GET /plugins` on the dedicated plugin host listener is the first
  capability-scoped host API. It is deliberately absent from the product API
  listener. A
  container may call it only when its manifest grants `plugins:list` and it
  presents the incarnation token supplied as `HAPPY2_PLUGIN_API_TOKEN`.
- `POST /chats/updateChat` on that same listener changes the current chat's
  `title` and/or `description`. It requires the installation runtime bearer
  token, the `chats:update` manifest permission, and the current call's chat
  capability in `X-Happy2-Chat-Token`. The endpoint deliberately accepts no
  chat ID: the signed capability selects the chat, so tool arguments cannot
  redirect the update to another conversation.

Container processes receive `HAPPY2_PLUGIN_API_URL` and
`HAPPY2_PLUGIN_API_TOKEN`. The URL is always
`http://happy2.host.internal:<plugins.host_api_port>`; the hardened container
adds `happy2.host.internal:host-gateway`, while the capability-only listener
binds `plugins.host_api_host` on that fixed port. HTTP/TCP and the OCI
`host-gateway` mapping work across Docker and Podman on macOS and Linux.
The cross-platform default bind is `0.0.0.0` because a loopback bind is not
reachable through Docker Desktop's or Podman's host gateway. Operators who
expose the host to an untrusted LAN should firewall
`plugins.host_api_port`; it is a container capability endpoint, not a public
service.

The token is an RS256 capability containing the installation ID, a random CUID2
container-incarnation ID, and the installation's exact granted permissions. Token bytes are
never stored. The incarnation ID is stored in `plugin_installations` and also
attached to the OCI container as `dev.happy2.plugin-instance`. On each request,
Happy verifies the signature, matches the incarnation against the ready database
row, and confirms that the correspondingly labelled container is running. A
stopped, missing, or replaced container therefore receives 403. A surviving
container and its token remain valid after a server restart; startup adopts the
matching container and refreshes its MCP tool cache instead of recreating it.
The token intentionally has no time expiration: its lifetime is exactly the
database-and-OCI incarnation lifetime, allowing a command to survive arbitrarily
many server restarts without persisting or rotating token bytes. Killing,
replacing, failing, or removing that incarnation immediately makes the token
unauthorized.
The capability is not a user session and the dedicated listener exposes no
ordinary `/v0` APIs.

When Happy asks an installed MCP tool to run for an agent, it adds the following
request metadata:

```json
{
    "_meta": {
        "happy2/chat": {
            "id": "current-chat-cuid2",
            "token": "signed-chat-capability-jwt"
        }
    }
}
```

The RS256 chat token has no expiration and is bound to both that chat and the
specific plugin installation receiving the call. Plugin host chat actions also
require the running installation's ordinary runtime token; presenting a chat
token through another installation is rejected. Uninstalling or replacing an
installation therefore prevents its old chat tokens from being used by a new
installation. Chat IDs remain immutable and are supplied in metadata and API
results for correlation, never accepted as mutation input.

The bridge allows at most 128 simultaneous sessions server-wide and 16 per
authenticated user. Idle sessions close after 15 minutes; inbound requests and
outbound server messages both renew that lifetime. A session is bound to the
authenticated user who initialized it and cannot be reused by another user.

Only GET and POST are exposed. MCP session DELETE is optional in the protocol
and is not enabled by this API; server shutdown and transport closure clean up
processes and sessions.

## Persistence and future upgrades

`plugins` records the durable CUID2, catalog short name, display metadata, source
kind/reference and installed version, package SHA-256 digest, exact manifest,
persistent snapshot directory, installer, and timestamps. Its image columns
persist the filesystem storage key, content type, byte size, width, height,
thumbhash, and SHA-256 checksum.

`plugin_installations` records a separate CUID2 and foreign key to `plugins`,
plus that instance's container/image choice, granted API permissions, lifecycle state, error detail,
installer, tool-sync timestamp, and timestamps. `plugin_mcp_tools` contains the
last complete MCP discovery keyed by installation and tool name.
`plugin_installation_variables` records each declared
value for one installation; secret rows contain authenticated ciphertext rather
than plaintext. No installation uses `shortName` as identity.

The built-in catalog and durable system plugin are deliberately independent.
Persisted rows use `source_kind = 'builtin'` as their built-in marker. During
startup, the server compares those rows with the current built-in catalog. If a
bundle was removed from the server, its installations, encrypted variables,
system-plugin row, private package/image snapshot, and any named local containers
are removed before the remaining runtimes start. Remotely sourced plugins will
not participate in this catalog-pruning rule.

When the catalog contains a different digest for a persisted plugin's
`shortName`, reads set `updateAvailable: true`; they do not mutate or restart its
installations. A future upgrade action can download/validate a remote package
into the same package abstraction, stage a new immutable package/image snapshot,
and atomically replace the system plugin version before reconciling all linked
installations. Until that action exists, upgrades are advertised only and the
old snapshot continues to run.

Configured installed-package storage:

```toml
[plugins]
directory = "/var/lib/happy2/plugins"
```

The directory must be persistent and private. Plugin variables share the
server’s generated recoverable-secret master key but use a plugin-specific
authenticated-encryption context bound to the installation ID and variable key,
so ciphertext cannot be replayed across integrations, installations, or fields.
