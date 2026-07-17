import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type RequestMetadata } from "./types.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { authSessions } from "../schema.js";

import { recordSessionEvent } from "./impl/recordSessionEvent.js";

/**
 * Marks the selected authSessions row revoked and records the request context that terminated its authority.
 * Keeping revocation durable makes every server instance reject the otherwise long-lived JWT immediately on its next authenticated request.
 */
export async function sessionRevoke(
    executor: DrizzleExecutor,
    id: string,
    metadata: RequestMetadata,
): Promise<void> {
    await withTransaction(executor, async (tx) => {
        const [session] = await tx
            .update(authSessions)
            .set({
                revokedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)))
            .returning({
                id: authSessions.id,
            });
        if (session) await recordSessionEvent(tx, id, "revoked", metadata);
    });
}
