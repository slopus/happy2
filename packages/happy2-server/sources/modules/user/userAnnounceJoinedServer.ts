import { type DrizzleTransaction } from "../drizzle.js";
import { channelAdvance } from "../chat/channelAdvance.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { chats, messages } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

/**
 * Announces one newly activated human with an automated message sent by the configured default agent and advances the main chat history.
 * The caller's transaction keeps messages, syncEvents, channel counters, and profile or delayed default-agent initialization in one commit; this boundary owns the server-wide join event.
 */
export async function userAnnounceJoinedServer(
    executor: DrizzleTransaction,
    user: {
        id: string;
        username: string;
    },
    defaultAgentUserId: string,
    sequence: number,
): Promise<void> {
    const [main] = await executor
        .select({
            id: chats.id,
        })
        .from(chats)
        .where(and(eq(chats.isMain, 1), isNull(chats.deletedAt), isNull(chats.archivedAt)))
        .limit(1);
    if (!main) throw new Error("Main channel is not initialized");
    const messageId = createId();
    const mutation = await channelAdvance(executor, {
        sequence,
        chatId: main.id,
        kind: "message.serviceCreated",
        entityId: messageId,
        actorUserId: defaultAgentUserId,
        incrementMessageSequence: true,
    });
    await executor.insert(messages).values({
        id: messageId,
        chatId: main.id,
        sequence: mutation.messageSequence!,
        changePts: mutation.pts,
        senderUserId: defaultAgentUserId,
        kind: "automated",
        text: `@${user.username} joined the server`,
        contentJson: JSON.stringify({
            service: {
                type: "user_joined",
                userId: user.id,
            },
        }),
        publishedAt: sql`CURRENT_TIMESTAMP`,
    });
}
