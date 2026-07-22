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
of a source package creates one durable system-plugin record and one immutable
package snapshot; later installations reuse that plugin identity and snapshot.
Every installation has its own CUID2, variables, selected image, lifecycle, and
dedicated container when it has a local runtime. Remote MCP configuration is
persisted and health-checked independently per installation. Ready MCP
installations expose their durably cached tools to Rig as external functions on
every agent submission. Happy also reconciles the skills from ready
installations into the exact agent sandbox home before each turn. Happy executes
each durable MCP call against the originating installation and resolves the
result back into the paused Rig run. Upgrade, marketplace discovery, and OAuth
flows are not implemented; individual installations can be uninstalled. Remote
update checks report drift but deliberately do not replace the installed snapshot.

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

Each package has this shape. Built-ins are authored as dedicated
`packages/happy2-plugin-*` workspaces, emit this tree in `dist/plugin`, and are
validated and assembled into `packages/happy2-server/dist/plugins` for development
and publication. Installed snapshots live below the configured `plugins.directory`.
A ZIP may contain this tree at its root or inside one top-level folder:

```text
example-plugin/
├── plugin.json
├── plugin.png
├── assets/                    # optional host-rendered monochrome UI assets
│   └── create-task.png
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
    "uiAssets": [
        {
            "id": "create-task",
            "path": "assets/create-task.png"
        }
    ],
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

`version` uses `x.y.z` SemVer syntax. `shortName` is the stable package name and
must match its directory in the assembled built-in catalog. External ZIPs are not
required to make their enclosing folder match; `shortName` still identifies the
validated package metadata and is not an installation identity.
The durable system plugin and every installation receive separate CUID2 IDs.
Variable keys are environment variable names. Every declared variable is
required for each installation. Secret values are encrypted with AES-256-GCM
and are never returned by catalog or installation reads; text values are stored
as ordinary configuration. Both kinds are supplied to configured local
processes as environment variables.

`uiAssets` declares immutable artwork that typed plugin contributions and app
instances may reference by ID. Each path is package-relative and unique. The
built asset must be an exact 40×40 RGBA PNG with transparent background and
uniform black visible pixels; partial alpha preserves antialiasing. Happy
checks its bytes and SHA-256 digest during package validation, serves it only
through authenticated product routes, and renders the fetched blob as a CSS
mask so the interface—not the plugin—owns hover, selection, disabled, light,
and dark tint colors. Contribution JSON cannot contain image URLs or inline SVG.

A package must contain at least one skill, `container`, or `mcp` definition.
`container.command` is optional when the same container exposes a stdio MCP;
otherwise it is required. A command and stdio MCP run alongside each other in
the same dedicated installation container. Container variables are supplied to
each configured process, not persisted in the image or container definition.

`container.permissions` declares the exact host API capabilities a package may
request. Permissions are grouped for presentation by API section:
`projects:create`, `channels:create`, `channels:create-child`, `chats:members:add`,
`chats:members:remove`, `chats:update`, and `chats:archive` independently grant
their named mutations. Messages split
send, delete, history, and single-message reads; reactions split add and remove;
search splits users, messages, and chats; and commands plus workspace reads and
writes each have their own grant. `environments:read` is read-only and
`environments:manage` creates and selects environments, and
`environments:deactivate` separately deactivates unused custom environments.
Deactivation retains the immutable manifest and Dockerfile, and creating the
same definition later reactivates it and queues a fresh build. `plugins:list` is
read-only and `plugins:install` and `plugins:uninstall` are mutating permissions
in `plugins`.
`plugins:request-install` and `plugins:request-uninstall` are also mutating
permissions, but create chat-scoped human approvals instead of granting direct
install or uninstall authority. Unknown and duplicate permissions are rejected
when the package is loaded.
`apps:manage` creates and updates durable MCP App destinations, while
`contributions:manage` creates and updates strictly typed native controls. Both
permissions remain installation-bound and require current delegated viewer/chat
capabilities whenever a definition narrows its audience.
Unknown and duplicate declarations are rejected when the package is loaded.

Declarations are not grants. Each install request may include a `permissions`
array containing any subset of the manifest declaration; omitted permissions
default to an empty grant. Installation responses expose `grantedPermissions`,
while catalog permission metadata is returned in `apiPermissions` sections with
separate `readOnly` and `mutations` arrays. Administrators can replace the grant
later with `POST /v0/admin/pluginInstallations/:installationId/updatePermissions`.
Changing a grant invalidates the current runtime token and restarts the local
container with a new token, so stale tokens cannot retain revoked access.

The isolated plugin host listener provides environment and plugin management
alongside capability-scoped chat, message, search, command, and workspace
routes. Each route requires its exact capability; a combined membership or
search request requires every capability used by that request. Plugin-triggered
installs must also choose a subset of the target package's declared permissions.

The bundled `hello` package is the minimal skill-plus-MCP example. The bundled
`plugin-developer` package contributes a comprehensive Happy2 plugin-development
skill and MCP tools for listing installations and requesting linked install or
uninstall approval from the current chat. The bundled `port-sharing` package
combines a workflow skill with tools for listing, exposing, probing,
authenticating, and disabling the current chat agent's public preview. Neither
format is a Conductor or Codex plugin format.

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

`POST /v0/admin/pluginInstallations/:installationId/checkForUpdate` is also an
SSE endpoint. It downloads and verifies the same selected remote path, emits
progress, then a `checked` event containing that installation's current and
remote versions/digests plus `updateAvailable`. Built-ins are compared with the
current catalog. `POST
/v0/admin/pluginInstallations/:installationId/updatePlugin` explicitly upgrades
only the selected installation. Its package snapshot, manifest, skills, assets,
permissions, and runtime lifecycle remain independent of sibling installations.

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

`POST /v0/admin/plugins/installPlugin` installs an external package. Send either
multipart form data with an `archive` ZIP part plus optional JSON `variables`
and `containerImageId` fields, or JSON with `sourceUrl`, `variables`, and
`containerImageId`. Link downloads allow public HTTPS only, revalidate every
redirect and resolved address, and are capped at three redirects, 20 seconds,
and 20 MiB. ZIP extraction rejects traversal, absolute paths, symlinks,
encryption, duplicate entries, more than 1,000 entries, files above 5 MiB, and
uncompressed package data above 20 MiB.

`containerImageId` is required for every local container manifest without a
bundled Dockerfile, and it is rejected in every other case. Unknown, missing, empty, or
oversized variable values are rejected. The endpoint returns HTTP 202 after the
durable system plugin (created once), immutable package/image snapshot, new
installation, variables, audit entry, initial state, and sync event are durable.
Calling it again for the same `shortName` creates another installation with a
new CUID2 and its own parameters and runtime. Container preparation continues
asynchronously. `shortName` is globally unique across system plugins: a package
from another source that reuses an existing name is rejected with HTTP 409. An
agent request with such a collision can be staged for review, but approval
resolves it to `failed` without replacing the existing plugin.

`POST /v0/admin/pluginInstallations/:installationId/uninstallPlugin` removes
one exact installation. Happy stops and removes that installation's local
runtime, deletes its variables and tool cache through cascading durable state,
and removes the system plugin and immutable package snapshot only when no other
installation references it.

### Agent-requested approval

A local plugin container may ask Happy to install a public HTTPS ZIP or
uninstall an exact installation while its MCP tool is executing for an agent
turn. The normal long-lived incarnation token cannot make such a request. For
that MCP call only, Happy injects a five-minute capability token bound to the
originating Rig session, call ID, human actor, agent, chat, requester
installation, and live container incarnation.

The host API validates and stages the exact package before creating a durable
chat request. The request stores the package digest, source, display name,
description, icon, optional reason, and a preallocated installation ID. It does
not install synchronously and does not use MCP elicitation as authority. Happy's
own administrator approval is the authority and audit boundary. Agent-requested
installs reject packages requiring variables or an administrator-selected
container image, because those values must not be collected through chat.

Chat members can list requests and read the staged icon while a request is
`pending` or `processing`. A server administrator who is also a chat member can
approve or deny them:

- `GET /v0/chats/:chatId/pluginManagementRequests`
- `GET /v0/chats/:chatId/pluginManagementRequests/:requestId/image`
- `POST .../:requestId/approvePluginInstall`
- `POST .../:requestId/denyPluginInstall`
- `POST .../:requestId/approvePluginUninstall`
- `POST .../:requestId/denyPluginUninstall`

Request creation and every terminal resolution advance the chat's durable
point, append audit/sync evidence, and publish server and chat realtime hints.
Approval claims publish their intermediate `processing` state as well. If the
complete server stops during a claimed operation, startup reconciles the request
to `approved` only when the deterministic durable installation outcome exists;
otherwise it records a terminal failure instead of leaving the card stuck.
Every terminal path removes the staged package, and startup retries that cleanup
for requests resolved immediately before a process stopped. Terminal projections
therefore omit `imageUrl`; the UI must reconcile these durable requests and
render their name, description, optional image, source, reason, status, and
action controls.

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
- `POST /v0/admin/plugins/installPlugin` installs a validated ZIP upload or
  public HTTPS ZIP link.
- `POST /v0/admin/pluginInstallations/:installationId/uninstallPlugin` removes
  one installation and removes its system plugin only when it was the last one.
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
- `POST /plugin-install-requests` and
  `POST /plugin-uninstall-requests` live only on the dedicated plugin host
  listener. A container must present `HAPPY2_PLUGIN_API_TOKEN` and declare the
  corresponding host permission. The two mutation-request endpoints also
  require an active contextual agent-call token.
- `POST /channels/updateMembers` adds or removes signed user capabilities from
  the chat selected by `X-Happy2-Chat-Token`. Non-empty `add` and `remove`
  arrays independently require `chats:members:add` and
  `chats:members:remove`. Direct messages remain immutable, and the triggering
  user's ordinary channel-manager authorization still applies.
- `POST /channels/createChannel` requires `channels:create`. It creates a
  public channel by default; `visibility: "private"` creates a private channel.
  It accepts signed initial members, an optional people or agent opening
  message, and an optional `idempotencyKey`. Opening messages are user-attributed
  with `automated: true`. The response includes a signed chat token for the new
  channel.
- `POST /projects/createProject` requires `projects:create`. It atomically
  creates a project with 1–20 initial public or private channels, optional
  signed people who join every channel, and an optional signed steward. The
  steward is credited as project and public-channel creator and owns every
  private channel; when omitted, the triggering human is the steward. Public
  channels never receive an owner. The triggering human retains administrative
  membership so the capability-scoped operation remains usable. Project
  visibility continues to derive from channel visibility and membership rather
  than a second project ACL. An optional `idempotencyKey` replays the same
  project and ordered channels, and each returned channel includes a signed chat
  token.
- `POST /channels/createChildChannel` requires `channels:create-child` and a
  chat capability for the parent. It creates a child with the parent's
  visibility and workspace access, independent opt-in membership, history, and
  agent session, plus an optional validated `agentModelId`. The triggering
  human must still be a manager of the top-level parent. Other active parent
  members may join or leave the child separately. It accepts the same optional
  automated opening message as top-level channel creation. The response
  includes a signed chat token for the child.
- `POST /chats/archiveChat` requires `chats:archive` and archives the channel
  selected by `X-Happy2-Chat-Token`, including the current channel when its
  current-call token is used. Normal manager, main-channel, and DM rules apply.
- `POST /messages/send` requires `messages:send`, sends as the human bound to
  the chat token with `automated: true`, and returns a signed message token.
  `audience: "agents"` starts agent inference while `audience: "people"` does
  not. `GET /messages/history` requires `messages:history` and deliberately
  returns no entity tokens.
  `GET /messages/:messageId` and `POST /messages/:messageId/deleteMessage`
  require a CUID2 path ID, the matching `X-Happy2-Message-Token`, and their
  separate `messages:read` or `messages:delete` grant.
- `POST /messages/:messageId/addReaction` and `removeReaction` use that same
  message capability and independently require `reactions:add` or
  `reactions:remove`.
- `POST /search` accepts `filters: "all"` or any non-empty subset of `users`,
  `messages`, and `chats`. Each filter requires its corresponding
  `search:users`, `search:messages`, or `search:chats` grant. Every result carries
  an installation-bound signed token for that entity. These tokens deliberately
  let the installation use its other granted capabilities across every returned
  entity the bound human can still access; they are not limited to the chat that
  initiated the plugin call. Durable actions always re-check the human's current
  authorization.
- `GET /workspace/file` requires `workspace:read`. `POST /workspace/writeFile`
  requires `workspace:write` and compares `expectedHash` with the current
  SHA-256 before replacing UTF-8 content; a conflict returns `currentHash`.
- `POST /commands/run` requires `commands:run` and runs Bash in the chat
  workspace with only the submitted environment plus a minimal process
  environment. This is an explicit local-operator capability: it executes as the
  server's OS user and can reach outside the workspace through the submitted
  command, so installations should receive it only when host shell access is
  intended. Execution is capped at 30 seconds and 4 MiB per output stream;
  `outputLimitExceeded` distinguishes truncated output from `timedOut`.
- `GET /port-shares`, `POST /port-shares/exposePort`, and the share-specific
  disable/access-token actions require `port-sharing:read`,
  `port-sharing:expose`, `port-sharing:disable`, and `port-sharing:access`
  respectively. Every route also requires the installation-bound chat
  capability in `X-Happy2-Chat-Token`; no request body can select a different
  chat, agent, or container. Creation requires an `audience` of `internet`,
  `server`, or `chat`; one port from the fixed 3000-3010 range may be shared for
  a chat at a time.

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

The ordinary token is an RS256 capability containing the installation ID, a
random CUID2 container-incarnation ID, and the installation's exact granted
permissions.
Token bytes are never stored. The incarnation ID is stored in
`plugin_installations` and also
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
unauthorized. During one agent MCP call, Happy substitutes the bounded
contextual token described above; it expires after five minutes and cannot be
used outside that live container incarnation or after the exact durable external
tool call stops being in progress.
The capability is not a user session and the dedicated listener exposes no
ordinary `/v0` APIs.

When Happy asks an installed MCP tool to run for an agent, it adds the following
request metadata:

```json
{
    "_meta": {
        "happy2/chat": {
            "id": "current-chat-cuid2",
            "token": "signed-chat-capability-jwt",
            "triggeredByUserId": "sender-cuid2"
        },
        "happy2/users": [
            {
                "id": "sender-cuid2",
                "username": "ada",
                "firstName": "Ada",
                "kind": "human",
                "triggeredTurn": true,
                "token": "signed-user-capability-jwt"
            },
            {
                "id": "mentioned-user-cuid2",
                "username": "grace",
                "firstName": "Grace",
                "kind": "human",
                "triggeredTurn": false,
                "token": "signed-user-capability-jwt"
            }
        ]
    }
}
```

The user list contains the message sender that triggered the exact agent turn,
followed by every concrete `@username` mention recorded on that message, with
duplicates removed. Special mentions such as `@here` do not create user
capabilities. Each RS256 user token has no expiration and is bound to the user
and the receiving plugin installation. A plugin may persist it; Happy does not
require or provide persistence by default. Host actions verify that the signed
user and the supplied user ID match.

The RS256 chat token also has no expiration. It is bound to that chat, the
triggering actor, the executing agent, and the specific plugin installation
receiving the call. Plugin host chat actions additionally require the running
installation's ordinary runtime token; presenting a chat or user token through
another installation is rejected. Uninstalling or replacing an installation
therefore prevents its old capabilities from being used by a new installation.
Chat IDs remain immutable and are supplied in metadata and API results for
correlation, never accepted as mutation input.

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

`plugin_management_requests` records the chat-scoped install/uninstall action,
requesting agent call, validated publisher metadata, exact staged package
coordinates, resolution, audit-related sync sequence, and deterministic target
or installation ID. Actionable staged packages live beneath the private plugin
package store and are revalidated by path and digest before image reads or
approval. They are reclaimed on approval, denial, failure, and restart cleanup;
terminal history retains metadata and audit evidence rather than package bytes.

The built-in catalog and durable system plugin are deliberately independent.
Persisted rows use `source_kind = 'builtin'`, `archive`, or `link`. During
startup, the server compares those rows with the current built-in catalog. If a
bundle was removed from the server, its installations, encrypted variables,
system-plugin row, private package/image snapshot, and any named local containers
are removed before the remaining runtimes start. Archive- and link-sourced
plugins do not participate in this catalog-pruning rule.

Before each agent turn, skills from ready installations are integrity-checked
against their immutable package digest and reconciled under
`.agents/skills/happy2-plugins/<pluginId>-<skillName>` in that exact agent home.
Rig recursively discovers skills below `.agents/skills` on every agent loop, so
the published frontmatter name and immutable package files stay unchanged.
Happy owns only the `happy2-plugins` subtree; user and project skills elsewhere
are left untouched. Uninstalling the final ready installation removes that
plugin's skills on the next turn.

When the catalog contains a different digest for a persisted plugin's
`shortName`, reads set `updateAvailable: true`; they do not mutate or restart its
installations. A future upgrade action can validate a replacement package, stage
a new immutable package/image snapshot, and atomically replace the system plugin
version before reconciling all linked installations. Until that action exists,
upgrades are advertised only and the old snapshot continues to run.

Configured installed-package storage:

```toml
[plugins]
directory = "/var/lib/happy2/plugins"
```

The directory must be persistent and private. Plugin variables share the
server’s generated recoverable-secret master key but use a plugin-specific
authenticated-encryption context bound to the installation ID and variable key,
so ciphertext cannot be replayed across integrations, installations, or fields.
