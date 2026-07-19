import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("bundled Environment Management MCP server", () => {
    test("exposes environment tools and calls the capability-scoped host API", async () => {
        const requests: Array<{
            authorization?: string;
            body: string;
            method?: string;
            url?: string;
        }> = [];
        const host = createServer((request, response) => {
            const chunks: Buffer[] = [];
            request.on("data", (chunk: Buffer) => chunks.push(chunk));
            request.on("end", () => {
                requests.push({
                    authorization: request.headers.authorization,
                    body: Buffer.concat(chunks).toString(),
                    method: request.method,
                    url: request.url,
                });
                response.setHeader("content-type", "application/json");
                if (request.url === "/environments")
                    response.end(
                        JSON.stringify({
                            defaultEnvironmentId: "environment-1",
                            environments: [
                                {
                                    id: "environment-1",
                                    name: "Default tools",
                                    status: "ready",
                                    builtin: false,
                                    active: true,
                                },
                            ],
                        }),
                    );
                else if (request.url === "/environments/environment-1/dockerfile")
                    response.end(
                        JSON.stringify({
                            environment: {
                                id: "environment-1",
                                name: "Default tools",
                                dockerfile: "FROM scratch",
                                active: true,
                            },
                        }),
                    );
                else if (request.url === "/environments/createEnvironment")
                    response.end(
                        JSON.stringify({
                            environment: {
                                id: "environment-2",
                                name: "New tools",
                                status: "pending",
                                builtin: false,
                                active: true,
                            },
                        }),
                    );
                else if (request.url === "/environments/environment-1/setDefaultEnvironment")
                    response.end(
                        JSON.stringify({
                            defaultEnvironmentId: "environment-1",
                            environment: {
                                id: "environment-1",
                                name: "Default tools",
                                status: "ready",
                                builtin: false,
                                active: true,
                            },
                        }),
                    );
                else if (request.url === "/environments/environment-2/deactivateEnvironment")
                    response.end(
                        JSON.stringify({ deactivated: true, environmentId: "environment-2" }),
                    );
                else {
                    response.statusCode = 404;
                    response.end(JSON.stringify({ message: "Unexpected test route" }));
                }
            });
        });
        await new Promise<void>((resolve, reject) => {
            host.once("error", reject);
            host.listen(0, "127.0.0.1", resolve);
        });
        try {
            const address = host.address();
            if (!address || typeof address === "string") throw new Error("Test host did not bind");
            const child = spawn(
                process.execPath,
                [join(process.cwd(), "plugins", "environment-management", "server.mjs")],
                {
                    stdio: ["pipe", "pipe", "pipe"],
                    env: {
                        ...process.env,
                        HAPPY2_PLUGIN_API_URL: `http://127.0.0.1:${address.port}`,
                        HAPPY2_PLUGIN_API_TOKEN: "environment-test-token",
                    },
                },
            );
            const output: Buffer[] = [];
            const errors: Buffer[] = [];
            child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
            child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
            child.stdin.end(
                [
                    rpc(1, "initialize", { protocolVersion: "2025-06-18" }),
                    rpc(2, "tools/list", {}),
                    toolCall(3, "happy2_environments_list", {}),
                    toolCall(4, "happy2_environment_get_dockerfile", {
                        environmentId: "environment-1",
                    }),
                    toolCall(5, "happy2_environment_create", {
                        name: "New tools",
                        dockerfile: "FROM alpine:3.21\n",
                    }),
                    toolCall(6, "happy2_environment_set_default", {
                        environmentId: "environment-1",
                    }),
                    toolCall(7, "happy2_environment_deactivate", {
                        environmentId: "environment-2",
                    }),
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
                .map((line) => JSON.parse(line) as Record<string, unknown>);
            expect(responses).toHaveLength(7);
            expect(responses[1]).toMatchObject({
                result: {
                    tools: [
                        { name: "happy2_environments_list" },
                        { name: "happy2_environment_get_dockerfile" },
                        { name: "happy2_environment_create" },
                        { name: "happy2_environment_set_default" },
                        { name: "happy2_environment_deactivate" },
                    ],
                },
            });
            expect(responses.slice(2)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        result: expect.objectContaining({ structuredContent: expect.any(Object) }),
                    }),
                ]),
            );
            expect(requests).toEqual([
                {
                    authorization: "Bearer environment-test-token",
                    body: "",
                    method: "GET",
                    url: "/environments",
                },
                {
                    authorization: "Bearer environment-test-token",
                    body: "",
                    method: "GET",
                    url: "/environments/environment-1/dockerfile",
                },
                {
                    authorization: "Bearer environment-test-token",
                    body: JSON.stringify({
                        name: "New tools",
                        dockerfile: "FROM alpine:3.21\n",
                    }),
                    method: "POST",
                    url: "/environments/createEnvironment",
                },
                {
                    authorization: "Bearer environment-test-token",
                    body: "{}",
                    method: "POST",
                    url: "/environments/environment-1/setDefaultEnvironment",
                },
                {
                    authorization: "Bearer environment-test-token",
                    body: "{}",
                    method: "POST",
                    url: "/environments/environment-2/deactivateEnvironment",
                },
            ]);
        } finally {
            await new Promise<void>((resolve, reject) =>
                host.close((error) => (error ? reject(error) : resolve())),
            );
        }
    });
});

function rpc(id: number, method: string, params: Record<string, unknown>): string {
    return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

function toolCall(id: number, name: string, args: Record<string, unknown>): string {
    return rpc(id, "tools/call", { name, arguments: args });
}
