import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { chatMembers, chats, files, users } from "../schema.js";

import { isUniqueConstraint } from "./isUniqueConstraint.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { userRequireServerAdmin } from "./userRequireServerAdmin.js";
import { chatDescendantIds } from "./impl/chatDescendantIds.js";

/**
 * Applies validated metadata to chats and propagates only a parent's visibility through its descendants.
 * A public-to-private transition updates chatMembers to select one already-active human owner per channel without joining anyone, preserving independent child membership and ownership.
 */
export async function channelUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        name?: string;
        slug?: string;
        topic?: string | null;
        kind?: "public_channel" | "private_channel";
        photoFileId?: string | null;
        isListed?: boolean;
        autoJoin?: boolean;
    },
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct messages cannot use channel settings");
        if (
            access.parentChatId &&
            (input.kind !== undefined ||
                input.isListed !== undefined ||
                input.autoJoin !== undefined)
        )
            throw new CollaborationError(
                "invalid",
                "Child channel visibility and membership policy are inherited",
            );
        if (input.autoJoin !== undefined) await userRequireServerAdmin(tx, input.actorUserId);
        if (input.autoJoin === true && access.archivedAt)
            throw new CollaborationError("invalid", "Archived channels cannot auto-join new users");
        if (
            access.isMain &&
            (input.kind === "private_channel" ||
                input.isListed === false ||
                input.autoJoin === false)
        )
            throw new CollaborationError(
                "invalid",
                "The main channel must remain public, listed, and auto-join",
            );
        if (input.photoFileId !== undefined && input.photoFileId !== null) {
            const [file] = await tx
                .select({
                    kind: files.kind,
                })
                .from(files)
                .where(
                    and(
                        eq(files.id, input.photoFileId),
                        isNull(files.deletedAt),
                        eq(files.uploadStatus, "complete"),
                        ne(files.scanStatus, "infected"),
                        or(eq(files.uploadedByUserId, input.actorUserId), eq(files.isPublic, 1)),
                    ),
                )
                .limit(1);
            if (!file || !["photo", "gif"].includes(file.kind))
                throw new CollaborationError("not_found", "Channel photo was not found");
        }
        const wasPubliclyListed = access.kind === "public_channel" && access.isListed;
        const nextKind = input.kind ?? access.kind;
        const nextIsListed = input.isListed ?? access.isListed;
        const directoryVisibilityChanged =
            wasPubliclyListed !== (nextKind === "public_channel" && nextIsListed);
        const visibilityChanged = input.kind !== undefined && input.kind !== access.kind;
        const descendantIds = visibilityChanged ? await chatDescendantIds(tx, input.chatId) : [];
        const affectedChatIds = [input.chatId, ...descendantIds];
        const privateOwners = new Map<string, string>();
        if (visibilityChanged && input.kind === "private_channel") {
            const candidates = await tx
                .select({
                    chatId: chatMembers.chatId,
                    userId: chatMembers.userId,
                    role: chatMembers.role,
                    createdByUserId: chats.createdByUserId,
                })
                .from(chatMembers)
                .innerJoin(chats, eq(chats.id, chatMembers.chatId))
                .innerJoin(users, eq(users.id, chatMembers.userId))
                .where(
                    and(
                        inArray(chatMembers.chatId, affectedChatIds),
                        isNull(chatMembers.leftAt),
                        isNull(users.agentRole),
                        isNull(users.deletedAt),
                    ),
                )
                .orderBy(chatMembers.joinedAt, chatMembers.userId);
            for (const chatId of affectedChatIds) {
                const eligible = candidates.filter((candidate) => candidate.chatId === chatId);
                const owner =
                    (chatId === input.chatId
                        ? eligible.find((candidate) => candidate.userId === input.actorUserId)
                        : eligible.find(
                              (candidate) => candidate.userId === candidate.createdByUserId,
                          )) ??
                    eligible.find((candidate) => candidate.role === "admin") ??
                    eligible[0];
                if (!owner)
                    throw new CollaborationError(
                        "conflict",
                        chatId === input.chatId
                            ? "Join the channel before making it private"
                            : "Every child needs an active human member before becoming private",
                    );
                privateOwners.set(chatId, owner.userId);
            }
        }
        const sequence = await syncSequenceNext(tx);
        const mutations = [];
        for (const chatId of affectedChatIds)
            mutations.push(
                await chatAdvanceWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    visibilityChanged || (chatId === input.chatId && directoryVisibilityChanged)
                        ? "chat.visibilityChanged"
                        : "chat.updated",
                    chatId,
                ),
            );
        try {
            await tx
                .update(chats)
                .set({
                    ...(input.name === undefined
                        ? {}
                        : {
                              name: input.name,
                          }),
                    ...(input.slug === undefined
                        ? {}
                        : {
                              slug: input.slug,
                          }),
                    ...(input.topic === undefined
                        ? {}
                        : {
                              topic: input.topic,
                          }),
                    ...(input.kind === undefined
                        ? {}
                        : {
                              kind: input.kind,
                              visibility: input.kind === "public_channel" ? "public" : "private",
                              ownerUserId:
                                  input.kind === "public_channel"
                                      ? null
                                      : privateOwners.get(input.chatId),
                          }),
                    ...(input.photoFileId === undefined
                        ? {}
                        : {
                              photoFileId: input.photoFileId,
                          }),
                    ...(input.isListed === undefined
                        ? {}
                        : {
                              isListed: input.isListed ? 1 : 0,
                          }),
                    ...(input.autoJoin === undefined
                        ? {}
                        : {
                              autoJoin: input.autoJoin ? 1 : 0,
                          }),
                    lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)));
            if (visibilityChanged)
                for (const chatId of descendantIds)
                    await tx
                        .update(chats)
                        .set({
                            kind: input.kind,
                            visibility: input.kind === "public_channel" ? "public" : "private",
                            ownerUserId:
                                input.kind === "public_channel" ? null : privateOwners.get(chatId),
                            lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        })
                        .where(eq(chats.id, chatId));
            if (visibilityChanged) {
                await tx
                    .update(chatMembers)
                    .set({
                        role: "admin",
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(
                        and(
                            inArray(chatMembers.chatId, affectedChatIds),
                            eq(chatMembers.role, "owner"),
                        ),
                    );
                if (input.kind === "private_channel")
                    for (const chatId of affectedChatIds)
                        await tx
                            .update(chatMembers)
                            .set({
                                role: "owner",
                                syncSequence: sequence,
                                updatedAt: sql`CURRENT_TIMESTAMP`,
                            })
                            .where(
                                and(
                                    eq(chatMembers.chatId, chatId),
                                    eq(chatMembers.userId, privateOwners.get(chatId)!),
                                    isNull(chatMembers.leftAt),
                                ),
                            );
            }
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new CollaborationError("conflict", "Channel slug is already in use");
            throw error;
        }
        const chat = await chatRequireManager(tx, input.actorUserId, input.chatId);
        return {
            chat,
            hint: {
                sequence: String(sequence),
                chats: mutations.map((mutation) => ({
                    chatId: mutation.chatId,
                    pts: String(mutation.pts),
                })),
                areas: [],
            },
        };
    });
}
