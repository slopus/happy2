import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: [
            "tooling/server-coverage/**/*.test.ts",
            "tooling/server-architecture/**/*.test.ts",
            "tooling/plugin-catalog/**/*.test.ts",
        ],
    },
});
