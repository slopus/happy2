import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface RigBlock {
    type: "text";
    text: string;
}

interface RigMessage {
    role: "agent" | "user";
    blocks: RigBlock[];
}

interface RigEvent {
    createdAt: number;
    data: Record<string, unknown>;
    id: string;
    sessionId: string;
    type: string;
}

interface GlobalEvent {
    cursor: number;
    event: RigEvent;
}

interface GlobalEventStream {
    cursor: number;
    response: ServerResponse;
}

interface MockSession {
    events: RigEvent[];
    id: string;
    lastEventId?: string;
    messages: RigMessage[];
    status: string;
}

export interface MockRigRun {
    runId: string;
    sessionId: string;
    text: string;
}

/**
 * Programmable black-box Rig protocol server bound to a real Unix socket.
 * Sessions and the opt-in durable global event queue survive `restart()`.
 */
export class MockRigDaemon implements AsyncDisposable {
    readonly createdCwds: string[] = [];
    readonly submittedRuns: MockRigRun[] = [];
    readonly submittedTexts: string[] = [];
    readonly trimRequests: number[] = [];
    readonly tokenPath: string;
    readonly socketPath: string;
    readonly workspaceRoot: string;
    configPatchCount = 0;
    configReadCount = 0;
    cursorRejections = 0;
    globalEventReadCount = 0;
    globalStreamRequestCount = 0;
    sessionEventRequestCount = 0;
    sessionStreamRequestCount = 0;
    submissionAttemptCount = 0;
    private automaticReply: string | undefined = "All tests are passing.";
    private dropSubmissionResponse = false;
    private durableGlobalEventQueue = false;
    private eventSequence = 0;
    private globalEventDeliveryPaused = false;
    private globalCursor = 0;
    private submissionsPaused = false;
    private readonly globalEvents: GlobalEvent[] = [];
    private readonly globalEventStreams = new Set<GlobalEventStream>();
    private runSequence = 0;
    private server = createServer();
    private readonly sessions = new Map<string, MockSession>();
    private readonly sockets = new Set<Socket>();
    private token = "test-token";
    private tokenSequence = 0;
    private trimmedThrough = 0;

    get durableGlobalEventQueueEnabled(): boolean {
        return this.durableGlobalEventQueue;
    }

    private constructor(private readonly directory: string) {
        this.socketPath = join(directory, "rig.sock");
        this.tokenPath = join(directory, "token");
        this.workspaceRoot = join(directory, "workspace");
    }

    static async create(): Promise<MockRigDaemon> {
        const directory = await mkdtemp(join(tmpdir(), "rigged-gym-rig-"));
        const daemon = new MockRigDaemon(directory);
        await writeFile(daemon.tokenPath, daemon.token, { mode: 0o600 });
        await daemon.startServer();
        return daemon;
    }

    setAutomaticReply(reply: string | undefined): void {
        this.automaticReply = reply;
    }

    dropNextSubmissionResponseAfterAccept(): void {
        this.dropSubmissionResponse = true;
    }

    pauseSubmissions(): void {
        this.submissionsPaused = true;
    }

    resumeSubmissions(): void {
        this.submissionsPaused = false;
    }

    completeRun(runId: string, text: string): void {
        const run = this.submittedRuns.find((candidate) => candidate.runId === runId);
        if (!run) throw new Error(`Unknown mock Rig run ${runId}`);
        const session = this.requireSession(run.sessionId);
        const message: RigMessage = { role: "agent", blocks: [{ type: "text", text }] };
        session.messages.push(message);
        this.append(session, "agent_message", { message, runId });
        session.status = "completed";
        this.append(session, "run_finished", {
            agentRunId: `agent-${runId}`,
            modelLocked: false,
            runId,
            stopReason: "stop",
        });
    }

    failRun(runId: string, errorMessage: string): void {
        const run = this.submittedRuns.find((candidate) => candidate.runId === runId);
        if (!run) throw new Error(`Unknown mock Rig run ${runId}`);
        const session = this.requireSession(run.sessionId);
        session.status = "error";
        this.append(session, "run_error", { errorMessage, modelLocked: false, runId });
    }

    emitGlobalUpdates(count: number): void {
        const session = this.sessions.values().next().value as MockSession | undefined;
        if (!session) throw new Error("Create a mock Rig session before emitting updates");
        for (let index = 0; index < count; index += 1)
            this.append(session, "tasks_changed", { tasks: [], update: index });
    }

    pauseGlobalEventDelivery(): void {
        this.globalEventDeliveryPaused = true;
    }

    resumeGlobalEventDelivery(): void {
        this.globalEventDeliveryPaused = false;
        for (const stream of this.globalEventStreams) this.flushGlobalEventStream(stream);
    }

    /** Restarts the Unix HTTP listener without losing sessions or queued events. */
    async restart(): Promise<void> {
        await this.stopServer();
        this.token = `test-token-${++this.tokenSequence}`;
        await writeFile(this.tokenPath, this.token, { mode: 0o600 });
        await this.startServer();
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.stopServer();
        await rm(this.directory, { recursive: true, force: true });
    }

    private async startServer(): Promise<void> {
        this.server = createServer((request, response) => {
            void this.handle(request, response).catch((error) => {
                if (!response.headersSent)
                    sendJson(response, 500, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                else response.destroy(error instanceof Error ? error : undefined);
            });
        });
        this.server.on("connection", (socket) => {
            this.sockets.add(socket);
            socket.once("close", () => this.sockets.delete(socket));
        });
        await new Promise<void>((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(this.socketPath, resolve);
        });
    }

    private async stopServer(): Promise<void> {
        for (const socket of this.sockets) socket.destroy();
        if (!this.server.listening) return;
        await new Promise<void>((resolve, reject) =>
            this.server.close((error) => (error ? reject(error) : resolve())),
        );
    }

    private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (request.headers.authorization !== `Bearer ${this.token}`)
            return sendJson(response, 401, {});
        const url = new URL(request.url ?? "/", "http://rig.invalid");
        if (request.method === "GET" && url.pathname === "/health")
            return sendJson(response, 200, {
                durableGlobalEventQueue: this.durableGlobalEventQueue,
                healthy: true,
                ready: true,
            });
        if (request.method === "GET" && url.pathname === "/config") {
            this.configReadCount += 1;
            return sendJson(response, 200, {
                config: {
                    settings: { durableGlobalEventQueue: this.durableGlobalEventQueue },
                },
            });
        }
        if (request.method === "PATCH" && url.pathname === "/config") {
            const body = await jsonBody(request);
            const settings = body.settings as Record<string, unknown> | undefined;
            if (typeof settings?.durableGlobalEventQueue !== "boolean")
                return sendJson(response, 400, { error: "Invalid queue configuration" });
            this.configPatchCount += 1;
            this.durableGlobalEventQueue = settings.durableGlobalEventQueue;
            return sendJson(response, 200, {
                config: {
                    settings: { durableGlobalEventQueue: this.durableGlobalEventQueue },
                },
            });
        }
        if (request.method === "GET" && url.pathname === "/events/stream") {
            this.globalStreamRequestCount += 1;
            return this.streamGlobalEvents(url, response);
        }
        if (request.method === "GET" && url.pathname === "/events")
            return this.listGlobalEvents(url, response);
        if (request.method === "POST" && url.pathname === "/events/trim")
            return this.trimGlobalEvents(request, response);
        if (request.method === "POST" && url.pathname === "/sessions") {
            const body = await jsonBody(request);
            const id = `session-${this.sessions.size + 1}`;
            const session: MockSession = { events: [], id, messages: [], status: "idle" };
            this.sessions.set(id, session);
            this.createdCwds.push(String(body.cwd));
            this.append(session, "session_created", { session: snapshot(session) });
            return sendJson(response, 201, { session: snapshot(session) });
        }
        const match = url.pathname.match(/^\/sessions\/([^/]+)(?:\/(messages|events|stream))?$/);
        const session = match ? this.sessions.get(decodeURIComponent(match[1]!)) : undefined;
        if (!match || !session) return sendJson(response, 404, { error: "Session not found" });
        const action = match[2];
        if (request.method === "GET" && action === undefined)
            return sendJson(response, 200, { session: snapshot(session) });
        if (request.method === "GET" && action === "events") {
            this.sessionEventRequestCount += 1;
            return sendJson(response, 501, { error: "Per-session events are disabled in Gym" });
        }
        if (request.method === "GET" && action === "stream") {
            this.sessionStreamRequestCount += 1;
            return sendJson(response, 501, { error: "Per-session streams are disabled in Gym" });
        }
        if (request.method === "POST" && action === "messages") {
            this.submissionAttemptCount += 1;
            if (this.submissionsPaused)
                return sendJson(response, 503, { error: "Submissions are temporarily paused" });
            const body = await jsonBody(request);
            const text = String(body.text);
            const runId = `run-${++this.runSequence}`;
            const message: RigMessage = { role: "user", blocks: [{ type: "text", text }] };
            session.messages.push(message);
            session.status = "running";
            const submitted = this.append(session, "message_submitted", {
                displayText: text,
                message,
                runId,
            });
            this.append(session, "run_started", { runId });
            this.submittedTexts.push(text);
            this.submittedRuns.push({ runId, sessionId: session.id, text });
            const drop = this.dropSubmissionResponse;
            this.dropSubmissionResponse = false;
            if (drop) response.destroy();
            else
                sendJson(response, 202, {
                    eventId: submitted.id,
                    runId,
                    sessionId: session.id,
                });
            const reply = this.automaticReply;
            if (reply !== undefined) queueMicrotask(() => this.completeRun(runId, reply));
            return;
        }
        sendJson(response, 405, { error: "Method not allowed" });
    }

    private listGlobalEvents(url: URL, response: ServerResponse): void {
        this.globalEventReadCount += 1;
        if (!this.durableGlobalEventQueue)
            return sendJson(response, 404, {
                error: "The durable global event queue is disabled.",
            });
        const afterText = url.searchParams.get("after");
        const after = afterText === null ? undefined : Number(afterText);
        const limit = Number(url.searchParams.get("limit") ?? 100);
        if (
            (after !== undefined && (!Number.isSafeInteger(after) || after < 0)) ||
            !Number.isSafeInteger(limit) ||
            limit <= 0
        )
            return sendJson(response, 400, { error: "Invalid global event cursor or limit" });
        if (after !== undefined && (after < this.trimmedThrough || after > this.globalCursor)) {
            this.cursorRejections += 1;
            return sendJson(response, 409, { error: "The global event cursor is not available." });
        }
        if (this.globalEventDeliveryPaused) return sendJson(response, 200, { events: [] });
        const events = this.globalEvents
            .filter((entry) => after === undefined || entry.cursor > after)
            .slice(0, limit);
        sendJson(response, 200, { events });
    }

    private streamGlobalEvents(url: URL, response: ServerResponse): void {
        if (!this.durableGlobalEventQueue)
            return sendJson(response, 404, {
                error: "The durable global event queue is disabled.",
            });
        const afterText = url.searchParams.get("after");
        const after = afterText === null ? this.trimmedThrough : Number(afterText);
        if (
            !Number.isSafeInteger(after) ||
            after < this.trimmedThrough ||
            after > this.globalCursor
        ) {
            this.cursorRejections += 1;
            return sendJson(response, 409, { error: "The global event cursor is not available." });
        }
        response.writeHead(200, {
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            "content-type": "text/event-stream; charset=utf-8",
        });
        response.write(": connected\n\n");
        const stream = { cursor: after, response };
        this.globalEventStreams.add(stream);
        response.once("close", () => this.globalEventStreams.delete(stream));
        this.flushGlobalEventStream(stream);
    }

    private flushGlobalEventStream(stream: GlobalEventStream): void {
        if (this.globalEventDeliveryPaused || stream.response.destroyed) return;
        for (const entry of this.globalEvents) {
            if (entry.cursor <= stream.cursor) continue;
            stream.response.write(
                `id: ${entry.cursor}\nevent: ${entry.event.type}\ndata: ${JSON.stringify(entry.event)}\n\n`,
            );
            stream.cursor = entry.cursor;
        }
    }

    private async trimGlobalEvents(
        request: IncomingMessage,
        response: ServerResponse,
    ): Promise<void> {
        if (!this.durableGlobalEventQueue)
            return sendJson(response, 404, {
                error: "The durable global event queue is disabled.",
            });
        const body = await jsonBody(request);
        const through = Number(body.through);
        if (!Number.isSafeInteger(through) || through < 0)
            return sendJson(response, 400, { error: "Invalid trim cursor" });
        if (through > this.globalCursor)
            return sendJson(response, 409, { error: "The global event cursor is not available." });
        this.trimRequests.push(through);
        const previousLength = this.globalEvents.length;
        if (through > this.trimmedThrough) {
            this.trimmedThrough = through;
            while (this.globalEvents[0] && this.globalEvents[0].cursor <= through)
                this.globalEvents.shift();
        }
        sendJson(response, 200, {
            through,
            trimmed: previousLength - this.globalEvents.length,
        });
    }

    private append(session: MockSession, type: string, data: Record<string, unknown>): RigEvent {
        const event: RigEvent = {
            createdAt: Date.now(),
            data,
            id: `event-${++this.eventSequence}`,
            sessionId: session.id,
            type,
        };
        session.events.push(event);
        session.lastEventId = event.id;
        if (this.durableGlobalEventQueue) {
            this.globalEvents.push({ cursor: ++this.globalCursor, event });
            for (const stream of this.globalEventStreams) this.flushGlobalEventStream(stream);
        }
        return event;
    }

    private requireSession(sessionId: string): MockSession {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`Unknown mock Rig session ${sessionId}`);
        return session;
    }
}

export const createMockRigDaemon = (): Promise<MockRigDaemon> => MockRigDaemon.create();

function snapshot(session: MockSession) {
    return {
        id: session.id,
        ...(session.lastEventId ? { lastEventId: session.lastEventId } : {}),
        snapshot: { messages: session.messages },
        status: session.status,
    };
}

async function jsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const contents = Buffer.concat(chunks).toString("utf8");
    return contents ? (JSON.parse(contents) as Record<string, unknown>) : {};
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
    const contents = JSON.stringify(body);
    response.writeHead(status, {
        "content-length": Buffer.byteLength(contents),
        "content-type": "application/json; charset=utf-8",
    });
    response.end(contents);
}
