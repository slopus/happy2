import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    manifest: {
        description:
            "Lets an agent expose a web server to the internet, authenticated server users, or current chat members, then inspect, verify, and disable it.",
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
