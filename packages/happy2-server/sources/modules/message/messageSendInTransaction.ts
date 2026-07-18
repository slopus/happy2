import { CollaborationError, type MessageSummary, type MutationHint } from "../chat/types.js";
import { type DrizzleTransaction } from "../drizzle.js";

import { type SendMessageDbInput } from "./impl/sendMessageDbInput.js";
import {
    agentRigBindings,
    agentTurns,
    botIdentities,
    chatMembers,
    messageAttachments,
    messageAgentAudiences,
    messages,
    serverSettings,
    userChatPreferences,
    users,
} from "../schema.js";

import { and, eq, isNull, sql } from "drizzle-orm";

import { chatHint } from "../chat/chatHint.js";

import { createId } from "@paralleldrive/cuid2";
import { earliestDate } from "./impl/earliestDate.js";

import { number } from "../chat/number.js";

import { text } from "../chat/text.js";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { fileCanAccessWith } from "../chat/fileCanAccessWith.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { findClientMutationDb } from "./impl/findClientMutationDb.js";
import { messageGetProjection } from "./messageGetProjection.js";
import { messageIndexForSearch } from "./messageIndexForSearch.js";
import { chatIsPostingRestricted } from "../chat/chatIsPostingRestricted.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { messageRecordDelivery } from "./messageRecordDelivery.js";
import { messageReplaceMentions } from "./messageReplaceMentions.js";
import { chatRequireManager } from "../chat/chatRequireManager.js";
import { messageRequireInChat } from "../chat/messageRequireInChat.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { storeClientMutationDb } from "./impl/storeClientMutationDb.js";
import { agentTurnPromptBuild } from "../agent/agentTurnPromptBuild.js";
/**
 * Publishes messages with authorized messageAttachments, search and mention projections, delivery records, and any requested agentTurns work.
 * The caller's transaction makes the channel point the boundary for every consequence of sending, including files, notifications, audit evidence, and agent execution.
 */
export async function messageSendInTransaction(
    tx: DrizzleTransaction,
    input: SendMessageDbInput,
): Promise<{
    message: MessageSummary;
    hint: MutationHint;
}> {
    const scope = `message.send:${input.chatId}`;
    return (async () => {
        if (input.kind === "automated" && !input.agentSessionId) {
            await userRequireServerAdmin(tx, input.actorUserId);
            if (
                input.senderBotId &&
                !(
                    await tx
                        .select({
                            id: botIdentities.id,
                        })
                        .from(botIdentities)
                        .where(
                            and(
                                eq(botIdentities.id, input.senderBotId),
                                eq(botIdentities.active, 1),
                                isNull(botIdentities.deletedAt),
                            ),
                        )
                        .limit(1)
                )[0]
            )
                throw new CollaborationError("not_found", "Bot identity was not found");
        }
        if (input.clientMutationId) {
            const previous = await findClientMutationDb(
                tx,
                input.actorUserId,
                scope,
                input.clientMutationId,
            );
            if (previous) {
                const message = await messageGetProjection(
                    tx,
                    input.actorUserId,
                    text(previous.messageId),
                );
                if (!message) throw new Error("Idempotent message result is missing");
                return {
                    message,
                    hint: chatHint(number(previous.sequence), input.chatId, number(previous.pts)),
                };
            }
        }
        const access =
            input.kind === "automated" && !input.agentSessionId
                ? await chatRequireManager(tx, input.actorUserId, input.chatId)
                : await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        const audience = input.audience ?? "people";
        const requestedTurns = input.agentTurns ?? [];
        if (audience === "people" && requestedTurns.length)
            throw new CollaborationError(
                "invalid",
                "People-only messages cannot start agent turns",
            );
        if (audience === "agents" && !requestedTurns.length)
            throw new CollaborationError("invalid", "Agent-audience messages require an agent");
        if (input.kind === "automated" && requestedTurns.length)
            throw new CollaborationError("invalid", "Automated messages cannot start agent turns");
        if (access.kind === "dm" && requestedTurns.length && access.dmType !== "direct")
            throw new CollaborationError(
                "invalid",
                "Group direct messages cannot start agent turns",
            );
        for (const requestedTurn of requestedTurns) {
            const [binding] = await tx
                .select({ userId: agentRigBindings.userId })
                .from(agentRigBindings)
                .innerJoin(
                    chatMembers,
                    and(
                        eq(chatMembers.chatId, agentRigBindings.chatId),
                        eq(chatMembers.userId, agentRigBindings.userId),
                    ),
                )
                .innerJoin(users, eq(users.id, agentRigBindings.userId))
                .where(
                    and(
                        eq(agentRigBindings.chatId, input.chatId),
                        eq(agentRigBindings.userId, requestedTurn.agentUserId),
                        eq(agentRigBindings.sessionId, requestedTurn.sessionId),
                        isNull(chatMembers.leftAt),
                        isNull(users.deletedAt),
                        eq(users.kind, "agent"),
                        isNull(users.systemRole),
                    ),
                )
                .limit(1);
            if (!binding)
                throw new CollaborationError("conflict", "Agent conversation is not ready");
        }
        let senderUserId = input.kind === "automated" ? undefined : input.actorUserId;
        if (input.agentSessionId) {
            const [agent] = await tx
                .select({
                    userId: agentRigBindings.userId,
                })
                .from(agentRigBindings)
                .where(
                    and(
                        eq(agentRigBindings.chatId, input.chatId),
                        eq(agentRigBindings.sessionId, input.agentSessionId),
                    ),
                )
                .limit(1);
            if (!agent)
                throw new CollaborationError("forbidden", "Agent session does not own this chat");
            senderUserId = agent.userId;
        }
        if (access.archivedAt)
            throw new CollaborationError("forbidden", "Archived chats are read-only");
        if (await chatIsPostingRestricted(tx, input.actorUserId, input.chatId))
            throw new CollaborationError("forbidden", "Posting is restricted by moderation");
        const expiryMode =
            input.expiryMode ??
            (input.expiresAt
                ? "after_send"
                : access.defaultExpiryMode === "none"
                  ? "none"
                  : access.defaultExpiryMode);
        const selfDestructSeconds = input.selfDestructSeconds ?? access.defaultSelfDestructSeconds;
        if (expiryMode !== "none" && !selfDestructSeconds && !input.expiresAt)
            throw new CollaborationError("invalid", "Self-destructing messages require a duration");
        const selfDestructAt =
            expiryMode === "after_send"
                ? (input.expiresAt ??
                  new Date(Date.now() + selfDestructSeconds! * 1_000).toISOString())
                : null;
        let retentionSeconds = access.retentionSeconds;
        if (access.retentionMode === "inherit") {
            const [defaults] = await tx
                .select({
                    defaultRetentionMode: serverSettings.defaultRetentionMode,
                    defaultRetentionSeconds: serverSettings.defaultRetentionSeconds,
                })
                .from(serverSettings)
                .where(eq(serverSettings.id, 1));
            retentionSeconds =
                defaults?.defaultRetentionMode === "duration"
                    ? (defaults.defaultRetentionSeconds ?? undefined)
                    : undefined;
        } else if (access.retentionMode === "forever") retentionSeconds = undefined;
        const retentionAt = retentionSeconds
            ? new Date(Date.now() + retentionSeconds * 1_000).toISOString()
            : null;
        const expiresAt = earliestDate(selfDestructAt, retentionAt);
        if (input.quotedMessageId)
            await messageRequireInChat(tx, input.quotedMessageId, input.chatId);
        if (input.forwardedFromMessageId) {
            const source = await messageGetProjection(
                tx,
                input.actorUserId,
                input.forwardedFromMessageId,
            );
            if (!source || source.deletedAt)
                throw new CollaborationError("not_found", "Source message was not found");
        }
        const fileIds = [...new Set(input.attachmentFileIds ?? [])];
        for (const fileId of fileIds)
            if (!(await fileCanAccessWith(tx, input.actorUserId, fileId)))
                throw new CollaborationError("not_found", "Attachment file was not found");
        const id = createId();
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "message.created",
            id,
            undefined,
            true,
        );
        if (mutation.messageSequence === undefined)
            throw new Error("Message sequence was not allocated");
        await tx.insert(messages).values({
            id,
            chatId: input.chatId,
            sequence: mutation.messageSequence,
            changePts: mutation.pts,
            senderUserId,
            kind: input.kind ?? "user",
            text: input.text,
            quotedMessageId: input.quotedMessageId,
            forwardedFromMessageId: input.forwardedFromMessageId,
            expiresAt,
            expiryMode,
            selfDestructSeconds,
            afterReadScope: input.afterReadScope ?? access.defaultAfterReadScope,
            senderBotId: input.senderBotId,
            publishedAt: input.deferPublication ? null : sql`CURRENT_TIMESTAMP`,
            audience,
        });
        if (requestedTurns.length)
            await tx.insert(messageAgentAudiences).values(
                requestedTurns.map(({ agentUserId }) => ({
                    messageId: id,
                    agentUserId,
                })),
            );
        const mentions = input.deferPublication
            ? {
                  notifyAll: false,
                  userIds: [],
              }
            : await messageReplaceMentions(tx, id, input.text);
        if (!input.deferPublication)
            await messageIndexForSearch(tx, id, input.chatId, input.text, 1);
        if (fileIds.length)
            await tx.insert(messageAttachments).values(
                fileIds.map((fileId, position) => ({
                    messageId: id,
                    fileId,
                    position,
                })),
            );
        if (requestedTurns.length) {
            const turns = [];
            for (const requestedTurn of requestedTurns)
                turns.push({
                    userMessageId: id,
                    agentUserId: requestedTurn.agentUserId,
                    chatId: input.chatId,
                    sessionId: requestedTurn.sessionId,
                    prompt:
                        access.kind === "dm"
                            ? input.text
                            : await agentTurnPromptBuild(tx, {
                                  agentUserId: requestedTurn.agentUserId,
                                  chatId: input.chatId,
                                  currentSequence: mutation.messageSequence,
                              }),
                });
            await tx.insert(agentTurns).values(turns);
        }
        if (access.parentMessageId) {
            await tx
                .insert(userChatPreferences)
                .values({
                    chatId: input.chatId,
                    userId: input.actorUserId,
                    followed: 1,
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [userChatPreferences.userId, userChatPreferences.chatId],
                    set: {
                        followed: 1,
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
        }
        if (!input.deferPublication)
            await messageRecordDelivery(tx, {
                actorUserId: input.actorUserId,
                chat: access,
                messageId: id,
                messageSequence: mutation.messageSequence,
                mentionedUserIds: mentions.userIds,
                mentionAll: mentions.notifyAll,
                syncSequence: sequence,
                senderUserId,
            });
        if (input.clientMutationId)
            await storeClientMutationDb(tx, input.actorUserId, scope, input.clientMutationId, {
                messageId: id,
                sequence,
                pts: mutation.pts,
            });
        const message = await messageGetProjection(tx, input.actorUserId, id);
        if (!message) throw new Error("Created message is not readable");
        if (input.kind === "automated")
            await chatAppendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "message.automated_sent",
                targetType: "message",
                targetId: id,
                chatId: input.chatId,
                after: {
                    botId: input.senderBotId,
                },
            });
        return {
            message,
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    })();
}
