import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
    getDefaultEnvironment,
    StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it } from "vitest";
import {
    pluginCatalogLoad,
    type PluginLocalCommandHandle,
    type PluginLocalOpenInput,
    type PluginLocalPrepareInput,
    type PluginMcpRuntime,
} from "happy2-server";
import { createGymServer, type GymRequestClient, type GymServer } from "happy2-gym";

describe("compiled collaborative TODO plugin realtime integration", () => {
    it("publishes a real plugin mutation over SSE and the second viewer sees the new app", async () => {
        const temporary = await mkdtemp(join(tmpdir(), "happy2-todo-realtime-"));
        const runtime = await CompiledTodoRuntime.create(temporary);
        try {
            await using server = await createGymServer({
                pluginCatalog: await pluginCatalogLoad(
                    resolve(process.cwd(), "../happy2-server/dist/plugins"),
                ),
                pluginMcpRuntime: runtime,
            });
            runtime.attach(server);
            const alice = await server.createUser({ username: "todo_realtime_alice" });
            const bob = await server.createUser({ username: "todo_realtime_bob" });
            const asAlice = server.as(alice);
            const asBob = server.as(bob);

            const installed = await asAlice.post("/v0/admin/plugins/todos/installPlugin", {
                permissions: ["apps:manage", "contributions:manage"],
            });
            expect(installed.statusCode).toBe(202);
            const installationId = installed.json().installation.id as string;
            await waitForInstallation(asAlice, installationId);

            const indexPut = await server.pluginHost().post(
                "/apps/putInstance",
                {
                    assetId: "todo-mark",
                    audience: { scope: "all_users" },
                    context: { dataRevision: 0 },
                    description: "Browse and create collaborative TODO lists.",
                    instanceKey: "todos.index",
                    position: 20,
                    presentation: "sidebar",
                    resourceUri: "ui://happy2-todos/index.html",
                    title: "TODO Lists",
                },
                { headers: { authorization: `Bearer ${runtime.runtimeToken()}` } },
            );
            expect(indexPut.statusCode, indexPut.body).toBe(200);
            const indexId = indexPut.json().id as string;
            expect((await visibleApps(asBob)).map(({ id }) => id)).toContain(indexId);

            const baseUrl = await server.listen();
            const abort = new AbortController();
            const response = await fetch(`${baseUrl}/v0/sync/events`, {
                headers: { authorization: `Bearer ${bob.token}` },
                signal: abort.signal,
            });
            expect(response.status).toBe(200);
            const frames = new SseFrames(response.body!.getReader());
            expect((await frames.next()).name).toBe("ready");

            try {
                const created = await asAlice.post(`/v0/apps/${indexId}/callTool`, {
                    name: "todos_app_create_list",
                    arguments: { title: "Shared launch" },
                });
                expect(created.statusCode, created.body).toBe(200);
                const listId = object(created.json().result.structuredContent, "structured content")
                    .list as Record<string, unknown>;
                expect(listId.title).toBe("Shared launch");
                const id = required(listId.id, "created list id");

                const hint = await frames.until(
                    ({ data, name }) =>
                        name === "sync" &&
                        Array.isArray(object(data, "sync frame").areas) &&
                        (object(data, "sync frame").areas as unknown[]).includes("apps"),
                );
                expect(hint.data).toMatchObject({ areas: expect.arrayContaining(["apps"]) });

                const bobApps = await visibleApps(asBob);
                expect(bobApps).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            instanceKey: `todos.list.${id}`,
                            title: "Shared launch",
                        }),
                        expect.objectContaining({
                            id: indexId,
                            dataRevision: expect.any(Number),
                        }),
                    ]),
                );
                expect(
                    Number(
                        bobApps.find(({ id: candidate }) => candidate === indexId)?.dataRevision,
                    ),
                ).toBeGreaterThan(0);
            } finally {
                abort.abort();
                await frames.cancel();
            }
        } finally {
            await runtime.close();
            await rm(temporary, { force: true, recursive: true });
        }
    });
});

type VisibleApp = Record<string, unknown> & { id: string; dataRevision?: number };

class CompiledTodoRuntime implements PluginMcpRuntime {
    #host?: GymRequestClient;
    #runtimeToken?: string;

    private constructor(
        private readonly temporary: string,
        private readonly bridge: ReturnType<typeof createServer>,
        private readonly bridgeUrl: string,
    ) {}

    static async create(temporary: string): Promise<CompiledTodoRuntime> {
        let runtime: CompiledTodoRuntime | undefined;
        const bridge = createServer(
            (request, response) => void runtime?.forward(request, response),
        );
        await new Promise<void>((resolve0, reject) => {
            bridge.once("error", reject);
            bridge.listen(0, "127.0.0.1", resolve0);
        });
        const address = bridge.address();
        if (!address || typeof address === "string") throw new Error("Plugin host bridge failed");
        runtime = new CompiledTodoRuntime(temporary, bridge, `http://127.0.0.1:${address.port}`);
        return runtime;
    }

    attach(server: GymServer): void {
        this.#host = server.pluginHost();
    }

    runtimeToken(): string {
        return required(this.#runtimeToken, "plugin runtime token");
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
        this.#runtimeToken = required(
            input.environment.HAPPY2_PLUGIN_API_TOKEN,
            "plugin runtime token",
        );
        const pluginDirectory = resolve(process.cwd(), "../happy2-plugin-todos/dist/plugin");
        return new StdioClientTransport({
            command: process.execPath,
            args: [join(pluginDirectory, "server.js")],
            cwd: pluginDirectory,
            env: {
                ...getDefaultEnvironment(),
                ...input.environment,
                HAPPY2_PLUGIN_API_URL: this.bridgeUrl,
                HAPPY2_TODOS_DATABASE_PATH: join(this.temporary, "todos.db"),
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

async function waitForInstallation(
    client: GymRequestClient,
    installationId: string,
): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await client.get("/v0/admin/plugins");
        const installation = (
            response.json().plugins as Array<{
                systemPlugin?: { installations?: Record<string, unknown>[] };
            }>
        )
            .flatMap(({ systemPlugin }) => systemPlugin?.installations ?? [])
            .find(({ id }) => id === installationId);
        if (installation?.status === "ready") return;
        if (installation?.status === "failed" || installation?.status === "broken_configuration")
            throw new Error(`TODO plugin failed to start: ${JSON.stringify(installation)}`);
        await new Promise((resolve0) => setTimeout(resolve0, 20));
    }
    throw new Error("Timed out waiting for the TODO plugin to become ready");
}

async function visibleApps(client: GymRequestClient): Promise<VisibleApp[]> {
    const response = await client.get("/v0/apps");
    expect(response.statusCode).toBe(200);
    return response.json().apps as VisibleApp[];
}

class SseFrames {
    #buffer = "";

    constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

    async next(): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const delimiter = this.#buffer.indexOf("\n\n");
            if (delimiter >= 0) {
                const frame = this.#buffer.slice(0, delimiter);
                this.#buffer = this.#buffer.slice(delimiter + 2);
                const name = /^event: ([^\n]+)$/m.exec(frame)?.[1];
                const rawData = /^data: (.*)$/m.exec(frame)?.[1];
                if (name && rawData) return { name, data: JSON.parse(rawData) };
                continue;
            }
            const result = await withTimeout(this.reader.read(), 5_000);
            if (result.done) throw new Error("SSE ended before the expected TODO app hint");
            this.#buffer += new TextDecoder().decode(result.value, { stream: true });
        }
    }

    async until(
        predicate: (frame: { name: string; data: unknown }) => boolean,
    ): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const frame = await this.next();
            if (predicate(frame)) return frame;
        }
    }

    async cancel(): Promise<void> {
        await this.reader.cancel().catch(() => undefined);
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for the TODO app SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function object(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(`${label} must be an object`);
    return value as Record<string, unknown>;
}

function required(value: unknown, label: string): string {
    if (typeof value !== "string" || !value) throw new TypeError(`${label} must be a string`);
    return value;
}
