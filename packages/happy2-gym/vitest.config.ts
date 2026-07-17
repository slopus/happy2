import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "happy2-server": fileURLToPath(
                new URL("../happy2-server/sources/index.ts", import.meta.url),
            ),
        },
    },
    test: {
        exclude: ["node_modules/**", "tests/playwright/**"],
        // The black-box servers exercise file watchers, SMTP, SQLite, and RSA setup.
        // Running files concurrently makes unrelated timing-sensitive workflows flaky.
        fileParallelism: false,
    },
});
