import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    manifest: {
        description:
            "Makes documents attached to the current chat visible to the agent so it can list and read them, create new attached documents from Markdown, and propose approval-gated block edits.",
        displayName: "Documents",
        permissions: ["documents:read", "documents:write"],
        shortName: "documents",
        variables: [],
        version: "1.0.0",
    },
    pluginIcon: "plugin.png",
    server: "src/server.ts",
    serverMinify: true,
});
