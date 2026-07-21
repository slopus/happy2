import { type ChatRole, type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import {
    agentRigBindings,
    chatMembers,
    chats,
    documentChannelAttachments,
    userChatPreferences,
} from "../schema.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatDescendantIds } from "./impl/chatDescendantIds.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { chatSelection } from "./impl/chatSelection.js";
import { asChat } from "./impl/asChat.js";
import { areaHint } from "./areaHint.js";
import { createId } from "@paralleldrive/cuid2";
import { chatDescendantMembershipSync } from "./impl/chatDescendantMembershipSync.js";
import { createChannelServiceMessageDb } from "./impl/createChannelServiceMessageDb.js";

/**
 * Updates chats archival state for a manageable channel and optionally applies the matching top-level chatMembers transition in the same transaction.
 * An archive may voluntarily deactivate every member, while an unarchive may restore the actor without allowing an explicitly removed membership to bypass revocation.
 */
export async function channelSetArchived(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        archived: boolean;
        membership?: boolean;
        reason?: string;
    },
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
    memberUserIds: string[];
    documentsHint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct messages cannot be archived");
        if (access.isMain && input.archived)
            throw new CollaborationError("invalid", "The main channel cannot be archived");
        const [stored] = await tx
            .select({ archivedAt: chats.archivedAt })
            .from(chats)
            .where(eq(chats.id, input.chatId))
            .limit(1);
        if (!stored) throw new CollaborationError("not_found", "Chat was not found");
        if (Boolean(stored.archivedAt) === input.archived)
            throw new CollaborationError(
                "conflict",
                input.archived ? "Channel is already archived" : "Channel is not archived",
            );
        let joinRole: ChatRole | undefined;
        if (!input.archived && input.membership && !access.membershipRole && !access.parentChatId) {
            const [previous] = await tx
                .select({
                    role: chatMembers.role,
                    removedByUserId: chatMembers.removedByUserId,
                })
                .from(chatMembers)
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        eq(chatMembers.userId, input.actorUserId),
                    ),
                )
                .limit(1);
            if (
                previous?.removedByUserId ||
                (access.kind === "private_channel" && !access.isRecoverableMember)
            )
                throw new CollaborationError("not_found", "Joinable channel was not found");
            joinRole = (previous?.role as ChatRole | undefined) ?? "member";
        }
        const sequence = await syncSequenceNext(tx);
        const descendantIds = await chatDescendantIds(tx, input.chatId);
        const affectedChatIds = [input.chatId, ...descendantIds];
        const mutations = [];
        for (const chatId of affectedChatIds)
            mutations.push(
                await chatAdvanceWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    chatId === input.chatId
                        ? input.archived
                            ? "chat.archived"
                            : "chat.unarchived"
                        : input.archived
                          ? "chat.parentArchived"
                          : "chat.parentUnarchived",
                    input.chatId,
                ),
            );
        const memberships =
            input.archived && input.membership && !access.parentChatId
                ? await tx
                      .select({
                          chatId: chatMembers.chatId,
                          userId: chatMembers.userId,
                      })
                      .from(chatMembers)
                      .where(
                          and(
                              inArray(chatMembers.chatId, affectedChatIds),
                              isNull(chatMembers.leftAt),
                          ),
                      )
                : [];
        const memberUserIds = [...new Set(memberships.map(({ userId }) => userId))];
        if (memberships.length > 0) {
            await tx
                .update(chatMembers)
                .set({
                    leftAt: sql`CURRENT_TIMESTAMP`,
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(inArray(chatMembers.chatId, affectedChatIds), isNull(chatMembers.leftAt)),
                );
            await tx
                .delete(agentRigBindings)
                .where(inArray(agentRigBindings.chatId, affectedChatIds));
            for (const membership of memberships)
                await syncEventInsert(tx, {
                    sequence,
                    kind: "member.left",
                    chatId: membership.chatId,
                    entityId: membership.userId,
                    actorUserId: input.actorUserId,
                    targetUserId: membership.userId,
                });
        }
        let servicePts: number | undefined;
        let documentsChanged = false;
        if (joinRole) {
            await chatAdvanceWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "member.joined",
                input.actorUserId,
                input.actorUserId,
            );
            await tx
                .insert(chatMembers)
                .values({
                    chatId: input.chatId,
                    userId: input.actorUserId,
                    role: joinRole,
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
                        role: joinRole,
                        membershipEpoch: sql`excluded.membership_epoch`,
                        syncSequence: sql`excluded.sync_sequence`,
                        joinedAt: sql`CURRENT_TIMESTAMP`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                        leftAt: null,
                        removedByUserId: null,
                    },
                });
            documentsChanged = await chatDescendantMembershipSync(tx, {
                ancestorChatId: input.chatId,
                userId: input.actorUserId,
                actorUserId: input.actorUserId,
                sequence,
                kind: "joined",
                role: joinRole,
            });
            servicePts = (
                await createChannelServiceMessageDb(tx, {
                    sequence,
                    chatId: input.chatId,
                    userId: input.actorUserId,
                    type: "user_joined",
                })
            ).pts;
            memberUserIds.push(input.actorUserId);
        }
        if (input.archived)
            servicePts = (
                await createChannelServiceMessageDb(tx, {
                    sequence,
                    chatId: input.chatId,
                    userId: input.actorUserId,
                    type: "channel_archived",
                })
            ).pts;
        const [attachedDocument] =
            memberships.length > 0
                ? await tx
                      .select({ chatId: documentChannelAttachments.chatId })
                      .from(documentChannelAttachments)
                      .where(inArray(documentChannelAttachments.chatId, affectedChatIds))
                      .limit(1)
                : [];
        if (attachedDocument)
            for (const userId of memberUserIds)
                await syncEventInsert(tx, {
                    sequence,
                    kind: "document.membershipChanged",
                    entityId: userId,
                    actorUserId: input.actorUserId,
                    targetUserId: userId,
                });
        await tx
            .update(chats)
            .set({
                archivedAt: input.archived ? sql`CURRENT_TIMESTAMP` : null,
                archivedByUserId: input.archived ? input.actorUserId : null,
                archiveReason: input.archived ? (input.reason ?? null) : null,
                lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(chats.id, input.chatId));
        const [row] = await tx
            .select(chatSelection)
            .from(chats)
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, input.actorUserId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .leftJoin(
                userChatPreferences,
                and(
                    eq(userChatPreferences.chatId, chats.id),
                    eq(userChatPreferences.userId, input.actorUserId),
                ),
            )
            .where(eq(chats.id, input.chatId))
            .limit(1);
        if (!row) throw new Error("Archived channel projection was not found");
        return {
            chat: asChat(row),
            hint: {
                sequence: String(sequence),
                chats: mutations.map((mutation) => ({
                    chatId: mutation.chatId,
                    pts: String(
                        mutation.chatId === input.chatId && servicePts !== undefined
                            ? servicePts
                            : mutation.pts,
                    ),
                })),
                areas: [],
            },
            memberUserIds,
            ...(attachedDocument || documentsChanged
                ? { documentsHint: areaHint(sequence, "documents") }
                : {}),
        };
    });
}
