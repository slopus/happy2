import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    manifest: {
        version: "1.0.0",
        displayName: "Plugin Developer",
        shortName: "plugin-developer",
        description:
            "Helps agents design, validate, inspect, and request installation of Happy2 plugins.",
        permissions: ["plugins:list", "plugins:request-install", "plugins:request-uninstall"],
    },
});
