import { type CallSummary, CollaborationError, type MutationHint } from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
    callEvents,
    callParticipants,
    calls,
    chatMembers,
    notifications,
    userNotificationPreferences,
} from "../schema.js";

import { chatHint } from "../chat/chatHint.js";

import { createId } from "@paralleldrive/cuid2";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { getCallProjectionDb } from "./impl/getCallProjectionDb.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { chatIsPostingRestricted } from "../chat/chatIsPostingRestricted.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Opens a calls session, enrolls its invited callParticipants, records join and invite callEvents, and creates recipient notifications.
 * The chat-authorized transaction prevents users from seeing an invitation to a call whose membership or event history failed to commit.
 */
export async function callCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        kind: "audio" | "video";
        invitedUserIds?: string[];
    },
): Promise<{
    call: CallSummary;
    hint: MutationHint;
    invitedUserIds: string[];
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        if (access.archivedAt)
            throw new CollaborationError("forbidden", "Archived chats are read-only");
        if (await chatIsPostingRestricted(tx, input.actorUserId, input.chatId))
            throw new CollaborationError("forbidden", "Calling is restricted by moderation");
        const members = await tx
            .select({
                userId: chatMembers.userId,
            })
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.chatId, input.chatId),
                    isNull(chatMembers.leftAt),
                    ne(chatMembers.userId, input.actorUserId),
                ),
            );
        const memberIds = new Set(members.map((row) => row.userId));
        const invitedUserIds = input.invitedUserIds
            ? [...new Set(input.invitedUserIds)]
            : [...memberIds];
        if (invitedUserIds.length === 0 || invitedUserIds.length > 50)
            throw new CollaborationError(
                "invalid",
                "A call requires between 1 and 50 invited participants",
            );
        if (invitedUserIds.some((userId) => !memberIds.has(userId)))
            throw new CollaborationError("not_found", "A call participant was not found");
        const [active] = await tx
            .select({
                id: calls.id,
            })
            .from(calls)
            .where(
                and(eq(calls.chatId, input.chatId), inArray(calls.status, ["ringing", "active"])),
            )
            .limit(1);
        if (active) throw new CollaborationError("conflict", "Chat already has an active call");
        const id = createId();
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "call.created",
            id,
        );
        await tx.insert(calls).values({
            id,
            chatId: input.chatId,
            createdByUserId: input.actorUserId,
            kind: input.kind,
        });
        await tx.insert(callParticipants).values({
            callId: id,
            userId: input.actorUserId,
            invitedByUserId: input.actorUserId,
            status: "joined",
            joinedAt: sql`CURRENT_TIMESTAMP`,
            lastSeenAt: sql`CURRENT_TIMESTAMP`,
        });
        await tx.insert(callEvents).values({
            id: createId(),
            callId: id,
            kind: "created",
            actorUserId: input.actorUserId,
        });
        for (const userId of invitedUserIds) {
            await tx.insert(callParticipants).values({
                callId: id,
                userId,
                invitedByUserId: input.actorUserId,
                status: "ringing",
                ringingAt: sql`CURRENT_TIMESTAMP`,
            });
            await tx.insert(callEvents).values({
                id: createId(),
                callId: id,
                kind: "ringing",
                actorUserId: input.actorUserId,
                targetUserId: userId,
            });
            const [notificationPreference] = await tx
                .select({
                    calls: userNotificationPreferences.calls,
                })
                .from(userNotificationPreferences)
                .where(eq(userNotificationPreferences.userId, userId))
                .limit(1);
            if (notificationPreference?.calls === "none") continue;
            const notificationId = createId();
            await tx.insert(notifications).values({
                id: notificationId,
                userId,
                kind: "call",
                chatId: input.chatId,
                actorUserId: input.actorUserId,
                payloadJson: JSON.stringify({
                    callId: id,
                    kind: input.kind,
                }),
                syncSequence: sequence,
            });
            await syncEventInsert(tx, {
                sequence,
                kind: "notification.created",
                entityId: notificationId,
                actorUserId: input.actorUserId,
                targetUserId: userId,
            });
        }
        const call = await getCallProjectionDb(tx, input.actorUserId, id);
        if (!call) throw new Error("Created call is not readable");
        return {
            call,
            hint: {
                ...chatHint(sequence, input.chatId, mutation.pts),
                areas: ["calls"],
            },
            invitedUserIds,
        };
    });
}
