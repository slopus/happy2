import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { HostClient } from "happy2-plugin-sdk/server";
import { afterEach, describe, expect, it } from "vitest";
import { TodosDatabase } from "./database.js";
import { createTodosPlugin } from "./plugin.js";

interface HostRequest {
    readonly body: Record<string, unknown>;
    readonly headers: Record<string, string | string[] | undefined>;
    readonly path: string;
}

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("collaborative TODO MCP server", () => {
    it("creates two sidebar lists, invalidates the selector, and collaborates across viewers", async () => {
        const host = await mockHost();
        const session = await pluginSession(host.client);

        const first = await call(
            session.client,
            "todos_create_list",
            { title: "Launch" },
            callMeta("viewer-a"),
        );
        const second = await call(
            session.client,
            "todos_create_list",
            { title: "Docs" },
            callMeta("viewer-b"),
        );
        const firstId = structured(first).list.id as string;
        expect(structured(second).list).toMatchObject({ title: "Docs" });

        const added = await call(
            session.client,
            "todos_add_item",
            { listId: firstId, title: "Ship build" },
            callMeta("viewer-b"),
        );
        const itemId = (structured(added).items as Array<{ id: string }>)[0]!.id;
        await call(
            session.client,
            "todos_app_toggle_item",
            { completed: true, itemId, listId: firstId },
            callMeta("viewer-a"),
        );
        const snapshot = await call(
            session.client,
            "todos_app_list_snapshot",
            { listId: firstId },
            callMeta("viewer-b"),
        );

        expect(structured(snapshot)).toMatchObject({
            list: { completedCount: 1, itemCount: 1, title: "Launch" },
            items: [{ completed: true, title: "Ship build" }],
        });
        expect(
            (structured(snapshot).activity as Array<{ actorUserId: string }>).map(
                ({ actorUserId }) => actorUserId,
            ),
        ).toEqual(["viewer-a", "viewer-b", "viewer-a"]);

        const appPuts = host.requests.filter(({ path }) => path === "/apps/putInstance");
        expect(appPuts.map(({ body }) => body.instanceKey)).toEqual([
            "todos.index",
            `todos.list.${firstId}`,
            expect.stringMatching(/^todos\.list\./),
            `todos.list.${firstId}`,
            `todos.list.${firstId}`,
            `todos.list.${firstId}`,
        ]);
        expect(
            host.requests.filter(({ path }) => path === "/contributions/putContribution"),
        ).toHaveLength(2);
        const indexUpdates = host.requests.filter(
            ({ body, path }) =>
                path === "/apps/updateInstanceContext" && body.instanceKey === "todos.index",
        );
        expect(
            indexUpdates.map(({ body }) => (body.context as { dataRevision: number }).dataRevision),
        ).toEqual([1, 2, 3, 4]);
        expect(
            host.requests.some(
                ({ headers }) => headers["x-happy2-viewer-token"] === "token-viewer-b",
            ),
        ).toBe(true);
        expect(
            host.requests.every(({ headers }) => headers["x-happy2-chat-token"] === "chat-token"),
        ).toBe(true);
    });

    it("provides meaningful text fallback, strict model visibility metadata, and displayable errors", async () => {
        const host = await mockHost();
        const session = await pluginSession(host.client);
        const tools = await session.client.listTools();

        expect(tools.tools.find(({ name }) => name === "todos_create_list")?._meta).toMatchObject({
            ui: { resourceUri: "ui://happy2-todos/list.html", visibility: ["model"] },
        });
        expect(
            tools.tools.find(({ name }) => name === "todos_app_index_snapshot")?._meta,
        ).toMatchObject({
            ui: { visibility: ["app"] },
        });

        const missingViewer = await call(session.client, "todos_create_list", { title: "Denied" });
        expect(missingViewer).toMatchObject({ isError: true });
        expect(text(missingViewer)).toContain("protected current viewer capability");

        const created = await call(
            session.client,
            "todos_create_list",
            { title: "Fallback" },
            callMeta("viewer-a"),
        );
        expect(text(created)).toBe("Created collaborative TODO list “Fallback” with no items.");
        const listId = structured(created).list.id as string;
        const missingItem = await call(
            session.client,
            "todos_update_item",
            { itemId: "missing", listId, title: "Nope" },
            callMeta("viewer-a"),
        );
        expect(missingItem).toMatchObject({ isError: true });
        expect(text(missingItem)).toBe(`TODO item missing was not found in list ${listId}.`);

        const listed = await call(session.client, "todos_list_lists", {}, callMeta("viewer-a"));
        expect(text(listed)).toBe("Found 1 collaborative TODO list.");
    });
});

async function pluginSession(hostClient: HostClient) {
    let next = 0;
    const database = new TodosDatabase(":memory:", { idFactory: () => `id-${++next}` });
    const runtime = createTodosPlugin({ database, hostClient });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "todos-test", version: "1.0.0" });
    await runtime.server.connect(serverTransport);
    await client.connect(clientTransport);
    cleanups.push(async () => {
        await client.close();
        await runtime.server.close();
        runtime.close();
    });
    return { client, runtime };
}

async function mockHost(): Promise<{ client: HostClient; requests: HostRequest[] }> {
    const requests: HostRequest[] = [];
    const server = createServer(async (request, response) => {
        await capture(request, response, requests);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Mock host did not bind TCP");
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    return {
        client: new HostClient({
            baseUrl: `http://127.0.0.1:${address.port}`,
            token: "runtime-token",
        }),
        requests,
    };
}

async function capture(
    request: IncomingMessage,
    response: ServerResponse,
    requests: HostRequest[],
): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const source = Buffer.concat(chunks).toString("utf8");
    requests.push({
        body: source ? (JSON.parse(source) as Record<string, unknown>) : {},
        headers: request.headers,
        path: new URL(request.url ?? "/", "http://host").pathname,
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":true}');
}

function callMeta(viewerId: string) {
    return {
        "happy2/chat": { id: "chat-1", token: "chat-token" },
        "happy2/viewer": { id: viewerId, token: `token-${viewerId}` },
    };
}

async function call(
    client: Client,
    name: string,
    arguments0: Record<string, unknown>,
    _meta?: Record<string, unknown>,
): Promise<CallToolResult> {
    return client.callTool({ _meta, arguments: arguments0, name }) as Promise<CallToolResult>;
}

function structured(result: CallToolResult): Record<string, any> {
    return result.structuredContent as Record<string, any>;
}

function text(result: CallToolResult): string {
    const content = result.content.find((entry) => entry.type === "text");
    return content?.type === "text" ? content.text : "";
}
