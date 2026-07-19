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
import { createGymServer } from "happy2-gym";

const SQUARE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);

describe("container plugin commands, durable MCP tools, and host capabilities", () => {
    const temporaryDirectories: string[] = [];

    afterEach(async () => {
        await Promise.all(
            temporaryDirectories
                .splice(0)
                .map((path) => rm(path, { force: true, recursive: true })),
        );
    });

    it("runs container-only and MCP-sidecar commands, refreshes cached tools on restart, and enforces exact host permissions", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-plugin-containers-"));
        temporaryDirectories.push(root);
        await writePlugin(root, "runtime-reader", {
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Runtime Reader",
            shortName: "runtime-reader",
            description: "Runs only a persistent container command.",
            variables: [],
            container: {
                dockerfile: "container/Dockerfile",
                command: "/plugin/worker",
                args: ["--serve"],
                permissions: ["plugins:list"],
            },
        });
        await writePlugin(root, "runtime-isolated", {
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Runtime Isolated",
            shortName: "runtime-isolated",
            description: "Runs without host permissions.",
            variables: [],
            container: {
                dockerfile: "container/Dockerfile",
                command: "/plugin/worker",
                args: [],
                permissions: [],
            },
        });
        await writePlugin(root, "runtime-tools", {
            schemaVersion: 1,
            version: "1.0.0",
            displayName: "Runtime Tools",
            shortName: "runtime-tools",
            description: "Runs a command and MCP together in one container.",
            variables: [],
            container: {
                dockerfile: "container/Dockerfile",
                command: "/plugin/indexer",
                args: ["--watch"],
                permissions: [],
            },
            mcp: { type: "stdio", command: "/plugin/mcp", args: ["--stdio"] },
        });
        const runtime = new ContainerRuntime();
        await using server = await createGymServer({
            pluginCatalog: await pluginCatalogLoad(root),
            pluginMcpRuntime: runtime,
            configure: (config) => {
                config.plugins.hostApiPort = 43123;
            },
        });
        const admin = await server.createUser({ username: "container_plugin_admin" });
        const member = await server.createUser({ username: "container_plugin_member" });

        const reader = await server
            .as(admin)
            .post("/v0/admin/plugins/runtime-reader/installPlugin");
        const adoptedReader = await server
            .as(admin)
            .post("/v0/admin/plugins/runtime-reader/installPlugin");
        const isolated = await server
            .as(admin)
            .post("/v0/admin/plugins/runtime-isolated/installPlugin");
        const tools = await server.as(admin).post("/v0/admin/plugins/runtime-tools/installPlugin");
        expect(reader.statusCode).toBe(202);
        expect(adoptedReader.statusCode).toBe(202);
        expect(isolated.statusCode).toBe(202);
        expect(tools.statusCode).toBe(202);
        const readerId = reader.json().installation.id as string;
        const adoptedReaderId = adoptedReader.json().installation.id as string;
        const isolatedId = isolated.json().installation.id as string;
        const toolsId = tools.json().installation.id as string;
        await Promise.all([
            waitForStatus(server, admin, readerId, "ready"),
            waitForStatus(server, admin, adoptedReaderId, "ready"),
            waitForStatus(server, admin, isolatedId, "ready"),
            waitForStatus(server, admin, toolsId, "ready"),
        ]);

        expect(runtime.prepares).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ installationId: readerId }),
                expect.objectContaining({ installationId: isolatedId }),
                expect.objectContaining({ installationId: toolsId }),
            ]),
        );
        expect(
            runtime.starts.find(({ containerName }) => containerName.endsWith(readerId)),
        ).toEqual(
            expect.objectContaining({
                command: "/plugin/worker",
                args: ["--serve"],
                environment: expect.objectContaining({
                    HAPPY2_PLUGIN_API_URL: "http://happy2.host.internal:43123",
                    HAPPY2_PLUGIN_API_TOKEN: expect.any(String),
                }),
            }),
        );
        expect(runtime.starts.find(({ containerName }) => containerName.endsWith(toolsId))).toEqual(
            expect.objectContaining({ command: "/plugin/indexer", args: ["--watch"] }),
        );
        expect(runtime.opens.find(({ containerName }) => containerName.endsWith(toolsId))).toEqual(
            expect.objectContaining({ command: "/plugin/mcp", args: ["--stdio"] }),
        );

        const cached = await server
            .as(admin)
            .get(`/v0/admin/pluginInstallations/${toolsId}/mcpTools`);
        expect(cached.statusCode).toBe(200);
        expect(cached.json()).toMatchObject({
            syncedAt: expect.any(String),
            tools: [
                {
                    installationId: toolsId,
                    name: "cached_first",
                    description: "Durably cached tool cached_first",
                    inputSchema: { type: "object", properties: { value: { type: "string" } } },
                    syncedAt: expect.any(String),
                },
            ],
        });
        expect(
            (await server.as(member).get(`/v0/admin/pluginInstallations/${toolsId}/mcpTools`))
                .statusCode,
        ).toBe(403);
        const opensAfterDiscovery = runtime.opens.length;
        await server.as(admin).get(`/v0/admin/pluginInstallations/${toolsId}/mcpTools`);
        await server.as(admin).get(`/v0/admin/pluginInstallations/${toolsId}/mcpTools`);
        expect(runtime.opens).toHaveLength(opensAfterDiscovery);

        const readerStart = runtime.starts.find(({ containerName }) =>
            containerName.endsWith(readerId),
        )!;
        const readerToken = readerStart.environment.HAPPY2_PLUGIN_API_TOKEN!;
        const adoptedReaderToken = runtime.starts.find(({ containerName }) =>
            containerName.endsWith(adoptedReaderId),
        )!.environment.HAPPY2_PLUGIN_API_TOKEN!;
        expect((await server.get("/v0/pluginRuntime/plugins")).statusCode).toBe(404);
        const hostList = await server.pluginHost().get("/plugins", {
            headers: { authorization: `Bearer ${readerToken}` },
        });
        expect(hostList.statusCode).toBe(200);
        expect(hostList.json()).toMatchObject({
            installationId: readerId,
            plugins: expect.arrayContaining([
                expect.objectContaining({ id: readerId, shortName: "runtime-reader" }),
                expect.objectContaining({ id: toolsId, shortName: "runtime-tools" }),
            ]),
        });
        const isolatedToken = runtime.starts.find(({ containerName }) =>
            containerName.endsWith(isolatedId),
        )!.environment.HAPPY2_PLUGIN_API_TOKEN!;
        expect(
            (
                await server.pluginHost().get("/plugins", {
                    headers: { authorization: `Bearer ${isolatedToken}` },
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await server.pluginHost().get("/plugins", {
                    headers: { authorization: "Bearer invalid" },
                })
            ).statusCode,
        ).toBe(403);

        runtime.exitCommand(isolatedId, 17);
        await waitForStatus(server, admin, isolatedId, "failed");
        expect(runtime.removals).toContain(`happy2-plugin-${isolatedId}`);

        runtime.toolName = "cached_second";
        const readerStartsBeforeRestart = runtime.starts.filter(({ containerName }) =>
            containerName.endsWith(readerId),
        ).length;
        const opensBeforeRestart = runtime.opens.length;
        await server.restart();
        await waitFor(() => runtime.opens.length > opensBeforeRestart);
        await waitFor(async () => {
            const response = await server
                .as(admin)
                .get(`/v0/admin/pluginInstallations/${toolsId}/mcpTools`);
            return response.json().tools?.[0]?.name === "cached_second";
        });
        expect(
            (
                await server.pluginHost().get("/plugins", {
                    headers: { authorization: `Bearer ${readerToken}` },
                })
            ).statusCode,
        ).toBe(200);
        expect(
            runtime.starts.filter(({ containerName }) => containerName.endsWith(readerId)),
        ).toHaveLength(readerStartsBeforeRestart);
        expect(
            (
                await server.pluginHost().get("/plugins", {
                    headers: { authorization: `Bearer ${readerToken}` },
                })
            ).statusCode,
        ).toBe(200);
        runtime.exitCommand(adoptedReaderId, 19);
        await waitForStatus(server, admin, adoptedReaderId, "failed");
        expect(
            (
                await server.pluginHost().get("/plugins", {
                    headers: { authorization: `Bearer ${adoptedReaderToken}` },
                })
            ).statusCode,
        ).toBe(403);

        runtime.killContainer(readerId);
        expect(
            (
                await server.pluginHost().get("/plugins", {
                    headers: { authorization: `Bearer ${readerToken}` },
                })
            ).statusCode,
        ).toBe(403);
        await waitForStatus(server, admin, readerId, "failed");
    }, 30_000);
});

class ContainerRuntime implements PluginMcpRuntime {
    readonly prepares: PluginLocalPrepareInput[] = [];
    readonly starts: PluginLocalOpenInput[] = [];
    readonly opens: PluginLocalOpenInput[] = [];
    readonly removals: string[] = [];
    private readonly commands = new Map<
        string,
        Set<(result: { exitCode: number | null; signal: NodeJS.Signals | null }) => void>
    >();
    private readonly containers = new Map<
        string,
        { installationId: string; containerInstanceId: string; running: boolean }
    >();
    toolName = "cached_first";

    async prepareLocal(input: PluginLocalPrepareInput) {
        this.prepares.push(structuredClone(input));
        const existing = this.containers.get(input.containerName);
        if (
            existing?.running &&
            existing.installationId === input.installationId &&
            existing.containerInstanceId === input.existingContainerInstanceId
        )
            return {
                containerInstanceId: existing.containerInstanceId,
                imageTag: input.imageTag,
                reused: true,
            };
        this.containers.set(input.containerName, {
            installationId: input.installationId,
            containerInstanceId: input.containerInstanceId,
            running: true,
        });
        return {
            containerInstanceId: input.containerInstanceId,
            imageTag: input.imageTag,
            reused: false,
        };
    }

    async startLocalCommand(input: PluginLocalOpenInput) {
        this.starts.push(structuredClone(input));
        this.commands.set(input.containerName, new Set());
        return this.commandHandle(input.containerName);
    }

    async monitorLocalCommand(containerName: string) {
        return this.commandHandle(containerName);
    }

    exitCommand(installationId: string, exitCode: number): void {
        const entry = [...this.commands.entries()].find(([containerName]) =>
            containerName.endsWith(installationId),
        );
        if (!entry) throw new Error("Plugin command was not started");
        this.commands.delete(entry[0]);
        for (const exit of entry[1]) exit({ exitCode, signal: null });
    }

    killContainer(installationId: string): void {
        const entry = [...this.containers.entries()].find(([, state]) =>
            state.installationId.endsWith(installationId),
        );
        if (!entry) throw new Error("Plugin container was not prepared");
        entry[1].running = false;
    }

    async openLocal(input: PluginLocalOpenInput) {
        this.opens.push(structuredClone(input));
        const toolName = this.toolName;
        type McpTransport = Awaited<ReturnType<PluginMcpRuntime["openLocal"]>>;
        const transport: McpTransport = {
            async start() {},
            async close() {
                transport.onclose?.();
            },
            async send(message) {
                if (!("id" in message) || !("method" in message)) return;
                const result =
                    message.method === "initialize"
                        ? {
                              protocolVersion: "2025-06-18",
                              capabilities: { tools: {} },
                              serverInfo: { name: "container-gym", version: "1.0.0" },
                          }
                        : message.method === "tools/list"
                          ? {
                                tools: [
                                    {
                                        name: toolName,
                                        description: `Durably cached tool ${toolName}`,
                                        inputSchema: {
                                            type: "object",
                                            properties: { value: { type: "string" } },
                                        },
                                    },
                                ],
                            }
                          : {};
                queueMicrotask(() =>
                    transport.onmessage?.({ jsonrpc: "2.0", id: message.id, result }),
                );
            },
        };
        return transport;
    }

    async removeLocal(containerName: string): Promise<void> {
        this.removals.push(containerName);
        this.containers.delete(containerName);
    }

    async isLocalRunning(
        containerName: string,
        installationId: string,
        containerInstanceId: string,
    ): Promise<boolean> {
        const state = this.containers.get(containerName);
        return Boolean(
            state?.running &&
            state.installationId === installationId &&
            state.containerInstanceId === containerInstanceId,
        );
    }

    private commandHandle(containerName: string) {
        const exits = this.commands.get(containerName);
        if (!exits) throw new Error("Plugin command is not running");
        let exit!: (result: { exitCode: number | null; signal: NodeJS.Signals | null }) => void;
        const wait = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => {
                exit = resolve;
            },
        );
        exits.add(exit);
        return {
            wait,
            close: () => {
                exits.delete(exit);
                exit({ exitCode: null, signal: "SIGTERM" });
            },
        };
    }
}

async function writePlugin(
    root: string,
    shortName: string,
    manifest: Record<string, unknown>,
): Promise<void> {
    const directory = join(root, shortName);
    await mkdir(join(directory, "container"), { recursive: true });
    await writeFile(join(directory, "plugin.png"), SQUARE_PNG);
    await writeFile(join(directory, "container", "Dockerfile"), "FROM alpine:3.21\n");
    await writeFile(join(directory, "plugin.json"), JSON.stringify(manifest));
}

async function waitForStatus(
    server: Awaited<ReturnType<typeof createGymServer>>,
    admin: Parameters<typeof server.as>[0],
    installationId: string,
    status: string,
): Promise<void> {
    await waitFor(async () => {
        const response = await server.as(admin).get("/v0/admin/plugins");
        const installation = response
            .json()
            .plugins.flatMap(
                (plugin: { systemPlugin?: { installations?: { id: string; status: string }[] } }) =>
                    plugin.systemPlugin?.installations ?? [],
            )
            .find((item: { id: string }) => item.id === installationId);
        return installation?.status === status;
    });
}

async function waitFor(condition: () => boolean | Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!(await condition())) {
        if (Date.now() >= deadline) throw new Error("Timed out waiting for plugin state");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
