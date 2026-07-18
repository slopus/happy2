import { and, eq, sql } from "drizzle-orm";
import { userRequireActive } from "../chat/userRequireActive.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { users } from "../schema.js";

/**
 * Records a monotonic explicit presence heartbeat for an active human in users.lastSeenAt.
 * The caller supplies the server-observed timestamp carried by the ephemeral lease; deferring the
 * syncEvents boundary until offline keeps exact crash-safe state without global heartbeat fanout.
 */
export async function userLastSeenTouch(
    executor: DrizzleExecutor,
    userId: string,
    lastSeenAt: string,
): Promise<void> {
    await withTransaction(executor, async (tx) => {
        await userRequireActive(tx, userId);
        const updated = await tx
            .update(users)
            .set({
                lastSeenAt: sql`CASE
                    WHEN ${users.lastSeenAt} IS NULL OR ${users.lastSeenAt} < ${lastSeenAt}
                    THEN ${lastSeenAt}
                    ELSE ${users.lastSeenAt}
                END`,
            })
            .where(and(eq(users.id, userId), eq(users.kind, "human")))
            .returning({ id: users.id });
        if (updated.length !== 1) throw new Error("Human last seen was not saved");
    });
}
