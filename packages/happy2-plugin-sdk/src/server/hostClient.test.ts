import { describe, expect, it, vi } from "vitest";
import { HostApiError, HostClient } from "./hostClient.js";

describe("HostClient", () => {
    it("uses protected headers and removes capabilities from durable audience JSON", async () => {
        let requestUrl: RequestInfo | URL | undefined;
        let requestInit: RequestInit | undefined;
        const fetch: typeof globalThis.fetch = async (url, init) => {
            requestUrl = url;
            requestInit = init;
            return Response.json({ id: "instance-1" });
        };
        const client = new HostClient({
            baseUrl: "http://127.0.0.1:3000/",
            fetch,
            token: "runtime-token",
        });
        await client.putAppInstance(
            {
                assetId: "todo",
                audience: { scope: "user", chatToken: "chat-token" },
                context: { listId: "list-1" },
                description: "Shared tasks",
                instanceKey: "list-1",
                position: 2,
                presentation: "sidebar",
                resourceUri: "ui://todos/list",
                title: "Launch",
            },
            { viewer: { id: "user-1", token: "viewer-token" } },
        );

        expect(String(requestUrl)).toBe("http://127.0.0.1:3000/apps/putInstance");
        const headers = new Headers(requestInit?.headers);
        expect(headers.get("authorization")).toBe("Bearer runtime-token");
        expect(headers.get("x-happy2-viewer-token")).toBe("viewer-token");
        expect(headers.get("x-happy2-chat-token")).toBe("chat-token");
        expect(JSON.parse(String(requestInit?.body))).toMatchObject({
            audience: { scope: "user" },
        });
        expect(JSON.parse(String(requestInit?.body)).audience).not.toHaveProperty("chatToken");
    });

    it("requires current-viewer authority for user-scoped definitions", async () => {
        const client = new HostClient({
            baseUrl: "http://127.0.0.1:3000",
            fetch: vi.fn(),
            token: "token",
        });
        expect(() =>
            client.putContribution({
                audience: { scope: "user" },
                description: "Create a task",
                externalKey: "create-task",
                location: "composerIcon",
                position: 0,
                spec: {
                    action: { toolName: "create_task" },
                    assetId: "plus",
                    description: "Create a task",
                    id: "create",
                    kind: "button",
                    title: "Create task",
                },
                title: "Create task",
            }),
        ).toThrow("current viewer capability");
    });

    it("returns bounded HTTP errors", async () => {
        const client = new HostClient({
            baseUrl: "http://127.0.0.1:3000",
            fetch: async () => new Response("denied", { status: 403 }),
            token: "token",
        });
        await expect(client.deleteAppInstance({ instanceKey: "x" })).rejects.toEqual(
            new HostApiError(403, "denied"),
        );
    });
});
