import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chats, files } from "../schema.js";

import { isUniqueConstraint } from "./isUniqueConstraint.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { userRequireServerAdmin } from "./userRequireServerAdmin.js";

/**
 * Applies validated name, description, or presentation changes to a manageable chats channel without altering omitted fields.
 * The single channel-version transition lets clients reconcile the complete updated projection instead of observing independent metadata edits.
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
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            input.kind && input.kind !== access.kind ? "chat.visibilityChanged" : "chat.updated",
            input.chatId,
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
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new CollaborationError("conflict", "Channel slug is already in use");
            throw error;
        }
        const chat = await chatRequireManager(tx, input.actorUserId, input.chatId);
        return {
            chat,
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
