import type { Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

export type DrizzleDatabase = LibSQLDatabase<typeof schema>;
export type DrizzleTransaction = Parameters<Parameters<DrizzleDatabase["transaction"]>[0]>[0];
export type DrizzleExecutor = DrizzleDatabase | DrizzleTransaction;

export function createDatabase(client: Client): DrizzleDatabase {
    return drizzle(client, { schema });
}

const SQLITE_BUSY_RETRY_DELAYS_MS = [5, 10, 20, 40, 80, 160, 250, 400] as const;
const activeTransactions = new WeakSet<object>();

/** Retries a complete, rollback-safe SQLite operation without blocking the event loop. */
export async function retrySqliteBusy<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            const delay = SQLITE_BUSY_RETRY_DELAYS_MS[attempt];
            if (delay === undefined || !isSqliteBusy(error)) throw error;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

/** Reuses an outer transaction or opens one retryable top-level SQLite transaction. */
export function withTransaction<T>(
    executor: DrizzleExecutor,
    operation: (tx: DrizzleTransaction) => Promise<T>,
): Promise<T> {
    if (activeTransactions.has(executor)) return operation(executor as DrizzleTransaction);
    const database = executor as DrizzleDatabase;
    return retrySqliteBusy(() =>
        database.transaction(async (transaction) => {
            activeTransactions.add(transaction);
            try {
                return await operation(transaction);
            } finally {
                activeTransactions.delete(transaction);
            }
        }),
    );
}

function isSqliteBusy(error: unknown, seen = new Set<unknown>()): boolean {
    if (!error || typeof error !== "object" || seen.has(error)) return false;
    seen.add(error);
    const candidate = error as { cause?: unknown; code?: unknown; message?: unknown };
    return (
        candidate.code === "SQLITE_BUSY" ||
        (typeof candidate.message === "string" && candidate.message.includes("SQLITE_BUSY")) ||
        isSqliteBusy(candidate.cause, seen)
    );
}

export { schema };
