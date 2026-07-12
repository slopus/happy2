import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthService } from "../auth/service.js";
import {
    fingerprintFastifyRequest,
    IdempotencyStoreCapacityError,
    idempotencyRequestAction,
    idempotencyKeyFromRequest,
    type IdempotencyCoordinator,
    type IdempotencyLease,
} from "./idempotency.js";

export interface StoredHttpResponse {
    statusCode: number;
    contentType?: string;
    payload: string;
    encoding: "utf8" | "base64";
}

/** Adds optional Idempotency-Key support uniformly to authenticated JSON POST actions. */
export function registerIdempotencyHooks(
    app: FastifyInstance,
    auth: AuthService,
    coordinator: IdempotencyCoordinator<StoredHttpResponse>,
): void {
    const leases = new WeakMap<FastifyRequest, IdempotencyLease>();

    app.addHook("preHandler", async (request, reply) => {
        if (request.method !== "POST") return;
        let key: string | undefined;
        try {
            key = idempotencyKeyFromRequest(request);
        } catch (error) {
            return reply
                .code(400)
                .send({ error: "invalid_idempotency_key", message: message(error) });
        }
        if (!key) return;
        if (request.headers["content-type"]?.startsWith("multipart/form-data")) {
            return reply.code(400).send({
                error: "idempotency_not_supported_for_multipart",
                message: "Use the resumable upload id for upload idempotency",
            });
        }
        const current = await auth.authenticate(request);
        if (!current) return;
        try {
            const result = await coordinator.begin({
                actorId: current.user.id,
                scope: idempotencyRequestAction(request),
                key,
                fingerprint: fingerprintFastifyRequest(request),
            });
            if (result.kind === "conflict")
                return reply.code(409).send({ error: "idempotency_key_reused" });
            if (result.kind === "in_progress") {
                const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1_000));
                return reply
                    .code(409)
                    .header("retry-after", String(retryAfterSeconds))
                    .send({ error: "idempotency_in_progress", retryAfterSeconds });
            }
            if (result.kind === "replay") {
                if (result.response.contentType) reply.type(result.response.contentType);
                reply.header("idempotency-replayed", "true").code(result.response.statusCode);
                return reply.send(
                    result.response.encoding === "base64"
                        ? Buffer.from(result.response.payload, "base64")
                        : result.response.payload,
                );
            }
            leases.set(request, result.lease);
        } catch (error) {
            if (error instanceof TypeError)
                return reply
                    .code(400)
                    .send({ error: "invalid_idempotency_key", message: message(error) });
            request.log.error(error, "Idempotency store failed");
            if (error instanceof IdempotencyStoreCapacityError && error.retryAt) {
                const retryAfter = Math.max(1, Math.ceil((error.retryAt - Date.now()) / 1_000));
                reply.header("retry-after", String(retryAfter));
            }
            return reply.code(503).send({ error: "idempotency_unavailable" });
        }
    });

    app.addHook("onSend", async (request, reply, payload) => {
        const lease = leases.get(request);
        if (!lease) return payload;
        leases.delete(request);
        if (reply.statusCode >= 500) {
            await coordinator.release(lease);
            return payload;
        }
        const buffer = Buffer.isBuffer(payload) ? payload : undefined;
        const response: StoredHttpResponse = {
            statusCode: reply.statusCode,
            contentType: reply.getHeader("content-type")?.toString(),
            payload: buffer ? buffer.toString("base64") : String(payload ?? ""),
            encoding: buffer ? "base64" : "utf8",
        };
        if (!(await coordinator.complete(lease, response)))
            request.log.warn("Idempotency lease was lost before response completion");
        return payload;
    });

    app.addHook("onError", async (request) => {
        const lease = leases.get(request);
        if (!lease) return;
        leases.delete(request);
        await coordinator.release(lease).catch(() => false);
    });
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : "Invalid idempotency key";
}
