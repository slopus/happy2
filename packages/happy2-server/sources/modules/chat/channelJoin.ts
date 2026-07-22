import { CollaborationError, type ChatRole, type ChatSummary, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { createChannelServiceMessageDb } from "./impl/createChannelServiceMessageDb.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatDescendantMembershipSync } from "./impl/chatDescendantMembershipSync.js";
import { areaHint } from "./areaHint.js";
import { childMemberRequireParent } from "./impl/childMemberRequireParent.js";

/**
 * Joins a discoverable public channel, a voluntarily departed channel, or a child for an active parent member by reactivating chatMembers with a fresh membership epoch.
 * The transaction advances chats history, preserves the previous role, and rejects private memberships that a manager explicitly revoked.
 */
export async function channelJoin(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
    documentsHint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const [target] = await tx
            .select({
                parentChatId: chats.parentChatId,
                archivedAt: chats.archivedAt,
            })
            .from(chats)
            .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
            .limit(1);
        if (!target) throw new CollaborationError("not_found", "Joinable channel was not found");
        await childMemberRequireParent(tx, target.parentChatId ?? undefined, actorUserId);
        const access = await chatGetAccess(tx, actorUserId, chatId, false);
        if (
            !target.parentChatId &&
            (!access ||
                (access.kind !== "public_channel" &&
                    !(access.kind === "private_channel" && access.isRecoverableMember)))
        )
            throw new CollaborationError("not_found", "Joinable channel was not found");
        if (access?.archivedAt ?? target.archivedAt)
            throw new CollaborationError("conflict", "Unarchive the channel before joining");
        if (access?.membershipRole)
            throw new CollaborationError("conflict", "Already joined this channel");
        const [previous] = await tx
            .select({
                role: chatMembers.role,
                removedByUserId: chatMembers.removedByUserId,
            })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, actorUserId)))
            .limit(1);
        if (previous?.removedByUserId)
            throw new CollaborationError("not_found", "Joinable channel was not found");
        const previousRole = previous?.role as ChatRole | undefined;
        const role: ChatRole =
            access?.kind === "public_channel" && previousRole === "owner"
                ? "admin"
                : (previousRole ?? "member");
        const sequence = await syncSequenceNext(tx);
        await chatAdvanceWithSequence(
            tx,
            sequence,
            actorUserId,
            chatId,
            "member.joined",
            actorUserId,
            actorUserId,
        );
        await tx
            .insert(chatMembers)
            .values({
                chatId,
                userId: actorUserId,
                role,
                membershipEpoch: createId(),
                syncSequence: sequence,
            })
            .onConflictDoUpdate({
                target: [chatMembers.chatId, chatMembers.userId],
                set: {
                    role,
                    membershipEpoch: sql`excluded.membership_epoch`,
                    syncSequence: sql`excluded.sync_sequence`,
                    joinedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                    leftAt: null,
                    removedByUserId: null,
                },
            });
        const documentsChanged = await chatDescendantMembershipSync(tx, {
            ancestorChatId: chatId,
            userId: actorUserId,
            actorUserId,
            sequence,
            kind: "joined",
        });
        const service = await createChannelServiceMessageDb(tx, {
            sequence,
            chatId,
            userId: actorUserId,
            type: "user_joined",
        });
        const chat = await chatGetAccess(tx, actorUserId, chatId, false);
        if (!chat) throw new Error("Joined chat is not readable");
        return {
            chat,
            hint: chatHint(sequence, chatId, service.pts),
            ...(documentsChanged ? { documentsHint: areaHint(sequence, "documents") } : {}),
        };
    });
}
