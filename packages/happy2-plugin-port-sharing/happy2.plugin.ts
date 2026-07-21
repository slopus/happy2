import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    manifest: {
        description:
            "Lets an agent expose, inspect, authenticate, verify, and disable a web server running on ports 3000 through 3010 in its current chat container.",
        displayName: "Port Sharing",
        permissions: [
            "port-sharing:read",
            "port-sharing:expose",
            "port-sharing:disable",
            "port-sharing:access",
        ],
        shortName: "port-sharing",
        variables: [],
        version: "1.0.0",
    },
    pluginIcon: "plugin.png",
    server: "src/server.mjs",
});
