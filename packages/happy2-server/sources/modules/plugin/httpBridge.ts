import { createId } from "@paralleldrive/cuid2";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PluginService } from "./service.js";

interface BridgeConnection {
    actorUserId: string;
    installationId: string;
    http: StreamableHTTPServerTransport;
    close(): Promise<void>;
    established(): boolean;
    touch(): void;
}

const MAX_HTTP_SESSIONS = 128;
const MAX_HTTP_SESSIONS_PER_ACTOR = 16;
const SESSION_IDLE_MS = 15 * 60_000;

/** Transparently bridges authenticated Streamable HTTP MCP sessions to isolated stdio processes inside one ready plugin container. */
export class PluginMcpHttpBridge {
    private readonly sessions = new Map<string, BridgeConnection>();
    private readonly activeConnections = new Set<BridgeConnection>();
    private readonly connectionCreations = new Set<Promise<BridgeConnection>>();
    private readonly activeByActor = new Map<string, number>();
    private readonly pendingByActor = new Map<string, number>();
    private pendingConnections = 0;
    private closed = false;

    constructor(
        private readonly plugins: PluginService,
        private readonly onError: (error: unknown) => void,
    ) {}

    async handle(
        request: FastifyRequest,
        reply: FastifyReply,
        installationId: string,
        actorUserId: string,
    ): Promise<void> {
        if (this.closed) {
            reply.code(503).send({ error: "plugin_mcp_unavailable" });
            return;
        }
        const sessionId = header(request, "mcp-session-id");
        let connection = sessionId
            ? this.sessions.get(sessionKey(installationId, sessionId))
            : undefined;
        if (connection && connection.actorUserId !== actorUserId) {
            reply.code(404).send({
                jsonrpc: "2.0",
                error: { code: -32_000, message: "No valid MCP session was provided" },
                id: null,
            });
            return;
        }
        let created = false;
        if (!connection) {
            if (sessionId || request.method !== "POST" || !isInitializeRequest(request.body)) {
                reply.code(sessionId ? 404 : 400).send({
                    jsonrpc: "2.0",
                    error: { code: -32_000, message: "No valid MCP session was provided" },
                    id: null,
                });
                return;
            }
            if (this.activeConnections.size + this.pendingConnections >= MAX_HTTP_SESSIONS) {
                reply.code(429).send({ error: "plugin_mcp_session_capacity" });
                return;
            }
            if (
                count(this.activeByActor, actorUserId) + count(this.pendingByActor, actorUserId) >=
                MAX_HTTP_SESSIONS_PER_ACTOR
            ) {
                reply.code(429).send({ error: "plugin_mcp_actor_session_capacity" });
                return;
            }
            this.pendingConnections += 1;
            increment(this.pendingByActor, actorUserId);
            const creation = this.createConnection(installationId, actorUserId);
            this.connectionCreations.add(creation);
            try {
                connection = await creation;
                if (this.closed) {
                    await connection.close();
                    throw new Error("Plugin MCP bridge is closed");
                }
                created = true;
            } finally {
                this.connectionCreations.delete(creation);
                this.pendingConnections -= 1;
                decrement(this.pendingByActor, actorUserId);
            }
        }
        connection.touch();
        reply.hijack();
        try {
            await connection.http.handleRequest(request.raw, reply.raw, request.body);
            if (created && !connection.established()) await connection.close();
        } catch (error) {
            this.onError(error);
            await connection.close();
            throw error;
        }
    }

    async close(): Promise<void> {
        this.closed = true;
        const connections = [...this.activeConnections];
        const creations = [...this.connectionCreations];
        this.sessions.clear();
        await Promise.allSettled([
            ...connections.map((connection) => connection.close()),
            ...creations.map(async (creation) => (await creation).close()),
        ]);
    }

    async closeInstallations(installationIds: readonly string[]): Promise<void> {
        const selected = new Set(installationIds);
        await Promise.allSettled(
            [...this.activeConnections]
                .filter(({ installationId }) => selected.has(installationId))
                .map((connection) => connection.close()),
        );
    }

    private async createConnection(
        installationId: string,
        actorUserId: string,
    ): Promise<BridgeConnection> {
        const upstream = await this.plugins.openLocal(installationId);
        if (this.closed) {
            await upstream.close();
            throw new Error("Plugin MCP bridge is closed");
        }
        let storedKey: string | undefined;
        let closed = false;
        let idleTimer: NodeJS.Timeout | undefined;
        let connection: BridgeConnection;
        const http = new StreamableHTTPServerTransport({
            sessionIdGenerator: createId,
            onsessioninitialized: (sessionId) => {
                storedKey = sessionKey(installationId, sessionId);
                this.sessions.set(storedKey, connection);
            },
            onsessionclosed: async () => connection.close(),
        });
        const close = async (): Promise<void> => {
            if (closed) return;
            closed = true;
            if (idleTimer) clearTimeout(idleTimer);
            if (storedKey) this.sessions.delete(storedKey);
            this.activeConnections.delete(connection);
            decrement(this.activeByActor, actorUserId);
            await Promise.allSettled([http.close(), upstream.close()]);
        };
        const touch = (): void => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => void close(), SESSION_IDLE_MS);
            idleTimer.unref();
        };
        connection = {
            actorUserId,
            installationId,
            http,
            close,
            established: () => storedKey !== undefined,
            touch,
        };
        this.activeConnections.add(connection);
        increment(this.activeByActor, actorUserId);
        touch();
        http.onmessage = (message) => {
            void upstream.send(message).catch((error) => {
                this.onError(error);
                void close();
            });
        };
        upstream.onmessage = (message) => {
            touch();
            void http
                .send(
                    message,
                    related(message) === undefined
                        ? undefined
                        : { relatedRequestId: related(message)! },
                )
                .catch((error) => {
                    this.onError(error);
                    void close();
                });
        };
        http.onerror = (error) => this.onError(error);
        upstream.onerror = (error) => {
            this.onError(error);
            void close();
        };
        http.onclose = () => void close();
        upstream.onclose = () => void close();
        try {
            await Promise.all([http.start(), upstream.start()]);
        } catch (error) {
            await close();
            throw error;
        }
        return connection;
    }
}

function related(message: JSONRPCMessage): string | number | undefined {
    return ("result" in message || "error" in message) &&
        "id" in message &&
        (typeof message.id === "string" || typeof message.id === "number")
        ? message.id
        : undefined;
}

function header(request: FastifyRequest, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
}

function sessionKey(installationId: string, sessionId: string): string {
    return `${installationId}:${sessionId}`;
}

function count(values: ReadonlyMap<string, number>, key: string): number {
    return values.get(key) ?? 0;
}

function increment(values: Map<string, number>, key: string): void {
    values.set(key, count(values, key) + 1);
}

function decrement(values: Map<string, number>, key: string): void {
    const next = count(values, key) - 1;
    if (next > 0) values.set(key, next);
    else values.delete(key);
}
