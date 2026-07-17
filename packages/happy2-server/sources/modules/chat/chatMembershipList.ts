import { type ChatRole, type UserSummary } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { accounts, chatMembers, users } from "../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";
import { asUser } from "./asUser.js";

import { text } from "./text.js";
import { userSelection } from "./userSelection.js";

import { chatMemberList } from "./chatMemberList.js";
/**
 * Returns active chat members with their channel role and join timestamp after applying the same visibility rules as the member directory.
 * Ordering by join timestamp and user identifier provides stable role-management output without including departed or ineligible identities.
 */
export async function chatMembershipList(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<
    Array<{
        user: UserSummary;
        role: ChatRole;
        joinedAt: string;
    }>
> {
    await chatMemberList(executor, userId, chatId);
    const rows = await executor
        .select({
            ...userSelection,
            chat_role: chatMembers.role,
            joined_at: chatMembers.joinedAt,
        })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .leftJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(chatMembers.chatId, chatId),
                isNull(chatMembers.leftAt),
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
        .orderBy(chatMembers.joinedAt, chatMembers.userId);
    return rows.map((row) => ({
        user: asUser(row),
        role: text(row.chat_role) as ChatRole,
        joinedAt: text(row.joined_at),
    }));
}
