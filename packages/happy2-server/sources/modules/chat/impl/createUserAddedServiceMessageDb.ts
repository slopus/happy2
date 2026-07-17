import { type ChatMutation } from "./chatMutation.js";
import { type DrizzleTransaction } from "../../drizzle.js";
import { chats, messages, users } from "../../schema.js";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "../chatAdvanceWithSequence.js";
import { requireHappyServiceAgentDb } from "./requireHappyServiceAgentDb.js";
/**
 * Inserts the automated messages history entry that identifies who added a member and which user joined the chat.
 * Using the membership transaction keeps the explanatory service message from surviving if the underlying access grant rolls back.
 */
export async function createUserAddedServiceMessageDb(
    tx: DrizzleTransaction,
    input: {
        sequence: number;
        chatId: string;
        userId: string;
        username?: string;
        happyUserId?: string;
    },
): Promise<
    ChatMutation & {
        messageSequence?: number;
    }
> {
    const happyUserId = input.happyUserId ?? (await requireHappyServiceAgentDb(tx));
    const username =
        input.username ??
        (
            await tx
                .select({
                    username: users.username,
                })
                .from(users)
                .where(eq(users.id, input.userId))
                .limit(1)
        )[0]?.username;
    const [channel] = await tx
        .select({
            name: chats.name,
            slug: chats.slug,
        })
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .limit(1);
    if (!username || !channel) throw new Error("Service message context is missing");
    const messageId = createId();
    const mutation = await chatAdvanceWithSequence(
        tx,
        input.sequence,
        happyUserId,
        input.chatId,
        "message.serviceCreated",
        messageId,
        undefined,
        true,
    );
    if (mutation.messageSequence === undefined)
        throw new Error("Service message sequence was not allocated");
    await tx.insert(messages).values({
        id: messageId,
        chatId: input.chatId,
        sequence: mutation.messageSequence,
        changePts: mutation.pts,
        senderUserId: happyUserId,
        kind: "automated",
        text: `@${username} joined #${channel.slug ?? channel.name ?? "channel"}`,
        contentJson: JSON.stringify({
            service: {
                type: "user_added",
                userId: input.userId,
            },
        }),
        publishedAt: sql`CURRENT_TIMESTAMP`,
    });
    return mutation;
}
