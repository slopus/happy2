import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

type Awaitable<T> = T | Promise<T>;

export interface RateLimitQuota {
    limit: number;
    windowMs: number;
}

export interface RateLimitRule extends RateLimitQuota {
    /** A stable action name, for example `auth.login` or `messages.send`. */
    scope: string;
    /** The independently enforced identity dimension. */
    dimension: "actor" | "ip" | (string & {});
    /** The raw identity. Stores receive only its hash. */
    identity: string;
}

export interface RateLimitConsumeInput extends RateLimitQuota {
    key: string;
    now: number;
}

export interface RateLimitDecision extends RateLimitQuota {
    key: string;
    allowed: boolean;
    remaining: number;
    resetAt: number;
    reason?: "limit" | "store_capacity";
}

/**
 * Distributed implementations must make consume atomic for a key. The contract is
 * deliberately independent of Fastify so a Redis or database implementation can
 * be substituted without changing route hooks.
 */
export interface RateLimitStore {
    consume(input: RateLimitConsumeInput): Promise<RateLimitDecision>;
    close?(): Awaitable<void>;
}

export interface LocalRateLimitStoreOptions {
    maxEntries?: number;
    cleanupIntervalMs?: number;
}

interface LocalBucket {
    count: number;
    resetAt: number;
}

/**
 * Bounded, process-local fixed-window store. It is appropriate for a single server
 * and intentionally fails closed when its key budget is exhausted. Use a shared
 * RateLimitStore implementation when several server processes are deployed.
 */
export class LocalRateLimitStore implements RateLimitStore {
    private readonly buckets = new Map<string, LocalBucket>();
    private readonly maxEntries: number;
    private readonly cleanupIntervalMs: number;
    private lastCleanupAt = Number.NEGATIVE_INFINITY;

    constructor(options: LocalRateLimitStoreOptions = {}) {
        this.maxEntries = positiveInteger(options.maxEntries ?? 100_000, "maxEntries");
        this.cleanupIntervalMs = positiveInteger(
            options.cleanupIntervalMs ?? 60_000,
            "cleanupIntervalMs",
        );
    }

    get size(): number {
        return this.buckets.size;
    }

    async consume(input: RateLimitConsumeInput): Promise<RateLimitDecision> {
        validateConsumeInput(input);
        if (input.now - this.lastCleanupAt >= this.cleanupIntervalMs) this.sweep(input.now);

        let bucket = this.buckets.get(input.key);
        if (bucket && bucket.resetAt <= input.now) {
            this.buckets.delete(input.key);
            bucket = undefined;
        }

        if (!bucket) {
            if (this.buckets.size >= this.maxEntries) {
                this.sweep(input.now);
                if (this.buckets.size >= this.maxEntries) {
                    const earliestReset = this.earliestResetAt();
                    return {
                        ...input,
                        allowed: false,
                        remaining: 0,
                        resetAt: Math.max(
                            input.now + 1,
                            earliestReset ?? input.now + input.windowMs,
                        ),
                        reason: "store_capacity",
                    };
                }
            }
            bucket = { count: 0, resetAt: input.now + input.windowMs };
            this.buckets.set(input.key, bucket);
        }

        bucket.count = Math.min(Number.MAX_SAFE_INTEGER, bucket.count + 1);
        const allowed = bucket.count <= input.limit;
        return {
            ...input,
            allowed,
            remaining: Math.max(0, input.limit - bucket.count),
            resetAt: bucket.resetAt,
            reason: allowed ? undefined : "limit",
        };
    }

    sweep(now: number): number {
        let deleted = 0;
        for (const [key, bucket] of this.buckets) {
            if (bucket.resetAt > now) continue;
            this.buckets.delete(key);
            deleted += 1;
        }
        this.lastCleanupAt = now;
        return deleted;
    }

    close(): void {
        this.buckets.clear();
    }

    private earliestResetAt(): number | undefined {
        let earliest: number | undefined;
        for (const bucket of this.buckets.values()) {
            if (earliest === undefined || bucket.resetAt < earliest) earliest = bucket.resetAt;
        }
        return earliest;
    }
}

export interface RateLimitEvaluation {
    allowed: boolean;
    decisions: RateLimitDecision[];
    bypassedBecauseStoreFailed: boolean;
    evaluatedAt: number;
}

export interface HttpRateLimiterOptions {
    /** Defaults to false. Authentication and mutation limits should remain fail-closed. */
    failOpen?: boolean;
    onStoreError?: (error: unknown) => void;
    now?: () => number;
}

export class RateLimitUnavailableError extends Error {
    override readonly cause: unknown;

    constructor(cause: unknown) {
        super("Rate-limit store is unavailable");
        this.name = "RateLimitUnavailableError";
        this.cause = cause;
    }
}

export class HttpRateLimiter {
    private readonly failOpen: boolean;
    private readonly onStoreError?: (error: unknown) => void;
    private readonly now: () => number;

    constructor(
        private readonly store: RateLimitStore,
        options: HttpRateLimiterOptions = {},
    ) {
        this.failOpen = options.failOpen ?? false;
        this.onStoreError = options.onStoreError;
        this.now = options.now ?? Date.now;
    }

    async evaluate(rules: readonly RateLimitRule[]): Promise<RateLimitEvaluation> {
        const now = this.now();
        if (rules.length === 0)
            return {
                allowed: true,
                decisions: [],
                bypassedBecauseStoreFailed: false,
                evaluatedAt: now,
            };

        try {
            const decisions = await Promise.all(
                rules.map((rule) => {
                    validateRule(rule);
                    return this.store.consume({
                        key: createRateLimitStorageKey(rule),
                        limit: rule.limit,
                        windowMs: rule.windowMs,
                        now,
                    });
                }),
            );
            return {
                allowed: decisions.every((decision) => decision.allowed),
                decisions,
                bypassedBecauseStoreFailed: false,
                evaluatedAt: now,
            };
        } catch (error: unknown) {
            this.onStoreError?.(error);
            if (!this.failOpen) throw new RateLimitUnavailableError(error);
            return {
                allowed: true,
                decisions: [],
                bypassedBecauseStoreFailed: true,
                evaluatedAt: now,
            };
        }
    }

    async close(): Promise<void> {
        await this.store.close?.();
    }
}

export interface RequestRateLimitPolicy {
    scope: string;
    ip?: RateLimitQuota | false;
    actor?: RateLimitQuota | false;
}

export interface RateLimitHookOptions {
    limiter: HttpRateLimiter;
    policy:
        | RequestRateLimitPolicy
        | ((request: FastifyRequest) => Awaitable<RequestRateLimitPolicy | undefined>);
    actorId?: (request: FastifyRequest) => Awaitable<string | undefined>;
}

/**
 * Builds independent actor and IP rules. `request.ip` is intentional: Fastify
 * applies its configured `trustProxy` boundary before exposing this value, so the
 * hook never trusts X-Forwarded-For on its own.
 */
export function requestRateLimitRules(
    request: Pick<FastifyRequest, "ip">,
    policy: RequestRateLimitPolicy,
    actorId?: string,
): RateLimitRule[] {
    const rules: RateLimitRule[] = [];
    if (policy.ip)
        rules.push({
            ...policy.ip,
            scope: policy.scope,
            dimension: "ip",
            identity: request.ip,
        });
    if (policy.actor && actorId)
        rules.push({
            ...policy.actor,
            scope: policy.scope,
            dimension: "actor",
            identity: actorId,
        });
    return rules;
}

export function createRateLimitHook(options: RateLimitHookOptions): preHandlerHookHandler {
    return async (request, reply): Promise<void> => {
        const policy =
            typeof options.policy === "function" ? await options.policy(request) : options.policy;
        if (!policy) return;
        const actorId = await options.actorId?.(request);

        let evaluation: RateLimitEvaluation;
        try {
            evaluation = await options.limiter.evaluate(
                requestRateLimitRules(request, policy, actorId),
            );
        } catch (error: unknown) {
            if (!(error instanceof RateLimitUnavailableError)) throw error;
            setRetryAfter(reply, 1);
            reply.code(503).send({ error: "rate_limit_unavailable", retryAfterSeconds: 1 });
            return;
        }

        if (evaluation.decisions.length === 0) return;
        const decision = representativeDecision(evaluation.decisions, evaluation.allowed);
        setRateLimitHeaders(reply, decision, evaluation.evaluatedAt);
        if (evaluation.allowed) return;

        const retryAfterSeconds = secondsUntil(decision.resetAt, evaluation.evaluatedAt);
        setRetryAfter(reply, retryAfterSeconds);
        reply.code(429).send({ error: "rate_limited", retryAfterSeconds });
    };
}

export function createRateLimitStorageKey(
    rule: Pick<RateLimitRule, "scope" | "dimension" | "identity">,
): string {
    boundedString(rule.scope, "scope", 128);
    boundedString(rule.dimension, "dimension", 64);
    boundedString(rule.identity, "identity", 2_048);
    const digest = createHash("sha256").update(rule.identity, "utf8").digest("hex");
    return `${encodeURIComponent(rule.scope)}:${encodeURIComponent(rule.dimension)}:${digest}`;
}

function representativeDecision(
    decisions: readonly RateLimitDecision[],
    allowed: boolean,
): RateLimitDecision {
    if (!allowed) {
        const denied = decisions.filter((decision) => !decision.allowed);
        return denied.reduce((latest, decision) =>
            decision.resetAt > latest.resetAt ? decision : latest,
        );
    }
    return decisions.reduce((mostConstrained, decision) =>
        decision.remaining / decision.limit < mostConstrained.remaining / mostConstrained.limit
            ? decision
            : mostConstrained,
    );
}

function setRateLimitHeaders(reply: FastifyReply, decision: RateLimitDecision, now: number): void {
    reply.header("RateLimit-Limit", decision.limit);
    reply.header("RateLimit-Remaining", decision.remaining);
    reply.header("RateLimit-Reset", secondsUntil(decision.resetAt, now));
    reply.header("X-RateLimit-Reset", Math.ceil(decision.resetAt / 1_000));
}

function setRetryAfter(reply: FastifyReply, seconds: number): void {
    reply.header("Retry-After", Math.max(1, Math.ceil(seconds)));
}

function secondsUntil(resetAt: number, now: number): number {
    return Math.max(1, Math.ceil((resetAt - now) / 1_000));
}

function validateRule(rule: RateLimitRule): void {
    createRateLimitStorageKey(rule);
    positiveInteger(rule.limit, "limit");
    positiveInteger(rule.windowMs, "windowMs");
}

function validateConsumeInput(input: RateLimitConsumeInput): void {
    boundedString(input.key, "key", 512);
    positiveInteger(input.limit, "limit");
    positiveInteger(input.windowMs, "windowMs");
    if (!Number.isFinite(input.now)) throw new TypeError("now must be finite");
}

function positiveInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new TypeError(`${name} must be a positive safe integer`);
    return value;
}

function boundedString(value: string, name: string, maxLength: number): void {
    if (value.length === 0 || value.length > maxLength)
        throw new TypeError(`${name} must contain 1-${maxLength} characters`);
}
