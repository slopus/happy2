import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { gymSequentialTestFiles } from "./test-lanes.js";

const alias = {
    "happy2-server": fileURLToPath(new URL("../happy2-server/sources/index.ts", import.meta.url)),
};

export default defineConfig({
    test: {
        projects: [
            {
                resolve: { alias },
                test: {
                    name: "gym-parallel",
                    include: ["tests/**/*.test.ts"],
                    exclude: [
                        ...configDefaults.exclude,
                        "tests/playwright/**",
                        ...gymSequentialTestFiles,
                    ],
                    // A bounded pool protects the desktop machine while cutting the
                    // independent in-memory Gym scenarios' wall-clock time.
                    maxWorkers: 4,
                    sequence: { groupOrder: 0 },
                },
            },
            {
                resolve: { alias },
                test: {
                    name: "gym-sequential",
                    include: [...gymSequentialTestFiles],
                    // These scenarios use file-backed SQLite or a packaged child
                    // process, so they retain their deterministic isolation lane.
                    fileParallelism: false,
                    sequence: { groupOrder: 1 },
                },
            },
        ],
    },
});
