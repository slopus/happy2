# Happy2 plugin SDK

The SDK turns a TypeScript MCP server and optional React MCP Apps into one validated Happy2 plugin
artifact. It wraps the official `@modelcontextprotocol/sdk` and
`@modelcontextprotocol/ext-apps` packages; it does not define a second MCP protocol.

## Minimal package

```text
happy2-plugin-example/
├── happy2.plugin.ts
├── package.json
├── plugin.png
├── skills/                    # optional, copied automatically
└── src/
    ├── server.ts
    └── apps/dashboard.tsx     # optional
```

```ts
// happy2.plugin.ts
import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    apps: { dashboard: "src/apps/dashboard.tsx" },
    manifest: {
        description: "Shows an example dashboard.",
        displayName: "Example",
        permissions: ["apps:manage"],
        shortName: "example",
        version: "1.0.0",
    },
    server: "src/server.ts",
});
```

`happy2-plugin-build` bundles `src/server.ts` as Node 24 ESM, bundles every React entry as a
self-contained HTML document, copies `skills/`, validates and normalizes declared UI masks to exact
40×40 black/alpha PNGs, and emits the installable tree at `dist/plugin`. It also generates the
manifest, module marker, and isolated container Dockerfile.

## Server and app APIs

- `happy2-plugin-sdk/server` re-exports the official MCP server and MCP Apps registration helpers,
  adds `registerHtmlAppResource`, parses Happy's protected viewer/chat/message/instance context,
  and provides `HostClient` for durable app instances and typed native contributions.
- `happy2-plugin-sdk/app` wraps the official strict React `useApp` lifecycle, host styles, durable
  `happy2/instance` context, and predeclared app-open requests.
- `happy2-plugin-sdk/build` exports `definePluginConfig` and the programmatic builder.

Model visibility always uses standard `_meta.ui.visibility`. Native Happy controls may call only
their exact registered app-visible tool; defining a native control never makes a tool visible to the
model.
