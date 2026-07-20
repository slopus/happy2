import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    pluginCatalogLoad,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient } from "happy2-gym";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";

const APP_URI = "ui://movie-catalog/movie.html";
const APP_MIME = "text/html;profile=mcp-app";
const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("MCP Apps in agent conversations", () => {
    it("restores an authorized app resource and lets it call only app-visible tools", async () => {
        const catalogRoot = await mkdtemp(join(tmpdir(), "happy2-mcp-apps-"));
        try {
            await writeMoviePlugin(catalogRoot);
            await using rig = await createMockRigDaemon();
            rig.setAutomaticReply(undefined);
            const runtime = new MovieAppRuntime();
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
            const owner = await server.createUser({ username: "movie_app_owner" });
            const outsider = await server.createUser({ username: "movie_app_outsider" });
            const client = server.as(owner);
            const installed = await client.post("/v0/admin/plugins/movie-catalog/installPlugin");
            expect(installed.statusCode).toBe(202);
            const installationId = installed.json().installation.id as string;
            await waitForInstallation(client, installationId, "ready");
            expect(runtime.initializeCapabilities).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        extensions: {
                            "io.modelcontextprotocol/ui": { mimeTypes: [APP_MIME] },
                        },
                    }),
                ]),
            );

            const tools = await client.get(
                `/v0/admin/pluginInstallations/${installationId}/mcpTools`,
            );
            expect(tools.statusCode).toBe(200);
            expect(tools.json().tools).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: "movie_show",
                        meta: {
                            ui: { resourceUri: APP_URI, visibility: ["model", "app"] },
                        },
                    }),
                    expect.objectContaining({
                        name: "movie_next",
                        meta: { ui: { visibility: ["app"] } },
                    }),
                ]),
            );

            const chatId = await createAgent(client);
            expect(
                (
                    await client.post(`/v0/chats/${chatId}/sendMessage`, {
                        text: "Show me a classic science-fiction movie.",
                        clientMutationId: "movie-app-turn",
                    })
                ).statusCode,
            ).toBe(201);
            await waitFor(() => rig.submittedRuns.length === 1, "Rig submission");
            const run = rig.submittedRuns[0]!;
            expect(run.externalTools).toHaveLength(2);
            expect(run.externalTools.map(({ label }) => label)).toEqual([
                "movie-catalog: Model-only movie notes",
                "movie-catalog: Show a movie",
            ]);
            expect(run.externalTools.some(({ label }) => label?.includes("Next movie"))).toBe(
                false,
            );
            const showTool = run.externalTools.find(({ label }) => label?.endsWith("Show a movie"));
            if (!showTool) throw new Error("Movie show tool was not submitted to Rig");
            const callId = rig.requestExternalToolCall(run.runId, showTool.name, {
                query: "matrix",
            });
            await waitFor(
                () => rig.externalToolCalls.find(({ id }) => id === callId)?.status === "completed",
                "MCP App tool call",
            );
            expect(rig.externalToolCalls.find(({ id }) => id === callId)?.resolution).toEqual({
                status: "completed",
                output: { content: [{ type: "text", text: "The Matrix (1999)" }] },
            });
            rig.completeRun(run.runId, "Here is The Matrix.");
            const messages = await waitForMessages(client, chatId, 2);
            const assistant = messages.at(-1)!;
            expect(assistant).toMatchObject({
                kind: "automated",
                text: "Here is The Matrix.",
                mcpApps: [
                    {
                        callId,
                        toolName: "movie_show",
                        resourceUri: APP_URI,
                        status: "completed",
                    },
                ],
            });
            const messageId = assistant.id as string;
            const appPath = `/v0/messages/${messageId}/mcpApps/${callId}`;
            expect((await server.get(appPath)).statusCode).toBe(401);
            expect((await server.as(outsider).get(appPath)).statusCode).toBe(404);

            const loaded = await client.get(appPath);
            expect(loaded.statusCode).toBe(200);
            expect(loaded.json()).toEqual({
                app: {
                    callId,
                    toolName: "movie_show",
                    resourceUri: APP_URI,
                    arguments: { query: "matrix" },
                    status: "completed",
                    result: {
                        content: [{ type: "text", text: "The Matrix (1999)" }],
                        structuredContent: {
                            movie: { id: "tt0133093", title: "The Matrix", year: 1999 },
                            position: 0,
                        },
                    },
                },
                resource: {
                    contentHashSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
                    html: "<!doctype html><title>Movie catalog</title><main id=app></main>",
                    meta: {
                        ui: {
                            csp: { connectDomains: [], resourceDomains: [] },
                            permissions: { clipboardWrite: {} },
                            prefersBorder: true,
                        },
                    },
                },
            });
            expect(runtime.resourceReads).toEqual([APP_URI]);

            const next = await client.post(`${appPath}/callTool`, {
                name: "movie_next",
                arguments: { position: 0 },
            });
            expect(next.statusCode).toBe(200);
            expect(next.json().result).toMatchObject({
                content: [{ type: "text", text: "Arrival (2016)" }],
                structuredContent: {
                    movie: { id: "tt2543164", title: "Arrival", year: 2016 },
                    position: 1,
                },
            });
            expect(
                (
                    await client.post(`${appPath}/callTool`, {
                        name: "movie_model_notes",
                        arguments: {},
                    })
                ).statusCode,
            ).toBe(403);
            expect(runtime.calls.at(-1)).toMatchObject({
                name: "movie_next",
                arguments: { position: 0 },
                _meta: {
                    "happy2/chat": {
                        id: chatId,
                        triggeredByUserId: owner.id,
                        token: expect.any(String),
                    },
                    "happy2/users": [
                        expect.objectContaining({
                            id: owner.id,
                            username: "movie_app_owner",
                            triggeredTurn: false,
                            token: expect.any(String),
                        }),
                    ],
                },
            });

            const read = await client.post(`${appPath}/readResource`, { uri: APP_URI });
            expect(read.statusCode).toBe(200);
            expect(read.json().result.contents[0]).toMatchObject({
                uri: APP_URI,
                mimeType: APP_MIME,
            });
            expect(runtime.resourceReads).toEqual([APP_URI, APP_URI]);

            expect((await client.post(`/v0/messages/${messageId}/deleteMessage`)).statusCode).toBe(
                200,
            );
            expect((await client.get(appPath)).statusCode).toBe(404);
        } finally {
            await rm(catalogRoot, { force: true, recursive: true });
        }
    });
});

class MovieAppRuntime implements PluginMcpRuntime {
    readonly calls: Array<{
        name: string;
        arguments: Record<string, unknown>;
        _meta?: Record<string, unknown>;
    }> = [];
    readonly initializeCapabilities: Record<string, unknown>[] = [];
    readonly resourceReads: string[] = [];

    async prepareLocal(input: PluginLocalPrepareInput) {
        return {
            containerInstanceId: input.existingContainerInstanceId ?? input.containerInstanceId,
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

    async openLocal(_input: PluginLocalOpenInput) {
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
                    const params = message.params as { capabilities?: Record<string, unknown> };
                    this.initializeCapabilities.push(structuredClone(params.capabilities ?? {}));
                    result = {
                        protocolVersion: "2025-06-18",
                        capabilities: { resources: {}, tools: {} },
                        serverInfo: { name: "movie-app-gym", version: "1.0.0" },
                    };
                } else if (message.method === "tools/list") {
                    result = { tools: movieTools() };
                } else if (message.method === "resources/read") {
                    const params = message.params as { uri: string };
                    this.resourceReads.push(params.uri);
                    result = {
                        contents: [
                            {
                                uri: params.uri,
                                mimeType: APP_MIME,
                                text: "<!doctype html><title>Movie catalog</title><main id=app></main>",
                                _meta: {
                                    ui: {
                                        csp: { connectDomains: [], resourceDomains: [] },
                                        permissions: { clipboardWrite: {} },
                                        prefersBorder: true,
                                    },
                                },
                            },
                        ],
                    };
                } else if (message.method === "tools/call") {
                    const params = message.params as {
                        name: string;
                        arguments: Record<string, unknown>;
                        _meta?: Record<string, unknown>;
                    };
                    this.calls.push(structuredClone(params));
                    const next = params.name === "movie_next";
                    result = next
                        ? movieResult("tt2543164", "Arrival", 2016, 1)
                        : movieResult("tt0133093", "The Matrix", 1999, 0);
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

function movieTools(): Record<string, unknown>[] {
    const inputSchema = { type: "object", additionalProperties: false };
    return [
        {
            name: "movie_show",
            title: "Show a movie",
            description: "Shows a matching movie in an interactive catalog.",
            inputSchema: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
                additionalProperties: false,
            },
            _meta: { ui: { resourceUri: APP_URI, visibility: ["model", "app"] } },
        },
        {
            name: "movie_next",
            title: "Next movie",
            description: "Moves the catalog to the next movie.",
            inputSchema: {
                type: "object",
                properties: { position: { type: "number" } },
                required: ["position"],
                additionalProperties: false,
            },
            _meta: { ui: { visibility: ["app"] } },
        },
        {
            name: "movie_model_notes",
            title: "Model-only movie notes",
            description: "Returns private model notes.",
            inputSchema,
            _meta: { ui: { visibility: ["model"] } },
        },
    ];
}

function movieResult(id: string, title: string, year: number, position: number) {
    return {
        content: [{ type: "text", text: `${title} (${year})` }],
        structuredContent: { movie: { id, title, year }, position },
    };
}

async function writeMoviePlugin(root: string): Promise<void> {
    const directory = join(root, "movie-catalog");
    await mkdir(join(directory, "container"), { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(
        join(directory, "plugin.json"),
        JSON.stringify({
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Movie Catalog",
            shortName: "movie-catalog",
            description: "Demonstrates an interactive MCP App movie catalog.",
            variables: [],
            container: { dockerfile: "container/Dockerfile", permissions: [] },
            mcp: { type: "stdio", command: "node", args: ["/plugin/server.mjs"] },
        }),
    );
    await writeFile(join(directory, "server.mjs"), "// Replaced by the gym MCP runtime.\n");
    await writeFile(
        join(directory, "container", "Dockerfile"),
        'FROM node:22-alpine\nWORKDIR /plugin\nCOPY server.mjs /plugin/server.mjs\nCMD ["sleep", "infinity"]\n',
    );
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
        name: "Movie Guide",
        username: "movie_guide",
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
        return (
            messages.length >= count &&
            messages.every(
                (message) =>
                    message.kind !== "automated" || message.generationStatus !== "streaming",
            )
        );
    }, `${count} chat messages`);
    return messages;
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 10_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for ${description}`);
}
