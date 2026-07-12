import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@slopus/rigged": fileURLToPath(new URL("../server/sources/index.ts", import.meta.url)),
        },
    },
    test: {
        exclude: ["node_modules/**"],
    },
});
