import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            happy2: fileURLToPath(new URL("../server/sources/index.ts", import.meta.url)),
        },
    },
    test: {
        exclude: ["node_modules/**", "tests/playwright/**"],
    },
});
