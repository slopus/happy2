import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    chatMembers,
    documentChannelAttachments,
    documentUpdates,
    documents,
    users,
} from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentSummaryGet } from "./impl/documentSummaryGet.js";
import {
    documentEmptyUpdate,
    documentUpdateDecode,
    documentUpdatesMerge,
} from "./impl/updateCodec.js";
import {
    DOCUMENT_FORMATS,
    MAX_DOCUMENT_TITLE_LENGTH,
    MAX_DOCUMENT_UPDATE_BYTES,
    type DocumentFormat,
    type DocumentSummary,
} from "./types.js";

/**
 * Creates one owner-accessible standalone `documents` row seeded with the canonical
 * empty Yjs snapshot, plus optional `documentUpdates` initial content and an optional
 * `documentChannelAttachments` row when the actor may post to the requested channel. An
 * optional active agent member may be attributed as creator while the authenticated actor
 * retains ownership, making agent-created documents member-manageable without losing agent
 * attribution on the initial update, attachment, or sync event. One transaction records
 * `document.created` so every visible document list reconciles through the documents area,
 * which is why creation and optional attachment share this boundary.
 */
export async function documentCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        attributedCreatorUserId?: string;
        chatId?: string;
        title: string;
        format: DocumentFormat;
        initialUpdate?: string;
    },
): Promise<{ document: DocumentSummary; hint: MutationHint }> {
    if (input.title.length > MAX_DOCUMENT_TITLE_LENGTH)
        throw new CollaborationError(
            "invalid",
            `title may have at most ${MAX_DOCUMENT_TITLE_LENGTH} characters`,
        );
    if (!DOCUMENT_FORMATS.includes(input.format))
        throw new CollaborationError("invalid", "Unknown document format");
    const initialUpdate =
        input.initialUpdate === undefined
            ? undefined
            : documentUpdatesMerge([
                  documentUpdateDecode(
                      input.initialUpdate,
                      "initialUpdate",
                      MAX_DOCUMENT_UPDATE_BYTES,
                  ),
              ]);
    return withTransaction(executor, async (tx) => {
        if (input.chatId !== undefined && !(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError("not_found", "Chat was not found");
        const creatorUserId = input.attributedCreatorUserId ?? input.actorUserId;
        if (creatorUserId !== input.actorUserId) {
            if (input.chatId === undefined)
                throw new CollaborationError(
                    "invalid",
                    "An attributed document creator requires a chat",
                );
            const [creator] = await tx
                .select({ id: users.id })
                .from(users)
                .innerJoin(
                    chatMembers,
                    and(
                        eq(chatMembers.userId, users.id),
                        eq(chatMembers.chatId, input.chatId),
                        isNull(chatMembers.leftAt),
                    ),
                )
                .where(
                    and(
                        eq(users.id, creatorUserId),
                        eq(users.kind, "agent"),
                        eq(users.active, 1),
                        isNull(users.deletedAt),
                    ),
                )
                .limit(1);
            if (!creator)
                throw new CollaborationError("not_found", "Document creator was not found");
        }
        const id = createId();
        const createdAt = new Date().toISOString();
        const [row] = await tx
            .insert(documents)
            .values({
                id,
                ownerUserId: input.actorUserId,
                title: input.title,
                format: input.format,
                snapshotUpdate: documentEmptyUpdate(),
                snapshotSequence: 0,
                lastSequence: initialUpdate === undefined ? 0 : 1,
                createdAt,
                updatedAt: createdAt,
            })
            .returning();
        if (!row) throw new Error("Document was not created");
        if (initialUpdate !== undefined)
            await tx.insert(documentUpdates).values({
                documentId: id,
                sequence: 1,
                update: initialUpdate,
                clientUpdateId: `create:${id}`,
                actorUserId: creatorUserId,
                createdAt,
            });
        if (input.chatId !== undefined)
            await tx.insert(documentChannelAttachments).values({
                documentId: id,
                chatId: input.chatId,
                attachedByUserId: creatorUserId,
                attachedAt: createdAt,
            });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.created",
            entityId: id,
            actorUserId: creatorUserId,
        });
        return {
            document: await documentSummaryGet(tx, input.actorUserId, row),
            hint: areaHint(sequence, "documents"),
        };
    });
}
