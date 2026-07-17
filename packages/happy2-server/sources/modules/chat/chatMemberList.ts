import { CollaborationError, type UserSummary } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { accounts, chatMembers, users } from "../schema.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { asUser } from "./asUser.js";

import { userSelection } from "./userSelection.js";

import { chatGetAccess } from "./chatGetAccess.js";
import { chatRequireManager } from "./chatRequireManager.js";
/**
 * Lists active members of an accessible or administrator-managed chat, including live agents and eligible human accounts, ordered by display name.
 * Falling back to manager authority supports private-channel administration while preserving not-found behavior for ordinary outsiders.
 */
export async function chatMemberList(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<UserSummary[]> {
    let access = await chatGetAccess(executor, userId, chatId, false);
    if (!access) {
        try {
            access = await chatRequireManager(executor, userId, chatId);
        } catch (error) {
            if (!(error instanceof CollaborationError)) throw error;
            // Preserve private-channel non-disclosure for ordinary users.
        }
    }
    if (!access) throw new CollaborationError("not_found", "Chat was not found");
    const rows = await executor
        .select(userSelection)
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
        .orderBy(sql`lower(${users.firstName})`, sql`lower(${users.lastName})`, users.id);
    return rows.map(asUser);
}
