import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    DOCUMENT_FRAGMENT_NAME,
    documentBlockEditUpdate,
    documentContentRead,
    type DocumentBlockEdit,
} from "./content.js";
import type {
    AttachedDocument,
    DocumentCreateInput,
    DocumentsHost,
    DocumentWriteInput,
    DocumentWriteOutcome,
} from "./host.js";
import { createDocumentsPlugin } from "./plugin.js";

describe("Documents plugin", () => {
    it("applies insertions and deletion against stable block IDs", async () => {
        const editor = ServerBlockNoteEditor.create();
        const document = editor.blocksToYDoc(
            await editor.tryParseMarkdownToBlocks(
                "# Heading\n\nTarget paragraph\n\nTail paragraph",
            ),
            DOCUMENT_FRAGMENT_NAME,
        );
        let snapshot = snapshotUpdate(document);
        const initial = await documentContentRead(snapshot);
        const targetId = initial.blocks[1]!.id;
        const tailId = initial.blocks[2]!.id;

        const apply = async (edit: DocumentBlockEdit) => {
            const prepared = await documentBlockEditUpdate(snapshot, edit);
            Y.applyUpdate(document, Buffer.from(prepared.update, "base64"));
            snapshot = snapshotUpdate(document);
            return { content: await documentContentRead(snapshot), prepared };
        };

        const before = await apply({
            kind: "insert_before",
            blockId: targetId,
            markdown: "Before target",
        });
        expect(before.content.blocks.map(({ id }) => id)).toEqual([
            initial.blocks[0]!.id,
            before.prepared.affectedBlockIds[0],
            targetId,
            tailId,
        ]);

        const after = await apply({
            kind: "insert_after",
            blockId: targetId,
            markdown: "After target",
        });
        expect(after.content.markdown.indexOf("Target paragraph")).toBeLessThan(
            after.content.markdown.indexOf("After target"),
        );
        expect(after.content.blocks.at(-1)?.id).toBe(tailId);

        const deleted = await apply({ kind: "delete", blockId: targetId });
        expect(deleted.content.markdown).not.toContain("Target paragraph");
        expect(deleted.content.markdown).toContain("Before target");
        expect(deleted.content.markdown).toContain("After target");
        expect(deleted.content.blocks.at(-1)?.id).toBe(tailId);
    });

    it("discovers attached documents and performs sequence-bound approval-gated block edits", async () => {
        const host = await FakeDocumentsHost.create("# Launch plan\n\nOriginal paragraph");
        const server = createDocumentsPlugin({ host });
        const client = new Client({ name: "documents-test", version: "1.0.0" });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        try {
            const tools = await client.listTools();
            expect(tools.tools.map(({ name }) => name)).toEqual([
                "documents_list",
                "document_create",
                "document_read",
                "document_edit",
            ]);
            expect(
                tools.tools.find(({ name }) => name === "documents_list")?.description,
            ).toContain("not visible in message text");
            expect(tools.tools.find(({ name }) => name === "document_edit")?.description).toContain(
                "blocks until a chat member approves or denies",
            );
            expect(
                tools.tools.find(({ name }) => name === "document_create")?.description,
            ).toContain("does not require member approval");

            const created = structured(
                await call(client, "document_create", {
                    title: "Agent draft",
                    markdown: "# Agent draft\n\nCreated from **Markdown**",
                }),
            );
            expect(created).toEqual({
                document: {
                    id: "created-document-1",
                    title: "Agent draft",
                    updatedAt: "2026-07-20T12:01:00.000Z",
                    latestSequence: "1",
                },
            });
            const initialUpdate = host.creates[0]?.initialUpdate;
            expect(initialUpdate).toBeDefined();
            expect((await documentContentRead(initialUpdate!)).markdown).toContain(
                "Created from **Markdown**",
            );
            await call(client, "document_create", { title: "Empty agent draft", markdown: "" });
            expect(host.creates[1]).toEqual({ title: "Empty agent draft" });
            await call(client, "document_create", { title: "Omitted-content agent draft" });
            expect(host.creates[2]).toEqual({ title: "Omitted-content agent draft" });

            const listed = structured(await call(client, "documents_list", {}));
            expect(listed.documents).toEqual([
                {
                    id: "document-1",
                    title: "Launch notes",
                    updatedAt: "2026-07-20T12:00:00.000Z",
                    latestSequence: "0",
                },
            ]);

            const read = structured(
                await call(client, "document_read", { documentId: "document-1" }),
            );
            expect(read).toMatchObject({
                snapshotSequence: "0",
                markdown: expect.stringContaining("Original paragraph"),
            });
            const blocks = array(read.blocks, "blocks");
            expect(blocks.every((block) => typeof object(block, "block").id === "string")).toBe(
                true,
            );
            const paragraphId = string(object(blocks[1], "paragraph").id, "paragraph.id");

            const approved = await call(client, "document_edit", {
                documentId: "document-1",
                snapshotSequence: "0",
                edit: {
                    kind: "replace",
                    blockId: paragraphId,
                    markdown: "Updated with **approval**",
                },
            });
            expect(approved.isError).not.toBe(true);
            expect(structured(approved)).toMatchObject({
                status: "approved",
                documentId: "document-1",
                acceptedSequence: "1",
                edit: { kind: "replace", blockId: paragraphId },
                affectedBlockIds: [paragraphId],
            });
            expect((await host.content()).markdown).toContain("Updated with **approval**");
            expect(host.writes[0]).toMatchObject({
                documentId: "document-1",
                baseSequence: "0",
            });

            host.nextOutcome = "denied";
            const beforeDenial = (await host.content()).markdown;
            const denied = await call(client, "document_edit", {
                documentId: "document-1",
                snapshotSequence: "1",
                edit: {
                    kind: "replace",
                    blockId: paragraphId,
                    markdown: "This must not land",
                },
            });
            expect(denied.isError).not.toBe(true);
            expect(structured(denied)).toMatchObject({
                status: "denied",
                documentId: "document-1",
                message: "Member denied the proposed edit.",
            });
            expect((await host.content()).markdown).toBe(beforeDenial);

            const writeCount = host.writes.length;
            const stale = await call(client, "document_edit", {
                documentId: "document-1",
                snapshotSequence: "0",
                edit: { kind: "delete", blockId: paragraphId },
            });
            expect(stale.isError).toBe(true);
            expect(structured(stale)).toMatchObject({
                status: "failed",
                message: expect.stringContaining("current sequence 1"),
            });
            expect(host.writes).toHaveLength(writeCount);
        } finally {
            await client.close();
            await server.close();
        }
    });
});

class FakeDocumentsHost implements DocumentsHost {
    readonly creates: DocumentCreateInput[] = [];
    readonly writes: DocumentWriteInput[] = [];
    nextOutcome: "approved" | "denied" = "approved";
    #sequence = 0;

    private constructor(private readonly document: Y.Doc) {}

    static async create(markdown: string): Promise<FakeDocumentsHost> {
        const editor = ServerBlockNoteEditor.create();
        const blocks = await editor.tryParseMarkdownToBlocks(markdown);
        return new FakeDocumentsHost(editor.blocksToYDoc(blocks, DOCUMENT_FRAGMENT_NAME));
    }

    documentList(): Promise<readonly AttachedDocument[]> {
        return Promise.resolve([this.summary()]);
    }

    documentRead(): Promise<{
        document: AttachedDocument;
        snapshot: { sequence: string; update: string };
    }> {
        return Promise.resolve({
            document: this.summary(),
            snapshot: {
                sequence: String(this.#sequence),
                update: Buffer.from(Y.encodeStateAsUpdate(this.document)).toString("base64"),
            },
        });
    }

    documentCreate(input: DocumentCreateInput): Promise<AttachedDocument> {
        this.creates.push(input);
        return Promise.resolve({
            id: `created-document-${this.creates.length}`,
            title: input.title,
            updatedAt: "2026-07-20T12:01:00.000Z",
            latestSequence: input.initialUpdate ? "1" : "0",
        });
    }

    documentWrite(input: DocumentWriteInput): Promise<DocumentWriteOutcome> {
        this.writes.push(input);
        if (this.nextOutcome === "denied")
            return Promise.resolve({
                status: "denied",
                requestId: `request-${this.writes.length}`,
                documentId: input.documentId,
                message: "Member denied the proposed edit.",
            });
        Y.applyUpdate(this.document, Buffer.from(input.updates[0]!, "base64"));
        this.#sequence += 1;
        return Promise.resolve({
            status: "approved",
            requestId: `request-${this.writes.length}`,
            documentId: input.documentId,
            acceptedSequence: String(this.#sequence),
        });
    }

    content() {
        return documentContentRead(
            Buffer.from(Y.encodeStateAsUpdate(this.document)).toString("base64"),
        );
    }

    private summary(): AttachedDocument {
        return {
            id: "document-1",
            title: "Launch notes",
            updatedAt: "2026-07-20T12:00:00.000Z",
            latestSequence: String(this.#sequence),
        };
    }
}

function call(client: Client, name: string, arguments0: Record<string, unknown>) {
    return client.callTool({
        name,
        arguments: arguments0,
        _meta: {
            "happy2/chat": { id: "chat-1", token: "chat-token" },
            "happy2/viewer": { id: "user-1", token: "viewer-token" },
        },
    }) as Promise<CallToolResult>;
}

function structured(result: CallToolResult): Record<string, unknown> {
    return object(result.structuredContent, "structuredContent");
}

function object(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(`${label} must be an object`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    return value;
}

function string(value: unknown, label: string): string {
    if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
    return value;
}

function snapshotUpdate(document: Y.Doc): string {
    return Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64");
}
