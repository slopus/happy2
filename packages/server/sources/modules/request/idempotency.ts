import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import type { FastifyRequest } from "fastify";

type Awaitable<T> = T | Promise<T>;

export interface IdempotencyAcquireInput {
    storageKey: string;
    fingerprint: string;
    leaseToken: string;
    now: number;
    leaseExpiresAt: number;
    recordExpiresAt: number;
}

export type IdempotencyAcquireResult<TResponse> =
    | { kind: "acquired" }
    | { kind: "replay"; response: TResponse }
    | { kind: "conflict" }
    | { kind: "in_progress"; retryAt: number };

export interface IdempotencyCompleteInput<TResponse> {
    storageKey: string;
    leaseToken: string;
    response: TResponse;
    now: number;
    recordExpiresAt: number;
}

/**
 * Durable adapters must linearize operations per storageKey. The lease token is a
 * fencing token: complete and release may mutate only the record owned by that
 * token. Responses must be serializable by the selected adapter.
 */
export interface IdempotencyStore<TResponse> {
    acquire(input: IdempotencyAcquireInput): Promise<IdempotencyAcquireResult<TResponse>>;
    complete(input: IdempotencyCompleteInput<TResponse>): Promise<boolean>;
    release(storageKey: string, leaseToken: string): Promise<boolean>;
    purgeExpired(now: number, limit?: number): Promise<number>;
    close?(): Awaitable<void>;
}

interface PendingEntry {
    state: "pending";
    fingerprint: string;
    leaseToken: string;
    leaseExpiresAt: number;
    recordExpiresAt: number;
}

interface CompletedEntry<TResponse> {
    state: "completed";
    fingerprint: string;
    response: TResponse;
    recordExpiresAt: number;
}

type LocalEntry<TResponse> = PendingEntry | CompletedEntry<TResponse>;

export interface LocalIdempotencyStoreOptions<TResponse> {
    maxEntries?: number;
    cleanupIntervalMs?: number;
    cloneResponse?: (response: TResponse) => TResponse;
}

export class IdempotencyStoreCapacityError extends Error {
    readonly retryAt?: number;

    constructor(retryAt?: number) {
        super("Idempotency store capacity is exhausted");
        this.name = "IdempotencyStoreCapacityError";
        this.retryAt = retryAt;
    }
}

/**
 * A bounded single-process adapter. It is useful for local deployments and tests;
 * multi-instance deployments should provide a database or Redis implementation of
 * IdempotencyStore so acquisition and fencing remain shared and atomic.
 */
export class LocalIdempotencyStore<TResponse> implements IdempotencyStore<TResponse> {
    private readonly entries = new Map<string, LocalEntry<TResponse>>();
    private readonly maxEntries: number;
    private readonly cleanupIntervalMs: number;
    private readonly cloneResponse: (response: TResponse) => TResponse;
    private lastCleanupAt = Number.NEGATIVE_INFINITY;

    constructor(options: LocalIdempotencyStoreOptions<TResponse> = {}) {
        this.maxEntries = positiveInteger(options.maxEntries ?? 10_000, "maxEntries");
        this.cleanupIntervalMs = positiveInteger(
            options.cleanupIntervalMs ?? 60_000,
            "cleanupIntervalMs",
        );
        this.cloneResponse = options.cloneResponse ?? ((response) => structuredClone(response));
    }

    get size(): number {
        return this.entries.size;
    }

    async acquire(input: IdempotencyAcquireInput): Promise<IdempotencyAcquireResult<TResponse>> {
        validateAcquireInput(input);
        if (input.now - this.lastCleanupAt >= this.cleanupIntervalMs)
            await this.purgeExpired(input.now);

        let entry = this.entries.get(input.storageKey);
        if (entry && entry.recordExpiresAt <= input.now) {
            this.entries.delete(input.storageKey);
            entry = undefined;
        }

        if (entry) {
            if (entry.fingerprint !== input.fingerprint) return { kind: "conflict" };
            if (entry.state === "completed")
                return { kind: "replay", response: this.cloneResponse(entry.response) };
            if (entry.leaseExpiresAt > input.now)
                return { kind: "in_progress", retryAt: entry.leaseExpiresAt };

            this.entries.set(input.storageKey, pendingEntry(input));
            return { kind: "acquired" };
        }

        if (this.entries.size >= this.maxEntries) {
            await this.purgeExpired(input.now);
            if (this.entries.size >= this.maxEntries)
                throw new IdempotencyStoreCapacityError(this.earliestExpiry());
        }
        this.entries.set(input.storageKey, pendingEntry(input));
        return { kind: "acquired" };
    }

    async complete(input: IdempotencyCompleteInput<TResponse>): Promise<boolean> {
        validateCompleteInput(input);
        const entry = this.entries.get(input.storageKey);
        if (!entry || entry.state !== "pending" || entry.leaseToken !== input.leaseToken)
            return false;
        this.entries.set(input.storageKey, {
            state: "completed",
            fingerprint: entry.fingerprint,
            response: this.cloneResponse(input.response),
            recordExpiresAt: input.recordExpiresAt,
        });
        return true;
    }

    async release(storageKey: string, leaseToken: string): Promise<boolean> {
        boundedString(storageKey, "storageKey", 512);
        boundedString(leaseToken, "leaseToken", 256);
        const entry = this.entries.get(storageKey);
        if (!entry || entry.state !== "pending" || entry.leaseToken !== leaseToken) return false;
        return this.entries.delete(storageKey);
    }

    async purgeExpired(now: number, limit = Number.MAX_SAFE_INTEGER): Promise<number> {
        if (!Number.isFinite(now)) throw new TypeError("now must be finite");
        positiveInteger(limit, "limit");
        let deleted = 0;
        for (const [key, entry] of this.entries) {
            if (deleted >= limit) break;
            if (entry.recordExpiresAt > now) continue;
            this.entries.delete(key);
            deleted += 1;
        }
        this.lastCleanupAt = now;
        return deleted;
    }

    close(): void {
        this.entries.clear();
    }

    private earliestExpiry(): number | undefined {
        let earliest: number | undefined;
        for (const entry of this.entries.values()) {
            if (earliest === undefined || entry.recordExpiresAt < earliest)
                earliest = entry.recordExpiresAt;
        }
        return earliest;
    }
}

export interface IdempotencyCoordinatorOptions {
    leaseMs?: number;
    retentionMs?: number;
    maxKeyLength?: number;
    now?: () => number;
    leaseToken?: () => string;
}

export interface BeginIdempotencyInput {
    actorId: string;
    scope: string;
    key: string;
    fingerprint: string;
}

export interface IdempotencyLease {
    storageKey: string;
    leaseToken: string;
}

export type BeginIdempotencyResult<TResponse> =
    | { kind: "acquired"; lease: IdempotencyLease }
    | { kind: "replay"; response: TResponse }
    | { kind: "conflict" }
    | { kind: "in_progress"; retryAfterMs: number };

export type ExecuteIdempotencyResult<TResponse> =
    | { kind: "executed"; response: TResponse }
    | { kind: "replay"; response: TResponse }
    | { kind: "conflict" }
    | { kind: "in_progress"; retryAfterMs: number };

export class IdempotencyLeaseLostError extends Error {
    constructor() {
        super("Idempotency lease was lost before its result could be recorded");
        this.name = "IdempotencyLeaseLostError";
    }
}

export class IdempotencyCoordinator<TResponse> {
    private readonly leaseMs: number;
    private readonly retentionMs: number;
    private readonly maxKeyLength: number;
    private readonly now: () => number;
    private readonly leaseToken: () => string;

    constructor(
        private readonly store: IdempotencyStore<TResponse>,
        options: IdempotencyCoordinatorOptions = {},
    ) {
        this.leaseMs = positiveInteger(options.leaseMs ?? 30_000, "leaseMs");
        this.retentionMs = positiveInteger(options.retentionMs ?? 24 * 60 * 60_000, "retentionMs");
        if (this.retentionMs < this.leaseMs)
            throw new TypeError("retentionMs must be greater than or equal to leaseMs");
        this.maxKeyLength = positiveInteger(options.maxKeyLength ?? 200, "maxKeyLength");
        this.now = options.now ?? Date.now;
        this.leaseToken = options.leaseToken ?? createId;
    }

    async begin(input: BeginIdempotencyInput): Promise<BeginIdempotencyResult<TResponse>> {
        validatePublicInput(input, this.maxKeyLength);
        const now = this.now();
        const leaseToken = this.leaseToken();
        boundedString(leaseToken, "leaseToken", 256);
        const storageKey = createIdempotencyStorageKey(input);
        const result = await this.store.acquire({
            storageKey,
            fingerprint: input.fingerprint,
            leaseToken,
            now,
            leaseExpiresAt: now + this.leaseMs,
            recordExpiresAt: now + this.retentionMs,
        });
        if (result.kind === "acquired")
            return { kind: "acquired", lease: { storageKey, leaseToken } };
        if (result.kind === "in_progress")
            return { kind: "in_progress", retryAfterMs: Math.max(1, result.retryAt - now) };
        return result;
    }

    async complete(lease: IdempotencyLease, response: TResponse): Promise<boolean> {
        const now = this.now();
        return this.store.complete({
            ...lease,
            response,
            now,
            recordExpiresAt: now + this.retentionMs,
        });
    }

    async release(lease: IdempotencyLease): Promise<boolean> {
        return this.store.release(lease.storageKey, lease.leaseToken);
    }

    async execute(
        input: BeginIdempotencyInput,
        operation: () => Promise<TResponse>,
    ): Promise<ExecuteIdempotencyResult<TResponse>> {
        const result = await this.begin(input);
        if (result.kind !== "acquired") return result;
        try {
            const response = await operation();
            if (!(await this.complete(result.lease, response)))
                throw new IdempotencyLeaseLostError();
            return { kind: "executed", response };
        } catch (error: unknown) {
            // A failed release merely leaves the short lease in place; never mask the
            // operation error. Side effects and completion should share a transaction
            // whenever the durable adapter supports one.
            await this.release(result.lease).catch(() => false);
            throw error;
        }
    }

    async close(): Promise<void> {
        await this.store.close?.();
    }
}

export interface RequestFingerprintInput {
    action: string;
    method?: string;
    contentType?: string;
    query?: unknown;
    payload?: unknown;
}

/** Hashes canonical JSON, so object key order does not create false conflicts. */
export function createRequestFingerprint(input: RequestFingerprintInput): string {
    boundedString(input.action, "action", 512);
    const envelope: Record<string, unknown> = {
        action: input.action,
        method: (input.method ?? "POST").toUpperCase(),
        payload: input.payload ?? null,
        query: input.query ?? null,
    };
    if (input.contentType) envelope.contentType = normalizedContentType(input.contentType);
    return createHash("sha256").update(canonicalJson(envelope), "utf8").digest("hex");
}

/**
 * Uses Fastify's route template rather than the raw URL. Callers may override the
 * payload when the body is not JSON (for example, with a precomputed file digest).
 */
export function fingerprintFastifyRequest(
    request: Pick<FastifyRequest, "body" | "headers" | "method" | "query" | "routeOptions" | "url">,
    payload: unknown = request.body,
): string {
    return createRequestFingerprint({
        action: idempotencyRequestAction(request),
        method: request.method,
        contentType: request.headers["content-type"],
        query: request.query,
        payload,
    });
}

export function idempotencyRequestAction(request: Pick<FastifyRequest, "method" | "url">): string {
    const path = request.url.split("?", 1)[0] ?? request.url;
    return `${request.method.toUpperCase()}:${path}`;
}

export function idempotencyKeyFromRequest(
    request: Pick<FastifyRequest, "headers">,
): string | undefined {
    const value = request.headers["idempotency-key"];
    if (value === undefined) return undefined;
    if (Array.isArray(value)) throw new TypeError("Idempotency-Key must occur exactly once");
    return value;
}

export function createIdempotencyStorageKey(
    input: Pick<BeginIdempotencyInput, "actorId" | "scope" | "key">,
): string {
    boundedString(input.actorId, "actorId", 256);
    boundedString(input.scope, "scope", 256);
    boundedString(input.key, "key", 1_024);
    return createHash("sha256")
        .update(canonicalJson([input.actorId, input.scope, input.key]), "utf8")
        .digest("hex");
}

function pendingEntry(input: IdempotencyAcquireInput): PendingEntry {
    return {
        state: "pending",
        fingerprint: input.fingerprint,
        leaseToken: input.leaseToken,
        leaseExpiresAt: input.leaseExpiresAt,
        recordExpiresAt: input.recordExpiresAt,
    };
}

function validatePublicInput(input: BeginIdempotencyInput, maxKeyLength: number): void {
    boundedString(input.actorId, "actorId", 256);
    boundedString(input.scope, "scope", 256);
    boundedString(input.fingerprint, "fingerprint", 512);
    boundedString(input.key, "key", maxKeyLength);
    if (!/^[\x21-\x7e]+$/.test(input.key))
        throw new TypeError("key must contain only visible ASCII characters without spaces");
}

function validateAcquireInput(input: IdempotencyAcquireInput): void {
    boundedString(input.storageKey, "storageKey", 512);
    boundedString(input.fingerprint, "fingerprint", 512);
    boundedString(input.leaseToken, "leaseToken", 256);
    finiteTimestamp(input.now, "now");
    finiteTimestamp(input.leaseExpiresAt, "leaseExpiresAt");
    finiteTimestamp(input.recordExpiresAt, "recordExpiresAt");
    if (input.leaseExpiresAt <= input.now) throw new TypeError("leaseExpiresAt must follow now");
    if (input.recordExpiresAt < input.leaseExpiresAt)
        throw new TypeError("recordExpiresAt must not precede leaseExpiresAt");
}

function validateCompleteInput<TResponse>(input: IdempotencyCompleteInput<TResponse>): void {
    boundedString(input.storageKey, "storageKey", 512);
    boundedString(input.leaseToken, "leaseToken", 256);
    finiteTimestamp(input.now, "now");
    finiteTimestamp(input.recordExpiresAt, "recordExpiresAt");
    if (input.recordExpiresAt <= input.now) throw new TypeError("recordExpiresAt must follow now");
}

function normalizedContentType(value: string): string {
    return value.split(";", 1)[0]!.trim().toLowerCase();
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
    if (value === null) return "null";
    if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new TypeError("fingerprint values must be finite");
        return JSON.stringify(value);
    }
    if (typeof value !== "object")
        throw new TypeError("fingerprint values must contain only JSON-compatible data");
    if (ancestors.has(value)) throw new TypeError("fingerprint values must not be cyclic");

    ancestors.add(value);
    try {
        if (Array.isArray(value))
            return `[${value.map((item) => canonicalJson(item, ancestors)).join(",")}]`;
        if (
            Object.getPrototypeOf(value) !== Object.prototype &&
            Object.getPrototypeOf(value) !== null
        )
            throw new TypeError("fingerprint objects must be plain objects");
        return `{${Object.keys(value)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], ancestors)}`,
            )
            .join(",")}}`;
    } finally {
        ancestors.delete(value);
    }
}

function positiveInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new TypeError(`${name} must be a positive safe integer`);
    return value;
}

function finiteTimestamp(value: number, name: string): void {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
}

function boundedString(value: string, name: string, maxLength: number): void {
    if (value.length === 0 || value.length > maxLength)
        throw new TypeError(`${name} must contain 1-${maxLength} characters`);
}
