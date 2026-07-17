import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tooling/server-coverage/**/*.test.ts"],
    },
});
