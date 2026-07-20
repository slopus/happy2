import type { RunningHappy2 } from "./backend.js";
import type { ServerConfig } from "./modules/config/type.js";
import { startBackendHappy2 } from "./backend.js";
import { startWebHappy2 } from "./web.js";

export type StandaloneHappy2 = RunningHappy2;

export interface StandaloneOptions {
    logger?: boolean;
    webRoot?: string;
}

/** Starts the private API server and the public web/static reverse proxy. */
export async function startStandaloneHappy2(
    config: ServerConfig,
    options: StandaloneOptions = {},
): Promise<StandaloneHappy2> {
    let backend: RunningHappy2 | undefined;
    let web: RunningHappy2 | undefined;
    try {
        const backendConfig: ServerConfig = {
            ...config,
            server: {
                ...config.server,
                host: "127.0.0.1",
                port: 0,
                // Only the gateway can reach this loopback listener. It supplies one
                // sanitized forwarding hop after applying the configured outer boundary.
                trustedProxyHops: 1,
            },
        };
        backend = await startBackendHappy2(backendConfig, { logger: options.logger });
        web = await startWebHappy2({
            backendUrl: backend.url,
            host: config.server.host,
            logger: options.logger ?? true,
            port: config.server.port,
            portSharingDomain: config.portSharing.publicDomain,
            trustedProxyHops: config.server.trustedProxyHops,
            webRoot: options.webRoot,
        });

        let closed = false;
        const close = async () => {
            if (closed) return;
            closed = true;
            try {
                await web?.close();
            } finally {
                await backend?.close();
            }
        };
        return {
            url: web.url,
            close,
            async [Symbol.asyncDispose]() {
                await close();
            },
        };
    } catch (error) {
        await web?.close().catch(() => undefined);
        await backend?.close().catch(() => undefined);
        throw error;
    }
}
