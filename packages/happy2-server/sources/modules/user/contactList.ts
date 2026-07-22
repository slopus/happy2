import { type DrizzleExecutor } from "../drizzle.js";
import { type UserSummary } from "../chat/types.js";
import { users } from "../schema.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { asUser } from "../chat/asUser.js";

import { userSelection } from "../chat/userSelection.js";

/**
 * Lists undeleted identities whose authoritative users lifecycle state is active.
 * Centralizing that eligibility rule keeps disabled, banned, and deleted people out of every contact surface.
 */
export async function contactList(executor: DrizzleExecutor): Promise<UserSummary[]> {
    const result = await executor
        .select({
            ...userSelection,
            last_seen_at: users.lastSeenAt,
        })
        .from(users)
        .where(and(isNull(users.deletedAt), eq(users.active, 1)))
        .orderBy(sql`lower(${users.firstName})`, sql`lower(${users.lastName})`, users.id);
    return result.map(asUser);
}
