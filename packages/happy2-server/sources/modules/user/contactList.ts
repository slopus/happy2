import { type DrizzleExecutor } from "../drizzle.js";
import { type UserSummary } from "../chat/types.js";
import { accounts, users } from "../schema.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { asUser } from "../chat/asUser.js";

import { userSelection } from "../chat/userSelection.js";

/**
 * Lists undeleted agents and humans whose credential accounts remain active and usable.
 * Centralizing that eligibility rule keeps disabled, banned, and deleted people out of every contact surface.
 */
export async function contactList(executor: DrizzleExecutor): Promise<UserSummary[]> {
    const result = await executor
        .select(userSelection)
        .from(users)
        .leftJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                isNull(users.deletedAt),
                or(
                    eq(users.kind, "agent"),
                    and(
                        eq(users.kind, "human"),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                ),
            ),
        )
        .orderBy(sql`lower(${users.firstName})`, sql`lower(${users.lastName})`, users.id);
    return result.map(asUser);
}
