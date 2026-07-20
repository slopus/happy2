import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
    pluginCatalogLoad,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);
const DOCUMENT_PERMISSIONS = ["documents:read", "documents:write"] as const;

describe("agent document access with chat-member write approval", () => {
    const temporaryDirectories: string[] = [];

    afterEach(async () => {
        await Promise.all(
            temporaryDirectories
                .splice(0)
                .map((directory) => rm(directory, { force: true, recursive: true })),
        );
    });

    it("scopes reads to the token chat and blocks replay-safe writes until approval or denial", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const catalogRoot = await mkdtemp(join(tmpdir(), "happy2-document-host-api-"));
        temporaryDirectories.push(catalogRoot);
        await writeDocumentPlugin(catalogRoot);
        const runtime = new DocumentRuntime();
        await using server = await createGymServer({
            databaseMode: "file",
            agentSandbox: new MockAgentSandboxRuntime(),
            pluginCatalog: await pluginCatalogLoad(catalogRoot),
            pluginMcpRuntime: runtime,
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const owner = await server.createUser({ username: "document_agent_owner" });
        const outsider = await server.createUser({ username: "document_agent_outsider" });
        const client = server.as(owner);
        const fullInstallationId = await install(client, [...DOCUMENT_PERMISSIONS]);
        const restrictedInstallationId = await install(client, []);

        const catalog = await client.get("/v0/admin/plugins");
        const plugin = catalog
            .json()
            .plugins.find((entry: { shortName: string }) => entry.shortName === "document-api");
        expect(
            plugin.apiPermissions.flatMap(
                (section: { readOnly: Array<{ id: string }>; mutations: Array<{ id: string }> }) =>
                    [...section.readOnly, ...section.mutations].map(({ id }) => id),
            ),
        ).toEqual(DOCUMENT_PERMISSIONS);

        const { agentUserId, chatId } = await createAgent(client);
        const created = await client.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Agent-editable notes",
        });
        expect(created.statusCode).toBe(201);
        const documentId = created.json().document.id as string;
        const otherChannel = await client.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Other documents",
            slug: "other-agent-documents",
        });
        const otherChatId = otherChannel.json().chat.id as string;
        const otherDocument = await client.post(`/v0/chats/${otherChatId}/createDocument`, {
            title: "Never leak this",
        });
        const otherDocumentId = otherDocument.json().document.id as string;

        const approvedUpdate = yjsUpdate("Approved by the requesting human");
        const deniedUpdate = yjsUpdate("This must never be applied");
        let fullChatToken = "";
        let revokedReadReadyResolve!: () => void;
        const revokedReadReady = new Promise<void>((resolve) => {
            revokedReadReadyResolve = resolve;
        });
        let continueRevokedReadResolve!: () => void;
        const continueRevokedRead = new Promise<void>((resolve) => {
            continueRevokedReadResolve = resolve;
        });
        runtime.actions.set(fullInstallationId, async (input) => {
            const requestHeaders = headers(input.runtimeToken, input.chatToken);
            if (input.arguments.mode === "approve") {
                fullChatToken = input.chatToken;
                const listed = await server.pluginHost().get("/documents", requestHeaders);
                expect(listed.statusCode).toBe(200);
                expect(listed.json().documents).toEqual([
                    {
                        id: documentId,
                        title: "Agent-editable notes",
                        format: "blocknote",
                        latestSequence: "0",
                        updatedAt: expect.any(String),
                    },
                ]);
                const read = await server
                    .pluginHost()
                    .get(`/documents/${documentId}`, requestHeaders);
                expect(read.statusCode).toBe(200);
                expect(read.json()).toMatchObject({
                    document: { id: documentId, latestSequence: "0" },
                    snapshot: { sequence: "0", update: expect.any(String) },
                });
                expect(
                    (await server.pluginHost().get(`/documents/${otherDocumentId}`, requestHeaders))
                        .statusCode,
                ).toBe(404);
                const body = {
                    clientUpdateId: "approved-agent-update",
                    updates: [approvedUpdate],
                };
                const [first, replay] = await Promise.all([
                    server
                        .pluginHost()
                        .post(`/documents/${documentId}/applyUpdates`, body, requestHeaders),
                    server
                        .pluginHost()
                        .post(`/documents/${documentId}/applyUpdates`, body, requestHeaders),
                ]);
                expect(replay.json()).toEqual(first.json());
                return first.json() as Record<string, unknown>;
            }
            if (input.arguments.mode === "mismatched-chat-token") {
                const response = await server.pluginHost().post(
                    `/documents/${documentId}/applyUpdates`,
                    {
                        clientUpdateId: "mismatched-chat-update",
                        updates: [deniedUpdate],
                    },
                    headers(input.runtimeToken, fullChatToken),
                );
                return { statusCode: response.statusCode, response: response.json() };
            }
            if (input.arguments.mode === "revoked-member-read") {
                const before = await server
                    .pluginHost()
                    .get(`/documents/${otherDocumentId}`, requestHeaders);
                revokedReadReadyResolve();
                await continueRevokedRead;
                const listed = await server.pluginHost().get("/documents", requestHeaders);
                const read = await server
                    .pluginHost()
                    .get(`/documents/${otherDocumentId}`, requestHeaders);
                return {
                    beforeStatusCode: before.statusCode,
                    listStatusCode: listed.statusCode,
                    readStatusCode: read.statusCode,
                };
            }
            const denied = await server.pluginHost().post(
                `/documents/${documentId}/applyUpdates`,
                {
                    clientUpdateId: "denied-agent-update",
                    updates: [deniedUpdate],
                },
                requestHeaders,
            );
            return denied.json() as Record<string, unknown>;
        });
        runtime.actions.set(restrictedInstallationId, async (input) => {
            const response = await server
                .pluginHost()
                .get("/documents", headers(input.runtimeToken, input.chatToken));
            return { statusCode: response.statusCode, response: response.json() };
        });

        expect(
            (
                await client.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Read this document and propose the requested edit.",
                    clientMutationId: "start-document-agent-turn",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 1, "Rig document-agent submission");
        const run = rig.submittedRuns[0]!;
        const fullTool = run.externalTools.find(({ name }) => name.includes(fullInstallationId));
        const restrictedTool = run.externalTools.find(({ name }) =>
            name.includes(restrictedInstallationId),
        );
        if (!fullTool || !restrictedTool)
            throw new Error("Both document plugin installations were not submitted to Rig");

        const approvedCallId = rig.requestExternalToolCall(run.runId, fullTool.name, {
            mode: "approve",
        });
        await waitFor(async () => {
            const requests = (await client.get(`/v0/chats/${chatId}/documentWriteRequests`)).json()
                .requests as Array<{ status: string }>;
            return requests.length === 1 && requests[0]?.status === "pending";
        }, "pending approved document write request");
        expect(rig.externalToolCalls.find(({ id }) => id === approvedCallId)?.status).toBe(
            "pending",
        );
        const database = createClient({ url: server.config.database.url });
        try {
            const durable = await database.execute({
                sql: "SELECT status FROM plugin_function_results WHERE call_id = ?",
                args: [approvedCallId],
            });
            expect(durable.rows[0]?.status).toBe("in_progress");
            const rows = await database.execute(
                "SELECT COUNT(*) AS count FROM document_write_requests",
            );
            expect(Number(rows.rows[0]?.count)).toBe(1);
        } finally {
            database.close();
        }
        const pending = (await client.get(`/v0/chats/${chatId}/documentWriteRequests`)).json()
            .requests[0] as Record<string, string>;
        expect(pending).toMatchObject({
            status: "pending",
            chatId,
            actorUserId: owner.id,
            requesterInstallationId: fullInstallationId,
            documentId,
            documentTitle: "Agent-editable notes",
            clientUpdateId: "approved-agent-update",
            expiresAt: expect.any(String),
        });
        expect(pending.agentUserId).toEqual(expect.any(String));
        expect(pending).not.toHaveProperty("updates");
        expect(
            (
                await server
                    .as(outsider)
                    .post(
                        `/v0/chats/${chatId}/documentWriteRequests/${pending.id}/approveDocumentWrite`,
                        {},
                    )
            ).statusCode,
        ).toBe(403);
        const approved = await client.post(
            `/v0/chats/${chatId}/documentWriteRequests/${pending.id}/approveDocumentWrite`,
            {},
        );
        expect(approved.statusCode).toBe(200);
        expect(approved.json()).toMatchObject({
            request: {
                id: pending.id,
                status: "approved",
                resolvedByUserId: owner.id,
                acceptedSequence: "1",
            },
            acceptedSequence: "1",
            replayed: false,
        });
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === approvedCallId)?.status ===
                "completed",
            "approved document tool completion",
        );
        expect(
            rig.externalToolCalls.find(({ id }) => id === approvedCallId)?.resolution,
        ).toMatchObject({
            status: "completed",
            output: {
                structuredContent: {
                    status: "approved",
                    requestId: pending.id,
                    documentId,
                    acceptedSequence: "1",
                },
            },
        });
        await expectDocumentText(client, documentId, "Approved by the requesting human", "1");

        const nonAgentToken = runtime.nonContextualTokens.get(fullInstallationId);
        if (!nonAgentToken || !fullChatToken)
            throw new Error("Non-contextual runtime or contextual chat token was not captured");
        const nonAgentWrite = await server
            .pluginHost()
            .post(
                `/documents/${documentId}/applyUpdates`,
                { clientUpdateId: "non-agent-update", updates: [deniedUpdate] },
                headers(nonAgentToken, fullChatToken),
            );
        expect(nonAgentWrite.statusCode).toBe(403);
        expect(nonAgentWrite.json().message).toContain("active Happy agent call");

        const deniedCallId = rig.requestExternalToolCall(run.runId, fullTool.name, {
            mode: "deny",
        });
        await waitFor(async () => {
            const requests = (await client.get(`/v0/chats/${chatId}/documentWriteRequests`)).json()
                .requests as Array<{ status: string }>;
            return requests.length === 2 && requests.some(({ status }) => status === "pending");
        }, "pending denied document write request");
        expect(rig.externalToolCalls.find(({ id }) => id === deniedCallId)?.status).toBe("pending");
        await expectDocumentText(client, documentId, "Approved by the requesting human", "1");
        const requests = (await client.get(`/v0/chats/${chatId}/documentWriteRequests`)).json()
            .requests as Array<Record<string, string>>;
        const deniedRequest = requests.find(({ status }) => status === "pending");
        if (!deniedRequest) throw new Error("Pending denial request was not listed");
        const denied = await client.post(
            `/v0/chats/${chatId}/documentWriteRequests/${deniedRequest.id}/denyDocumentWrite`,
            {},
        );
        expect(denied.statusCode).toBe(200);
        expect(denied.json().request).toMatchObject({
            id: deniedRequest.id,
            status: "denied",
            resolvedByUserId: owner.id,
        });
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === deniedCallId)?.status === "completed",
            "denied document tool completion",
        );
        expect(
            rig.externalToolCalls.find(({ id }) => id === deniedCallId)?.resolution,
        ).toMatchObject({
            status: "completed",
            output: {
                structuredContent: {
                    status: "denied",
                    requestId: deniedRequest.id,
                    documentId,
                    message: "Document write was denied by a chat member.",
                },
            },
        });
        await expectDocumentText(client, documentId, "Approved by the requesting human", "1");

        const restrictedCallId = rig.requestExternalToolCall(run.runId, restrictedTool.name, {
            mode: "read",
        });
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === restrictedCallId)?.status ===
                "completed",
            "restricted document tool completion",
        );
        expect(
            rig.externalToolCalls.find(({ id }) => id === restrictedCallId)?.resolution,
        ).toMatchObject({
            status: "completed",
            output: {
                structuredContent: {
                    statusCode: 403,
                    response: { message: expect.stringContaining("documents:read") },
                },
            },
        });

        const secondConversation = await client.post("/v0/chats/createAgentConversation", {
            agentUserId,
        });
        expect(secondConversation.statusCode).toBe(201);
        const secondChatId = secondConversation.json().chat.id as string;
        expect(secondChatId).not.toBe(chatId);
        expect(
            (
                await client.post(`/v0/chats/${secondChatId}/sendMessage`, {
                    text: "Try a document token from my other conversation.",
                    clientMutationId: "start-mismatched-chat-token-turn",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 2, "second document-agent submission");
        const secondRun = rig.submittedRuns[1]!;
        const secondFullTool = secondRun.externalTools.find(({ name }) =>
            name.includes(fullInstallationId),
        );
        if (!secondFullTool) throw new Error("Document plugin was not submitted to the second run");
        const mismatchedCallId = rig.requestExternalToolCall(secondRun.runId, secondFullTool.name, {
            mode: "mismatched-chat-token",
        });
        await waitFor(async () => {
            if (
                rig.externalToolCalls.find(({ id }) => id === mismatchedCallId)?.status ===
                "completed"
            )
                return true;
            const current = (await client.get(`/v0/chats/${chatId}/documentWriteRequests`)).json()
                .requests as Array<{ status: string }>;
            return current.some(({ status }) => status === "pending");
        }, "mismatched chat-token rejection or vulnerable staged request");
        const mismatchedRequests = (
            await client.get(`/v0/chats/${chatId}/documentWriteRequests`)
        ).json().requests as Array<Record<string, string>>;
        const vulnerableRequest = mismatchedRequests.find(({ status }) => status === "pending");
        if (vulnerableRequest)
            await client.post(
                `/v0/chats/${chatId}/documentWriteRequests/${vulnerableRequest.id}/denyDocumentWrite`,
                {},
            );
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === mismatchedCallId)?.status ===
                "completed",
            "mismatched chat-token tool completion",
        );
        expect(
            rig.externalToolCalls.find(({ id }) => id === mismatchedCallId)?.resolution,
        ).toMatchObject({
            status: "completed",
            output: {
                structuredContent: {
                    statusCode: 403,
                    response: {
                        error: "forbidden",
                        message: expect.stringContaining("another active agent call"),
                    },
                },
            },
        });
        expect(
            (await client.get(`/v0/chats/${chatId}/documentWriteRequests`)).json().requests,
        ).toHaveLength(2);

        expect(
            (
                await client.post(`/v0/chats/${otherChatId}/addMember`, {
                    userId: agentUserId,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await client.post(`/v0/chats/${otherChatId}/addMember`, {
                    userId: outsider.id,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await server.as(outsider).post(`/v0/chats/${otherChatId}/sendMessage`, {
                    audience: "agents",
                    agentUserIds: [agentUserId],
                    text: "Read the attached document before and after I am removed.",
                    clientMutationId: "start-revoked-member-document-read",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 3, "revoked-member agent submission");
        const revokedRun = rig.submittedRuns[2]!;
        const revokedFullTool = revokedRun.externalTools.find(({ name }) =>
            name.includes(fullInstallationId),
        );
        if (!revokedFullTool)
            throw new Error("Document plugin was not submitted to the revoked-member run");
        const revokedReadCallId = rig.requestExternalToolCall(
            revokedRun.runId,
            revokedFullTool.name,
            { mode: "revoked-member-read" },
        );
        await revokedReadReady;
        const removed = await client.post(`/v0/chats/${otherChatId}/removeMember`, {
            userId: outsider.id,
        });
        continueRevokedReadResolve();
        expect(removed.statusCode).toBe(200);
        await waitFor(
            () =>
                rig.externalToolCalls.find(({ id }) => id === revokedReadCallId)?.status ===
                "completed",
            "revoked-member document read completion",
        );
        expect(
            rig.externalToolCalls.find(({ id }) => id === revokedReadCallId)?.resolution,
        ).toMatchObject({
            status: "completed",
            output: {
                structuredContent: {
                    beforeStatusCode: 200,
                    listStatusCode: 404,
                    readStatusCode: 404,
                },
            },
        });
        expect(
            (await server.as(outsider).get(`/v0/chats/${chatId}/documentWriteRequests`)).statusCode,
        ).toBe(403);
    }, 45_000);
});

class DocumentRuntime implements PluginMcpRuntime {
    readonly actions = new Map<
        string,
        (input: {
            runtimeToken: string;
            chatToken: string;
            arguments: Record<string, unknown>;
        }) => Promise<Record<string, unknown>>
    >();
    readonly nonContextualTokens = new Map<string, string>();
    private readonly containers = new Map<
        string,
        { installationId: string; containerInstanceId: string }
    >();

    async prepareLocal(input: PluginLocalPrepareInput) {
        const containerInstanceId = input.existingContainerInstanceId ?? input.containerInstanceId;
        this.containers.set(input.containerName, {
            installationId: input.installationId,
            containerInstanceId,
        });
        return {
            containerInstanceId,
            imageTag: input.imageTag,
            reused: input.existingContainerInstanceId !== undefined,
        };
    }

    async startLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async monitorLocalCommand() {
        return { wait: new Promise<never>(() => undefined), close() {} };
    }

    async openLocal(input: PluginLocalOpenInput) {
        const installationId = input.containerName.replace(/^happy2-plugin-/, "");
        const runtimeToken = input.environment.HAPPY2_PLUGIN_API_TOKEN;
        if (!runtimeToken) throw new Error("Plugin runtime token was not supplied");
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            send: async (message) => {
                if (!("id" in message) || !("method" in message)) return;
                let result: Record<string, unknown>;
                if (message.method === "initialize")
                    result = {
                        protocolVersion: "2025-06-18",
                        capabilities: { tools: {} },
                        serverInfo: { name: "document-api-gym", version: "1.0.0" },
                    };
                else if (message.method === "tools/list") {
                    this.nonContextualTokens.set(installationId, runtimeToken);
                    result = {
                        tools: [
                            {
                                name: "exercise_documents",
                                title: "Exercise document access",
                                description: "Reads a chat document and requests a staged write.",
                                inputSchema: {
                                    type: "object",
                                    properties: { mode: { type: "string" } },
                                    required: ["mode"],
                                    additionalProperties: false,
                                },
                            },
                        ],
                    };
                } else if (message.method === "tools/call") {
                    const params = message.params as {
                        arguments: Record<string, unknown>;
                        _meta?: Record<string, unknown>;
                    };
                    const chat = params._meta?.["happy2/chat"] as { token?: unknown } | undefined;
                    if (typeof chat?.token !== "string")
                        throw new Error("Plugin chat capability was not supplied");
                    const action = this.actions.get(installationId);
                    if (!action) throw new Error(`No document action for ${installationId}`);
                    const structuredContent = await action({
                        runtimeToken,
                        chatToken: chat.token,
                        arguments: params.arguments,
                    });
                    result = {
                        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
                        structuredContent,
                    };
                } else result = {};
                queueMicrotask(() =>
                    transport.onmessage?.({ jsonrpc: "2.0", id: message.id, result }),
                );
            },
        };
        return transport;
    }

    async isLocalRunning(
        containerName: string,
        installationId: string,
        containerInstanceId: string,
    ): Promise<boolean> {
        const container = this.containers.get(containerName);
        return (
            container?.installationId === installationId &&
            container.containerInstanceId === containerInstanceId
        );
    }

    async removeLocal(containerName: string): Promise<void> {
        this.containers.delete(containerName);
    }
}

function headers(runtimeToken: string, chatToken: string) {
    return {
        headers: {
            authorization: `Bearer ${runtimeToken}`,
            "x-happy2-chat-token": chatToken,
        },
    };
}

function yjsUpdate(text: string): string {
    const document = new Y.Doc();
    document.getText("content").insert(0, text);
    return Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64");
}

async function expectDocumentText(
    client: GymRequestClient,
    documentId: string,
    text: string,
    sequence: string,
): Promise<void> {
    const response = await client.get(`/v0/documents/${documentId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().snapshot.sequence).toBe(sequence);
    const document = new Y.Doc();
    Y.applyUpdate(
        document,
        new Uint8Array(Buffer.from(response.json().snapshot.update as string, "base64")),
    );
    expect(document.getText("content").toString()).toBe(text);
}

async function writeDocumentPlugin(root: string): Promise<void> {
    const directory = join(root, "document-api");
    await mkdir(join(directory, "container"), { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(join(directory, "container", "Dockerfile"), "FROM scratch\n");
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Document API",
            shortName: "document-api",
            description: "Exercises chat-scoped document reads and approved writes.",
            variables: [],
            container: {
                dockerfile: "container/Dockerfile",
                permissions: DOCUMENT_PERMISSIONS,
            },
            mcp: { type: "stdio", command: "/plugin/server", args: [] },
        }),
    );
}

async function install(client: GymRequestClient, permissions: readonly string[]): Promise<string> {
    const installed = await client.post("/v0/admin/plugins/document-api/installPlugin", {
        permissions,
    });
    expect(installed.statusCode).toBe(202);
    const installationId = installed.json().installation.id as string;
    await waitFor(async () => {
        const catalog = await client.get("/v0/admin/plugins");
        return catalog
            .json()
            .plugins.flatMap(
                (entry: {
                    systemPlugin?: { installations?: Array<{ id: string; status: string }> };
                }) => entry.systemPlugin?.installations ?? [],
            )
            .some(
                (installation: { id: string; status: string }) =>
                    installation.id === installationId && installation.status === "ready",
            );
    }, `document plugin installation ${installationId}`);
    return installationId;
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
        name: "Document agent",
        username: "document_agent",
    });
    expect(created.statusCode).toBe(201);
    const contacts = (await client.get("/v0/contacts")).json().users as Array<{
        id: string;
        kind: string;
        username: string;
    }>;
    const agent = contacts.find(
        ({ kind, username }) => kind === "agent" && username === "document_agent",
    );
    if (!agent) throw new Error("Document agent was not found in contacts");
    return { agentUserId: agent.id, chatId: created.json().chat.id as string };
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 8_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${description}`);
}
