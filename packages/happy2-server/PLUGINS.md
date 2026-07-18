# Server plugins

Happy (2) plugins package Agent Skills, an MCP server, or both. This first
server-side implementation installs only packages bundled with the server. It
already keeps catalog discovery, durable system plugins, immutable package/image
snapshots, and independent runtime installations separate so a later remote
catalog/download step can reuse the same boundaries.

Plugin management is system-wide and administrator-only. The first installation
of a catalog package creates one durable system-plugin record and one immutable
package snapshot; later installations reuse that plugin identity and snapshot.
Every installation has its own CUID2, variables, selected image, lifecycle, and
dedicated container when it is a local stdio MCP. Remote MCP configuration is
persisted and health-checked independently per installation. This feature does
not yet inject installed skills or MCP configuration into Rig agent runs, and it
does not yet implement upgrade, uninstall, marketplace download, or OAuth flows.

## Package anatomy

Each built-in package is a directory below `packages/happy2-server/plugins`:

```text
example-plugin/
├── plugin.json
├── plugin.png
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
    ]
}
```

`version` uses `x.y.z` SemVer syntax. `shortName` is the stable catalog/package
link and must match the package directory; it is not an installation identity.
The durable system plugin and every installation receive separate CUID2 IDs.
Variable keys are environment variable names. Every declared variable is
required for each installation. Secret values are encrypted with AES-256-GCM
and are never returned by catalog or installation reads; text values are stored
as ordinary configuration. Both kinds are supplied to a stdio process as
environment variables.

A package must contain at least one skill or an `mcp` definition.

The bundled `hello` package is the minimal skills-only example. It declares no
variables or MCP authentication, so an administrator can install it with an
empty POST body; each call still creates a separate installation.

## Stdio MCP with a bundled container

```json
{
    "mcp": {
        "type": "stdio",
        "command": "/plugin/bin/project-mcp",
        "args": ["--stdio"],
        "container": {
            "dockerfile": "container/Dockerfile"
        }
    }
}
```

The Dockerfile path is package-relative. Creating the durable system plugin
copies the entire package once to `plugins.directory` before writing its
database record. Each installation lifecycle builds or resolves that exact
snapshot with the selected local Docker or Podman provider, using a
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
The fixed `HOME`, `TMPDIR`, and working directory are `/tmp`, so tools that
need a cache can still run without making the image root writable.

Each installation container stays alive as that installation's plugin runtime.
Each HTTP MCP session starts
the configured command with `docker exec`/`podman exec`; variables reach that
process through Docker/Podman's environment-copy option. Values are never placed
in command arguments, Happy's process environment, the long-lived container
definition, or the image build; they exist only in the short-lived OCI CLI child
and the MCP process. Variables that could alter the OCI client itself, such as
`DOCKER_*`, proxy, loader, or executable-path settings, are rejected. Happy
transparently bridges newline-delimited stdio JSON-RPC to MCP Streamable HTTP, so
the plugin itself does not need an HTTP server.

## Stdio MCP using a selected container image

Omit `mcp.container` when the plugin does not bundle its own Dockerfile:

```json
{
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
custom static headers described above.

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

`containerImageId` is required only for stdio manifests without a bundled
container, and it is rejected in every other case. Unknown, missing, empty, or
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

An installation has one of these durable health states:

- `preparing`: copying/reconciling package and image/container state.
- `starting`: the container exists or remote endpoint is selected and MCP
  initialization/health checking is in progress.
- `ready`: the MCP server completed initialization and ping (local), or returned
  a valid initialization response (remote). A skills-only plugin becomes ready
  immediately after its durable install.
- `broken_configuration`: stored variables, selected image state, manifest
  material, or resolved headers cannot form a valid runtime configuration.
- `failed`: package integrity, image build, container creation, process startup,
  protocol health, DNS, or network execution failed. `lastError` contains bounded
  diagnostic text.

Every transition updates `plugin_installations`, appends a `plugin.*` sync
event, and publishes the normal server SSE hint with the `plugins` area. Clients
must reconcile the durable catalog after a hint; the event itself is not state.
On server restart, every installation is reconciled again. Its package path and
SHA-256 digest are revalidated first; local containers are then recreated from
the installed snapshot, and remote endpoints are rechecked.

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
plus that instance's container/image choice, lifecycle state, error detail,
installer, and timestamps. `plugin_installation_variables` records each declared
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
