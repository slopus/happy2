import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it, vi } from "vitest";

it("advertises and forwards child-channel initial messages through the real MCP tool", async () => {
    process.env.HAPPY2_PLUGIN_API_URL = "https://happy.test/plugins/host";
    process.env.HAPPY2_PLUGIN_API_TOKEN = "runtime-token";
    const { server } = await import("./server.js");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
            JSON.stringify({
                chat: { id: "child-1" },
                initialMessage: { audience: "agents", text: "Investigate this." },
            }),
            { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
    const client = new Client({ name: "chat-management-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
        const tool = (await client.listTools()).tools.find(
            ({ name }) => name === "channel_child_create",
        );
        expect(tool?.inputSchema).toMatchObject({
            type: "object",
            properties: {
                initialMessage: {
                    type: "object",
                    properties: {
                        audience: { enum: ["agents", "people"] },
                        text: { type: "string", minLength: 1, maxLength: 40_000 },
                    },
                    required: ["text", "audience"],
                    additionalProperties: false,
                },
            },
            additionalProperties: false,
        });

        const result = await client.callTool({
            name: "channel_child_create",
            arguments: {
                name: "Parallel investigation",
                initialMessage: { audience: "agents", text: "Investigate this." },
            },
            _meta: {
                "happy2/chat": {
                    id: "parent-1",
                    token: "chat-token",
                    triggeredByUserId: "user-1",
                },
            },
        });
        expect(result).toMatchObject({
            structuredContent: {
                chat: { id: "child-1" },
                initialMessage: { audience: "agents", text: "Investigate this." },
            },
        });
        expect(fetch).toHaveBeenCalledOnce();
        expect(String(fetch.mock.calls[0]?.[0])).toBe(
            "https://happy.test/plugins/host/channels/createChildChannel",
        );
        const request = fetch.mock.calls[0]?.[1];
        expect(request).toMatchObject({ method: "POST" });
        expect(request?.headers).toMatchObject({ "x-happy2-chat-token": "chat-token" });
        expect(JSON.parse(String(request?.body))).toEqual({
            name: "Parallel investigation",
            initialMessage: { audience: "agents", text: "Investigate this." },
        });
    } finally {
        await client.close();
        await server.close();
        fetch.mockRestore();
        delete process.env.HAPPY2_PLUGIN_API_URL;
        delete process.env.HAPPY2_PLUGIN_API_TOKEN;
    }
});
