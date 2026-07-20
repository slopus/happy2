import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    manifest: {
        description:
            "Lets an agent inspect, create, select, and safely deactivate Happy agent environments.",
        displayName: "Environment Management",
        permissions: ["environments:read", "environments:manage", "environments:deactivate"],
        shortName: "environment-management",
        variables: [],
        version: "1.0.0",
    },
    pluginIcon: "plugin.png",
    server: "src/server.ts",
});
