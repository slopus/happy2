import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";

export interface RigDaemonConfig {
    socketPath: string;
    tokenPath: string;
    command: string;
}

interface RigBlock {
    type: string;
    text?: string;
}

interface RigMessage {
    role: "agent" | "system" | "user";
    blocks: RigBlock[];
}

interface RigSession {
    id: string;
    status: string;
    snapshot: { messages: RigMessage[] };
}

export interface RigEvent {
    id: string;
    sessionId: string;
    type: string;
    data: {
        errorMessage?: string;
        message?: RigMessage;
        runId?: string;
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
    private token?: string;
    private ready?: Promise<void>;

    constructor(private readonly config: RigDaemonConfig) {}

    async ensureGlobalEventQueue(signal?: AbortSignal): Promise<void> {
        const current = await this.connectedRequest<{
            config: { settings: { durableGlobalEventQueue: boolean } };
        }>("GET", "/config", undefined, signal);
        if (current.config.settings.durableGlobalEventQueue) return;
        await this.connectedRequest(
            "PATCH",
            "/config",
            { settings: { durableGlobalEventQueue: true } },
            signal,
        );
    }

    async createSession(cwd: string): Promise<{ id: string }> {
        const response = await this.connectedRequest<{ session: RigSession }>("POST", "/sessions", {
            cwd,
            permissionMode: "workspace_write",
        });
        return { id: response.session.id };
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

    async trimGlobalEvents(through: number, signal?: AbortSignal): Promise<void> {
        await this.connectedRequest("POST", "/events/trim", { through }, signal);
    }

    async sessionMessageCount(sessionId: string, signal?: AbortSignal): Promise<number> {
        return (await this.session(sessionId, signal)).snapshot.messages.length;
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
        signal?: AbortSignal,
    ): Promise<{ runId: string }> {
        return this.connectedRequest<{ eventId: string; runId: string }>(
            "POST",
            `/sessions/${encodeURIComponent(sessionId)}/messages`,
            { text },
            signal,
        );
    }

    private session(sessionId: string, signal?: AbortSignal): Promise<RigSession> {
        return this.connectedRequest<{ session: RigSession }>(
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
        if (!this.ready) {
            this.ready = this.connect().catch((error) => {
                this.ready = undefined;
                throw error;
            });
        }
        return this.ready;
    }

    private async connect(): Promise<void> {
        this.token = await readToken(this.config.tokenPath);
        if (this.token && (await this.healthy())) return;
        await execute(this.config.command, ["daemon", "start"], {
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
            const health = await this.request<{ healthy: boolean; ready: boolean }>(
                "GET",
                "/health",
            );
            return health.healthy && health.ready;
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
        if (!this.token) return Promise.reject(new Error("Rig daemon token is unavailable."));
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
        if (!this.token) return Promise.reject(new Error("Rig daemon token is unavailable."));
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

export function isRetryableRigError(error: unknown): boolean {
    return (
        error instanceof RigTransportError ||
        (error instanceof RigHttpError && (error.status === 401 || error.status >= 500))
    );
}

function agentText(messages: readonly RigMessage[]): string {
    return messages
        .filter((message) => message.role === "agent")
        .flatMap((message) => message.blocks)
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text!.trim())
        .filter(Boolean)
        .join("\n\n");
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

class RigHttpError extends Error {
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
