import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
    AgentContainerInput,
    AgentDockerRuntime,
    AgentImageBuildInput,
    AgentImageBuildOptions,
    AgentImageBuildUpdate,
} from "happy2-server";

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

interface SessionEventStream {
    cursor?: string;
    response: ServerResponse;
    sessionId: string;
}

interface MockRunStream {
    started: boolean;
    text: string;
}

interface MockSession {
    effort: string;
    events: RigEvent[];
    id: string;
    lastEventId?: string;
    messages: RigMessage[];
    projectSecretIds: Set<string>;
    sessionSecretIds: Set<string>;
    status: string;
}

interface MockSecretRegistration {
    description: string;
    environment: Record<string, string>;
    id: string;
}

export interface MockRigRun {
    runId: string;
    sessionId: string;
    text: string;
}

export interface MockRigSessionRequest {
    cwd: string;
    docker?: { container?: string; workingDirectory?: string };
    permissionMode?: string;
    effort?: string;
}

const MOCK_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"] as const;
const MOCK_MODEL_ID = "gym/mock-agent";

/**
 * Programmable black-box Rig protocol server bound to a real Unix socket.
 * Sessions and the opt-in durable global event queue survive `restart()`.
 */
export class MockRigDaemon implements AsyncDisposable {
    readonly createdCwds: string[] = [];
    readonly createdSessions: MockRigSessionRequest[] = [];
    readonly effortChanges: Array<{ effort: string; sessionId: string }> = [];
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
    private readonly createEventId = createEventIdFactory();
    private globalEventDeliveryPaused = false;
    private globalCursor = 0;
    private submissionsPaused = false;
    private readonly globalEvents: GlobalEvent[] = [];
    private readonly globalEventStreams = new Set<GlobalEventStream>();
    private runSequence = 0;
    private readonly runStreams = new Map<string, MockRunStream>();
    private readonly secrets = new Map<string, MockSecretRegistration>();
    private server = createServer();
    private nextSessionStreamStatus?: number;
    private sessionEventDeliveryPaused = false;
    private readonly sessionEventStreams = new Set<SessionEventStream>();
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
        const directory = await mkdtemp(join(tmpdir(), "happy2-gym-rig-"));
        const daemon = new MockRigDaemon(directory);
        await writeFile(daemon.tokenPath, daemon.token, { mode: 0o600 });
        await daemon.startServer();
        return daemon;
    }

    setAutomaticReply(reply: string | undefined): void {
        this.automaticReply = reply;
    }

    secretEnvironment(secretId: string): Readonly<Record<string, string>> | undefined {
        const secret = this.secrets.get(secretId);
        return secret ? { ...secret.environment } : undefined;
    }

    sessionSecretIds(sessionId: string): readonly string[] {
        const session = this.requireSession(sessionId);
        return [...new Set([...session.projectSecretIds, ...session.sessionSecretIds])].sort();
    }

    sessionEffort(sessionId: string): string {
        return this.requireSession(sessionId).effort;
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

    emitTextStart(runId: string): void {
        const { session } = this.requireRun(runId);
        const stream = { started: true, text: "" };
        this.runStreams.set(runId, stream);
        this.append(session, "agent_event", {
            event: {
                contentIndex: 0,
                partial: partialAgentMessage(stream.text),
                type: "text_start",
            },
            runId,
        });
    }

    emitTextDelta(runId: string, delta: string): void {
        const { session } = this.requireRun(runId);
        let stream = this.runStreams.get(runId);
        if (!stream?.started) {
            this.emitTextStart(runId);
            stream = this.runStreams.get(runId)!;
        }
        stream.text += delta;
        this.append(session, "agent_event", {
            event: {
                contentIndex: 0,
                delta,
                partial: partialAgentMessage(stream.text),
                type: "text_delta",
            },
            runId,
        });
    }

    emitTextEnd(runId: string, content?: string): void {
        const { session } = this.requireRun(runId);
        let stream = this.runStreams.get(runId);
        if (!stream?.started) {
            this.emitTextStart(runId);
            stream = this.runStreams.get(runId)!;
        }
        if (content !== undefined) stream.text = content;
        this.append(session, "agent_event", {
            event: {
                content: stream.text,
                contentIndex: 0,
                partial: partialAgentMessage(stream.text),
                type: "text_end",
            },
            runId,
        });
    }

    emitAgentMessage(runId: string, text: string): void {
        const { session } = this.requireRun(runId);
        const message: RigMessage = { role: "agent", blocks: [{ type: "text", text }] };
        session.messages.push(message);
        this.append(session, "agent_message", { message, runId });
        this.runStreams.delete(runId);
    }

    completeRun(runId: string, text: string): void {
        const { session } = this.requireRun(runId);
        this.emitAgentMessage(runId, text);
        session.status = "completed";
        this.append(session, "run_finished", {
            agentRunId: `agent-${runId}`,
            modelLocked: false,
            runId,
            stopReason: "stop",
        });
        this.runStreams.delete(runId);
    }

    failRun(runId: string, errorMessage: string): void {
        const { session } = this.requireRun(runId);
        session.status = "error";
        this.append(session, "run_error", { errorMessage, modelLocked: false, runId });
        this.runStreams.delete(runId);
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

    pauseSessionEventDelivery(): void {
        this.sessionEventDeliveryPaused = true;
    }

    resumeSessionEventDelivery(): void {
        this.sessionEventDeliveryPaused = false;
        for (const stream of this.sessionEventStreams) this.flushSessionEventStream(stream);
    }

    rejectNextSessionStream(status = 409): void {
        this.nextSessionStreamStatus = status;
        for (const stream of this.sessionEventStreams) stream.response.destroy();
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
        if (request.method === "GET" && url.pathname === "/secrets") {
            return sendJson(response, 200, {
                secrets: [...this.secrets.values()]
                    .sort((left, right) => left.id.localeCompare(right.id))
                    .map(secretSummary),
            });
        }
        if (request.method === "POST" && url.pathname === "/secrets") {
            const body = await jsonBody(request);
            if (
                typeof body.id !== "string" ||
                typeof body.description !== "string" ||
                !body.environment ||
                typeof body.environment !== "object" ||
                Array.isArray(body.environment)
            )
                return sendJson(response, 400, { error: "Invalid secret registration" });
            const secret: MockSecretRegistration = {
                id: body.id,
                description: body.description,
                environment: Object.fromEntries(
                    Object.entries(body.environment as Record<string, unknown>).map(
                        ([name, value]) => [name, String(value)],
                    ),
                ),
            };
            this.secrets.set(secret.id, secret);
            return sendJson(response, 200, { secret: secretSummary(secret) });
        }
        const secretRegistrationMatch = url.pathname.match(/^\/secrets\/([^/]+)$/u);
        if (request.method === "DELETE" && secretRegistrationMatch) {
            const secretId = decodeURIComponent(secretRegistrationMatch[1]!);
            const removed = this.secrets.delete(secretId);
            if (removed) {
                for (const session of this.sessions.values()) {
                    session.projectSecretIds.delete(secretId);
                    session.sessionSecretIds.delete(secretId);
                }
            }
            return sendJson(response, 200, { removed });
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
            const effort = typeof body.effort === "string" ? body.effort : "high";
            if (!MOCK_EFFORT_OPTIONS.includes(effort as (typeof MOCK_EFFORT_OPTIONS)[number]))
                return sendJson(response, 400, { error: "Unsupported effort" });
            const id = `session-${this.sessions.size + 1}`;
            const session: MockSession = {
                effort,
                events: [],
                id,
                messages: [],
                projectSecretIds: new Set(),
                sessionSecretIds: new Set(
                    Array.isArray(body.secretIds)
                        ? body.secretIds.filter(
                              (secretId): secretId is string => typeof secretId === "string",
                          )
                        : [],
                ),
                status: "idle",
            };
            this.sessions.set(id, session);
            this.createdCwds.push(String(body.cwd));
            const docker =
                body.docker && typeof body.docker === "object"
                    ? (body.docker as Record<string, unknown>)
                    : undefined;
            const container = typeof docker?.container === "string" ? docker.container : undefined;
            const workingDirectory =
                typeof docker?.workingDirectory === "string" ? docker.workingDirectory : undefined;
            this.createdSessions.push({
                cwd: String(body.cwd),
                ...(container !== undefined || workingDirectory !== undefined
                    ? {
                          docker: {
                              ...(container !== undefined ? { container } : {}),
                              ...(workingDirectory !== undefined ? { workingDirectory } : {}),
                          },
                      }
                    : {}),
                ...(typeof body.permissionMode === "string"
                    ? { permissionMode: body.permissionMode }
                    : {}),
                ...(typeof body.effort === "string" ? { effort: body.effort } : {}),
            });
            this.append(session, "session_created", { session: snapshot(session) });
            return sendJson(response, 201, { session: snapshot(session) });
        }
        const sessionSecretMatch = url.pathname.match(
            /^\/sessions\/([^/]+)\/secrets(?:\/([^/]+))?$/u,
        );
        if (sessionSecretMatch) {
            const session = this.sessions.get(decodeURIComponent(sessionSecretMatch[1]!));
            if (!session) return sendJson(response, 404, { error: "Session not found" });
            const pathSecretId = sessionSecretMatch[2]
                ? decodeURIComponent(sessionSecretMatch[2])
                : undefined;
            if (request.method === "POST" && pathSecretId === undefined) {
                const body = await jsonBody(request);
                if (typeof body.secretId !== "string" || !this.secrets.has(body.secretId))
                    return sendJson(response, 409, { error: "Secret is not registered" });
                if (body.scope === "project") session.projectSecretIds.add(body.secretId);
                else session.sessionSecretIds.add(body.secretId);
                return sendJson(response, 200, { session: snapshot(session) });
            }
            if (request.method === "DELETE" && pathSecretId !== undefined) {
                if (url.searchParams.get("scope") === "project")
                    session.projectSecretIds.delete(pathSecretId);
                else session.sessionSecretIds.delete(pathSecretId);
                return sendJson(response, 200, { session: snapshot(session) });
            }
        }
        const match = url.pathname.match(
            /^\/sessions\/([^/]+)(?:\/(messages|events|stream|effort))?$/u,
        );
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
            if (this.nextSessionStreamStatus !== undefined) {
                const status = this.nextSessionStreamStatus;
                this.nextSessionStreamStatus = undefined;
                return sendJson(response, status, { error: "Session stream is unavailable" });
            }
            return this.streamSessionEvents(request, url, session, response);
        }
        if (request.method === "PATCH" && action === "effort") {
            const body = await jsonBody(request);
            if (
                typeof body.effort !== "string" ||
                !MOCK_EFFORT_OPTIONS.includes(body.effort as (typeof MOCK_EFFORT_OPTIONS)[number])
            )
                return sendJson(response, 400, { error: "Unsupported effort" });
            session.effort = body.effort;
            this.effortChanges.push({ effort: session.effort, sessionId: session.id });
            this.append(session, "effort_changed", {
                effort: session.effort,
                modelId: MOCK_MODEL_ID,
            });
            return sendJson(response, 200, { session: snapshot(session) });
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
            writeSseFrame(
                stream.response,
                `id: ${entry.cursor}\nevent: ${entry.event.type}\ndata: ${JSON.stringify(entry.event)}\n\n`,
            );
            stream.cursor = entry.cursor;
        }
    }

    private streamSessionEvents(
        request: IncomingMessage,
        url: URL,
        session: MockSession,
        response: ServerResponse,
    ): void {
        const header = request.headers["last-event-id"];
        const headerCursor = Array.isArray(header) ? header.at(-1) : header;
        const cursor = headerCursor ?? url.searchParams.get("after") ?? undefined;
        if (cursor !== undefined && !session.events.some((event) => event.id === cursor)) {
            return sendJson(response, 409, { error: "Event cursor not found" });
        }
        response.writeHead(200, {
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            "content-type": "text/event-stream; charset=utf-8",
            "x-accel-buffering": "no",
        });
        response.write(": connected\n\n");
        const stream = { cursor, response, sessionId: session.id };
        this.sessionEventStreams.add(stream);
        response.once("close", () => this.sessionEventStreams.delete(stream));
        this.flushSessionEventStream(stream);
    }

    private flushSessionEventStream(stream: SessionEventStream): void {
        if (this.sessionEventDeliveryPaused || stream.response.destroyed) return;
        const session = this.sessions.get(stream.sessionId);
        if (!session) return;
        const start =
            stream.cursor === undefined
                ? 0
                : session.events.findIndex((event) => event.id === stream.cursor) + 1;
        if (start < 0) return;
        for (const event of session.events.slice(start)) {
            writeSseFrame(
                stream.response,
                `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            );
            stream.cursor = event.id;
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
            id: this.createEventId(),
            sessionId: session.id,
            type,
        };
        session.events.push(event);
        session.lastEventId = event.id;
        for (const stream of this.sessionEventStreams) {
            if (stream.sessionId === session.id) this.flushSessionEventStream(stream);
        }
        if (this.durableGlobalEventQueue && type !== "agent_event") {
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

    private requireRun(runId: string): { run: MockRigRun; session: MockSession } {
        const run = this.submittedRuns.find((candidate) => candidate.runId === runId);
        if (!run) throw new Error(`Unknown mock Rig run ${runId}`);
        return { run, session: this.requireSession(run.sessionId) };
    }
}

/** In-memory Docker boundary for server + Rig Gym tests. */
export class MockAgentDockerRuntime implements AgentDockerRuntime {
    readonly buildRequests: AgentImageBuildInput[] = [];
    readonly createdContainers: AgentContainerInput[] = [];
    readonly removedContainers: string[] = [];
    private buildsPaused = false;
    private readonly buildWaiters = new Set<() => void>();
    private readonly buildUpdates = new Set<(update: AgentImageBuildUpdate) => void>();
    private nextBuildError?: Error;

    pauseBuilds(): void {
        this.buildsPaused = true;
    }

    resumeBuilds(): void {
        this.buildsPaused = false;
        for (const resume of this.buildWaiters) resume();
        this.buildWaiters.clear();
    }

    failNextBuild(message = "Mock Docker build failed"): void {
        this.nextBuildError = new Error(message);
    }

    emitBuildUpdate(update: AgentImageBuildUpdate): void {
        for (const listener of this.buildUpdates) listener(update);
    }

    async buildImage(
        input: AgentImageBuildInput,
        options: AgentImageBuildOptions = {},
    ): Promise<{ imageId: string }> {
        this.buildRequests.push({ ...input });
        const listener = options.onUpdate;
        if (listener) this.buildUpdates.add(listener);
        listener?.({ logChunk: "#1 [stage-0 1/2] preparing image\n", progress: 5 });
        try {
            if (this.buildsPaused) await this.waitForBuildResume(options.signal);
            if (options.signal?.aborted) throw abortError();
            const error = this.nextBuildError;
            this.nextBuildError = undefined;
            if (error) throw error;
            listener?.({ logChunk: "#2 [stage-0 2/2] image assembled\n#2 DONE\n", progress: 95 });
            return { imageId: `sha256:gym-agent-image-${this.buildRequests.length}` };
        } finally {
            if (listener) this.buildUpdates.delete(listener);
        }
    }

    async createContainer(input: AgentContainerInput, signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) throw abortError();
        this.createdContainers.push({ ...input });
    }

    async removeContainer(containerName: string): Promise<void> {
        this.removedContainers.push(containerName);
    }

    private waitForBuildResume(signal?: AbortSignal): Promise<void> {
        if (!this.buildsPaused) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const finish = () => {
                signal?.removeEventListener("abort", abort);
                this.buildWaiters.delete(finish);
                resolve();
            };
            const abort = () => {
                this.buildWaiters.delete(finish);
                reject(abortError());
            };
            this.buildWaiters.add(finish);
            if (signal?.aborted) abort();
            else signal?.addEventListener("abort", abort, { once: true });
        });
    }
}

export const createMockRigDaemon = (): Promise<MockRigDaemon> => MockRigDaemon.create();

function partialAgentMessage(text: string) {
    return {
        api: "gym",
        content: [{ type: "text", text }],
        model: "gym/mock-agent",
        provider: "gym",
        role: "assistant",
        stopReason: "stop",
        timestamp: Date.now(),
        usage: {
            cacheRead: 0,
            cacheWrite: 0,
            cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
            input: 0,
            output: 0,
            totalTokens: 0,
        },
    };
}

function createEventIdFactory(): () => string {
    let lastTimeMs = 0;
    let sequence = randomBytes(2).readUInt16BE(0) & 0x0fff;
    return () => {
        const observedTimeMs = Math.max(0, Math.floor(Date.now()));
        if (observedTimeMs > lastTimeMs) {
            lastTimeMs = observedTimeMs;
            sequence = randomBytes(2).readUInt16BE(0) & 0x0fff;
        } else {
            sequence = (sequence + 1) & 0x0fff;
            if (sequence === 0) lastTimeMs += 1;
        }
        return formatUuidV7(lastTimeMs, sequence, randomBytes(8));
    };
}

function formatUuidV7(timeMs: number, sequence: number, random: Buffer): string {
    const bytes = Buffer.alloc(16);
    const timestamp = Math.min(timeMs, 0xffffffffffff);
    bytes[0] = Math.floor(timestamp / 0x10000000000) & 0xff;
    bytes[1] = Math.floor(timestamp / 0x100000000) & 0xff;
    bytes[2] = Math.floor(timestamp / 0x1000000) & 0xff;
    bytes[3] = Math.floor(timestamp / 0x10000) & 0xff;
    bytes[4] = Math.floor(timestamp / 0x100) & 0xff;
    bytes[5] = timestamp & 0xff;
    bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
    bytes[7] = sequence & 0xff;
    bytes[8] = 0x80 | ((random[0] ?? 0) & 0x3f);
    random.copy(bytes, 9, 1);

    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function snapshot(session: MockSession) {
    const projectSecretIds = [...session.projectSecretIds].sort();
    const sessionSecretIds = [...session.sessionSecretIds].sort();
    return {
        effort: session.effort,
        id: session.id,
        modelId: MOCK_MODEL_ID,
        models: [
            {
                defaultThinkingLevel: "high",
                id: MOCK_MODEL_ID,
                name: "Gym mock agent",
                thinkingLevels: MOCK_EFFORT_OPTIONS,
            },
        ],
        ...(session.lastEventId ? { lastEventId: session.lastEventId } : {}),
        projectSecretIds,
        secretIds: [...new Set([...projectSecretIds, ...sessionSecretIds])].sort(),
        sessionSecretIds,
        snapshot: { messages: session.messages },
        status: session.status,
    };
}

function secretSummary(secret: MockSecretRegistration) {
    return {
        id: secret.id,
        description: secret.description,
        environmentVariables: Object.keys(secret.environment),
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

function writeSseFrame(response: ServerResponse, frame: string): void {
    const contents = Buffer.from(frame);
    const multibyte = Buffer.from("🚀");
    const marker = contents.indexOf(multibyte);
    if (marker < 0) {
        response.write(contents);
        return;
    }
    response.write(contents.subarray(0, marker + 1));
    response.write(contents.subarray(marker + 1));
}

function abortError(): Error {
    return new Error("Mock Docker operation aborted", { cause: "ABORT_ERR" });
}
