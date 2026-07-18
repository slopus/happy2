import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
    createServerCoverageOptions,
    repositoryRoot,
} from "../happy2-server/tooling/server-coverage/config.js";
export default defineConfig({
    root: repositoryRoot,
    resolve: {
        alias: {
            "happy2-server": fileURLToPath(
                new URL("../happy2-server/sources/index.ts", import.meta.url),
            ),
        },
    },
    test: {
        include: ["packages/happy2-gym/tests/**/*.test.ts"],
        exclude: ["**/node_modules/**", "packages/happy2-gym/tests/playwright/**"],
        // V8 instrumentation amplifies file-database teardown races. Keep the
        // coverage gate deterministic while normal Gym tests use bounded lanes.
        fileParallelism: false,
        coverage: createServerCoverageOptions("gym"),
    },
});
