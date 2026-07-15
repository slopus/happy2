import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { createClient, type Client } from "@libsql/client";
import { createDatabase, retrySqliteBusy, type DrizzleExecutor } from "../drizzle.js";
import { idempotencyKeys } from "../schema.js";
import type {
    IdempotencyAcquireInput,
    IdempotencyAcquireResult,
    IdempotencyCompleteInput,
    IdempotencyStore,
} from "./idempotency.js";

const requestKey = (storageKey: string) =>
    and(
        eq(idempotencyKeys.principalType, "system"),
        eq(idempotencyKeys.principalId, "http"),
        eq(idempotencyKeys.scope, "request"),
        eq(idempotencyKeys.idempotencyKey, storageKey),
    );

/** Shared SQLite/libSQL adapter; leases and fencing remain authoritative across processes. */
export class DatabaseIdempotencyStore<TResponse> implements IdempotencyStore<TResponse> {
    private readonly client: Client;
    private readonly db;
    private readonly ownsClient: boolean;

    constructor(source: string | Client, authToken?: string) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string" ? createClient({ url: source, authToken }) : source;
        this.db = createDatabase(this.client);
    }

    async acquire(input: IdempotencyAcquireInput): Promise<IdempotencyAcquireResult<TResponse>> {
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                let row: KeyRow | undefined = await find(tx, input.storageKey);
                if (row && Date.parse(row.expiresAt) <= input.now) {
                    await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.id, row.id));
                    row = undefined;
                }
                if (row) {
                    if (row.requestHash !== input.fingerprint) return { kind: "conflict" };
                    if (row.status === "completed")
                        return {
                            kind: "replay",
                            response: JSON.parse(requiredJson(row.responseJson)) as TResponse,
                        };
                    if (row.lockedUntil && Date.parse(row.lockedUntil) > input.now)
                        return { kind: "in_progress", retryAt: Date.parse(row.lockedUntil) };
                    await tx
                        .update(idempotencyKeys)
                        .set({
                            status: "in_progress",
                            requestHash: input.fingerprint,
                            responseStatus: null,
                            responseJson: JSON.stringify({ leaseToken: input.leaseToken }),
                            lockedUntil: iso(input.leaseExpiresAt),
                            expiresAt: iso(input.recordExpiresAt),
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        })
                        .where(eq(idempotencyKeys.id, row.id));
                    return { kind: "acquired" };
                }
                await tx.insert(idempotencyKeys).values({
                    id: createId(),
                    principalType: "system",
                    principalId: "http",
                    scope: "request",
                    idempotencyKey: input.storageKey,
                    requestHash: input.fingerprint,
                    status: "in_progress",
                    responseJson: JSON.stringify({ leaseToken: input.leaseToken }),
                    lockedUntil: iso(input.leaseExpiresAt),
                    expiresAt: iso(input.recordExpiresAt),
                });
                return { kind: "acquired" };
            }),
        );
    }

    async complete(input: IdempotencyCompleteInput<TResponse>): Promise<boolean> {
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                const row = await find(tx, input.storageKey);
                if (!row || row.status !== "in_progress") return false;
                if (leaseToken(row.responseJson) !== input.leaseToken) return false;
                const changed = await tx
                    .update(idempotencyKeys)
                    .set({
                        status: "completed",
                        responseJson: JSON.stringify(input.response),
                        lockedUntil: null,
                        expiresAt: iso(input.recordExpiresAt),
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(
                        and(
                            eq(idempotencyKeys.id, row.id),
                            eq(idempotencyKeys.status, "in_progress"),
                        ),
                    )
                    .returning({ id: idempotencyKeys.id });
                return changed.length === 1;
            }),
        );
    }

    async release(storageKey: string, token: string): Promise<boolean> {
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                const row = await find(tx, storageKey);
                if (!row || row.status !== "in_progress" || leaseToken(row.responseJson) !== token)
                    return false;
                const changed = await tx
                    .delete(idempotencyKeys)
                    .where(
                        and(
                            eq(idempotencyKeys.id, row.id),
                            eq(idempotencyKeys.status, "in_progress"),
                        ),
                    )
                    .returning({ id: idempotencyKeys.id });
                return changed.length === 1;
            }),
        );
    }

    async purgeExpired(now: number, limit = 1_000): Promise<number> {
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                const due = await tx
                    .select({ id: idempotencyKeys.id })
                    .from(idempotencyKeys)
                    .where(lte(idempotencyKeys.expiresAt, iso(now)))
                    .orderBy(asc(idempotencyKeys.expiresAt), asc(idempotencyKeys.id))
                    .limit(limit);
                if (due.length === 0) return 0;
                return (
                    await tx
                        .delete(idempotencyKeys)
                        .where(
                            inArray(
                                idempotencyKeys.id,
                                due.map(({ id }) => id),
                            ),
                        )
                        .returning({ id: idempotencyKeys.id })
                ).length;
            }),
        );
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }
}

type KeyRow = typeof idempotencyKeys.$inferSelect;

async function find(executor: DrizzleExecutor, storageKey: string): Promise<KeyRow | undefined> {
    const rows = await executor.select().from(idempotencyKeys).where(requestKey(storageKey));
    return rows[0];
}

function leaseToken(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
        const parsed = JSON.parse(value) as { leaseToken?: unknown };
        return typeof parsed.leaseToken === "string" ? parsed.leaseToken : undefined;
    } catch {
        return undefined;
    }
}

function requiredJson(value: string | null): string {
    if (value === null) throw new Error("Idempotency response is missing");
    return value;
}

function iso(value: number): string {
    return new Date(value).toISOString();
}
