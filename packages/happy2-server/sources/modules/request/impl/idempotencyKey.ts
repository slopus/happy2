import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../../drizzle.js";
import { idempotencyKeys } from "../../schema.js";

export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;

export function idempotencyRequestKey(storageKey: string) {
    return and(
        eq(idempotencyKeys.principalType, "system"),
        eq(idempotencyKeys.principalId, "http"),
        eq(idempotencyKeys.scope, "request"),
        eq(idempotencyKeys.idempotencyKey, storageKey),
    );
}

export async function idempotencyKeyFind(
    executor: DrizzleExecutor,
    storageKey: string,
): Promise<IdempotencyKeyRow | undefined> {
    const rows = await executor
        .select()
        .from(idempotencyKeys)
        .where(idempotencyRequestKey(storageKey));
    return rows[0];
}

export function idempotencyLeaseToken(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
        const parsed = JSON.parse(value) as { leaseToken?: unknown };
        return typeof parsed.leaseToken === "string" ? parsed.leaseToken : undefined;
    } catch {
        return undefined;
    }
}

export function idempotencyTimestamp(value: number): string {
    return new Date(value).toISOString();
}
