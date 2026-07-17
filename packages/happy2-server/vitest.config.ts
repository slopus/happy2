import { defineConfig } from "vitest/config";
import { createServerCoverageOptions } from "./tooling/server-coverage/config.js";

export default defineConfig({
    test: {
        exclude: ["dist/**", "node_modules/**", "tooling/**"],
        coverage: createServerCoverageOptions("unit"),
    },
});
