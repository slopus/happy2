# Happy2 package format

## Contents

1. Package tree
2. Manifest fields
3. Skills
4. Local containers and stdio MCP
5. Remote MCP
6. Variables and permissions
7. Validation limits

## Package tree

```text
my-plugin/
├── happy2.plugin.ts
├── package.json
├── plugin.png
├── src/
│   ├── server.ts              # optional official MCP server
│   └── apps/dashboard.tsx     # optional React MCP App
└── skills/
    └── my-plugin-workflow/
        ├── SKILL.md
        ├── references/        # optional
        ├── scripts/           # optional
        └── assets/            # optional
```

Run `happy2-plugin-build` from `happy2-plugin-sdk`. It emits the validated
`dist/plugin` package, including `plugin.json`, bundled `server.js`, single-file
app HTML, normalized UI assets, skills, and the generated container definition.
Do not hand-write MCP JSON-RPC or a `.mjs` runtime.

`plugin.png` is required, must be PNG, must be square, and may be at most 4096×4096. Happy2 records its dimensions, bytes, SHA-256 checksum, and thumbhash, then keeps the exact image in the immutable installed snapshot.

The entire package may contain at most 1,000 files and 20 MiB uncompressed. One file may be at most 5 MiB. Symlinks and non-files are rejected.

## Manifest fields

```json
{
    "schemaVersion": 1,
    "version": "1.2.3",
    "displayName": "Project Search",
    "shortName": "project-search",
    "description": "Searches project source and documentation.",
    "uiAssets": [],
    "variables": []
}
```

- `schemaVersion` must be `1`.
- `version` must be strict SemVer.
- `shortName` is lower-case kebab-case and at most 64 characters. It must match a built-in package directory; an uploaded/downloaded ZIP may use any enclosing folder name.
- `displayName` is at most 100 characters.
- `description` is at most 1,000 characters.
- `uiAssets` defaults to none. Each entry has a unique lower-case kebab-case
  `id` and safe package-relative `path`. The referenced file must be an exact
  40×40 RGBA PNG with transparent background and uniform black visible pixels;
  Happy uses its alpha channel as a host-tinted UI mask.
- `variables` defaults conceptually to none, but write the explicit array.
- A package must contain at least one discovered skill, `container`, or `mcp`.
- Unknown manifest fields are rejected.

## Skills

Every direct child of `skills/` is one Agent Skill. It must contain `SKILL.md` with YAML frontmatter:

```markdown
---
name: project-search
description: Search this project's indexed source and docs. Use when an agent needs to locate code, symbols, or design documentation.
---
```

The name matches the skill directory and uses lower-case kebab-case. Put detailed material in one-level `references/` files and deterministic reusable helpers in `scripts/`. Do not make the core skill a dump of material the agent rarely needs.

## Local containers and stdio MCP

Bundled runtime:

```json
{
    "container": {
        "dockerfile": "container/Dockerfile",
        "command": "/plugin/bin/indexer",
        "args": ["--watch"],
        "permissions": ["plugins:list"]
    },
    "mcp": {
        "type": "stdio",
        "command": "node",
        "args": ["/plugin/server.js"]
    }
}
```

The optional persistent `container.command` and each stdio MCP process run in the same dedicated installation container. The image root is read-only at runtime. `/tmp` and `/run` are ephemeral and writable. `HOME`, `TMPDIR`, and the working directory are `/tmp`.

If a stdio MCP is the only local component, older manifests may put a bundled Dockerfile under `mcp.container`; new packages should use `container.dockerfile` so one container definition owns permissions and both processes.

Without `container.dockerfile`, direct installation must provide a ready Happy2 agent-image ID. Chat-requested installation intentionally rejects that package because an administrator must make the image choice.

## Remote MCP

```json
{
    "variables": [
        {
            "key": "PROJECT_TOKEN",
            "displayName": "API token",
            "description": "Token sent to the project MCP server.",
            "kind": "secret"
        }
    ],
    "mcp": {
        "type": "remote",
        "url": "https://mcp.example.com/mcp",
        "headers": {
            "Authorization": "Bearer ${PROJECT_TOKEN}"
        }
    }
}
```

Remote URLs are public HTTPS URLs without embedded credentials or fragments. Happy2 resolves and pins public addresses to prevent DNS rebinding. Header templates may reference only declared variables; every remote variable must be used. Hop-by-hop, proxy, host, content, MCP protocol, and other Happy-managed headers are reserved.

Remote MCP cannot share a local plugin container. OAuth is not part of schema version 1.

## Variables and permissions

Variable keys use environment-variable syntax. Each installation must provide every declared variable and no extra keys. Use `secret` for credentials and `text` for non-secret configuration. Values must be non-empty and no larger than 64 KiB.

Supported local host permissions:

- `environments:read`: list agent environments and read one immutable Dockerfile.
- `environments:manage`: create an agent environment and select a ready default.
- `environments:deactivate`: deactivate an unused custom agent environment without deleting its retained manifest or Dockerfile.
- `apps:manage`: create and update durable MCP App instances for an authorized audience.
- `contributions:manage`: create and update typed native Happy controls and menus.
- `plugins:list`: read non-secret installed-plugin identity and health.
- `plugins:request-install`: during a contextual agent tool call, stage a linked ZIP and create a durable approval in that exact chat.
- `plugins:request-uninstall`: during a contextual agent tool call, create a durable approval to remove one exact installation.
- `port-sharing:read`: list shared ports selected by a signed chat capability.
- `port-sharing:expose`: expose one fixed port from the agent selected by a signed chat capability.
- `port-sharing:disable`: disable a shared port selected by a signed chat capability.
- `port-sharing:access`: issue a user-and-subdomain access token after enforcing the share's current audience.

The host API is capability-only and separate from the product API. It exposes neither user sessions nor arbitrary server routes.

## Validation limits

Happy2 rejects unsafe relative paths, missing referenced Dockerfiles, malformed skill frontmatter, duplicate skill names, invalid SemVer, duplicate variables/permissions, unsupported fields, non-square icons, oversized packages, and packages with no functional component.

The installed package digest covers every relative filename, byte length, and byte. Container image tags are content-addressed from that digest. Mutating source files later does not mutate a durable installation.
