import { type ActiveSession, type RequestMetadata } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { accounts, authSessions } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

import { createId } from "@paralleldrive/cuid2";

import { recordSessionEvent } from "./impl/recordSessionEvent.js";

/**
 * Creates an authSessions authority row for an eligible account and records the proxy-aware request metadata for its issuance.
 * Persisting the session and telemetry together makes later revocation authoritative and preserves where the credential originated.
 */
export async function sessionCreate(
    executor: DrizzleExecutor,
    accountId: string,
    expiresAt: Date,
    metadata: RequestMetadata,
): Promise<ActiveSession> {
    return withTransaction(executor, async (tx) => {
        const [allowed] = await tx
            .select({
                id: accounts.id,
            })
            .from(accounts)
            .where(
                and(
                    eq(accounts.id, accountId),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        if (!allowed) throw new Error("Account is not allowed to create sessions");
        const session = {
            id: createId(),
            accountId,
            expiresAt,
        };
        await tx.insert(authSessions).values({
            id: session.id,
            accountId,
            expiresAt: expiresAt.toISOString(),
        });
        await recordSessionEvent(tx, session.id, "issued", metadata);
        return session;
    });
}
