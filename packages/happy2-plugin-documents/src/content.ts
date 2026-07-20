import type {
    Block,
    DefaultBlockSchema,
    DefaultInlineContentSchema,
    DefaultStyleSchema,
} from "@blocknote/core";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import * as Y from "yjs";

/** Matches documentFragmentName in happy2-ui/src/DocumentEditor.tsx. */
export const DOCUMENT_FRAGMENT_NAME = "document";

export type DocumentBlock = Block<
    DefaultBlockSchema,
    DefaultInlineContentSchema,
    DefaultStyleSchema
>;

export type DocumentBlockEdit =
    | { readonly kind: "replace"; readonly blockId: string; readonly markdown: string }
    | { readonly kind: "insert_before"; readonly blockId: string; readonly markdown: string }
    | { readonly kind: "insert_after"; readonly blockId: string; readonly markdown: string }
    | { readonly kind: "delete"; readonly blockId: string };

export interface DocumentContent {
    readonly markdown: string;
    readonly blocks: readonly DocumentBlock[];
}

export interface DocumentEditUpdate {
    readonly update: string;
    readonly affectedBlockIds: readonly string[];
}

let conversionQueue = Promise.resolve();

/** Converts non-empty Markdown into a complete BlockNote Yjs update for document creation. */
export function documentMarkdownCreateUpdate(markdown?: string): Promise<string | undefined> {
    if (!markdown?.trim()) return Promise.resolve(undefined);
    return withEditor(async (editor) => {
        const blocks = await editor.tryParseMarkdownToBlocks(markdown);
        const document = editor.blocksToYDoc(blocks, DOCUMENT_FRAGMENT_NAME);
        return Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64");
    });
}

/** Decodes one merged Happy snapshot into its stable-id BlockNote tree and lossy Markdown view. */
export function documentContentRead(snapshotUpdate: string): Promise<DocumentContent> {
    return withEditor(async (editor) => {
        const document = snapshotDocument(snapshotUpdate);
        const blocks = editor.yDocToBlocks(document, DOCUMENT_FRAGMENT_NAME);
        return { blocks, markdown: await editor.blocksToMarkdownLossy(blocks) };
    });
}

/** Builds one minimal Yjs difference for a single stable block-id edit against a merged snapshot. */
export function documentBlockEditUpdate(
    snapshotUpdate: string,
    edit: DocumentBlockEdit,
): Promise<DocumentEditUpdate> {
    return withEditor(async (editor) => {
        const document = snapshotDocument(snapshotUpdate);
        const before = Y.encodeStateVector(document);
        const blocks = structuredClone(
            editor.yDocToBlocks(document, DOCUMENT_FRAGMENT_NAME),
        ) as DocumentBlock[];
        const target = findBlock(blocks, edit.blockId);
        if (!target)
            throw new DocumentEditError(`Block ${JSON.stringify(edit.blockId)} no longer exists`);

        let affectedBlockIds: readonly string[];
        if (edit.kind === "delete") {
            if (target.blocks === blocks && blocks.length === 1)
                throw new DocumentEditError(
                    "The only top-level block cannot be deleted; replace it with an empty block instead",
                );
            target.blocks.splice(target.index, 1);
            affectedBlockIds = [edit.blockId];
        } else {
            const parsed = await editor.tryParseMarkdownToBlocks(edit.markdown);
            if (!parsed.length) throw new DocumentEditError("Markdown did not produce any blocks");
            if (edit.kind === "replace") {
                parsed[0] = { ...parsed[0], id: edit.blockId };
                target.blocks.splice(target.index, 1, ...parsed);
            } else {
                target.blocks.splice(
                    target.index + (edit.kind === "insert_after" ? 1 : 0),
                    0,
                    ...parsed,
                );
            }
            affectedBlockIds = parsed.map(({ id }) => id);
        }

        editor.blocksToYXmlFragment(blocks, document.getXmlFragment(DOCUMENT_FRAGMENT_NAME));
        const update = Y.encodeStateAsUpdate(document, before);
        if (update.length <= 2)
            throw new DocumentEditError("The requested block edit made no change");
        return { update: Buffer.from(update).toString("base64"), affectedBlockIds };
    });
}

export class DocumentEditError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DocumentEditError";
    }
}

function snapshotDocument(snapshotUpdate: string): Y.Doc {
    try {
        const document = new Y.Doc();
        Y.applyUpdate(document, Buffer.from(snapshotUpdate, "base64"));
        return document;
    } catch {
        throw new TypeError("Happy returned an invalid Yjs document snapshot");
    }
}

function findBlock(
    blocks: DocumentBlock[],
    blockId: string,
): { blocks: DocumentBlock[]; index: number } | undefined {
    for (const [index, block] of blocks.entries()) {
        if (block.id === blockId) return { blocks, index };
        const nested = findBlock(block.children as DocumentBlock[], blockId);
        if (nested) return nested;
    }
    return undefined;
}

function withEditor<T>(operation: (editor: ServerBlockNoteEditor) => Promise<T>): Promise<T> {
    const result = conversionQueue.then(() => operation(ServerBlockNoteEditor.create()));
    conversionQueue = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}
