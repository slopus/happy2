import { createId } from "@paralleldrive/cuid2";
import {
    HostApiError,
    McpServer,
    happyCallContext,
    type CallToolResult,
    type HappyCallContext,
    type JsonObject,
    type JsonValue,
} from "happy2-plugin-sdk/server";
import { z } from "zod";
import {
    DocumentEditError,
    documentBlockEditUpdate,
    documentContentRead,
    documentMarkdownCreateUpdate,
    type DocumentBlockEdit,
} from "./content.js";
import {
    DocumentsHostClient,
    type AttachedDocument,
    type DocumentsHost,
    type DocumentWriteOutcome,
} from "./host.js";

const identifier = (description: string) => z.string().min(1).max(128).describe(description);
const sequence = z
    .string()
    .regex(/^\d+$/)
    .describe("The snapshotSequence returned by document_read; stale sequences are rejected.");
const markdown = z
    .string()
    .max(200_000)
    .describe("BlockNote-compatible Markdown for the replacement or inserted block(s).");
const createMarkdown = z
    .string()
    .max(200_000)
    .describe("Optional initial Markdown content; empty or omitted creates an empty document.");

const editSchema = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("replace"),
        blockId: identifier("Stable ID of the block to replace."),
        markdown,
    }),
    z.strictObject({
        kind: z.literal("insert_before"),
        blockId: identifier("Stable ID of the block to insert before."),
        markdown,
    }),
    z.strictObject({
        kind: z.literal("insert_after"),
        blockId: identifier("Stable ID of the block to insert after."),
        markdown,
    }),
    z.strictObject({
        kind: z.literal("delete"),
        blockId: identifier("Stable ID of the block to delete."),
    }),
]);

export interface DocumentsPluginOptions {
    readonly host?: DocumentsHost;
}

/** Creates the built-in document-awareness MCP server without opening its stdio transport. */
export function createDocumentsPlugin(options: DocumentsPluginOptions = {}): McpServer {
    const host = options.host ?? DocumentsHostClient.fromEnvironment();
    const server = new McpServer({ name: "happy2-documents", version: "1.0.0" });

    server.registerTool(
        "documents_list",
        {
            title: "List attached documents",
            description:
                "Lists documents attached to the current Happy chat. Chats can contain documents that are not visible in message text; use this to discover each document ID, title, update time, and latest snapshot sequence before reading or editing one.",
            inputSchema: z.strictObject({}),
        },
        (_input, extra) =>
            safely(async () => {
                const documents = await host.documentList(requireChat(extra), extra.signal);
                return result(
                    documents.length
                        ? `The current chat has ${documents.length} attached document${documents.length === 1 ? "" : "s"}:\n${documents.map(({ id, title, latestSequence }) => `- ${title} (${id}, sequence ${latestSequence})`).join("\n")}`
                        : "The current chat has no attached documents.",
                    { documents: documents.map(documentSummary) },
                );
            }),
    );

    server.registerTool(
        "document_create",
        {
            title: "Create attached document",
            description:
                "Creates a new BlockNote document and attaches it to the current Happy chat immediately. Supply a title and optional initial Markdown; unlike edits to existing documents, creating a new document does not require member approval.",
            inputSchema: z.strictObject({
                title: z.string().trim().min(1).max(200).describe("Title for the new document."),
                markdown: createMarkdown.optional(),
            }),
        },
        ({ title, markdown: initialMarkdown }, extra) =>
            safely(async () => {
                const initialUpdate = await documentMarkdownCreateUpdate(initialMarkdown);
                const document = await host.documentCreate(
                    { title, ...(initialUpdate ? { initialUpdate } : {}) },
                    requireChat(extra),
                    extra.signal,
                );
                return result(
                    `Created and attached “${document.title}” (${document.id}) to the current chat.`,
                    { document: documentSummary(document) },
                );
            }),
    );

    server.registerTool(
        "document_read",
        {
            title: "Read attached document",
            description:
                "Reads one document attached to the current Happy chat as Markdown and as its complete BlockNote block tree. Every block includes a stable ID for document_edit, and snapshotSequence must be passed back unchanged when proposing an edit.",
            inputSchema: z.strictObject({
                documentId: identifier("ID returned by documents_list."),
            }),
        },
        ({ documentId }, extra) =>
            safely(async () => {
                const snapshot = await host.documentRead(
                    documentId,
                    requireChat(extra),
                    extra.signal,
                );
                const content = await documentContentRead(snapshot.snapshot.update);
                return result(
                    `Read “${snapshot.document.title}” at sequence ${snapshot.snapshot.sequence}.\n\n${content.markdown || "(empty document)"}`,
                    {
                        document: documentSummary(snapshot.document),
                        snapshotSequence: snapshot.snapshot.sequence,
                        markdown: content.markdown,
                        blocks: jsonValue(content.blocks),
                    },
                );
            }),
    );

    server.registerTool(
        "document_edit",
        {
            title: "Propose one document block edit",
            description:
                "Proposes exactly one stable block-ID edit to a document attached to the current Happy chat: replace a block with Markdown, insert Markdown before or after it, or delete it. The call is staged against document_read's snapshotSequence and blocks until a chat member approves or denies it; stale, denied, and failed outcomes are reported explicitly.",
            inputSchema: z.strictObject({
                documentId: identifier("ID returned by documents_list or document_read."),
                snapshotSequence: sequence,
                edit: editSchema,
            }),
        },
        ({ documentId, snapshotSequence, edit }, extra) =>
            safely(async () => {
                const context = requireChat(extra);
                const snapshot = await host.documentRead(documentId, context, extra.signal);
                if (snapshot.snapshot.sequence !== snapshotSequence)
                    return failedResult(
                        documentId,
                        `Document changed since it was read: expected sequence ${snapshotSequence}, current sequence ${snapshot.snapshot.sequence}. Read it again before proposing another edit.`,
                        edit,
                    );
                const prepared = await documentBlockEditUpdate(snapshot.snapshot.update, edit);
                const outcome = await host.documentWrite(
                    {
                        documentId,
                        baseSequence: snapshotSequence,
                        clientUpdateId: createId(),
                        updates: [prepared.update],
                    },
                    context,
                    extra.signal,
                );
                return editResult(outcome, edit, prepared.affectedBlockIds);
            }),
    );

    return server;
}

function requireChat(extra: Parameters<typeof happyCallContext>[0]): HappyCallContext {
    const context = happyCallContext(extra);
    if (!context.chat) throw new TypeError("Document functions require a current Happy chat");
    return context;
}

function documentSummary(document: AttachedDocument): JsonObject {
    return {
        id: document.id,
        title: document.title,
        updatedAt: document.updatedAt,
        latestSequence: document.latestSequence,
    };
}

function editResult(
    outcome: DocumentWriteOutcome,
    edit: DocumentBlockEdit,
    affectedBlockIds: readonly string[],
): CallToolResult {
    if (outcome.status === "approved")
        return result(
            `Approved and applied the ${edit.kind} edit to document ${outcome.documentId} at sequence ${outcome.acceptedSequence}.`,
            {
                status: outcome.status,
                requestId: outcome.requestId,
                documentId: outcome.documentId,
                acceptedSequence: outcome.acceptedSequence,
                edit: { kind: edit.kind, blockId: edit.blockId },
                affectedBlockIds: [...affectedBlockIds],
            },
        );
    const terminal = result(
        outcome.status === "denied"
            ? `The document edit was denied and no content was changed. ${outcome.message}`
            : `The document edit failed and was not applied. ${outcome.message}`,
        {
            status: outcome.status,
            requestId: outcome.requestId,
            documentId: outcome.documentId,
            message: outcome.message,
            edit: { kind: edit.kind, blockId: edit.blockId },
        },
    );
    return outcome.status === "failed" ? { ...terminal, isError: true } : terminal;
}

function failedResult(
    documentId: string,
    message: string,
    edit: DocumentBlockEdit,
): CallToolResult {
    return {
        ...result(message, {
            status: "failed",
            documentId,
            message,
            edit: { kind: edit.kind, blockId: edit.blockId },
        }),
        isError: true,
    };
}

async function safely(operation: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await operation();
    } catch (error) {
        const message =
            error instanceof DocumentEditError || error instanceof HostApiError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : String(error);
        return {
            ...result(`Document operation failed: ${message}`, { status: "failed", message }),
            isError: true,
        };
    }
}

function result(text: string, structuredContent: JsonObject): CallToolResult {
    return { content: [{ type: "text", text }], structuredContent };
}

function jsonValue(value: unknown): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
}
