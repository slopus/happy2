import { describe, expect, it } from "vitest";
import type {
    PluginLocalOpenInput,
    PluginLocalPrepareInput,
    PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

describe("agent plugin chat capabilities", () => {
    it("injects an installation-bound current-chat token and lets Chat Management update only that chat", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const runtime = new ChatManagementRuntime();
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
            pluginMcpRuntime: runtime,
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        runtime.update = async ({ chatToken, input, runtimeToken }) => {
            const response = await server.pluginHost().post("/chats/updateChat", input, {
                headers: {
                    authorization: `Bearer ${runtimeToken}`,
                    "x-happy2-chat-token": chatToken,
                },
            });
            return { statusCode: response.statusCode, body: response.json() };
        };
        const owner = await server.createUser({ username: "plugin_chat_owner" });
        const client = server.as(owner);
        const first = await install(client);
        const second = await install(client);
        const chatId = await createAgent(client);

        expect(
            (
                await server.pluginHost().post(
                    "/chats/updateChat",
                    { title: "Missing capability" },
                    {
                        headers: {
                            authorization: `Bearer ${runtime.tokenFor(first)}`,
                        },
                    },
                )
            ).statusCode,
        ).toBe(403);

        expect(
            (
                await client.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Rename this conversation for the release work.",
                    clientMutationId: "chat-management-turn",
                })
            ).statusCode,
        ).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 1, "Rig submission");
        const run = rig.submittedRuns[0]!;
        const tool = run.externalTools.find(({ name }) => name.startsWith(`plugin_${first}_`));
        if (!tool) throw new Error("The first Chat Management tool was not submitted to Rig");
        const callId = rig.requestExternalToolCall(run.runId, tool.name, {
            title: "Boston release",
            description: "Tracks the final release work.",
        });
        await waitFor(
            () => rig.externalToolCalls.find(({ id }) => id === callId)?.status !== "pending",
            "chat management tool completion",
        );
        const resolvedCall = rig.externalToolCalls.find(({ id }) => id === callId);
        if (resolvedCall?.status !== "completed")
            throw new Error(`Chat management failed: ${JSON.stringify(resolvedCall?.resolution)}`);

        expect(runtime.calls).toHaveLength(1);
        const call = runtime.calls[0]!;
        expect(call).toMatchObject({
            name: "chat_update",
            arguments: {
                title: "Boston release",
                description: "Tracks the final release work.",
            },
            _meta: {
                "happy2/chat": {
                    id: chatId,
                    token: expect.any(String),
                },
            },
        });
        expect(rig.externalToolCalls.find(({ id }) => id === callId)?.resolution).toMatchObject({
            status: "completed",
            output: {
                structuredContent: {
                    chat: {
                        id: chatId,
                        title: "Boston release",
                        description: "Tracks the final release work.",
                    },
                },
            },
        });
        expect((await client.get(`/v0/chats/${chatId}`)).json().chat).toMatchObject({
            id: chatId,
            name: "Boston release",
            topic: "Tracks the final release work.",
        });

        const chatToken = chatMeta(call).token;
        const wrongInstallation = await server.pluginHost().post(
            "/chats/updateChat",
            { title: "Cross-installation replay" },
            {
                headers: {
                    authorization: `Bearer ${runtime.tokenFor(second)}`,
                    "x-happy2-chat-token": chatToken,
                },
            },
        );
        expect(wrongInstallation.statusCode).toBe(403);
        expect(wrongInstallation.json().message).toContain("another installation");

        const spoofedId = await server.pluginHost().post(
            "/chats/updateChat",
            { id: "some-other-chat", title: "Spoofed" },
            {
                headers: {
                    authorization: `Bearer ${runtime.tokenFor(first)}`,
                    "x-happy2-chat-token": chatToken,
                },
            },
        );
        expect(spoofedId.statusCode).toBe(400);
        expect((await client.get(`/v0/chats/${chatId}`)).json().chat.name).toBe("Boston release");
    }, 30_000);
});

type ChatCall = {
    name: string;
    arguments: Record<string, unknown>;
    _meta?: Record<string, unknown>;
};

class ChatManagementRuntime implements PluginMcpRuntime {
    readonly calls: ChatCall[] = [];
    private readonly containers = new Map<
        string,
        { installationId: string; containerInstanceId: string }
    >();
    private readonly runtimeTokens = new Map<string, string>();
    update?: (input: {
        runtimeToken: string;
        chatToken: string;
        input: Record<string, unknown>;
    }) => Promise<{ statusCode: number; body: Record<string, unknown> }>;

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
        this.runtimeTokens.set(installationId, runtimeToken);
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            send: async (message) => {
                if (!("id" in message) || !("method" in message)) return;
                let result: Record<string, unknown>;
                if (message.method === "initialize") {
                    result = {
                        protocolVersion: "2025-06-18",
                        capabilities: { tools: {} },
                        serverInfo: { name: "chat-management-gym", version: "1.0.0" },
                    };
                } else if (message.method === "tools/list") {
                    result = {
                        tools: [
                            {
                                name: "chat_update",
                                title: "Update current chat",
                                description:
                                    "Changes the title or description of the current chat.",
                                inputSchema: {
                                    type: "object",
                                    properties: {
                                        title: { type: "string" },
                                        description: { type: ["string", "null"] },
                                    },
                                    additionalProperties: false,
                                },
                            },
                        ],
                    };
                } else if (message.method === "tools/call") {
                    const call = structuredClone(message.params) as ChatCall;
                    this.calls.push(call);
                    const update = this.update;
                    if (!update) throw new Error("Plugin host update callback is unavailable");
                    const response = await update({
                        runtimeToken,
                        chatToken: chatMeta(call).token,
                        input: call.arguments,
                    });
                    result =
                        response.statusCode === 200
                            ? {
                                  content: [
                                      {
                                          type: "text",
                                          text: `Updated chat ${String(response.body.chat && (response.body.chat as { id?: unknown }).id)}.`,
                                      },
                                  ],
                                  structuredContent: { chat: response.body.chat },
                              }
                            : {
                                  isError: true,
                                  content: [
                                      {
                                          type: "text",
                                          text: String(response.body.message ?? "Update failed"),
                                      },
                                  ],
                              };
                } else {
                    result = {};
                }
                queueMicrotask(() =>
                    transport.onmessage?.({ jsonrpc: "2.0", id: message.id, result }),
                );
            },
        };
        return transport;
    }

    tokenFor(installationId: string): string {
        const token = this.runtimeTokens.get(installationId);
        if (!token) throw new Error(`No runtime token was captured for ${installationId}`);
        return token;
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

function chatMeta(call: ChatCall): { id: string; token: string } {
    const value = call._meta?.["happy2/chat"];
    if (!value || typeof value !== "object") throw new Error("Chat metadata was not supplied");
    const meta = value as { id?: unknown; token?: unknown };
    if (typeof meta.id !== "string" || typeof meta.token !== "string")
        throw new Error("Chat metadata was malformed");
    return { id: meta.id, token: meta.token };
}

async function install(client: GymRequestClient): Promise<string> {
    const installed = await client.post("/v0/admin/plugins/chat-management/installPlugin", {
        permissions: ["chats:update"],
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
        name: "Release agent",
        username: "release_agent",
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
