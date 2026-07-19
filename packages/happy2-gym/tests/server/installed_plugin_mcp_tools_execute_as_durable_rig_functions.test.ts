import { describe, expect, it } from "vitest";
import type {
    PluginLocalOpenInput,
    PluginLocalPrepareInput,
    PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

describe("installed plugin MCP tools in agent runs", () => {
    it("forwards ready tools to Rig and resolves a durable call after server restart", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const pluginRuntime = new GreetingPluginMcpRuntime();
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
            pluginMcpRuntime: pluginRuntime,
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const owner = await server.createUser({ username: "plugin_function_owner" });
        const client = server.as(owner);

        const installed = await client.post("/v0/admin/plugins/hello/installPlugin");
        expect(installed.statusCode).toBe(202);
        const installationId = installed.json().installation.id as string;
        await waitForInstallation(client, installationId, "ready");
        const chatId = await createAgent(client);

        const sent = await client.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Please greet Ada using the installed plugin.",
            clientMutationId: "plugin-function-turn",
        });
        expect(sent.statusCode).toBe(201);
        await waitFor(() => rig.submittedRuns.length === 1, "Rig submission");
        const run = rig.submittedRuns[0]!;
        expect(run.externalTools).toEqual([
            expect.objectContaining({
                description: "Creates a short, friendly greeting for a person.",
                label: "hello: Greet someone",
                name: expect.stringMatching(`^plugin_${installationId}_hello_greet_`),
                parameters: expect.objectContaining({
                    required: ["name"],
                    type: "object",
                }),
            }),
        ]);

        rig.pauseGlobalEventDelivery();
        const callId = rig.requestExternalToolCall(run.runId, run.externalTools[0]!.name, {
            name: "Ada",
        });
        await server.restart();
        rig.resumeGlobalEventDelivery();

        await waitFor(
            () => rig.externalToolCalls.find(({ id }) => id === callId)?.status === "completed",
            "durable plugin function resolution",
            10_000,
        );
        expect(pluginRuntime.calls).toEqual([{ name: "hello_greet", arguments: { name: "Ada" } }]);
        expect(rig.externalToolCalls.find(({ id }) => id === callId)?.resolution).toMatchObject({
            status: "completed",
            output: {
                content: [{ type: "text", text: "Hello, Ada! It’s lovely to meet you." }],
            },
        });
        rig.redeliverExternalToolCall(callId);
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(pluginRuntime.calls).toHaveLength(1);

        rig.completeRun(run.runId, "Hello, Ada! It’s lovely to meet you.");
        const messages = await waitForMessages(client, chatId, 2);
        expect(messages.at(-1)).toMatchObject({
            kind: "automated",
            text: "Hello, Ada! It’s lovely to meet you.",
        });
    });
});

class GreetingPluginMcpRuntime implements PluginMcpRuntime {
    readonly calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

    async prepareLocal(input: PluginLocalPrepareInput): Promise<{ imageTag: string }> {
        return { imageTag: input.imageTag };
    }

    async openLocal(_input: PluginLocalOpenInput) {
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const calls = this.calls;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            async send(message) {
                if (!("id" in message) || !("method" in message)) return;
                let result: Record<string, unknown>;
                if (message.method === "initialize") {
                    result = {
                        protocolVersion: "2025-06-18",
                        capabilities: { tools: {} },
                        serverInfo: { name: "hello-gym", version: "1.0.0" },
                    };
                } else if (message.method === "tools/list") {
                    result = {
                        tools: [
                            {
                                name: "hello_greet",
                                title: "Greet someone",
                                description: "Creates a short, friendly greeting for a person.",
                                inputSchema: {
                                    type: "object",
                                    properties: { name: { type: "string" } },
                                    required: ["name"],
                                    additionalProperties: false,
                                },
                            },
                        ],
                    };
                } else if (message.method === "tools/call") {
                    const params = message.params as {
                        name: string;
                        arguments: Record<string, unknown>;
                    };
                    calls.push(structuredClone(params));
                    result = {
                        content: [
                            {
                                type: "text",
                                text: `Hello, ${String(params.arguments.name)}! It’s lovely to meet you.`,
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

    async removeLocal(): Promise<void> {}
}

async function createAgent(client: GymRequestClient): Promise<string> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
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
        name: "Greeter",
        username: "plugin_greeter",
    });
    expect(created.statusCode).toBe(201);
    return created.json().chat.id as string;
}

async function waitForInstallation(
    client: GymRequestClient,
    installationId: string,
    status: string,
): Promise<void> {
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
                    installation.id === installationId && installation.status === status,
            );
    }, `plugin installation ${status}`);
}

async function waitForMessages(
    client: GymRequestClient,
    chatId: string,
    count: number,
): Promise<Array<Record<string, unknown>>> {
    let messages: Array<Record<string, unknown>> = [];
    await waitFor(async () => {
        messages = (await client.get(`/v0/chats/${chatId}/messages`)).json().messages;
        return messages.length >= count;
    }, `${count} chat messages`);
    return messages;
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
