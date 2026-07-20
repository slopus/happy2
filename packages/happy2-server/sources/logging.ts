import { dirname, join } from "node:path";
import type { FastifyLoggerOptions } from "fastify";
import pino from "pino";

export interface ServerLogging {
    logger: boolean | FastifyLoggerOptions;
    close(): void;
}

/** Resolves the dedicated error log beside the managed server configuration. */
export function serverErrorLogPath(managedConfigPath: string): string {
    return join(dirname(managedConfigPath), "server-error.log");
}

/** Creates server logging that preserves stdout while duplicating error-level events to a durable file. */
export function serverLoggingCreate(enabled: boolean, errorLogPath?: string): ServerLogging {
    if (!enabled || !errorLogPath) return { logger: enabled, close() {} };

    const errorDestination = pino.destination({ dest: errorLogPath, mkdir: true, sync: true });
    const stream = pino.multistream([
        { level: "info", stream: process.stdout },
        { level: "error", stream: errorDestination },
    ]);
    let closed = false;
    return {
        logger: { stream },
        close() {
            if (closed) return;
            closed = true;
            errorDestination.flushSync();
            errorDestination.end();
        },
    };
}
