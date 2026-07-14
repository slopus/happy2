#!/usr/bin/env node

import { parseArgs } from "node:util";
import { TokenService } from "./modules/auth/tokens.js";
import { loadRuntimeConfig } from "./modules/config/runtime.js";
import { Database } from "./modules/database.js";
import { buildServer } from "./server.js";

const { values } = parseArgs({
    options: { config: { type: "string" } },
});
const configPath = values.config ?? process.env.RIGGED_CONFIG;
const { config } = await loadRuntimeConfig(configPath);
const database = new Database(
    config.database.url,
    config.database.authTokenEnv ? process.env[config.database.authTokenEnv] : undefined,
);
await database.migrate();
const app = await buildServer(config, { database, tokens: await TokenService.create(config) });
let cleanupPromise: Promise<void> | undefined;
const cleanup = () => {
    cleanupPromise ??= (async () => {
        try {
            await app.close();
        } finally {
            database.close();
        }
    })();
    return cleanupPromise;
};
try {
    await app.listen({ host: config.server.host, port: config.server.port });
    const stop = () => {
        void cleanup().catch((error: unknown) => {
            app.log.error(error);
            process.exitCode = 1;
        });
    };
    process.once("SIGHUP", stop);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
} catch (error) {
    app.log.error(error);
    await cleanup().catch((cleanupError: unknown) => app.log.error(cleanupError));
    process.exitCode = 1;
}
