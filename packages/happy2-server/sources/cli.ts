#!/usr/bin/env node

import { parseArgs } from "node:util";
import { startBackendHappy2 } from "./backend.js";
import { loadRuntimeConfig } from "./modules/config/runtime.js";

const { values } = parseArgs({
    options: { config: { type: "string" } },
});
const configPath = values.config ?? process.env.HAPPY2_CONFIG;
const { config } = await loadRuntimeConfig(configPath);
const app = await startBackendHappy2(config);
let cleanupPromise: Promise<void> | undefined;
const cleanup = () => {
    cleanupPromise ??= app.close();
    return cleanupPromise;
};
try {
    const stop = () => {
        void cleanup().catch((error: unknown) => {
            console.error(error);
            process.exitCode = 1;
        });
    };
    process.once("SIGHUP", stop);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
} catch (error) {
    console.error(error);
    await cleanup().catch((cleanupError: unknown) => console.error(cleanupError));
    process.exitCode = 1;
}
