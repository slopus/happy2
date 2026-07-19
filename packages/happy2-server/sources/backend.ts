import { createClient } from "@libsql/client";
import type { FastifyInstance } from "fastify";
import { TokenService } from "./modules/auth/tokens.js";
import type { ServerConfig } from "./modules/config/type.js";
import { serverSchemaMigrate } from "./modules/server/serverSchemaMigrate.js";
import { buildServer } from "./server.js";

export interface RunningHappy2 extends AsyncDisposable {
    /** Actual bound URL. This differs from config.server.publicUrl when port 0 is used. */
    url: string;
    close(): Promise<void>;
}

export interface BackendOptions {
    logger?: boolean;
}

/** Starts only the Happy (2) backend, without serving or proxying the web application. */
export async function startBackendHappy2(
    config: ServerConfig,
    options: BackendOptions = {},
): Promise<RunningHappy2> {
    const client = createClient({
        url: config.database.url,
        authToken: config.database.authTokenEnv
            ? process.env[config.database.authTokenEnv]
            : undefined,
    });
    let app: FastifyInstance | undefined;
    try {
        await serverSchemaMigrate(client);
        app = await buildServer(config, {
            client,
            tokens: await TokenService.create(config),
            logger: options.logger,
        });
        const url = await app.listen({ host: config.server.host, port: config.server.port });
        let closed = false;
        const close = async () => {
            if (closed) return;
            closed = true;
            try {
                await app?.close();
            } finally {
                client.close();
            }
        };
        return {
            url,
            close,
            async [Symbol.asyncDispose]() {
                await close();
            },
        };
    } catch (error) {
        await app?.close().catch(() => undefined);
        client.close();
        throw error;
    }
}
