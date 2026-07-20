import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("bundled Port Sharing MCP server", () => {
    test("exposes contextual share tools, keeps probe tokens internal, and calls the scoped host API", async () => {
        const previewRequests: Array<{ authorization?: string; method?: string; url?: string }> =
            [];
        const preview = createServer((request, response) => {
            previewRequests.push({
                authorization: request.headers.authorization,
                method: request.method,
                url: request.url,
            });
            response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
            response.end("port-sharing preview is healthy");
        });
        const previewUrl = await listen(preview);
        const hostRequests: Array<{
            authorization?: string;
            body: string;
            chatToken?: string;
            method?: string;
            url?: string;
        }> = [];
        let accessSequence = 0;
        const portShare = {
            id: "share-1",
            chatId: "chat-1",
            agentUserId: "agent-1",
            containerPort: 3000,
            name: "Documentation Preview",
            subdomain: "documentation-preview-a1b2c3",
            createdByUserId: "user-1",
            createdAt: "2026-07-20T00:00:00.000Z",
            url: previewUrl,
        };
        const host = createServer((request, response) => {
            void handleHostRequest(request, response, async (body) => {
                hostRequests.push({
                    authorization: request.headers.authorization,
                    body,
                    chatToken: request.headers["x-happy2-chat-token"] as string | undefined,
                    method: request.method,
                    url: request.url,
                });
                if (request.url === "/port-shares" && request.method === "GET")
                    return { portShares: [] };
                if (request.url === "/port-shares/exposePort" && request.method === "POST")
                    return { portShare };
                if (
                    request.url === "/port-shares/share-1/createAccessToken" &&
                    request.method === "POST"
                ) {
                    accessSequence += 1;
                    return {
                        portShare,
                        token: `access-${accessSequence}`,
                        expiresAt: "2026-07-20T01:00:00.000Z",
                        refreshAfter: "2026-07-20T00:15:00.000Z",
                    };
                }
                if (
                    request.url === "/port-shares/share-1/disablePortShare" &&
                    request.method === "POST"
                )
                    return {
                        portShare: { ...portShare, disabledAt: "2026-07-20T00:10:00.000Z" },
                    };
                response.statusCode = 404;
                return { message: "Unexpected test route" };
            });
        });
        const hostUrl = await listen(host);
        try {
            const child = spawn(
                process.execPath,
                [join(process.cwd(), "plugins", "port-sharing", "server.mjs")],
                {
                    stdio: ["pipe", "pipe", "pipe"],
                    env: {
                        ...process.env,
                        HAPPY2_PLUGIN_API_URL: hostUrl,
                        HAPPY2_PLUGIN_API_TOKEN: "runtime-token",
                    },
                },
            );
            const output: Buffer[] = [];
            const errors: Buffer[] = [];
            child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
            child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
            child.stdin.end(
                [
                    "null",
                    "7",
                    "[]",
                    rpc(1, "initialize", { protocolVersion: "2025-06-18" }),
                    rpc(2, "tools/list", {}),
                    toolCall(3, "happy2_port_shares_list", {}),
                    toolCall(4, "happy2_port_share_expose", {
                        name: "Documentation Preview",
                        port: 3000,
                    }),
                    toolCall(5, "happy2_port_share_create_access_token", {
                        portShareId: "share-1",
                    }),
                    toolCall(6, "happy2_port_share_probe", {
                        portShareId: "share-1",
                        path: "/health?full=1",
                        maxBytes: 128,
                    }),
                    toolCall(7, "happy2_port_share_disable", { portShareId: "share-1" }),
                    toolCall(8, "happy2_port_share_probe", {
                        portShareId: "share-1",
                        path: "//different.example/steal",
                    }),
                    toolCall(9, "happy2_port_shares_list", {}, false),
                ].join("\n"),
            );
            const exitCode = await new Promise<number | null>((resolve, reject) => {
                child.once("error", reject);
                child.once("close", resolve);
            });
            expect(exitCode).toBe(0);
            expect(Buffer.concat(errors).toString()).toBe("");
            const responses = Buffer.concat(output)
                .toString()
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line) as RpcResponse);
            expect(responses).toHaveLength(9);
            expect(responses[1]).toMatchObject({
                result: {
                    tools: [
                        { name: "happy2_port_shares_list" },
                        { name: "happy2_port_share_expose" },
                        { name: "happy2_port_share_disable" },
                        { name: "happy2_port_share_create_access_token" },
                        { name: "happy2_port_share_probe" },
                    ],
                },
            });
            expect(responses[4]).toMatchObject({
                result: {
                    content: [{ text: expect.not.stringContaining("access-1") }],
                    structuredContent: { token: "access-1" },
                },
            });
            expect(responses[5]).toMatchObject({
                result: {
                    content: [{ text: "GET /health?full=1 returned HTTP 200." }],
                    structuredContent: {
                        request: { method: "GET", path: "/health?full=1" },
                        response: {
                            status: 200,
                            bodyPreview: "port-sharing preview is healthy",
                            truncated: false,
                        },
                    },
                },
            });
            expect(JSON.stringify(responses[5])).not.toContain("access-2");
            expect(responses[7]).toMatchObject({
                result: {
                    isError: true,
                    content: [{ text: expect.stringContaining("one slash") }],
                },
            });
            expect(responses[8]).toMatchObject({
                result: {
                    isError: true,
                    content: [{ text: "This tool must be called from an active Happy chat." }],
                },
            });
            expect(previewRequests).toEqual([
                {
                    authorization: "Bearer access-2",
                    method: "GET",
                    url: "/health?full=1",
                },
            ]);
            expect(hostRequests).toEqual([
                hostRequest("GET", "/port-shares", ""),
                hostRequest(
                    "POST",
                    "/port-shares/exposePort",
                    JSON.stringify({ name: "Documentation Preview", port: 3000 }),
                ),
                hostRequest("POST", "/port-shares/share-1/createAccessToken", "{}"),
                hostRequest("POST", "/port-shares/share-1/createAccessToken", "{}"),
                hostRequest("POST", "/port-shares/share-1/disablePortShare", "{}"),
            ]);
        } finally {
            await close(host);
            await close(preview);
        }
    });
});

interface RpcResponse {
    readonly result?: {
        readonly content?: ReadonlyArray<{ readonly text?: string }>;
        readonly isError?: boolean;
        readonly structuredContent?: unknown;
        readonly tools?: ReadonlyArray<{ readonly name?: string }>;
    };
}

async function handleHostRequest(
    request: IncomingMessage,
    response: ServerResponse,
    handle: (body: string) => Promise<Record<string, unknown>>,
): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await handle(Buffer.concat(chunks).toString());
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(result));
}

function rpc(id: number, method: string, params: Record<string, unknown>): string {
    return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

function toolCall(
    id: number,
    name: string,
    args: Record<string, unknown>,
    contextual = true,
): string {
    return rpc(id, "tools/call", {
        name,
        arguments: args,
        ...(contextual ? { _meta: { "happy2/chat": { id: "chat-1", token: "chat-token" } } } : {}),
    });
}

function hostRequest(method: string, url: string, body: string) {
    return {
        authorization: "Bearer runtime-token",
        body,
        chatToken: "chat-token",
        method,
        url,
    };
}

function listen(server: ReturnType<typeof createServer>): Promise<string> {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                reject(new Error("Test server did not bind"));
                return;
            }
            resolve(`http://127.0.0.1:${address.port}`);
        });
    });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
    return new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
}
