import { createId } from "@paralleldrive/cuid2";
import { createClient, type Client, type InArgs, type Row, type Transaction } from "@libsql/client";
import type {
    IdempotencyAcquireInput,
    IdempotencyAcquireResult,
    IdempotencyCompleteInput,
    IdempotencyStore,
} from "./idempotency.js";

type Executor = Pick<Client, "execute"> | Pick<Transaction, "execute">;

/** Shared SQLite/libSQL adapter; leases and fencing remain authoritative across processes. */
export class DatabaseIdempotencyStore<TResponse> implements IdempotencyStore<TResponse> {
    private readonly client: Client;
    private readonly ownsClient: boolean;

    constructor(source: string | Client, authToken?: string) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string" ? createClient({ url: source, authToken }) : source;
    }

    async acquire(input: IdempotencyAcquireInput): Promise<IdempotencyAcquireResult<TResponse>> {
        return this.write(async (tx) => {
            let row = await this.find(tx, input.storageKey);
            if (row && Date.parse(text(row.expires_at)) <= input.now) {
                await tx.execute({
                    sql: `DELETE FROM idempotency_keys WHERE id = ?`,
                    args: [row.id],
                });
                row = undefined;
            }
            if (row) {
                if (row.request_hash !== input.fingerprint) return { kind: "conflict" };
                if (row.status === "completed")
                    return {
                        kind: "replay",
                        response: JSON.parse(text(row.response_json)) as TResponse,
                    };
                const lockedUntil = optionalText(row.locked_until);
                if (lockedUntil && Date.parse(lockedUntil) > input.now)
                    return { kind: "in_progress", retryAt: Date.parse(lockedUntil) };
                await tx.execute({
                    sql: `UPDATE idempotency_keys
                             SET status = 'in_progress', request_hash = ?, response_status = NULL,
                                 response_json = ?, locked_until = ?, expires_at = ?,
                                 updated_at = CURRENT_TIMESTAMP
                           WHERE id = ?`,
                    args: [
                        input.fingerprint,
                        JSON.stringify({ leaseToken: input.leaseToken }),
                        iso(input.leaseExpiresAt),
                        iso(input.recordExpiresAt),
                        row.id,
                    ],
                });
                return { kind: "acquired" };
            }
            await tx.execute({
                sql: `INSERT INTO idempotency_keys
                        (id, principal_type, principal_id, scope, idempotency_key, request_hash,
                         status, response_json, locked_until, expires_at)
                      VALUES (?, 'system', 'http', 'request', ?, ?, 'in_progress', ?, ?, ?)`,
                args: [
                    createId(),
                    input.storageKey,
                    input.fingerprint,
                    JSON.stringify({ leaseToken: input.leaseToken }),
                    iso(input.leaseExpiresAt),
                    iso(input.recordExpiresAt),
                ],
            });
            return { kind: "acquired" };
        });
    }

    async complete(input: IdempotencyCompleteInput<TResponse>): Promise<boolean> {
        return this.write(async (tx) => {
            const row = await this.find(tx, input.storageKey);
            if (!row || row.status !== "in_progress") return false;
            if (leaseToken(row.response_json) !== input.leaseToken) return false;
            const result = await tx.execute({
                sql: `UPDATE idempotency_keys
                         SET status = 'completed', response_json = ?, locked_until = NULL,
                             expires_at = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND status = 'in_progress'`,
                args: [JSON.stringify(input.response), iso(input.recordExpiresAt), row.id],
            });
            return result.rowsAffected === 1;
        });
    }

    async release(storageKey: string, token: string): Promise<boolean> {
        return this.write(async (tx) => {
            const row = await this.find(tx, storageKey);
            if (!row || row.status !== "in_progress" || leaseToken(row.response_json) !== token)
                return false;
            const result = await tx.execute({
                sql: `DELETE FROM idempotency_keys WHERE id = ? AND status = 'in_progress'`,
                args: [row.id],
            });
            return result.rowsAffected === 1;
        });
    }

    async purgeExpired(now: number, limit = 1_000): Promise<number> {
        const result = await this.client.execute({
            sql: `DELETE FROM idempotency_keys WHERE id IN (
                    SELECT id FROM idempotency_keys WHERE datetime(expires_at) <= datetime(?)
                     ORDER BY expires_at, id LIMIT ?
                  )`,
            args: [iso(now), limit],
        });
        return result.rowsAffected;
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }

    private find(executor: Executor, storageKey: string): Promise<Row | undefined> {
        return one(
            executor,
            `SELECT id, request_hash, status, response_json, locked_until, expires_at
               FROM idempotency_keys
              WHERE principal_type = 'system' AND principal_id = 'http'
                AND scope = 'request' AND idempotency_key = ?`,
            [storageKey],
        );
    }

    private async write<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> {
        const tx = await this.client.transaction("write");
        try {
            const result = await operation(tx);
            await tx.commit();
            return result;
        } catch (error) {
            if (!tx.closed) await tx.rollback();
            throw error;
        } finally {
            tx.close();
        }
    }
}

async function one(executor: Executor, sql: string, args: InArgs): Promise<Row | undefined> {
    return (await executor.execute({ sql, args })).rows[0];
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

function iso(value: number): string {
    return new Date(value).toISOString();
}

function text(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    throw new Error("Expected database text value");
}

function optionalText(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : text(value);
}
