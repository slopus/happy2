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

## Trust model

Manifest permissions are exact capabilities, not descriptive labels. Happy2 verifies the token signature, installation, container-incarnation ID, database health, and matching live OCI container on every host request. Stopping, replacing, failing, or uninstalling that incarnation invalidates the token without a process-local revocation list.

The host listener is deliberately separate from `/v0`. A plugin cannot exchange its capability for a human session, choose a different chat for approval, or call arbitrary product APIs.
