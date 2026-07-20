import { definePluginConfig } from "happy2-plugin-sdk/build";

export default definePluginConfig({
    server: "src/entry.ts",
    apps: {
        movie: { entry: "src/apps/movie.tsx" },
    },
    manifest: {
        version: "1.0.0",
        displayName: "Movie Catalog",
        shortName: "movie-catalog",
        description:
            "Finds movies through the public Studio Ghibli no-auth catalog and presents them as an interactive MCP App.",
        permissions: [],
    },
});
