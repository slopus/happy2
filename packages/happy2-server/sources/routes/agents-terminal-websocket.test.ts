import Fastify, { type FastifyInstance } from "fastify";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { RigHttpError, type AgentService } from "../modules/agents/index.js";
import type { AuthService } from "../modules/auth/service.js";
import { CollaborationError } from "../modules/chat/types.js";
import { registerAgentRoutes } from "./agents.js";

const TERMINAL_PROTOCOL = "happy2-terminal.v1";

describe("agent terminal WebSocket route", () => {
    const streams: PassThrough[] = [];
    let baseUrl = "";
    let app: FastifyInstance;

    beforeEach(async () => {
        app = Fastify({ logger: false });
        const auth = {
            async authenticate(request: { headers: Record<string, unknown> }) {
                const authorization = request.headers.authorization;
                if (authorization === "Bearer throw") throw new Error("authentication failed");
                if (authorization !== "Bearer valid") return undefined;
                return { user: { id: "user-1" } };
            },
        } as unknown as AuthService;
        const agents = {
            async attachTerminal(input: { terminalId: string }) {
                switch (input.terminalId) {
                    case "forbidden":
                        throw new CollaborationError("forbidden", "Forbidden terminal");
                    case "invalid":
                        throw new CollaborationError("invalid", "Invalid terminal");
                    case "missing":
                        throw new RigHttpError(404, "Missing terminal");
                    case "conflict":
                        throw new RigHttpError(409, "Terminal conflict");
                    case "unexpected-rig":
                        throw new RigHttpError(418, "Unexpected Rig response");
                    case "broken":
                        throw new Error("Attachment failed");
                }
                const stream = new PassThrough();
                streams.push(stream);
                return stream;
            },
        } as unknown as AgentService;
        registerAgentRoutes(app, auth, agents);
        baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    });

    afterEach(async () => {
        for (const stream of streams.splice(0)) stream.destroy();
        await app.close();
    });

    it("authenticates, maps attachment failures, and bridges binary traffic", async () => {
        expect(await status("ready", [])).toBe(400);
        expect(await status("ready", [TERMINAL_PROTOCOL])).toBe(401);
        expect(await status("forbidden", authorizedProtocols())).toBe(403);
        expect(await status("invalid", authorizedProtocols())).toBe(400);
        expect(await status("missing", authorizedProtocols())).toBe(404);
        expect(await status("conflict", authorizedProtocols())).toBe(409);
        expect(await status("unexpected-rig", authorizedProtocols())).toBe(502);
        expect(await status("broken", authorizedProtocols())).toBe(502);
        expect(await status("ready", [TERMINAL_PROTOCOL, "happy2-auth.throw"])).toBe(500);

        const socket = new WebSocket(terminalUrl("ready"), authorizedProtocols());
        await new Promise<void>((resolve, reject) => {
            socket.once("open", resolve);
            socket.once("error", reject);
        });
        expect(socket.protocol).toBe(TERMINAL_PROTOCOL);
        const received = new Promise<Buffer>((resolve) => {
            socket.once("message", (data) => resolve(Buffer.from(data as Buffer)));
        });
        socket.send(Buffer.from([0, 1, 2, 255]));
        await expect(received).resolves.toEqual(Buffer.from([0, 1, 2, 255]));
        socket.terminate();
    });

    function authorizedProtocols(): string[] {
        return [TERMINAL_PROTOCOL, "happy2-auth.valid"];
    }

    function terminalUrl(terminalId: string): string {
        const url = new URL(
            `/v0/chats/chat-1/agents/agent-1/terminals/${terminalId}/attach`,
            baseUrl,
        );
        url.protocol = "ws:";
        return url.toString();
    }

    async function status(terminalId: string, protocols: string[]): Promise<number> {
        const socket = new WebSocket(terminalUrl(terminalId), protocols);
        return await new Promise<number>((resolve, reject) => {
            socket.once("unexpected-response", (_request, response) => {
                const responseStatus = response.statusCode ?? 500;
                response.resume();
                socket.terminate();
                resolve(responseStatus);
            });
            socket.once("open", () => {
                socket.terminate();
                reject(new Error("WebSocket unexpectedly connected"));
            });
            socket.once("error", reject);
        });
    }
});
