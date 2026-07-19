import { ApiResponseError } from "../../api.js";
import {
    type BackendOperation,
    type BackendOperationInput,
    type BackendOperationResult,
    backendOperations,
    backendOperationStreamRequest,
    backendOperationSupportsIdempotency,
    executeBackendOperation,
} from "../../backend.js";
import { type ClientTransport, type HttpStreamEvent, TransportError } from "../../transport.js";
import { UserError } from "../../types.js";

export interface OperationStreamObserver {
    /** One named server-sent event with its parsed JSON payload. */
    readonly onEvent: (event: HttpStreamEvent) => void;
    /** The stream closed after the server finished sending frames. */
    readonly onEnd: () => void;
    /** The request failed to open or the stream broke; already displayable. */
    readonly onError: (error: UserError) => void;
}

export interface StateRetryPolicy {
    /** Total attempts, including the first request. */
    readonly attempts?: number;
    readonly delayMs?: (attempt: number, error: unknown) => number;
}

export interface StateRuntimeOptions {
    readonly transport?: ClientTransport;
    readonly retry?: StateRetryPolicy;
    readonly createId?: () => string;
    readonly now?: () => number;
    readonly sleep?: (milliseconds: number) => Promise<void>;
    readonly onBackgroundError?: (error: UserError) => void;
}

/** Owns transport retry/idempotency and background-work lifetime without owning render state. */
export class StateRuntime implements AsyncDisposable {
    readonly createId: () => string;
    readonly now: () => number;
    private readonly transport?: ClientTransport;
    private readonly attempts: number;
    private readonly delayMs: NonNullable<StateRetryPolicy["delayMs"]>;
    private readonly sleep: (milliseconds: number) => Promise<void>;
    private readonly onBackgroundError: (error: UserError) => void;
    private readonly pending = new Set<Promise<void>>();
    private stopped = false;

    constructor(options: StateRuntimeOptions) {
        this.transport = options.transport;
        const attempts = options.retry?.attempts ?? 3;
        if (!Number.isSafeInteger(attempts) || attempts < 1)
            throw new RangeError("Retry attempts must be a positive integer.");
        this.attempts = attempts;
        this.delayMs = options.retry?.delayMs ?? ((attempt) => 100 * 2 ** (attempt - 1));
        this.createId = options.createId ?? defaultId;
        this.now = options.now ?? Date.now;
        this.sleep = options.sleep ?? defaultSleep;
        this.onBackgroundError = options.onBackgroundError ?? (() => undefined);
    }

    get connected(): boolean {
        return this.transport !== undefined;
    }

    get active(): boolean {
        return !this.stopped;
    }

    transportGet(): ClientTransport | undefined {
        return this.stopped ? undefined : this.transport;
    }

    async operation<K extends BackendOperation>(
        operation: K,
        ...inputArgument: {} extends BackendOperationInput<K>
            ? [input?: BackendOperationInput<K>]
            : [input: BackendOperationInput<K>]
    ): Promise<BackendOperationResult<K>> {
        this.assertActive();
        const transport = this.requireTransport();
        const input = inputArgument[0];
        try {
            if (backendOperationSupportsIdempotency(operation)) {
                return await this.executeWithIdempotencyKey(operation, this.createId(), input);
            }
            if (backendOperations[operation].method === "GET") {
                return await this.retry(() => executeBackendOperation(transport, operation, input));
            }
            return await executeBackendOperation(transport, operation, input);
        } catch (error) {
            throw userError(error);
        }
    }

    async operationWithIdempotencyKey<K extends BackendOperation>(
        operation: K,
        idempotencyKey: string,
        ...inputArgument: {} extends BackendOperationInput<K>
            ? [input?: BackendOperationInput<K>]
            : [input: BackendOperationInput<K>]
    ): Promise<BackendOperationResult<K>> {
        this.assertActive();
        if (!backendOperationSupportsIdempotency(operation))
            throw new TypeError(`${operation} does not support idempotency keys.`);
        return await this.executeWithIdempotencyKey(operation, idempotencyKey, inputArgument[0]);
    }

    private async executeWithIdempotencyKey<K extends BackendOperation>(
        operation: K,
        idempotencyKey: string,
        input: BackendOperationInput<K> | undefined,
    ): Promise<BackendOperationResult<K>> {
        const transport = this.requireTransport();
        try {
            return await this.retry(() =>
                executeBackendOperation(transport, operation, input, idempotencyKey),
            );
        } catch (error) {
            throw userError(error);
        }
    }

    /**
     * Opens one server-sent-event operation (plugin preparation, update checks).
     * Streams are never retried and never carry idempotency keys; a non-2xx
     * response or transport failure surfaces once through `onError`. The
     * returned function cancels the stream and silences the observer.
     */
    operationStream<K extends BackendOperation>(
        operation: K,
        input: BackendOperationInput<K> | undefined,
        observer: OperationStreamObserver,
    ): () => void {
        this.assertActive();
        const transport = this.requireTransport();
        return transport.requestStream(backendOperationStreamRequest(operation, input), {
            onEvent: (event) => observer.onEvent(event),
            onFailure: (response) => {
                const body =
                    response.body !== null && typeof response.body === "object"
                        ? (response.body as Record<string, unknown>)
                        : {};
                observer.onError(
                    userError(
                        new ApiResponseError(
                            response,
                            typeof body.message === "string"
                                ? body.message
                                : typeof body.error === "string"
                                  ? body.error
                                  : "The server request failed.",
                        ),
                    ),
                );
            },
            onEnd: () => observer.onEnd(),
            onError: (error) => observer.onError(userError(error)),
        });
    }

    async read<Result>(request: (transport: ClientTransport) => Promise<Result>): Promise<Result> {
        this.assertActive();
        const transport = this.requireTransport();
        try {
            return await this.retry(() => request(transport));
        } catch (error) {
            throw userError(error);
        }
    }

    background(task: Promise<void>): void {
        const tracked = task
            .catch((error: unknown) => {
                if (this.stopped) return;
                this.onBackgroundError(userError(error));
            })
            .finally(() => this.pending.delete(tracked));
        if (this.stopped) return;
        this.pending.add(tracked);
    }

    async whenIdle(): Promise<void> {
        while (this.pending.size > 0) await Promise.all(this.pending);
    }

    stop(): void {
        this.stopped = true;
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this.stop();
        await this.whenIdle();
    }

    private requireTransport(): ClientTransport {
        if (!this.transport) throw new UserError("This state is not connected to a server.");
        return this.transport;
    }

    private assertActive(): void {
        if (this.stopped) throw new UserError("This state instance has been stopped.");
    }

    private async retry<Result>(request: () => Promise<Result>): Promise<Result> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
            this.assertActive();
            try {
                return await request();
            } catch (error) {
                lastError = error;
                if (attempt === this.attempts || !retryable(error)) throw error;
                const requestedDelay =
                    error instanceof ApiResponseError ? error.retryAfterMs : undefined;
                await this.sleep(requestedDelay ?? Math.max(0, this.delayMs(attempt, error)));
            }
        }
        throw lastError;
    }
}

export function userError(error: unknown, fallback = "The server request failed."): UserError {
    if (error instanceof UserError) return error;
    if (error instanceof ApiResponseError) return new UserError(error.message, error.code, error);
    if (error instanceof Error) return new UserError(error.message || fallback, undefined, error);
    return new UserError(fallback, undefined, error);
}

function retryable(error: unknown): boolean {
    if (error instanceof TransportError) return error.retryable;
    if (!(error instanceof ApiResponseError)) return false;
    return (
        error.response.status === 408 ||
        error.response.status === 425 ||
        error.response.status === 429 ||
        error.response.status >= 500 ||
        error.code === "idempotency_in_progress" ||
        error.code === "idempotency_retry"
    );
}

function defaultId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function defaultSleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
