import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

const ALL_PERMISSIONS = [
    "projects:create",
    "channels:create",
    "channels:create-child",
    "chats:members:add",
    "chats:members:remove",
    "chats:archive",
    "messages:send",
    "messages:delete",
    "messages:history",
    "messages:read",
    "reactions:add",
    "reactions:remove",
    "search:users",
    "search:messages",
    "search:chats",
    "commands:run",
    "workspace:read",
    "workspace:write",
] as const;

describe("granular plugin host collaboration capabilities", () => {
    const temporaryDirectories: string[] = [];

    afterEach(async () => {
        await Promise.all(
            temporaryDirectories
                .splice(0)
                .map((directory) => rm(directory, { force: true, recursive: true })),
        );
    });

    it("scopes chat, search, message, command, and hash-guarded workspace operations independently", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const catalogRoot = await mkdtemp(join(tmpdir(), "happy2-plugin-host-api-"));
        temporaryDirectories.push(catalogRoot);
        await writeCapabilityPlugin(catalogRoot);
        const runtime = new CapabilityRuntime();
        await using server = await createGymServer({
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
        const owner = await server.createUser({ username: "plugin_api_owner" });
        const member = await server.createUser({ username: "plugin_api_member" });
        const outsider = await server.createUser({ username: "plugin_api_outsider" });
        const client = server.as(owner);
        const fullInstallationId = await install(client, [...ALL_PERMISSIONS]);
        const restrictedInstallationId = await install(client, [
            "messages:history",
            "messages:read",
            "search:users",
        ]);
        const catalog = await client.get("/v0/admin/plugins");
        const capabilityPlugin = catalog
            .json()
            .plugins.find((plugin: { shortName: string }) => plugin.shortName === "capability-api");
        const permissionIds = capabilityPlugin.apiPermissions.flatMap(
            (section: { readOnly: Array<{ id: string }>; mutations: Array<{ id: string }> }) =>
                [...section.readOnly, ...section.mutations].map(({ id }) => id),
        );
        expect(new Set(permissionIds)).toEqual(new Set(ALL_PERMISSIONS));
        const originChatId = await createAgent(client);

        let publicChatId = "";
        let fullChatToken = "";
        let fullMessageId = "";
        let fullMessageToken = "";
        runtime.actions.set(fullInstallationId, async ({ chatToken, runtimeToken }) => {
            const currentHeaders = headers(runtimeToken, chatToken);
            const users = await server
                .pluginHost()
                .post(
                    "/search",
                    { query: "plugin_api_member", filters: ["users"] },
                    currentHeaders,
                );
            expect(users.statusCode).toBe(200);
            const userResult = users
                .json()
                .results.find((result: { type: string }) => result.type === "user");
            expect(userResult).toMatchObject({
                type: "user",
                user: { id: member.id },
                token: expect.any(String),
            });
            const memberCapability = { id: member.id, token: userResult.token as string };

            const publicChannel = await server
                .pluginHost()
                .post(
                    "/channels/createChannel",
                    { name: "PluginSearchNeedle public", members: [] },
                    currentHeaders,
                );
            expect(publicChannel.statusCode).toBe(201);
            expect(publicChannel.json()).toMatchObject({
                chat: { kind: "public_channel" },
                token: expect.any(String),
            });
            publicChatId = publicChannel.json().chat.id as string;
            const publicHeaders = headers(runtimeToken, publicChannel.json().token as string);
            expect(
                (
                    await server
                        .pluginHost()
                        .post(
                            "/channels/updateMembers",
                            { add: [memberCapability], remove: [] },
                            publicHeaders,
                        )
                ).statusCode,
            ).toBe(200);
            expect(
                (
                    await server
                        .pluginHost()
                        .post(
                            "/channels/updateMembers",
                            { add: [], remove: [memberCapability] },
                            publicHeaders,
                        )
                ).statusCode,
            ).toBe(200);

            const privateChannel = await server.pluginHost().post(
                "/channels/createChannel",
                {
                    name: "PluginSearchNeedle private",
                    visibility: "private",
                    members: [],
                },
                currentHeaders,
            );
            expect(privateChannel.statusCode).toBe(201);
            expect(privateChannel.json().chat).toMatchObject({
                kind: "private_channel",
            });
            const privateChatId = privateChannel.json().chat.id as string;
            const privateChatToken = privateChannel.json().token as string;
            fullChatToken = privateChatToken;
            const privateHeaders = headers(runtimeToken, privateChatToken);

            const childChannel = await server.pluginHost().post(
                "/channels/createChildChannel",
                {
                    name: "PluginSearchNeedle child",
                    description: "Independent child conversation in the parent workspace.",
                    agentModelId: "gym/alternate-agent",
                    initialMessage: {
                        text: "pluginsearchneedle child opening",
                        audience: "people",
                    },
                },
                privateHeaders,
            );
            expect(childChannel.statusCode).toBe(201);
            expect(childChannel.json()).toMatchObject({
                chat: {
                    kind: "private_channel",
                    parentChatId: privateChatId,
                    agentModelId: "gym/alternate-agent",
                },
                initialMessage: {
                    text: "pluginsearchneedle child opening",
                    audience: "people",
                    automated: true,
                    sender: { id: owner.id },
                },
                token: expect.any(String),
            });

            const added = await server
                .pluginHost()
                .post(
                    "/channels/updateMembers",
                    { add: [memberCapability], remove: [] },
                    privateHeaders,
                );
            expect(added.statusCode).toBe(200);
            expect(added.json().addedUserIds).toEqual([member.id]);
            const removed = await server
                .pluginHost()
                .post(
                    "/channels/updateMembers",
                    { add: [], remove: [memberCapability] },
                    privateHeaders,
                );
            expect(removed.statusCode).toBe(200);
            expect(removed.json().removedUserIds).toEqual([member.id]);

            const sent = await server.pluginHost().post(
                "/messages/send",
                {
                    text: "pluginsearchneedle message",
                    audience: "people",
                    idempotencyKey: "send-once",
                },
                privateHeaders,
            );
            expect(sent.statusCode).toBe(201);
            expect(sent.json()).toMatchObject({
                message: {
                    chatId: privateChatId,
                    sender: { id: owner.id },
                    automated: true,
                },
                token: expect.any(String),
            });
            const messageId = sent.json().message.id as string;
            const messageToken = sent.json().token as string;
            fullMessageId = messageId;
            fullMessageToken = messageToken;
            const messageHeaders = {
                headers: {
                    authorization: `Bearer ${runtimeToken}`,
                    "x-happy2-message-token": messageToken,
                },
            };

            const history = await server
                .pluginHost()
                .get("/messages/history?limit=10", privateHeaders);
            expect(history.statusCode).toBe(200);
            expect(history.json().messages).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: messageId, text: "pluginsearchneedle message" }),
                ]),
            );
            expect(JSON.stringify(history.json())).not.toContain(messageToken);

            const read = await server.pluginHost().get(`/messages/${messageId}`, messageHeaders);
            expect(read.statusCode).toBe(200);
            expect(read.json().message.id).toBe(messageId);
            expect(
                (
                    await server
                        .pluginHost()
                        .get(`/messages/${differentCuid2(messageId)}`, messageHeaders)
                ).statusCode,
            ).toBe(403);

            const reacted = await server
                .pluginHost()
                .post(`/messages/${messageId}/addReaction`, { emoji: "👍" }, messageHeaders);
            expect(reacted.statusCode).toBe(200);
            expect(reacted.json().message.reactions).toHaveLength(1);
            expect(
                (
                    await server
                        .pluginHost()
                        .post(
                            `/messages/${messageId}/removeReaction`,
                            { emoji: "👍" },
                            messageHeaders,
                        )
                ).statusCode,
            ).toBe(200);

            const searched = await server
                .pluginHost()
                .post(
                    "/search",
                    { query: "pluginsearchneedle", filters: ["messages", "chats"] },
                    currentHeaders,
                );
            expect(searched.statusCode).toBe(200);
            const searchResults = searched.json().results as Array<{
                type: string;
                token?: unknown;
                message?: { id?: string };
            }>;
            const searchedMessage = searchResults.find(
                (result) => result.type === "message" && result.message?.id === messageId,
            );
            const searchedChat = searchResults.find((result) => result.type === "channel");
            if (!searchedMessage || !searchedChat)
                throw new Error(`Search results were incomplete: ${JSON.stringify(searchResults)}`);
            expect(searchedMessage.token).toEqual(expect.any(String));
            expect(searchedChat.token).toEqual(expect.any(String));

            const firstChatPage = await server
                .pluginHost()
                .post(
                    "/search",
                    { query: "PluginSearchNeedle", filters: ["chats"], limit: 1 },
                    currentHeaders,
                );
            expect(firstChatPage.statusCode).toBe(200);
            expect(firstChatPage.json().nextCursor).toEqual(expect.any(String));
            const mismatchedCursor = await server.pluginHost().post(
                "/search",
                {
                    query: "PluginSearchNeedle",
                    filters: ["messages"],
                    cursor: firstChatPage.json().nextCursor,
                    limit: 1,
                },
                currentHeaders,
            );
            expect(mismatchedCursor.statusCode).toBe(400);

            const createdFile = await server
                .pluginHost()
                .post(
                    "/workspace/writeFile",
                    { path: "note.txt", expectedHash: null, content: "first\n" },
                    privateHeaders,
                );
            expect(createdFile.statusCode).toBe(201);
            const firstHash = createdFile.json().file.sha256 as string;
            expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
            const file = await server
                .pluginHost()
                .get("/workspace/file?path=note.txt", privateHeaders);
            expect(file.statusCode).toBe(200);
            expect(file.json().file).toMatchObject({ content: "first\n", sha256: firstHash });
            expect(
                (
                    await server
                        .pluginHost()
                        .get(
                            `/workspace/file?path=${encodeURIComponent("../../etc/passwd")}`,
                            privateHeaders,
                        )
                ).statusCode,
            ).toBe(404);
            const conflict = await server
                .pluginHost()
                .post(
                    "/workspace/writeFile",
                    { path: "note.txt", expectedHash: "0".repeat(64), content: "stale\n" },
                    privateHeaders,
                );
            expect(conflict.statusCode).toBe(409);
            expect(conflict.json()).toMatchObject({ currentHash: firstHash });
            const updatedFile = await server
                .pluginHost()
                .post(
                    "/workspace/writeFile",
                    { path: "note.txt", expectedHash: firstHash, content: "second\n" },
                    privateHeaders,
                );
            expect(updatedFile.statusCode).toBe(200);
            expect(updatedFile.json().file.sha256).not.toBe(firstHash);

            const command = await server.pluginHost().post(
                "/commands/run",
                {
                    command: "printf '%s' \"$PLUGIN_GREETING\" && test -f note.txt",
                    environment: { PLUGIN_GREETING: "hello-from-plugin" },
                },
                privateHeaders,
            );
            expect(command.statusCode).toBe(200);
            expect(command.json().command).toMatchObject({
                command: expect.stringContaining("PLUGIN_GREETING"),
                stdout: "hello-from-plugin",
                stderr: "",
                exitCode: 0,
                signal: null,
                timedOut: false,
                outputLimitExceeded: false,
            });
            const failedCommand = await server
                .pluginHost()
                .post("/commands/run", { command: "printf failure >&2; exit 7" }, privateHeaders);
            expect(failedCommand.statusCode).toBe(200);
            expect(failedCommand.json().command).toMatchObject({
                stdout: "",
                stderr: "failure",
                exitCode: 7,
                signal: null,
                timedOut: false,
                outputLimitExceeded: false,
            });
            const signaledCommand = await server
                .pluginHost()
                .post("/commands/run", { command: "kill -TERM $$" }, privateHeaders);
            expect(signaledCommand.statusCode).toBe(200);
            expect(signaledCommand.json().command).toMatchObject({
                exitCode: null,
                signal: "SIGTERM",
                timedOut: false,
                outputLimitExceeded: false,
            });
            const overflowingCommand = await server
                .pluginHost()
                .post(
                    "/commands/run",
                    { command: "/usr/bin/yes x | /usr/bin/head -c 4194305" },
                    privateHeaders,
                );
            expect(overflowingCommand.statusCode).toBe(200);
            expect(overflowingCommand.json().command).toMatchObject({
                exitCode: null,
                timedOut: false,
                outputLimitExceeded: true,
            });

            const deleted = await server
                .pluginHost()
                .post(`/messages/${messageId}/deleteMessage`, {}, messageHeaders);
            expect(deleted.statusCode).toBe(200);
            expect(deleted.json().message.deletedAt).toEqual(expect.any(String));
            const archived = await server
                .pluginHost()
                .post("/chats/archiveChat", {}, privateHeaders);
            expect(archived.statusCode).toBe(200);
            expect(archived.json().chat.archivedAt).toEqual(expect.any(String));
            return { ok: true };
        });

        runtime.actions.set(restrictedInstallationId, async ({ chatToken, runtimeToken }) => {
            const authorization = headers(runtimeToken, chatToken);
            const history = await server
                .pluginHost()
                .get("/messages/history?limit=1", authorization);
            const denied = await server
                .pluginHost()
                .post("/messages/send", { text: "must not send" }, authorization);
            const deniedChild = await server
                .pluginHost()
                .post("/channels/createChildChannel", { name: "Must not create" }, authorization);
            const deniedProject = await server.pluginHost().post(
                "/projects/createProject",
                {
                    name: "Must not create",
                    people: [],
                    channels: [{ name: "Denied", visibility: "private" }],
                },
                authorization,
            );
            expect(history.statusCode).toBe(200);
            expect(denied.statusCode).toBe(403);
            expect(denied.json().message).toContain("messages:send");
            expect(deniedChild.statusCode).toBe(403);
            expect(deniedChild.json().message).toContain("channels:create-child");
            expect(deniedProject.statusCode).toBe(403);
            expect(deniedProject.json().message).toContain("projects:create");
            const users = await server
                .pluginHost()
                .post("/search", { query: "plugin_api_member", filters: ["users"] }, authorization);
            expect(users.statusCode).toBe(200);
            const deniedMessageSearch = await server
                .pluginHost()
                .post(
                    "/search",
                    { query: "pluginsearchneedle", filters: ["messages"] },
                    authorization,
                );
            expect(deniedMessageSearch.statusCode).toBe(403);
            expect(deniedMessageSearch.json().message).toContain("search:messages");
            const deniedAllSearch = await server
                .pluginHost()
                .post("/search", { query: "pluginsearchneedle", filters: "all" }, authorization);
            expect(deniedAllSearch.statusCode).toBe(403);

            expect(fullChatToken).not.toBe("");
            expect(fullMessageId).not.toBe("");
            expect(fullMessageToken).not.toBe("");
            const foreignChat = await server
                .pluginHost()
                .get("/messages/history?limit=1", headers(runtimeToken, fullChatToken));
            expect(foreignChat.statusCode).toBe(403);
            expect(foreignChat.json().message).toContain("another installation");
            const foreignMessage = await server.pluginHost().get(`/messages/${fullMessageId}`, {
                headers: {
                    authorization: `Bearer ${runtimeToken}`,
                    "x-happy2-message-token": fullMessageToken,
                },
            });
            expect(foreignMessage.statusCode).toBe(403);
            expect(foreignMessage.json().message).toContain("another installation");
            return { ok: true };
        });

        expect(
            (
                await client.post(`/v0/chats/${originChatId}/sendMessage`, {
                    text: "Exercise both plugin capability grants.",
                    clientMutationId: "plugin-host-capabilities",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 1, "Rig submission");
        const run = rig.submittedRuns[0]!;
        for (const installationId of [fullInstallationId, restrictedInstallationId]) {
            const tool = run.externalTools.find(({ name }) =>
                name.includes(`plugin_${installationId}_exercise_`),
            );
            if (!tool) throw new Error(`Capability tool ${installationId} was not submitted`);
            const callId = rig.requestExternalToolCall(run.runId, tool.name, {});
            await waitFor(
                () => rig.externalToolCalls.find(({ id }) => id === callId)?.status !== "pending",
                `capability call ${installationId}`,
            );
            const resolution = rig.externalToolCalls.find(({ id }) => id === callId)?.resolution;
            if (resolution?.status !== "completed")
                throw new Error(`Capability call failed: ${JSON.stringify(resolution)}`);
            expect(resolution).toMatchObject({
                status: "completed",
                output: { structuredContent: { ok: true } },
            });
        }

        expect(publicChatId).not.toBe("");
        expect((await server.as(outsider).get(`/v0/chats/${publicChatId}`)).statusCode).toBe(200);
    }, 30_000);
});

class CapabilityRuntime implements PluginMcpRuntime {
    readonly actions = new Map<
        string,
        (input: { runtimeToken: string; chatToken: string }) => Promise<Record<string, unknown>>
    >();
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
                        serverInfo: { name: "capability-gym", version: "1.0.0" },
                    };
                else if (message.method === "tools/list")
                    result = {
                        tools: [
                            {
                                name: "exercise",
                                title: "Exercise plugin API",
                                description: "Exercises the granted plugin host capabilities.",
                                inputSchema: { type: "object", additionalProperties: false },
                            },
                        ],
                    };
                else if (message.method === "tools/call") {
                    const meta = (message.params as { _meta?: Record<string, unknown> })._meta?.[
                        "happy2/chat"
                    ] as { token?: unknown } | undefined;
                    if (typeof meta?.token !== "string")
                        throw new Error("Plugin chat capability was not supplied");
                    const action = this.actions.get(installationId);
                    if (!action) throw new Error(`No action for installation ${installationId}`);
                    const structuredContent = await action({
                        runtimeToken,
                        chatToken: meta.token,
                    });
                    result = {
                        content: [{ type: "text", text: "Capability exercise completed." }],
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

function differentCuid2(value: string): string {
    return `${value.slice(0, -1)}${value.endsWith("a") ? "b" : "a"}`;
}

async function writeCapabilityPlugin(root: string): Promise<void> {
    const directory = join(root, "capability-api");
    await mkdir(join(directory, "container"), { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(join(directory, "container", "Dockerfile"), "FROM scratch\n");
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Capability API",
            shortName: "capability-api",
            description: "Exercises granular Happy plugin host capabilities.",
            variables: [],
            container: {
                dockerfile: "container/Dockerfile",
                permissions: ALL_PERMISSIONS,
            },
            mcp: { type: "stdio", command: "/plugin/server", args: [] },
        }),
    );
}

async function install(client: GymRequestClient, permissions: readonly string[]): Promise<string> {
    const installed = await client.post("/v0/admin/plugins/capability-api/installPlugin", {
        permissions,
    });
    expect(installed.statusCode).toBe(202);
    const installationId = installed.json().installation.id as string;
    await waitFor(async () => {
        const catalog = await client.get("/v0/admin/plugins");
        return catalog
            .json()
            .plugins.flatMap(
                (plugin: {
                    systemPlugin?: { installations?: Array<{ id: string; status: string }> };
                }) => plugin.systemPlugin?.installations ?? [],
            )
            .some(
                (installation: { id: string; status: string }) =>
                    installation.id === installationId && installation.status === "ready",
            );
    }, `plugin installation ${installationId}`);
    return installationId;
}

async function createAgent(client: GymRequestClient): Promise<string> {
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
        name: "Capability agent",
        username: "capability_agent",
    });
    expect(created.statusCode).toBe(201);
    return created.json().chat.id as string;
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${description}`);
}
