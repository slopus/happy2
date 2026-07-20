import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import {
    getDefaultEnvironment,
    StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    pluginCatalogLoad,
    type PluginLocalCommandHandle,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient, type GymServer } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

const DOCUMENT_FRAGMENT_NAME = "document";

describe("built-in Documents plugin agent workflow", () => {
    it("creates, lists, and reads Markdown, lands an approved block edit, and preserves content after denial", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const runtime = await CompiledDocumentsRuntime.create();
        try {
            await using server = await createGymServer({
                databaseMode: "file",
                agentSandbox: new MockAgentSandboxRuntime(),
                pluginCatalog: await pluginCatalogLoad(
                    resolve(process.cwd(), "../happy2-server/dist/plugins"),
                ),
                pluginMcpRuntime: runtime,
                configure(config) {
                    config.agents.enabled = true;
                    config.agents.socketPath = rig.socketPath;
                    config.agents.tokenPath = rig.tokenPath;
                    config.agents.defaultCwd = rig.workspaceRoot;
                },
            });
            runtime.attach(server);
            const owner = await server.createUser({ username: "built_in_documents_owner" });
            const client = server.as(owner);
            const installed = await client.post("/v0/admin/plugins/documents/installPlugin", {
                permissions: ["documents:read", "documents:write"],
            });
            expect(installed.statusCode).toBe(202);
            const installationId = installed.json().installation.id as string;
            await waitForInstallation(client, installationId);

            const { agentUserId, chatId } = await createAgent(client);
            const created = await client.post(`/v0/chats/${chatId}/createDocument`, {
                title: "Agent launch brief",
                initialUpdate: await markdownUpdate(
                    "# Launch brief\n\nOriginal launch owner\n\n- Verify the approval flow",
                ),
            });
            expect(created.statusCode).toBe(201);
            const documentId = created.json().document.id as string;

            expect(
                (
                    await client.post(`/v0/chats/${chatId}/sendMessage`, {
                        text: "Read the attached launch brief and update its owner after I approve.",
                        clientMutationId: "built-in-documents-turn",
                    })
                ).statusCode,
            ).toBe(201);
            await waitFor(() => rig.submittedRuns.length === 1, "Documents agent submission");
            const run = rig.submittedRuns[0]!;
            const listTool = tool(run.externalTools, "documents: List attached documents");
            const createTool = tool(run.externalTools, "documents: Create attached document");
            const readTool = tool(run.externalTools, "documents: Read attached document");
            const editTool = tool(run.externalTools, "documents: Propose one document block edit");
            expect(listTool.description).toContain("not visible in message text");
            expect(createTool.description).toContain("does not require member approval");
            expect(readTool.description).toContain("stable ID");
            expect(editTool.description).toContain("blocks until a chat member approves or denies");

            const creationBaseline = (await client.get("/v0/sync/state")).json().state;
            const createCall = rig.requestExternalToolCall(run.runId, createTool.name, {
                title: "Agent-created rollout plan",
                markdown: "# Rollout plan\n\nCreated durably by the **Documents agent**.",
            });
            await waitForTool(rig, createCall, "document creation");
            const createdByAgent = toolStructured(rig, createCall).document;
            const createdDocumentId = string(
                object(createdByAgent, "created document").id,
                "created document id",
            );
            expect(createdByAgent).toEqual({
                id: createdDocumentId,
                title: "Agent-created rollout plan",
                updatedAt: expect.any(String),
                latestSequence: "1",
            });
            expect(
                (await client.get(`/v0/chats/${chatId}/documentWriteRequests`)).json().requests,
            ).toEqual([]);
            const memberDocuments = (await client.get(`/v0/chats/${chatId}/documents`)).json()
                .documents as Array<Record<string, unknown>>;
            expect(memberDocuments.find(({ id }) => id === createdDocumentId)).toMatchObject({
                id: createdDocumentId,
                ownerUserId: owner.id,
                title: "Agent-created rollout plan",
                latestSequence: "1",
                channelAttachments: [{ chatId, attachedByUserId: agentUserId }],
            });
            const creationDifference = await client.post("/v0/sync/getDifference", {
                state: creationBaseline,
            });
            expect(creationDifference.statusCode).toBe(200);
            expect(creationDifference.json().areas).toContain("documents");
            const createdReadCall = rig.requestExternalToolCall(run.runId, readTool.name, {
                documentId: createdDocumentId,
            });
            await waitForTool(rig, createdReadCall, "created document read");
            expect(toolStructured(rig, createdReadCall)).toMatchObject({
                document: { id: createdDocumentId, latestSequence: "1" },
                snapshotSequence: "1",
                markdown: expect.stringContaining("Created durably by the **Documents agent**"),
            });

            const listCall = rig.requestExternalToolCall(run.runId, listTool.name, {});
            await waitForTool(rig, listCall, "document list");
            const listedDocuments = array(
                toolStructured(rig, listCall).documents,
                "listed documents",
            );
            expect(listedDocuments).toHaveLength(2);
            expect(listedDocuments).toEqual(
                expect.arrayContaining([
                    {
                        id: documentId,
                        title: "Agent launch brief",
                        updatedAt: expect.any(String),
                        latestSequence: "1",
                    },
                    {
                        id: createdDocumentId,
                        title: "Agent-created rollout plan",
                        updatedAt: expect.any(String),
                        latestSequence: "1",
                    },
                ]),
            );

            const readCall = rig.requestExternalToolCall(run.runId, readTool.name, { documentId });
            await waitForTool(rig, readCall, "document read");
            const read = toolStructured(rig, readCall);
            expect(read).toMatchObject({
                document: { id: documentId, latestSequence: "1" },
                snapshotSequence: "1",
                markdown: expect.stringContaining("Original launch owner"),
            });
            const blocks = array(read.blocks, "read blocks");
            expect(blocks).toHaveLength(3);
            const ownerBlockId = string(object(blocks[1], "owner block").id, "owner block id");

            const approvedCall = rig.requestExternalToolCall(run.runId, editTool.name, {
                documentId,
                snapshotSequence: "1",
                edit: {
                    kind: "replace",
                    blockId: ownerBlockId,
                    markdown: "Launch owner: **Ada**",
                },
            });
            const approvedRequest = await pendingRequest(client, chatId, 1);
            expect(rig.externalToolCalls.find(({ id }) => id === approvedCall)?.status).toBe(
                "pending",
            );
            expect(await documentMarkdown(client, documentId)).toContain("Original launch owner");
            const approved = await client.post(
                `/v0/chats/${chatId}/documentWriteRequests/${approvedRequest.id}/approveDocumentWrite`,
                {},
            );
            expect(approved.statusCode).toBe(200);
            expect(approved.json().request).toMatchObject({
                status: "approved",
                baseSequence: "1",
                acceptedSequence: "2",
            });
            await waitForTool(rig, approvedCall, "approved document edit");
            expect(toolStructured(rig, approvedCall)).toMatchObject({
                status: "approved",
                requestId: approvedRequest.id,
                documentId,
                acceptedSequence: "2",
                edit: { kind: "replace", blockId: ownerBlockId },
                affectedBlockIds: [ownerBlockId],
            });
            const approvedMarkdown = await documentMarkdown(client, documentId);
            expect(approvedMarkdown).toContain("Launch owner: **Ada**");
            expect(approvedMarkdown).not.toContain("Original launch owner");

            const deniedCall = rig.requestExternalToolCall(run.runId, editTool.name, {
                documentId,
                snapshotSequence: "2",
                edit: {
                    kind: "replace",
                    blockId: ownerBlockId,
                    markdown: "Launch owner: Mallory",
                },
            });
            const deniedRequest = await pendingRequest(client, chatId, 2);
            expect(await documentMarkdown(client, documentId)).toBe(approvedMarkdown);
            const denied = await client.post(
                `/v0/chats/${chatId}/documentWriteRequests/${deniedRequest.id}/denyDocumentWrite`,
                {},
            );
            expect(denied.statusCode).toBe(200);
            expect(denied.json().request).toMatchObject({
                status: "denied",
                baseSequence: "2",
            });
            await waitForTool(rig, deniedCall, "denied document edit");
            expect(toolStructured(rig, deniedCall)).toMatchObject({
                status: "denied",
                requestId: deniedRequest.id,
                documentId,
                message: "Document write was denied by a chat member.",
            });
            expect(await documentMarkdown(client, documentId)).toBe(approvedMarkdown);

            const staleCall = rig.requestExternalToolCall(run.runId, editTool.name, {
                documentId,
                snapshotSequence: "2",
                edit: {
                    kind: "replace",
                    blockId: ownerBlockId,
                    markdown: "Launch owner: Stale agent edit",
                },
            });
            const staleRequest = await pendingRequest(client, chatId, 3);
            const concurrent = await client.post(`/v0/documents/${documentId}/applyUpdates`, {
                clientUpdateId: "member-concurrent-block-edit",
                updates: [
                    await blockReplacementUpdate(
                        client,
                        documentId,
                        ownerBlockId,
                        "Launch owner: **Grace**",
                    ),
                ],
            });
            expect(concurrent.statusCode).toBe(201);
            expect(concurrent.json().acceptedSequence).toBe("3");
            const staleApproval = await client.post(
                `/v0/chats/${chatId}/documentWriteRequests/${staleRequest.id}/approveDocumentWrite`,
                {},
            );
            expect(staleApproval.statusCode).toBe(200);
            expect(staleApproval.json().request).toMatchObject({
                status: "failed",
                baseSequence: "2",
                lastError: expect.stringContaining("current sequence 3"),
            });
            await waitFor(
                () => rig.externalToolCalls.find(({ id }) => id === staleCall)?.status === "failed",
                "stale document edit failure",
            );
            expect(
                rig.externalToolCalls.find(({ id }) => id === staleCall)?.resolution,
            ).toMatchObject({
                status: "failed",
                error: {
                    code: "plugin_mcp_error",
                    data: {
                        structuredContent: {
                            status: "failed",
                            documentId,
                            message: expect.stringContaining("current sequence 3"),
                        },
                    },
                },
            });
            const concurrentMarkdown = await documentMarkdown(client, documentId);
            expect(concurrentMarkdown).toContain("Launch owner: **Grace**");
            expect(concurrentMarkdown).not.toContain("Stale agent edit");
        } finally {
            await runtime.close();
        }
    }, 45_000);
});

class CompiledDocumentsRuntime implements PluginMcpRuntime {
    #host?: GymRequestClient;

    private constructor(
        private readonly bridge: ReturnType<typeof createServer>,
        private readonly bridgeUrl: string,
    ) {}

    static async create(): Promise<CompiledDocumentsRuntime> {
        let runtime: CompiledDocumentsRuntime | undefined;
        const bridge = createServer(
            (request, response) => void runtime?.forward(request, response),
        );
        await new Promise<void>((resolve0, reject) => {
            bridge.once("error", reject);
            bridge.listen(0, "127.0.0.1", resolve0);
        });
        const address = bridge.address();
        if (!address || typeof address === "string")
            throw new Error("Documents plugin host bridge failed");
        runtime = new CompiledDocumentsRuntime(bridge, `http://127.0.0.1:${address.port}`);
        return runtime;
    }

    attach(server: GymServer): void {
        this.#host = server.pluginHost();
    }

    async prepareLocal(input: PluginLocalPrepareInput) {
        return {
            containerInstanceId: input.existingContainerInstanceId ?? input.containerInstanceId,
            imageTag: input.imageTag,
            reused: input.existingContainerInstanceId !== undefined,
        };
    }

    async startLocalCommand(): Promise<PluginLocalCommandHandle> {
        return commandHandle();
    }

    async monitorLocalCommand(): Promise<PluginLocalCommandHandle> {
        return commandHandle();
    }

    async openLocal(input: PluginLocalOpenInput): Promise<Transport> {
        const pluginDirectory = resolve(process.cwd(), "../happy2-plugin-documents/dist/plugin");
        return new StdioClientTransport({
            command: process.execPath,
            args: [join(pluginDirectory, "server.js")],
            cwd: pluginDirectory,
            env: {
                ...getDefaultEnvironment(),
                ...input.environment,
                HAPPY2_PLUGIN_API_URL: this.bridgeUrl,
            },
            stderr: "pipe",
        });
    }

    async removeLocal(): Promise<void> {}

    async isLocalRunning(): Promise<boolean> {
        return true;
    }

    async close(): Promise<void> {
        await new Promise<void>((resolve0) => this.bridge.close(() => resolve0()));
    }

    private async forward(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (!this.#host) {
            response.writeHead(503).end();
            return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(request.headers))
            if (typeof value === "string") headers[name] = value;
        const result = await this.#host.request({
            method: request.method === "GET" ? "GET" : "POST",
            url: request.url ?? "/",
            headers,
            payload: Buffer.concat(chunks),
        });
        response.writeHead(result.statusCode, {
            "content-type": result.headers["content-type"] ?? "application/json",
        });
        response.end(result.rawPayload);
    }
}

function commandHandle(): PluginLocalCommandHandle {
    let finish!: (result: { exitCode: number | null; signal: NodeJS.Signals | null }) => void;
    const wait = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
        (resolve0) => {
            finish = resolve0;
        },
    );
    return { wait, close: () => finish({ exitCode: 0, signal: null }) };
}

async function markdownUpdate(markdown: string): Promise<string> {
    const editor = ServerBlockNoteEditor.create();
    const blocks = await editor.tryParseMarkdownToBlocks(markdown);
    const document = editor.blocksToYDoc(blocks, DOCUMENT_FRAGMENT_NAME);
    return Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64");
}

async function documentMarkdown(client: GymRequestClient, documentId: string): Promise<string> {
    const response = await client.get(`/v0/documents/${documentId}`);
    expect(response.statusCode).toBe(200);
    const document = new Y.Doc();
    Y.applyUpdate(document, Buffer.from(response.json().snapshot.update as string, "base64"));
    const editor = ServerBlockNoteEditor.create();
    return editor.blocksToMarkdownLossy(editor.yDocToBlocks(document, DOCUMENT_FRAGMENT_NAME));
}

async function blockReplacementUpdate(
    client: GymRequestClient,
    documentId: string,
    blockId: string,
    markdown: string,
): Promise<string> {
    const response = await client.get(`/v0/documents/${documentId}`);
    expect(response.statusCode).toBe(200);
    const document = new Y.Doc();
    Y.applyUpdate(document, Buffer.from(response.json().snapshot.update as string, "base64"));
    const before = Y.encodeStateVector(document);
    const editor = ServerBlockNoteEditor.create();
    const blocks = editor.yDocToBlocks(document, DOCUMENT_FRAGMENT_NAME);
    const index = blocks.findIndex(({ id }) => id === blockId);
    if (index < 0) throw new Error(`Block ${blockId} was not found for concurrent replacement`);
    const replacements = await editor.tryParseMarkdownToBlocks(markdown);
    if (!replacements[0]) throw new Error("Concurrent Markdown did not produce a block");
    replacements[0] = { ...replacements[0], id: blockId };
    blocks.splice(index, 1, ...replacements);
    editor.blocksToYXmlFragment(blocks, document.getXmlFragment(DOCUMENT_FRAGMENT_NAME));
    return Buffer.from(Y.encodeStateAsUpdate(document, before)).toString("base64");
}

async function createAgent(
    client: GymRequestClient,
): Promise<{ agentUserId: string; chatId: string }> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready") {
        expect(
            (await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {})).statusCode,
        ).toBe(202);
        await waitFor(async () => {
            catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
            return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
        }, "agent image build");
    }
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
    const created = await client.post("/v0/chats/createAgent", {
        name: "Built-in Documents agent",
        username: "built_in_documents_agent",
    });
    expect(created.statusCode).toBe(201);
    const contacts = (await client.get("/v0/contacts")).json().users as Array<{
        id: string;
        kind: string;
        username: string;
    }>;
    const agent = contacts.find(
        ({ kind, username }) => kind === "agent" && username === "built_in_documents_agent",
    );
    if (!agent) throw new Error("Built-in Documents agent was not found in contacts");
    return { agentUserId: agent.id, chatId: created.json().chat.id as string };
}

async function waitForInstallation(
    client: GymRequestClient,
    installationId: string,
): Promise<void> {
    await waitFor(async () => {
        const response = await client.get("/v0/admin/plugins");
        const installation = (
            response.json().plugins as Array<{
                systemPlugin?: { installations?: Record<string, unknown>[] };
            }>
        )
            .flatMap(({ systemPlugin }) => systemPlugin?.installations ?? [])
            .find(({ id }) => id === installationId);
        if (installation?.status === "failed" || installation?.status === "broken_configuration")
            throw new Error(`Documents plugin failed to start: ${JSON.stringify(installation)}`);
        return installation?.status === "ready";
    }, "Documents plugin installation");
}

async function pendingRequest(
    client: GymRequestClient,
    chatId: string,
    expectedCount: number,
): Promise<Record<string, string>> {
    let pending: Record<string, string> | undefined;
    await waitFor(async () => {
        const requests = (await client.get(`/v0/chats/${chatId}/documentWriteRequests`)).json()
            .requests as Array<Record<string, string>>;
        pending = requests.find(({ status }) => status === "pending");
        return requests.length === expectedCount && pending !== undefined;
    }, "pending document write request");
    return pending!;
}

function tool(
    tools: ReadonlyArray<{ name: string; label?: string; description?: string }>,
    label: string,
): { name: string; label?: string; description?: string } {
    const found = tools.find((candidate) => candidate.label === label);
    if (!found) throw new Error(`Missing external tool ${label}`);
    return found;
}

async function waitForTool(
    rig: Awaited<ReturnType<typeof createMockRigDaemon>>,
    callId: string,
    description: string,
): Promise<void> {
    await waitFor(
        () => rig.externalToolCalls.find(({ id }) => id === callId)?.status === "completed",
        description,
    );
}

function toolStructured(
    rig: Awaited<ReturnType<typeof createMockRigDaemon>>,
    callId: string,
): Record<string, unknown> {
    const call = rig.externalToolCalls.find(({ id }) => id === callId);
    const resolution = object(call?.resolution, "tool resolution");
    const output = object(resolution.output, "tool output");
    return object(output.structuredContent, "tool structured content");
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 10_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve0) => setTimeout(resolve0, 20));
    }
    throw new Error(`Timed out waiting for ${description}`);
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
