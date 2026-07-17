import { CollaborationError, type FileSummary, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { asFile } from "../chat/asFile.js";
import { createId } from "@paralleldrive/cuid2";
import { customEmojiRevisions, customEmojis, files } from "../schema.js";

import { fileSelection } from "../chat/fileSelection.js";

import { isUniqueConstraint } from "../chat/isUniqueConstraint.js";

import { text } from "../chat/text.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "../chat/userRequireActive.js";

/**
 * Creates a uniquely named customEmojis entry and initial customEmojiRevisions record from an active user's accessible image file.
 * Committing the definition, revision, and sync sequence together prevents clients from resolving an emoji before its source revision exists.
 */
export async function customEmojiCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        name: string;
        fileId: string;
    },
): Promise<{
    emoji: {
        id: string;
        name: string;
        file: FileSummary;
        createdByUserId: string;
    };
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.actorUserId);
        const [file] = await tx
            .select(fileSelection)
            .from(files)
            .where(
                and(
                    eq(files.id, input.fileId),
                    isNull(files.deletedAt),
                    eq(files.uploadStatus, "complete"),
                    ne(files.scanStatus, "infected"),
                    or(eq(files.uploadedByUserId, input.actorUserId), eq(files.isPublic, 1)),
                ),
            )
            .limit(1);
        if (!file || !["photo", "gif"].includes(text(file.kind)))
            throw new CollaborationError("not_found", "Emoji image file was not found");
        const id = createId();
        const sequence = await syncSequenceNext(tx);
        try {
            await tx.insert(customEmojis).values({
                id,
                name: input.name,
                fileId: input.fileId,
                createdByUserId: input.actorUserId,
                syncSequence: sequence,
            });
            await tx.insert(customEmojiRevisions).values({
                id: createId(),
                customEmojiId: id,
                name: input.name,
                fileId: input.fileId,
                changedByUserId: input.actorUserId,
                changeKind: "created",
            });
        } catch (error) {
            if (isUniqueConstraint(error))
                throw new CollaborationError("conflict", "Emoji name is already in use");
            throw error;
        }
        await syncEventInsert(tx, {
            sequence,
            kind: "emoji.created",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        return {
            emoji: {
                id,
                name: input.name,
                file: asFile(file),
                createdByUserId: input.actorUserId,
            },
            hint: areaHint(sequence, "emoji"),
        };
    });
}
