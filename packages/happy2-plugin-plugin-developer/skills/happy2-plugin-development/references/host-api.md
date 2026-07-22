# Capability-scoped plugin host API

## Runtime environment

Local plugin processes receive:

- `HAPPY2_PLUGIN_API_URL`: the dedicated capability-only host listener.
- `HAPPY2_PLUGIN_API_TOKEN`: an RS256 token for one installed plugin and live container incarnation.

Send `Authorization: Bearer <token>`. Do not persist, log, return, or forward either value.

## List plugins

Manifest permission: `plugins:list`

```http
GET /plugins
Authorization: Bearer …
```

The response includes the calling installation ID and non-secret installation identity, short name, version, and status. It does not expose variables, users, filesystem paths, package internals, or administrator APIs.

## Agent environments

Manifest permissions: `environments:read` for listing and Dockerfile reads;
`environments:manage` for creation and default selection;
`environments:deactivate` separately for safe deactivation.

```http
GET /environments
GET /environments/:environmentId/dockerfile
POST /environments/createEnvironment
POST /environments/:environmentId/setDefaultEnvironment
POST /environments/:environmentId/deactivateEnvironment
Authorization: Bearer …
```

Creation accepts `{ "name": string, "dockerfile": string }`, creates an immutable
definition, and queues its image build. Creating the same inactive definition
reactivates its retained manifest and queues a fresh build under the same ID.
Only a ready environment can become the default. Deactivation accepts an empty
body and rejects built-ins, queued or active builds, the default, agent
assignments and bindings, and plugin container-image selections. It never
deletes the immutable manifest or Dockerfile. `GET /environments` supplies
active state, IDs, and lifecycle status required to drive those operations
without exposing build logs or provider identifiers.

## Request linked installation

Manifest permission: `plugins:request-install`

```http
POST /plugin-install-requests
Authorization: Bearer …
Content-Type: application/json

{
  "sourceUrl": "https://downloads.example.com/plugin.zip",
  "reason": "Adds the formatter requested in this chat."
}
```

This endpoint additionally requires a short-lived contextual token issued only while Happy2 executes an MCP tool for a running Rig turn. The token binds the request to the external-tool call, session, agent, human actor, and chat. A persistent plugin command or a non-contextual health probe receives 403 even if its base manifest declares the permission.

The endpoint downloads, extracts, fully validates, and snapshots the package before it creates the approval. It returns HTTP 202 and an approval summary. It does not install synchronously.

## Request uninstall

Manifest permission: `plugins:request-uninstall`

```http
POST /plugin-uninstall-requests
Authorization: Bearer …
Content-Type: application/json

{
  "installationId": "the installation ID from GET /plugins",
  "reason": "The user no longer needs this integration."
}
```

This endpoint has the same contextual-call requirement. It snapshots the installed plugin's validated name, description, and icon into a pending chat card. Removal begins only after a chat-member server administrator approves it.

## Share the current chat agent's port

Manifest permissions: `port-sharing:read` for listing, `port-sharing:expose` for
creation, `port-sharing:disable` for disabling, and `port-sharing:access` for
access-token creation.

Each route also requires the installation-bound chat capability in
`X-Happy2-Chat-Token`. The chat, triggering user, and agent are taken from that
capability; request bodies cannot select another chat or container. Exactly one
share may be active for a chat, `port` must be an integer from 3000 through
3010, and `audience` must be `internet`, `server`, or `chat`.

```http
GET /port-shares
POST /port-shares/exposePort
POST /port-shares/:portShareId/disablePortShare
POST /port-shares/:portShareId/createAccessToken
Authorization: Bearer …
X-Happy2-Chat-Token: …
Content-Type: application/json

{ "name": "Documentation Preview", "port": 3000, "audience": "chat" }
```

Creation returns a friendly hostname such as
`documentation-preview-a1b2c3.preview.example.com`. `internet` permits anyone
with the link, `server` permits any active authenticated Happy user, and `chat`
permits current chat members. Access-token creation uses an empty body and
returns a one-hour RS256 bearer token for the triggering user and subdomain,
plus `refreshAfter` set 15 minutes after issuance. Treat that token as secret.
Present it to the preview hostname as
`X-Happy2-Port-Share-Authorization: Bearer <token>`, never as the standard
application `Authorization` header. The preview proxy consumes that dedicated
header while forwarding application authorization and cookies unchanged.
Happy rechecks its user's current audience access in SQLite on every request.
When a browser opens a restricted share without a current preview cookie, Happy
redirects through the main API session and returns a one-minute user-only
redemption token. The preview host verifies current access, establishes a
user-and-subdomain host-only HttpOnly cookie, and redirects back to the requested
path.

## Trust model

Manifest permissions are exact capabilities, not descriptive labels. Happy2 verifies the token signature, installation, container-incarnation ID, database health, and matching live OCI container on every host request. Stopping, replacing, failing, or uninstalling that incarnation invalidates the token without a process-local revocation list.

The host listener is deliberately separate from `/v0`. A plugin cannot exchange its capability for a human session, choose a different chat for approval, or call arbitrary product APIs.
