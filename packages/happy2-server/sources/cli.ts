#!/usr/bin/env node

import { parseArgs } from "node:util";
import { createClient } from "@libsql/client";
import { TokenService } from "./modules/auth/tokens.js";
import { loadRuntimeConfig } from "./modules/config/runtime.js";
import { serverSchemaMigrate } from "./modules/server/serverSchemaMigrate.js";
import { buildServer } from "./server.js";

const { values } = parseArgs({
    options: { config: { type: "string" } },
});
const configPath = values.config ?? process.env.HAPPY2_CONFIG;
const { config } = await loadRuntimeConfig(configPath);
const client = createClient({
    url: config.database.url,
    authToken: config.database.authTokenEnv ? process.env[config.database.authTokenEnv] : undefined,
});
await serverSchemaMigrate(client);
const app = await buildServer(config, {
    client,
    tokens: await TokenService.create(config),
});
let cleanupPromise: Promise<void> | undefined;
const cleanup = () => {
    cleanupPromise ??= (async () => {
        try {
            await app.close();
        } finally {
            client.close();
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
