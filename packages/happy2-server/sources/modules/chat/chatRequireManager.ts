import { type ChatAccess } from "./chatAccess.js";
import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, chatMembers, chats, userChatPreferences, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { asChat } from "./impl/asChat.js";

import { chatSelection } from "./impl/chatSelection.js";

import { chatGetAccess } from "./chatGetAccess.js";
/**
 * Requires owner or administrator membership for a live chat, while allowing an active server administrator to manage it without membership.
 * The server-admin fallback loads the same chat projection but preserves not-found non-disclosure for every unauthorized caller.
 */
export async function chatRequireManager(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<ChatAccess> {
    let access = await chatGetAccess(executor, userId, chatId, true);
    if (!access) {
        const [admin] = await executor
            .select({
                id: users.id,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, userId),
                    eq(users.role, "admin"),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            )
            .limit(1);
        if (admin) {
            const [row] = await executor
                .select(chatSelection)
                .from(chats)
                .leftJoin(
                    chatMembers,
                    and(
                        eq(chatMembers.chatId, chats.id),
                        eq(chatMembers.userId, userId),
                        isNull(chatMembers.leftAt),
                    ),
                )
                .leftJoin(
                    userChatPreferences,
                    and(
                        eq(userChatPreferences.chatId, chats.id),
                        eq(userChatPreferences.userId, userId),
                    ),
                )
                .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
                .limit(1);
            if (row)
                access = {
                    ...asChat(row),
                    isServerAdmin: true,
                };
        }
    }
    if (!access) throw new CollaborationError("not_found", "Chat was not found");
    if (
        !access.isServerAdmin &&
        access.membershipRole !== "owner" &&
        access.membershipRole !== "admin"
    )
        throw new CollaborationError("forbidden", "Channel manager permission is required");
    return access;
}
