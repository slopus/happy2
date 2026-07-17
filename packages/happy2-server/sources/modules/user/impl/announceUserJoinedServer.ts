import { type DrizzleTransaction } from "../../drizzle.js";
import { channelAdvance } from "../../chat/channelAdvance.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { chats, messages } from "../../schema.js";
import { createId } from "@paralleldrive/cuid2";

/**
 * Inserts an automated messages announcement after reserving its main-channel point and message sequence.
 * Requiring the profile transaction keeps the announcement and channel counters from committing when creation of the joined user rolls back.
 */
export async function announceUserJoinedServer(
    executor: DrizzleTransaction,
    user: {
        id: string;
        username: string;
    },
    happyUserId: string,
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
        actorUserId: happyUserId,
        incrementMessageSequence: true,
    });
    await executor.insert(messages).values({
        id: messageId,
        chatId: main.id,
        sequence: mutation.messageSequence!,
        changePts: mutation.pts,
        senderUserId: happyUserId,
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
