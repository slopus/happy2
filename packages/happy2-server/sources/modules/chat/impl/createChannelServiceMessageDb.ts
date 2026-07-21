import { type ChatMutation } from "./chatMutation.js";
import { type DrizzleTransaction } from "../../drizzle.js";
import { chats, messages, users } from "../../schema.js";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "../chatAdvanceWithSequence.js";
import { agentDefaultRequire } from "../../agent/agentDefaultRequire.js";

type ChannelServiceType =
    | "user_added"
    | "user_joined"
    | "user_left"
    | "user_kicked"
    | "channel_archived";

/**
 * Inserts one durable channel-lifecycle notice from the default agent in the same transaction as the action it explains.
 * The structured service payload identifies the affected user while the stored text remains useful to clients that only render ordinary automated messages.
 */
export async function createChannelServiceMessageDb(
    tx: DrizzleTransaction,
    input: {
        sequence: number;
        chatId: string;
        userId: string;
        type: ChannelServiceType;
        username?: string;
        defaultAgentUserId?: string;
    },
): Promise<
    ChatMutation & {
        messageSequence?: number;
    }
> {
    const defaultAgentUserId = input.defaultAgentUserId ?? (await agentDefaultRequire(tx));
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
    const channelName = channel.slug ?? channel.name ?? "channel";
    const text = channelServiceText(input.type, username, channelName);
    const messageId = createId();
    const mutation = await chatAdvanceWithSequence(
        tx,
        input.sequence,
        defaultAgentUserId,
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
        senderUserId: defaultAgentUserId,
        kind: "automated",
        text,
        contentJson: JSON.stringify({
            service: {
                type: input.type,
                userId: input.userId,
            },
        }),
        publishedAt: sql`CURRENT_TIMESTAMP`,
    });
    return mutation;
}

function channelServiceText(type: ChannelServiceType, username: string, channel: string): string {
    switch (type) {
        case "user_added":
        case "user_joined":
            return `@${username} joined #${channel}`;
        case "user_left":
            return `@${username} left #${channel}`;
        case "user_kicked":
            return `@${username} was removed from #${channel}`;
        case "channel_archived":
            return `@${username} archived #${channel}`;
    }
}
