import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    apps: {
        index: "src/apps/index.tsx",
        list: "src/apps/list.tsx",
    },
    manifest: {
        description:
            "Creates collaborative TODO lists with durable shared tasks and interactive MCP Apps.",
        displayName: "Collaborative TODOs",
        permissions: ["apps:manage", "contributions:manage"],
        shortName: "todos",
        variables: [],
        version: "1.0.0",
    },
    pluginIcon: "plugin.png",
    server: "src/server.ts",
    uiAssets: {
        "todo-mark": "assets/todo-mark.svg",
    },
});
