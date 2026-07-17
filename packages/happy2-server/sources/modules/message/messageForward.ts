import { type ChatAccess } from "../chat/chatAccess.js";
import { CollaborationError, type MessageSummary, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "../chat/chatHint.js";
import { createId } from "@paralleldrive/cuid2";
import { earliestDate } from "./impl/earliestDate.js";
import { eq, sql } from "drizzle-orm";
import { messageAttachments, messageForwardMetadata, messages, serverSettings } from "../schema.js";

import { number } from "../chat/number.js";

import { text } from "../chat/text.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { findClientMutationDb } from "./impl/findClientMutationDb.js";
import { messageGetProjection } from "./messageGetProjection.js";
import { messageIndexForSearch } from "./messageIndexForSearch.js";
import { chatIsPostingRestricted } from "../chat/chatIsPostingRestricted.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { messageRecordDelivery } from "./messageRecordDelivery.js";
import { storeClientMutationDb } from "./impl/storeClientMutationDb.js";

/**
 * Copies an accessible source into a new target-chat messages row with messageForwardMetadata and authorized messageAttachments.
 * The target channel point, provenance, attachments, mentions, and search document commit together so a forwarded item is never only partly reproducible.
 */
export async function messageForward(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        messageId: string;
        targetChatIds: string[];
        clientMutationId?: string;
    },
): Promise<{
    messages: MessageSummary[];
    hints: MutationHint[];
}> {
    const targetChatIds = [...new Set(input.targetChatIds)];
    const scope = `message.forward:${input.messageId}`;
    return withTransaction(executor, async (tx) => {
        if (input.clientMutationId) {
            const previous = await findClientMutationDb(
                tx,
                input.actorUserId,
                scope,
                input.clientMutationId,
            );
            if (previous) {
                const ids = Array.isArray(previous.messageIds)
                    ? previous.messageIds.map((id) => text(id))
                    : [];
                const points = Array.isArray(previous.points)
                    ? (previous.points as Array<Record<string, unknown>>)
                    : [];
                const messages: MessageSummary[] = [];
                for (const id of ids) {
                    const message = await messageGetProjection(tx, input.actorUserId, id);
                    if (message) messages.push(message);
                }
                return {
                    messages,
                    hints: points.map((point) =>
                        chatHint(number(previous.sequence), text(point.chatId), number(point.pts)),
                    ),
                };
            }
        }
        const source = await messageGetProjection(tx, input.actorUserId, input.messageId);
        if (!source || source.deletedAt)
            throw new CollaborationError("not_found", "Source message was not found");
        const destinations = new Map<string, ChatAccess>();
        for (const chatId of targetChatIds) {
            const destination = await chatGetAccess(tx, input.actorUserId, chatId, true);
            if (!destination)
                throw new CollaborationError("not_found", "Destination chat was not found");
            if (destination.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await chatIsPostingRestricted(tx, input.actorUserId, chatId))
                throw new CollaborationError("forbidden", "Posting is restricted by moderation");
            destinations.set(chatId, destination);
        }
        const sequence = await syncSequenceNext(tx);
        const forwardedMessages: MessageSummary[] = [];
        const hints: MutationHint[] = [];
        const messageIds: string[] = [];
        const points: Array<{
            chatId: string;
            pts: number;
        }> = [];
        for (const chatId of targetChatIds) {
            const destination = destinations.get(chatId)!;
            let retentionSeconds = destination.retentionSeconds;
            if (destination.retentionMode === "inherit") {
                const [defaults] = await tx
                    .select({
                        mode: serverSettings.defaultRetentionMode,
                        seconds: serverSettings.defaultRetentionSeconds,
                    })
                    .from(serverSettings)
                    .where(eq(serverSettings.id, 1));
                retentionSeconds =
                    defaults?.mode === "duration" ? (defaults.seconds ?? undefined) : undefined;
            } else if (destination.retentionMode === "forever") retentionSeconds = undefined;
            const expiryMode = destination.defaultExpiryMode;
            const selfDestructSeconds = destination.defaultSelfDestructSeconds;
            const selfDestructAt =
                expiryMode === "after_send" && selfDestructSeconds
                    ? new Date(Date.now() + selfDestructSeconds * 1_000).toISOString()
                    : null;
            const retentionAt = retentionSeconds
                ? new Date(Date.now() + retentionSeconds * 1_000).toISOString()
                : null;
            const expiresAt = earliestDate(selfDestructAt, retentionAt);
            const id = createId();
            const mutation = await chatAdvanceWithSequence(
                tx,
                sequence,
                input.actorUserId,
                chatId,
                "message.forwarded",
                id,
                undefined,
                true,
            );
            if (mutation.messageSequence === undefined)
                throw new Error("Message sequence was not allocated");
            await tx.insert(messages).values({
                id,
                chatId,
                sequence: mutation.messageSequence,
                changePts: mutation.pts,
                senderUserId: input.actorUserId,
                kind: "user",
                text: source.text,
                forwardedFromMessageId: source.id,
                expiresAt,
                expiryMode,
                selfDestructSeconds,
                afterReadScope: destination.defaultAfterReadScope,
                publishedAt: sql`CURRENT_TIMESTAMP`,
            });
            await messageIndexForSearch(tx, id, chatId, source.text, 1);
            await tx.insert(messageForwardMetadata).values({
                messageId: id,
                sourceMessageId: source.id,
                sourceChatId: source.chatId,
                sourceSenderUserId: source.sender?.id,
                sourceCreatedAt: source.createdAt,
                sourceTextSnapshot: source.text,
                forwardedByUserId: input.actorUserId,
            });
            if (source.attachments.length)
                await tx.insert(messageAttachments).values(
                    source.attachments.map((file, position) => ({
                        messageId: id,
                        fileId: file.id,
                        position,
                    })),
                );
            await messageRecordDelivery(tx, {
                actorUserId: input.actorUserId,
                chat: destination,
                messageId: id,
                messageSequence: mutation.messageSequence,
                mentionedUserIds: [],
                syncSequence: sequence,
            });
            const message = await messageGetProjection(tx, input.actorUserId, id);
            if (!message) throw new Error("Forwarded message is not readable");
            forwardedMessages.push(message);
            messageIds.push(id);
            points.push({
                chatId,
                pts: mutation.pts,
            });
            hints.push(chatHint(sequence, chatId, mutation.pts));
        }
        if (input.clientMutationId)
            await storeClientMutationDb(tx, input.actorUserId, scope, input.clientMutationId, {
                messageIds,
                sequence,
                points,
            });
        return {
            messages: forwardedMessages,
            hints,
        };
    });
}
