import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    manifest: {
        description: "A tiny built-in skill and MCP tool that help an agent greet people warmly.",
        displayName: "Hello",
        permissions: [],
        shortName: "hello",
        variables: [],
        version: "1.0.0",
    },
    pluginIcon: "plugin.png",
    server: "src/server.ts",
});
