import { execFile } from "node:child_process";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import type { Duplex } from "node:stream";
import WebSocket, { createWebSocketStream } from "ws";

import type {
    AttachSecretRequest,
    ChangeEffortRequest,
    ChangePermissionModeRequest,
    CreateSessionRequest,
    CreateSessionResponse,
    DurableSkillDefinition,
    GetDaemonConfigResponse,
    HealthResponse,
    ListSecretsResponse,
    ListModelsResponse,
    ListSubagentsResponse,
    ModelCatalog,
    ProtocolSession,
    SubagentSummary,
    RegisterSecretRequest,
    RegisterSecretResponse,
    ResolveExternalToolCallRequest,
    ResolveExternalToolCallResponse,
    SecretSummary,
    SubmitMessageRequest,
    SubmitMessageResponse,
    TrimGlobalEventsRequest,
    UnregisterSecretResponse,
    UpdateDaemonConfigRequest,
} from "@slopus/rig/dist/protocol/index.js";
import type {
    ExternalToolCall,
    ExternalToolCallResolution,
    ExternalToolDefinition,
} from "@slopus/rig/dist/external-tools/index.js";
import type {
    CreateRemoteTerminalRequest,
    RemoteTerminalResponse,
    RemoteTerminalSummary,
} from "@slopus/rig/dist/terminal/index.js";

const MAX_TERMINAL_WIRE_BYTES = 4 * 1024 * 1024 + 20;

export interface RigDaemonConfig {
    directory: string;
    socketPath: string;
    tokenPath: string;
    command: string;
}

interface RigBlock {
    type: string;
    text?: string;
    thinking?: string;
}

interface RigMessage {
    role: "agent" | "system" | "user";
    id?: string;
    blocks: readonly RigBlock[];
    usage?: RigUsage;
}

interface RigUsage {
    totalTokens?: number;
}

export interface RigEffortConfiguration {
    effort: string;
    options: string[];
}

export type RigSecretRegistration = RegisterSecretRequest;

export type RigSecretSummary = SecretSummary;

export interface RigSessionSecretPlan {
    desiredSecretIds: readonly string[];
    managedSecretIds: readonly string[];
}

interface RigPartialMessage {
    content?: Array<{ type: string; text?: string; thinking?: string }>;
    id?: string;
    usage?: RigUsage;
}

interface RigAgentLoopEvent {
    content?: string;
    contentIndex?: number;
    delta?: string;
    display?: string;
    error?: RigPartialMessage;
    iteration?: number;
    message?: RigPartialMessage;
    processes?: readonly RigBackgroundProcess[];
    result?: {
        display?: string;
        isError?: boolean;
        toolCallId?: string;
        toolName?: string;
    };
    running?: number;
    status?: string;
    toolCall?: { id?: string; name?: string; arguments?: unknown };
    toolCallId?: string;
    type?: string;
    partial?: RigPartialMessage;
}

export type RigBackgroundProcess = NonNullable<ProtocolSession["backgroundProcesses"]>[number];
export type RigSubagentSummary = SubagentSummary;

export interface RigEvent {
    createdAt: number;
    id: string;
    sessionId: string;
    type: string;
    data: {
        errorMessage?: string;
        event?: RigAgentLoopEvent;
        call?: ExternalToolCall;
        message?: RigMessage;
        runId?: string;
        title?: string;
        subagent?: RigSubagentSummary;
    };
}

export interface RigGlobalEvent {
    cursor: number;
    event: RigEvent;
}

export type RigTurnInspection =
    | { kind: "not_submitted" }
    | { kind: "running" }
    | { kind: "completed"; text: string }
    | { error: string; kind: "failed" };

export class RigDaemonClient {
    private readonly sessionSecretReconciliations = new Map<string, Promise<void>>();
    private daemonReload?: Promise<void>;
    private daemonReloadAttempted = false;
    private daemonVersion?: string;
    private token?: string;
    private ready?: Promise<void>;

    constructor(private readonly config: RigDaemonConfig) {}

    async ensureGlobalEventQueue(signal?: AbortSignal): Promise<void> {
        const current = await this.connectedRequest<GetDaemonConfigResponse>(
            "GET",
            "/config",
            undefined,
            signal,
        );
        if (current.config.settings.durableGlobalEventQueue) return;
        await this.connectedRequest(
            "PATCH",
            "/config",
            {
                settings: { durableGlobalEventQueue: true },
            } satisfies UpdateDaemonConfigRequest,
            signal,
        );
    }

    async createSession(
        cwd: string,
        containerName: string,
        effort?: string,
        signal?: AbortSignal,
        modelId?: string,
    ): Promise<{ effort: string; id: string }> {
        const response = await this.connectedRequest<CreateSessionResponse>(
            "POST",
            "/sessions",
            {
                cwd,
                docker: { container: containerName, workingDirectory: "/workspace" },
                ...(effort ? { effort } : {}),
                ...(modelId ? { modelId } : {}),
                // Rig's durable external functions intentionally require Full access. The
                // agent remains bounded by Happy's dedicated OCI sandbox and cannot reach
                // the plugin process directly; Happy owns and resolves every function call.
                permissionMode: "full_access",
            } satisfies CreateSessionRequest,
            signal,
        );
        return { id: response.session.id, effort: sessionEffort(response.session).effort };
    }

    async modelCatalog(signal?: AbortSignal): Promise<ModelCatalog> {
        const response = await this.connectedRequest<ListModelsResponse>(
            "GET",
            "/models",
            undefined,
            signal,
        );
        return response.catalog;
    }

    async effortConfiguration(
        sessionId: string,
        signal?: AbortSignal,
    ): Promise<RigEffortConfiguration> {
        return sessionEffort(await this.session(sessionId, signal));
    }

    async changeEffort(
        sessionId: string,
        effort: string,
        signal?: AbortSignal,
    ): Promise<RigEffortConfiguration> {
        const response = await this.connectedRequest<{ session: ProtocolSession }>(
            "PATCH",
            `/sessions/${encodeURIComponent(sessionId)}/effort`,
            { effort } satisfies ChangeEffortRequest,
            signal,
        );
        return sessionEffort(response.session);
    }

    async ensureFunctionPermission(sessionId: string, signal?: AbortSignal): Promise<void> {
        const current = await this.session(sessionId, signal);
        if (current.permissionMode === "full_access") return;
        await this.connectedRequest(
            "PATCH",
            `/sessions/${encodeURIComponent(sessionId)}/permissions`,
            { permissionMode: "full_access" } satisfies ChangePermissionModeRequest,
            signal,
        );
    }

    async listSecrets(signal?: AbortSignal): Promise<readonly RigSecretSummary[]> {
        const response = await this.connectedRequest<ListSecretsResponse>(
            "GET",
            "/secrets",
            undefined,
            signal,
        );
        return response.secrets;
    }

    async registerSecret(
        secret: RigSecretRegistration,
        signal?: AbortSignal,
    ): Promise<RigSecretSummary> {
        const response = await this.connectedRequest<RegisterSecretResponse>(
            "POST",
            "/secrets",
            secret,
            signal,
        );
        return response.secret;
    }

    async unregisterSecret(secretId: string, signal?: AbortSignal): Promise<boolean> {
        const response = await this.connectedRequest<UnregisterSecretResponse>(
            "DELETE",
            `/secrets/${encodeURIComponent(secretId)}`,
            undefined,
            signal,
        );
        return response.removed;
    }

    async createRemoteTerminal(
        sessionId: string,
        dimensions: CreateRemoteTerminalRequest,
        signal?: AbortSignal,
    ): Promise<RemoteTerminalSummary> {
        await this.ensureReady();
        if (this.daemonVersion && rigVersionBefore(this.daemonVersion, "0.0.27"))
            await this.reloadDaemon(signal);
        const response = await this.connectedRequest<RemoteTerminalResponse>(
            "POST",
            `/sessions/${encodeURIComponent(sessionId)}/terminals`,
            dimensions,
            signal,
        );
        return response.terminal;
    }

    async attachRemoteTerminal(sessionId: string, terminalId: string): Promise<Duplex> {
        await this.ensureReady();
        if (!this.token) throw new RigTransportError("Rig daemon token is unavailable.");
        try {
            return await connectRigTerminalWebSocket({
                path: `${remoteTerminalPath(sessionId, terminalId)}/attach`,
                socketPath: this.config.socketPath,
                token: this.token,
            });
        } catch (error) {
            if (error instanceof RigHttpError) throw error;
            throw asTransportError(error);
        }
    }

    async stopRemoteTerminal(
        sessionId: string,
        terminalId: string,
        signal?: AbortSignal,
    ): Promise<RemoteTerminalSummary> {
        const response = await this.connectedRequest<RemoteTerminalResponse>(
            "DELETE",
            remoteTerminalPath(sessionId, terminalId),
            undefined,
            signal,
        );
        return response.terminal;
    }

    async reconcileSessionSecrets(
        sessionId: string,
        loadPlan: () => Promise<RigSessionSecretPlan>,
        signal?: AbortSignal,
    ): Promise<void> {
        const previous = this.sessionSecretReconciliations.get(sessionId) ?? Promise.resolve();
        const reconciliation = previous
            .catch(() => undefined)
            .then(async () => {
                const { desiredSecretIds, managedSecretIds } = await loadPlan();
                const desired = new Set(desiredSecretIds);
                const managed = new Set(managedSecretIds);
                const session = await this.session(sessionId, signal);
                const attached = new Set(session.sessionSecretIds);
                for (const secretId of [...desired].sort()) {
                    if (attached.has(secretId)) continue;
                    await this.connectedRequest(
                        "POST",
                        `/sessions/${encodeURIComponent(sessionId)}/secrets`,
                        { secretId, scope: "session" } satisfies AttachSecretRequest,
                        signal,
                    );
                }
                for (const secretId of [...attached].sort()) {
                    if (!managed.has(secretId) || desired.has(secretId)) continue;
                    await this.connectedRequest(
                        "DELETE",
                        `/sessions/${encodeURIComponent(sessionId)}/secrets/${encodeURIComponent(secretId)}?scope=session`,
                        undefined,
                        signal,
                    );
                }
            });
        this.sessionSecretReconciliations.set(sessionId, reconciliation);
        try {
            await reconciliation;
        } finally {
            if (this.sessionSecretReconciliations.get(sessionId) === reconciliation)
                this.sessionSecretReconciliations.delete(sessionId);
        }
    }

    async watchGlobalEvents(
        after: number | undefined,
        onEvent: (event: RigGlobalEvent) => Promise<void>,
        signal?: AbortSignal,
    ): Promise<void> {
        const parameters = new URLSearchParams();
        if (after !== undefined) parameters.set("after", String(after));
        const path = `/events/stream${parameters.size ? `?${parameters.toString()}` : ""}`;
        await this.ensureReady();
        try {
            await this.stream(path, onEvent, signal);
        } catch (error) {
            if (error instanceof RigHttpError && error.status === 404) {
                await this.ensureGlobalEventQueue(signal);
                await this.stream(path, onEvent, signal);
                return;
            }
            if (
                error instanceof RigTransportError ||
                (error instanceof RigHttpError && error.status === 401)
            ) {
                this.ready = undefined;
                this.token = undefined;
            }
            throw error;
        }
    }

    async watchSessionEvents(
        sessionId: string,
        after: string | undefined,
        onEvent: (event: RigEvent) => Promise<void>,
        signal?: AbortSignal,
    ): Promise<string | undefined> {
        const path =
            after === undefined
                ? `/sessions/${encodeURIComponent(sessionId)}/stream`
                : `/sessions/${encodeURIComponent(sessionId)}/stream?after=${encodeURIComponent(after)}`;
        await this.ensureReady();
        try {
            return await this.sessionStream(path, after, onEvent, signal);
        } catch (error) {
            if (
                error instanceof RigTransportError ||
                (error instanceof RigHttpError && error.status === 401)
            ) {
                this.ready = undefined;
                this.token = undefined;
            }
            throw error;
        }
    }

    async trimGlobalEvents(through: number, signal?: AbortSignal): Promise<void> {
        await this.connectedRequest(
            "POST",
            "/events/trim",
            { through } satisfies TrimGlobalEventsRequest,
            signal,
        );
    }

    async sessionCheckpoint(
        sessionId: string,
        signal?: AbortSignal,
    ): Promise<{ messageCount: number; lastEventId?: string }> {
        const session = await this.session(sessionId, signal);
        return {
            messageCount: session.snapshot.messages.length,
            ...(session.lastEventId === undefined ? {} : { lastEventId: session.lastEventId }),
        };
    }

    async turnActivity(
        sessionId: string,
        signal?: AbortSignal,
    ): Promise<{
        backgroundProcesses: readonly RigBackgroundProcess[];
        subagents: readonly RigSubagentSummary[];
    }> {
        const [session, subagents] = await Promise.all([
            this.session(sessionId, signal),
            this.connectedRequest<ListSubagentsResponse>(
                "GET",
                `/sessions/${encodeURIComponent(sessionId)}/subagents`,
                undefined,
                signal,
            ),
        ]);
        return {
            backgroundProcesses: session.backgroundProcesses ?? [],
            subagents: subagents.subagents,
        };
    }

    async submittedTurnBaseline(
        sessionId: string,
        text: string,
        signal?: AbortSignal,
    ): Promise<number> {
        const messages = (await this.session(sessionId, signal)).snapshot.messages;
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index]!;
            if (message.role === "user" && messageText(message) === text) return index;
        }
        throw new Error("Rig session no longer contains the submitted agent turn.");
    }

    async inspectTurn(
        sessionId: string,
        baselineMessageCount: number,
        text: string,
        signal?: AbortSignal,
    ): Promise<RigTurnInspection> {
        const session = await this.session(sessionId, signal);
        const turnMessages = session.snapshot.messages.slice(baselineMessageCount);
        const submitted = turnMessages.some(
            (message) => message.role === "user" && messageText(message) === text,
        );
        if (!submitted) return { kind: "not_submitted" };
        if (session.status === "queued" || session.status === "running") return { kind: "running" };
        const answer = agentText(turnMessages);
        if (answer) return { kind: "completed", text: answer };
        return {
            error:
                session.status === "error"
                    ? "Rig ended the turn with an error."
                    : "Rig completed without an assistant response.",
            kind: "failed",
        };
    }

    async submitTurn(
        sessionId: string,
        text: string,
        externalTools: readonly ExternalToolDefinition[],
        skills: readonly DurableSkillDefinition[],
        signal?: AbortSignal,
    ): Promise<{ eventId: string; runId: string }> {
        return this.connectedRequest<SubmitMessageResponse>(
            "POST",
            `/sessions/${encodeURIComponent(sessionId)}/messages`,
            { text, externalTools, skills } satisfies SubmitMessageRequest,
            signal,
        );
    }

    async resolveExternalToolCall(
        sessionId: string,
        callId: string,
        resolution: ExternalToolCallResolution,
        signal?: AbortSignal,
    ): Promise<ResolveExternalToolCallResponse> {
        return this.connectedRequest<ResolveExternalToolCallResponse>(
            "POST",
            `/sessions/${encodeURIComponent(sessionId)}/external-tool-calls/${encodeURIComponent(callId)}`,
            resolution satisfies ResolveExternalToolCallRequest,
            signal,
        );
    }

    private session(sessionId: string, signal?: AbortSignal): Promise<ProtocolSession> {
        return this.connectedRequest<{ session: ProtocolSession }>(
            "GET",
            `/sessions/${encodeURIComponent(sessionId)}`,
            undefined,
            signal,
        ).then((response) => response.session);
    }

    private async connectedRequest<T>(
        method: string,
        path: string,
        body?: unknown,
        signal?: AbortSignal,
    ): Promise<T> {
        await this.ensureReady();
        try {
            return await this.request<T>(method, path, body, signal);
        } catch (error) {
            if (
                error instanceof RigTransportError ||
                (error instanceof RigHttpError && error.status === 401)
            ) {
                this.ready = undefined;
                this.token = undefined;
            }
            throw error;
        }
    }

    private ensureReady(): Promise<void> {
        if (this.daemonReload) return this.daemonReload;
        if (!this.ready) {
            this.ready = this.connect().catch((error) => {
                this.ready = undefined;
                throw error;
            });
        }
        return this.ready;
    }

    private async reloadDaemon(signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) throw shutdownError();
        if (this.daemonReloadAttempted) return this.ensureReady();
        this.daemonReloadAttempted = true;
        if (!this.daemonReload) {
            this.ready = undefined;
            this.token = undefined;
            const reload = execute(this.config.command, ["daemon", "reload"], {
                RIG_HOME: this.config.directory,
                RIG_SERVER_DIRECTORY: "",
                RIG_SERVER_SOCKET_PATH: this.config.socketPath,
                RIG_SERVER_TOKEN_PATH: this.config.tokenPath,
            }).then(() => this.connect());
            this.daemonReload = reload.finally(() => {
                this.daemonReload = undefined;
            });
        }
        await this.daemonReload;
    }

    private async connect(): Promise<void> {
        this.token = await readToken(this.config.tokenPath);
        if (this.token && (await this.healthy())) return;
        await mkdir(this.config.directory, { recursive: true, mode: 0o700 });
        await chmod(this.config.directory, 0o700);
        await execute(this.config.command, ["daemon", "start"], {
            RIG_HOME: this.config.directory,
            RIG_SERVER_DIRECTORY: "",
            RIG_SERVER_SOCKET_PATH: this.config.socketPath,
            RIG_SERVER_TOKEN_PATH: this.config.tokenPath,
        });
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
            this.token = await readToken(this.config.tokenPath);
            if (this.token && (await this.healthy())) return;
            await delay(100);
        }
        throw new Error("Rig daemon did not become ready within 10 seconds.");
    }

    private async healthy(): Promise<boolean> {
        try {
            const health = await this.request<HealthResponse>("GET", "/health");
            this.daemonVersion = health.identity.version;
            return health.status === "ready";
        } catch {
            return false;
        }
    }

    private request<T>(
        method: string,
        path: string,
        body?: unknown,
        signal?: AbortSignal,
    ): Promise<T> {
        if (!this.token)
            return Promise.reject(new RigTransportError("Rig daemon token is unavailable."));
        if (signal?.aborted) return Promise.reject(shutdownError());
        const payload = body === undefined ? undefined : JSON.stringify(body);
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            let responseEnded = false;
            const finish = (action: () => void) => {
                if (settled) return;
                settled = true;
                action();
            };
            const request = httpRequest(
                {
                    socketPath: this.config.socketPath,
                    method,
                    path,
                    headers: {
                        accept: "application/json",
                        authorization: `Bearer ${this.token}`,
                        ...(payload === undefined
                            ? {}
                            : {
                                  "content-type": "application/json; charset=utf-8",
                                  "content-length": Buffer.byteLength(payload),
                              }),
                    },
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    response.on("data", (chunk: Buffer | string) =>
                        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
                    );
                    response.on("end", () => {
                        responseEnded = true;
                        const contents = Buffer.concat(chunks).toString("utf8");
                        if ((response.statusCode ?? 500) >= 400) {
                            finish(() =>
                                reject(
                                    new RigHttpError(
                                        response.statusCode ?? 500,
                                        rigError(contents, response.statusCode),
                                    ),
                                ),
                            );
                            return;
                        }
                        try {
                            finish(() => resolve((contents ? JSON.parse(contents) : {}) as T));
                        } catch (error) {
                            finish(() => reject(error));
                        }
                    });
                    response.on("aborted", () =>
                        finish(() => reject(new RigTransportError("Rig response aborted."))),
                    );
                    response.on("error", (error) => finish(() => reject(asTransportError(error))));
                    response.on("close", () => {
                        if (!responseEnded)
                            finish(() =>
                                reject(new RigTransportError("Rig response closed unexpectedly.")),
                            );
                    });
                },
            );
            const abort = () => request.destroy(shutdownError());
            signal?.addEventListener("abort", abort, { once: true });
            request.setTimeout(10_000, () =>
                request.destroy(new Error("Rig daemon request timed out after 10 seconds.")),
            );
            request.once("close", () => signal?.removeEventListener("abort", abort));
            request.on("error", (error) => finish(() => reject(asTransportError(error))));
            if (payload) request.write(payload);
            request.end();
        });
    }

    private stream(
        path: string,
        onEvent: (event: RigGlobalEvent) => Promise<void>,
        signal?: AbortSignal,
    ): Promise<void> {
        if (!this.token)
            return Promise.reject(new RigTransportError("Rig daemon token is unavailable."));
        if (signal?.aborted) return Promise.reject(shutdownError());
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (action: () => void) => {
                if (settled) return;
                settled = true;
                action();
            };
            const request = httpRequest(
                {
                    socketPath: this.config.socketPath,
                    method: "GET",
                    path,
                    headers: {
                        accept: "text/event-stream",
                        authorization: `Bearer ${this.token}`,
                    },
                },
                (response) => {
                    if ((response.statusCode ?? 500) >= 400) {
                        const chunks: Buffer[] = [];
                        response.on("data", (chunk: Buffer | string) =>
                            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
                        );
                        response.on("end", () => {
                            const contents = Buffer.concat(chunks).toString("utf8");
                            finish(() =>
                                reject(
                                    new RigHttpError(
                                        response.statusCode ?? 500,
                                        rigError(contents, response.statusCode),
                                    ),
                                ),
                            );
                        });
                        return;
                    }
                    response.setEncoding("utf8");
                    void consumeGlobalEventStream(response, onEvent, signal).then(
                        () =>
                            finish(() =>
                                signal?.aborted
                                    ? resolve()
                                    : reject(
                                          new RigTransportError(
                                              "Rig global event stream ended unexpectedly.",
                                          ),
                                      ),
                            ),
                        (error) => finish(() => reject(asTransportError(error))),
                    );
                },
            );
            const abort = () => request.destroy(shutdownError());
            signal?.addEventListener("abort", abort, { once: true });
            request.once("close", () => signal?.removeEventListener("abort", abort));
            request.on("error", (error) => {
                if (signal?.aborted) finish(resolve);
                else finish(() => reject(asTransportError(error)));
            });
            request.end();
        });
    }

    private sessionStream(
        path: string,
        after: string | undefined,
        onEvent: (event: RigEvent) => Promise<void>,
        signal?: AbortSignal,
    ): Promise<string | undefined> {
        if (!this.token)
            return Promise.reject(new RigTransportError("Rig daemon token is unavailable."));
        if (signal?.aborted) return Promise.resolve(after);
        return new Promise<string | undefined>((resolve, reject) => {
            let settled = false;
            const finish = (action: () => void) => {
                if (settled) return;
                settled = true;
                action();
            };
            const request = httpRequest(
                {
                    socketPath: this.config.socketPath,
                    method: "GET",
                    path,
                    headers: {
                        accept: "text/event-stream",
                        authorization: `Bearer ${this.token}`,
                    },
                },
                (response) => {
                    if ((response.statusCode ?? 500) >= 400) {
                        const chunks: Buffer[] = [];
                        response.on("data", (chunk: Buffer | string) =>
                            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
                        );
                        response.on("end", () => {
                            const contents = Buffer.concat(chunks).toString("utf8");
                            finish(() =>
                                reject(
                                    new RigHttpError(
                                        response.statusCode ?? 500,
                                        rigError(contents, response.statusCode),
                                    ),
                                ),
                            );
                        });
                        return;
                    }
                    response.setEncoding("utf8");
                    void consumeSessionEventStream(response, after, onEvent, signal).then(
                        (cursor) =>
                            finish(() =>
                                signal?.aborted
                                    ? resolve(cursor)
                                    : reject(
                                          new RigTransportError(
                                              "Rig session event stream ended unexpectedly.",
                                          ),
                                      ),
                            ),
                        (error) => finish(() => reject(asTransportError(error))),
                    );
                },
            );
            const abort = () => request.destroy(shutdownError());
            signal?.addEventListener("abort", abort, { once: true });
            request.once("close", () => signal?.removeEventListener("abort", abort));
            request.on("error", (error) => {
                if (signal?.aborted) finish(() => resolve(after));
                else finish(() => reject(asTransportError(error)));
            });
            request.end();
        });
    }
}

function rigVersionBefore(version: string, minimum: string): boolean {
    const actual = version.split(".").map(Number);
    const required = minimum.split(".").map(Number);
    for (let index = 0; index < Math.max(actual.length, required.length); index += 1) {
        const difference = (actual[index] ?? 0) - (required[index] ?? 0);
        if (difference !== 0) return difference < 0;
    }
    return false;
}

function remoteTerminalPath(sessionId: string, terminalId: string): string {
    return `/sessions/${encodeURIComponent(sessionId)}/terminals/${encodeURIComponent(terminalId)}`;
}

function connectRigTerminalWebSocket(options: {
    path: string;
    socketPath: string;
    token: string;
}): Promise<Duplex> {
    return new Promise((resolve, reject) => {
        const webSocket = new WebSocket(`ws+unix://${options.socketPath}:${options.path}`, {
            handshakeTimeout: 10_000,
            headers: { authorization: `Bearer ${options.token}` },
            maxPayload: MAX_TERMINAL_WIRE_BYTES,
            perMessageDeflate: false,
        });
        let settled = false;
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            webSocket.terminate();
            reject(error);
        };
        const unexpected = (_request: unknown, response: import("node:http").IncomingMessage) => {
            response.resume();
            fail(new RigHttpError(response.statusCode ?? 500, "Rig terminal attachment failed."));
        };
        webSocket.once("error", fail);
        webSocket.once("unexpected-response", unexpected);
        webSocket.once("open", () => {
            if (settled) return;
            settled = true;
            webSocket.off("error", fail);
            webSocket.off("unexpected-response", unexpected);
            resolve(createWebSocketStream(webSocket, { allowHalfOpen: false }));
        });
    });
}

async function consumeGlobalEventStream(
    response: NodeJS.ReadableStream & AsyncIterable<Buffer | string>,
    onEvent: (event: RigGlobalEvent) => Promise<void>,
    signal?: AbortSignal,
): Promise<void> {
    let buffer = "";
    for await (const chunk of response) {
        if (signal?.aborted) return;
        buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
        for (;;) {
            const boundary = buffer.match(/\r?\n\r?\n/u);
            if (!boundary?.index && boundary?.index !== 0) break;
            const frame = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const event = parseGlobalEventFrame(frame);
            if (event) await onEvent(event);
        }
    }
}

async function consumeSessionEventStream(
    response: NodeJS.ReadableStream & AsyncIterable<Buffer | string>,
    after: string | undefined,
    onEvent: (event: RigEvent) => Promise<void>,
    signal?: AbortSignal,
): Promise<string | undefined> {
    let buffer = "";
    let cursor = after;
    for await (const chunk of response) {
        if (signal?.aborted) return cursor;
        buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
        for (;;) {
            const boundary = buffer.match(/\r?\n\r?\n/u);
            if (!boundary?.index && boundary?.index !== 0) break;
            const frame = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const event = parseSessionEventFrame(frame);
            if (!event) continue;
            await onEvent(event);
            cursor = event.id;
        }
    }
    return cursor;
}

function parseGlobalEventFrame(frame: string): RigGlobalEvent | undefined {
    let id: string | undefined;
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/u)) {
        if (line.startsWith(":")) continue;
        const separator = line.indexOf(":");
        const field = separator < 0 ? line : line.slice(0, separator);
        let value = separator < 0 ? "" : line.slice(separator + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "id") id = value;
        if (field === "data") data.push(value);
    }
    if (!id || data.length === 0) return undefined;
    const cursor = Number(id);
    if (!Number.isSafeInteger(cursor) || cursor < 0)
        throw new RigTransportError(`Rig sent an invalid global event cursor: ${id}`);
    return { cursor, event: JSON.parse(data.join("\n")) as RigEvent };
}

function parseSessionEventFrame(frame: string): RigEvent | undefined {
    let id: string | undefined;
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/u)) {
        if (line.startsWith(":")) continue;
        const separator = line.indexOf(":");
        const field = separator < 0 ? line : line.slice(0, separator);
        let value = separator < 0 ? "" : line.slice(separator + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "id") id = value;
        if (field === "data") data.push(value);
    }
    if (!id || data.length === 0) return undefined;
    const event = JSON.parse(data.join("\n")) as RigEvent;
    if (event.id !== id)
        throw new RigTransportError("Rig session event id does not match its SSE cursor.");
    return event;
}

export function isRetryableRigError(error: unknown): boolean {
    return (
        error instanceof RigTransportError ||
        (error instanceof RigHttpError && (error.status === 401 || error.status >= 500))
    );
}

function agentText(messages: readonly RigMessage[]): string {
    return messages
        .filter((message) => message.role === "agent")
        .map((message) => messageText(message) ?? "")
        .filter((text) => text.length > 0)
        .join("\n\n");
}

function sessionEffort(session: ProtocolSession): RigEffortConfiguration {
    const model = session.models.find((candidate) => candidate.id === session.modelId);
    if (!model) throw new Error(`Rig session uses unknown model '${session.modelId}'.`);
    const effort = session.effort ?? model.defaultThinkingLevel;
    if (!model.thinkingLevels.includes(effort))
        throw new Error(`Rig session reports unsupported effort '${effort}'.`);
    return { effort, options: [...model.thinkingLevels] };
}

function messageText(message: RigMessage | undefined): string | undefined {
    return message?.blocks
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("");
}

async function readToken(path: string): Promise<string | undefined> {
    try {
        const token = (await readFile(path, "utf8")).trim();
        return token || undefined;
    } catch {
        return undefined;
    }
}

function execute(command: string, arguments_: string[], environment: Record<string, string>) {
    return new Promise<void>((resolve, reject) => {
        execFile(command, arguments_, { env: { ...process.env, ...environment } }, (error) => {
            if (error) reject(new Error(`Could not start Rig daemon: ${error.message}`));
            else resolve();
        });
    });
}

function rigError(contents: string, status?: number): string {
    try {
        const body = JSON.parse(contents) as { error?: string };
        if (body.error) return body.error;
    } catch {
        // Fall back to the response body below.
    }
    return contents || `Rig daemon returned HTTP ${status ?? 500}.`;
}

export class RigHttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "RigHttpError";
    }
}

class RigTransportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RigTransportError";
    }
}

function asTransportError(error: unknown): RigTransportError {
    return error instanceof RigTransportError
        ? error
        : new RigTransportError(error instanceof Error ? error.message : String(error));
}

function shutdownError(): Error {
    return new Error("Rig request was stopped because the server is shutting down.");
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
