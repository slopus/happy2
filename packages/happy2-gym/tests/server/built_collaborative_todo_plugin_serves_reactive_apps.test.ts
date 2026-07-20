import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
    getDefaultEnvironment,
    StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

interface HostRequest {
    readonly body: Record<string, unknown>;
    readonly path: string;
    readonly viewerToken?: string;
}

describe("built collaborative TODO plugin", () => {
    it("serves two compiled React apps and reconciles shared lists across viewers", async () => {
        const temporary = await mkdtemp(join(tmpdir(), "happy2-built-todos-"));
        const requests: HostRequest[] = [];
        const host = createServer(
            (request, response) => void hostRequest(request, response, requests),
        );
        await new Promise<void>((resolve0, reject) => {
            host.once("error", reject);
            host.listen(0, "127.0.0.1", resolve0);
        });
        const address = host.address();
        if (!address || typeof address === "string") throw new Error("TODO test host did not bind");
        const serverPath = resolve(process.cwd(), "../happy2-plugin-todos/dist/plugin/server.js");
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: [serverPath],
            cwd: resolve(process.cwd(), "../happy2-plugin-todos/dist/plugin"),
            env: {
                ...getDefaultEnvironment(),
                HAPPY2_PLUGIN_API_TOKEN: "built-todos-token",
                HAPPY2_PLUGIN_API_URL: `http://127.0.0.1:${address.port}`,
                HAPPY2_TODOS_DATABASE_PATH: join(temporary, "todos.db"),
            },
            stderr: "pipe",
        });
        const client = new Client({ name: "happy2-gym-built-todos", version: "1.0.0" });
        try {
            await client.connect(transport);
            const tools = await client.listTools();
            expect(
                tools.tools.find(({ name }) => name === "todos_create_list")?._meta,
            ).toMatchObject({
                ui: { resourceUri: "ui://happy2-todos/list.html", visibility: ["model"] },
            });
            expect(
                tools.tools.find(({ name }) => name === "todos_app_index_snapshot")?._meta,
            ).toMatchObject({ ui: { visibility: ["app"] } });

            const launch = await call(client, "todos_create_list", { title: "Launch" }, "alice");
            const docs = await call(client, "todos_create_list", { title: "Docs" }, "bob");
            const launchId = object(structured(launch).list, "launch list").id;
            expect(typeof launchId).toBe("string");
            expect(object(structured(docs).list, "docs list").title).toBe("Docs");

            const added = await call(
                client,
                "todos_app_add_item",
                { listId: launchId, title: "Ship signed build" },
                "bob",
            );
            const firstItem = array(structured(added).items, "items")[0];
            const itemId = object(firstItem, "item").id;
            await call(
                client,
                "todos_app_toggle_item",
                { completed: true, itemId, listId: launchId },
                "alice",
            );
            const index = await call(client, "todos_app_index_snapshot", {}, "bob");
            expect(array(structured(index).lists, "lists")).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ title: "Launch", completedCount: 1, itemCount: 1 }),
                    expect.objectContaining({ title: "Docs", completedCount: 0, itemCount: 0 }),
                ]),
            );

            for (const uri of ["ui://happy2-todos/index.html", "ui://happy2-todos/list.html"]) {
                const resource = await client.readResource({ uri });
                expect(resource.contents[0]).toMatchObject({
                    mimeType: "text/html;profile=mcp-app",
                    uri,
                });
                const content = resource.contents[0];
                if (!content || !("text" in content))
                    throw new Error("TODO app resource was not text");
                const html = content.text;
                expect(html).toContain('<div id="root"></div>');
                const markup = html
                    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
                    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
                expect(markup).not.toMatch(/<script\b[^>]*\bsrc=/);
            }

            const appPuts = requests.filter(({ path }) => path === "/apps/putInstance");
            expect(appPuts.map(({ body }) => body.instanceKey)).toEqual(
                expect.arrayContaining([
                    "todos.index",
                    expect.stringMatching(/^todos\.list\./),
                    expect.stringMatching(/^todos\.list\./),
                ]),
            );
            expect(
                requests.filter(
                    ({ body, path }) =>
                        path === "/apps/updateInstanceContext" &&
                        body.instanceKey === "todos.index",
                ).length,
            ).toBeGreaterThanOrEqual(4);
            expect(requests.some(({ viewerToken }) => viewerToken === "token-alice")).toBe(true);
            expect(requests.some(({ viewerToken }) => viewerToken === "token-bob")).toBe(true);
        } finally {
            await client.close().catch(() => undefined);
            await transport.close().catch(() => undefined);
            await new Promise<void>((resolve0) => host.close(() => resolve0()));
            await rm(temporary, { recursive: true, force: true });
        }
    });
});

async function hostRequest(
    request: IncomingMessage,
    response: ServerResponse,
    requests: HostRequest[],
): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8");
    requests.push({
        body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
        path: new URL(request.url ?? "/", "http://host").pathname,
        viewerToken:
            typeof request.headers["x-happy2-viewer-token"] === "string"
                ? request.headers["x-happy2-viewer-token"]
                : undefined,
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":true}');
}

async function call(
    client: Client,
    name: string,
    arguments0: Record<string, unknown>,
    viewer: string,
): Promise<CallToolResult> {
    return client.callTool({
        _meta: {
            "happy2/chat": { id: "chat-1", token: "chat-token" },
            "happy2/viewer": { id: viewer, token: `token-${viewer}` },
        },
        arguments: arguments0,
        name,
    }) as Promise<CallToolResult>;
}

function structured(result: CallToolResult): Record<string, unknown> {
    if (!result.structuredContent)
        throw new TypeError(`structured content is missing: ${JSON.stringify(result)}`);
    return object(result.structuredContent, "structured content");
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
