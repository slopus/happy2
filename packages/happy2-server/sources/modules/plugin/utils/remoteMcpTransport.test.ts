import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";
import type { WebhookTransport, WebhookTransportRequest } from "../../integrations/types.js";
import { RemotePluginMcpTransport } from "./remoteMcpTransport.js";

describe("RemotePluginMcpTransport", () => {
    it("pins every request and carries the negotiated MCP session through tool execution", async () => {
        const requests: WebhookTransportRequest[] = [];
        const remote: WebhookTransport = {
            async deliver(request) {
                requests.push(structuredClone(request));
                if (request.method === "DELETE") return { statusCode: 405 };
                const message = JSON.parse(request.body) as {
                    id?: string | number;
                    method: string;
                };
                if (message.id === undefined) return { statusCode: 202 };
                const result =
                    message.method === "initialize"
                        ? {
                              protocolVersion: "2025-06-18",
                              capabilities: { tools: {} },
                              serverInfo: { name: "remote-test", version: "1.0.0" },
                          }
                        : message.method === "tools/list"
                          ? {
                                tools: [
                                    {
                                        name: "remote_echo",
                                        description: "Echo input remotely",
                                        inputSchema: { type: "object" },
                                    },
                                ],
                            }
                          : { content: [{ type: "text", text: "remote result" }] };
                return {
                    statusCode: 200,
                    body: JSON.stringify({ jsonrpc: "2.0", id: message.id, result }),
                    ...(message.method === "initialize"
                        ? { headers: { "mcp-session-id": "remote-session" } }
                        : {}),
                };
            },
        };
        let resolutions = 0;
        const transport = new RemotePluginMcpTransport({
            headers: { authorization: "Bearer secret" },
            installationId: "installation1",
            remoteTransport: remote,
            url: "https://mcp.example.test/service",
            urlPolicy: {
                validateForStorage: (url) => url,
                resolveForDelivery: async (url) => {
                    resolutions += 1;
                    return {
                        url,
                        addresses: [{ address: "203.0.113.9", family: 4 }],
                    };
                },
            },
        });
        const client = new Client({ name: "remote-test-client", version: "1.0.0" });
        await client.connect(transport);
        expect((await client.listTools()).tools.map(({ name }) => name)).toEqual(["remote_echo"]);
        expect(
            await client.callTool({ name: "remote_echo", arguments: { value: "hello" } }),
        ).toMatchObject({ content: [{ type: "text", text: "remote result" }] });
        await client.close();

        expect(resolutions).toBe(requests.length);
        expect(requests[0]?.headers).not.toHaveProperty("mcp-session-id");
        expect(
            requests
                .slice(1)
                .every(({ headers }) => headers["mcp-session-id"] === "remote-session"),
        ).toBe(true);
        expect(
            requests.slice(1).every(({ headers }) => headers.authorization === "Bearer secret"),
        ).toBe(true);
        expect(requests.at(-1)).toMatchObject({
            method: "DELETE",
            headers: { "mcp-session-id": "remote-session" },
        });
    });
});
