import { createId } from "@paralleldrive/cuid2";
import { areaHint } from "../chat/areaHint.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentUpdates, documents } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentProjection } from "./impl/documentProjection.js";
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
 * Creates one collaborative document owned by a chat the actor may post to: a new
 * `documents` row seeded with the canonical empty Yjs snapshot, plus an optional first
 * content row in `documentUpdates` when the client supplies initial content. The single
 * transaction also records a `document.created` sync event so chat document lists
 * reconcile through the `documents` area without ever parsing document content.
 */
export async function documentCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
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
        if (!(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError("not_found", "Chat was not found");
        const id = createId();
        const createdAt = new Date().toISOString();
        const [row] = await tx
            .insert(documents)
            .values({
                id,
                chatId: input.chatId,
                title: input.title,
                format: input.format,
                createdByUserId: input.actorUserId,
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
                actorUserId: input.actorUserId,
                createdAt,
            });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.created",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        return {
            document: documentProjection(row),
            hint: areaHint(sequence, "documents"),
        };
    });
}
