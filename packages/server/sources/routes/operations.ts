import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import { requestMetadata } from "../modules/auth/metadata.js";
import type { OperationsRepository } from "../modules/operations/repository.js";
import {
    OperationsError,
    type DataExportStatus,
    type RetentionScope,
} from "../modules/operations/types.js";

const MAX_ID_LENGTH = 128;
const MAX_CURSOR_LENGTH = 1_024;
const MAX_JSON_BYTES = 32_768;

type AuthenticatedHandler = (
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
) => Promise<unknown>;

export function registerOperationsRoutes(
    app: FastifyInstance,
    auth: AuthService,
    repository: OperationsRepository,
): void {
    app.get(
        "/v0/admin/auditLogs",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const query = requestQuery(request, [
                "action",
                "targetType",
                "targetId",
                "actorUserId",
                "before",
                "limit",
            ]);
            const result = await repository.listAuditLog({
                actorUserId,
                action: optionalString(query, "action", 200),
                targetType: optionalString(query, "targetType", 100),
                targetId: optionalId(query, "targetId"),
                auditedActorUserId: optionalId(query, "actorUserId"),
                before: optionalCursor(query),
                limit: limit(query),
            });
            return { auditLogs: result.items, nextCursor: result.nextCursor };
        }),
    );

    app.get(
        "/v0/admin/bans",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const query = requestQuery(request, ["userId", "status", "before", "limit"]);
            const result = await repository.listBans({
                actorUserId,
                targetUserId: optionalId(query, "userId"),
                status: optionalEnum(query, "status", ["active", "expired", "revoked"] as const),
                before: optionalCursor(query),
                limit: limit(query),
            });
            return { bans: result.items, nextCursor: result.nextCursor };
        }),
    );

    app.post(
        "/v0/admin/users/:userId/applyBan",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, ["reason", "expiresAt"]);
            const ban = await repository.applyBan({
                actorUserId,
                targetUserId: pathId(request, "userId"),
                reason: optionalString(body, "reason", 2_000),
                expiresAt: optionalTimestamp(body, "expiresAt"),
                context: auditContext(request),
            });
            return reply.code(201).send({ ban });
        }),
    );

    app.post(
        "/v0/admin/users/:userId/revokeBan",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["reason"]);
            return {
                ban: await repository.revokeBan({
                    actorUserId,
                    targetUserId: pathId(request, "userId"),
                    reason: optionalString(body, "reason", 2_000),
                    context: auditContext(request),
                }),
            };
        }),
    );

    app.post(
        "/v0/admin/expireBans",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyBody(request);
            return {
                expired: await repository.expireDueBans({
                    actorUserId,
                    context: auditContext(request),
                }),
            };
        }),
    );

    app.post(
        "/v0/reports/createReport",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, [
                "targetUserId",
                "chatId",
                "messageId",
                "fileId",
                "reason",
                "details",
            ]);
            const report = await repository.createReport({
                actorUserId,
                targetUserId: optionalId(body, "targetUserId"),
                chatId: optionalId(body, "chatId"),
                messageId: optionalId(body, "messageId"),
                fileId: optionalId(body, "fileId"),
                reason: requiredString(body, "reason", 2_000),
                details: optionalString(body, "details", 20_000),
                context: auditContext(request),
            });
            return reply.code(201).send({ report });
        }),
    );

    app.get(
        "/v0/admin/reports",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const query = requestQuery(request, ["status", "assignedToUserId", "before", "limit"]);
            const result = await repository.listReports({
                actorUserId,
                status: optionalEnum(query, "status", [
                    "open",
                    "reviewing",
                    "resolved",
                    "dismissed",
                ] as const),
                assignedToUserId: optionalId(query, "assignedToUserId"),
                before: optionalCursor(query),
                limit: limit(query),
            });
            return { reports: result.items, nextCursor: result.nextCursor };
        }),
    );

    app.post(
        "/v0/admin/reports/:reportId/updateReport",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["status", "assignedToUserId", "resolution"]);
            return {
                report: await repository.updateReport({
                    actorUserId,
                    reportId: pathId(request, "reportId"),
                    status: optionalEnum(body, "status", [
                        "open",
                        "reviewing",
                        "resolved",
                        "dismissed",
                    ] as const),
                    assignedToUserId: nullableId(body, "assignedToUserId"),
                    resolution: nullableString(body, "resolution", 20_000),
                    context: auditContext(request),
                }),
            };
        }),
    );

    app.post(
        "/v0/admin/reports/:reportId/takeAction",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["action", "reason", "expiresAt", "metadata"]);
            return repository.takeModerationAction({
                actorUserId,
                reportId: pathId(request, "reportId"),
                action: requiredEnum(body, "action", [
                    "warn",
                    "restrict",
                    "remove_message",
                    "remove_file",
                    "ban",
                    "unban",
                    "delete_user",
                ] as const),
                reason: optionalString(body, "reason", 2_000),
                expiresAt: optionalTimestamp(body, "expiresAt"),
                metadata: optionalJsonObject(body, "metadata"),
                context: auditContext(request),
            });
        }),
    );

    app.post(
        "/v0/admin/moderationActions/:actionId/revokeAction",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["reason"]);
            return repository.revokeModerationAction({
                actorUserId,
                actionId: pathId(request, "actionId"),
                reason: optionalString(body, "reason", 2_000),
                context: auditContext(request),
            });
        }),
    );

    app.post(
        "/v0/me/requestDataExport",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, ["options", "expiresAt"]);
            const dataExport = await repository.requestDataExport({
                actorUserId,
                kind: "user_data",
                options: optionalJsonObject(body, "options"),
                expiresAt: optionalTimestamp(body, "expiresAt"),
                context: auditContext(request),
            });
            return reply.code(202).send({ dataExport });
        }),
    );

    app.post(
        "/v0/dataExports/requestChatExport",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, ["chatId", "options", "expiresAt"]);
            const dataExport = await repository.requestDataExport({
                actorUserId,
                kind: "chat_history",
                targetId: requiredId(body, "chatId"),
                options: optionalJsonObject(body, "options"),
                expiresAt: optionalTimestamp(body, "expiresAt"),
                context: auditContext(request),
            });
            return reply.code(202).send({ dataExport });
        }),
    );

    app.get(
        "/v0/dataExports",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const query = requestQuery(request, ["status", "before", "limit"]);
            const result = await repository.listDataExports({
                actorUserId,
                status: optionalExportStatus(query),
                before: optionalCursor(query),
                limit: limit(query),
                ownOnly: true,
            });
            return { dataExports: result.items, nextCursor: result.nextCursor };
        }),
    );

    app.get(
        "/v0/dataExports/:exportId",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyQuery(request);
            return {
                dataExport: await repository.getDataExport(
                    actorUserId,
                    pathId(request, "exportId"),
                ),
            };
        }),
    );

    app.post(
        "/v0/dataExports/:exportId/cancelDataExport",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyBody(request);
            return {
                dataExport: await repository.cancelDataExport({
                    actorUserId,
                    jobId: pathId(request, "exportId"),
                    context: auditContext(request),
                }),
            };
        }),
    );

    app.get(
        "/v0/admin/dataExports",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const query = requestQuery(request, ["status", "requestedByUserId", "before", "limit"]);
            const result = await repository.listDataExports({
                actorUserId,
                status: optionalExportStatus(query),
                requestedByUserId: optionalId(query, "requestedByUserId"),
                before: optionalCursor(query),
                limit: limit(query),
            });
            return { dataExports: result.items, nextCursor: result.nextCursor };
        }),
    );

    app.post(
        "/v0/admin/requestDataExport",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, ["kind", "targetId", "options", "expiresAt"]);
            const dataExport = await repository.requestDataExport({
                actorUserId,
                kind: requiredEnum(body, "kind", [
                    "user_data",
                    "server_data",
                    "audit_log",
                    "chat_history",
                ] as const),
                targetId: optionalId(body, "targetId"),
                options: optionalJsonObject(body, "options"),
                expiresAt: optionalTimestamp(body, "expiresAt"),
                context: auditContext(request),
            });
            return reply.code(202).send({ dataExport });
        }),
    );

    app.post(
        "/v0/admin/dataExports/:exportId/updateDataExport",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["status", "outputFileId", "lastError", "expiresAt"]);
            return {
                dataExport: await repository.updateDataExport({
                    actorUserId,
                    jobId: pathId(request, "exportId"),
                    status: requiredEnum(body, "status", [
                        "running",
                        "complete",
                        "failed",
                        "cancelled",
                        "expired",
                    ] as const),
                    outputFileId: optionalId(body, "outputFileId"),
                    lastError: optionalString(body, "lastError", 10_000),
                    expiresAt: optionalTimestamp(body, "expiresAt"),
                    context: auditContext(request),
                }),
            };
        }),
    );

    app.get(
        "/v0/admin/backups",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const query = requestQuery(request, ["status", "before", "limit"]);
            const result = await repository.listBackups({
                actorUserId,
                status: optionalEnum(query, "status", [
                    "pending",
                    "running",
                    "complete",
                    "failed",
                    "deleted",
                ] as const),
                before: optionalCursor(query),
                limit: limit(query),
            });
            return { backups: result.items, nextCursor: result.nextCursor };
        }),
    );

    app.post(
        "/v0/admin/backups/createBackupRecord",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, [
                "storageProvider",
                "storageKey",
                "retentionUntil",
                "metadata",
            ]);
            const backup = await repository.createBackup({
                actorUserId,
                storageProvider: storageProvider(body),
                storageKey: storageKey(body),
                retentionUntil: optionalTimestamp(body, "retentionUntil"),
                metadata: optionalJsonObject(body, "metadata"),
                context: auditContext(request),
            });
            return reply.code(201).send({ backup });
        }),
    );

    app.post(
        "/v0/admin/backups/:backupId/updateBackupRecord",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, [
                "status",
                "checksumSha256",
                "size",
                "lastError",
                "retentionUntil",
                "metadata",
            ]);
            return {
                backup: await repository.updateBackup({
                    actorUserId,
                    backupId: pathId(request, "backupId"),
                    status: requiredEnum(body, "status", [
                        "running",
                        "complete",
                        "failed",
                        "deleted",
                    ] as const),
                    checksumSha256: optionalChecksum(body),
                    size: optionalNonNegativeInteger(body, "size"),
                    lastError: optionalString(body, "lastError", 10_000),
                    retentionUntil: optionalTimestamp(body, "retentionUntil"),
                    metadata: optionalJsonObject(body, "metadata"),
                    context: auditContext(request),
                }),
            };
        }),
    );

    app.get(
        "/v0/admin/retentionRuns",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const query = requestQuery(request, ["scope", "before", "limit"]);
            const result = await repository.listRetentionRuns({
                actorUserId,
                scope: optionalRetentionScope(query),
                before: optionalCursor(query),
                limit: limit(query),
            });
            return { retentionRuns: result.items, nextCursor: result.nextCursor };
        }),
    );

    app.post(
        "/v0/admin/retentionRuns/startRetentionRun",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, ["scope", "details"]);
            const retentionRun = await repository.startRetentionRun({
                actorUserId,
                scope: requiredEnum(body, "scope", [
                    "messages",
                    "files",
                    "sync",
                    "idempotency",
                    "audit",
                    "backups",
                ] as const),
                details: optionalJsonObject(body, "details"),
                context: auditContext(request),
            });
            return reply.code(201).send({ retentionRun });
        }),
    );

    app.post(
        "/v0/admin/retentionRuns/:runId/finishRetentionRun",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, [
                "status",
                "itemsExamined",
                "itemsDeleted",
                "details",
                "lastError",
            ]);
            return {
                retentionRun: await repository.finishRetentionRun({
                    actorUserId,
                    runId: pathId(request, "runId"),
                    status: requiredEnum(body, "status", ["complete", "failed"] as const),
                    itemsExamined: requiredNonNegativeInteger(body, "itemsExamined"),
                    itemsDeleted: requiredNonNegativeInteger(body, "itemsDeleted"),
                    details: optionalJsonObject(body, "details"),
                    lastError: optionalString(body, "lastError", 10_000),
                    context: auditContext(request),
                }),
            };
        }),
    );

    app.get(
        "/v0/admin/userAccess",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const query = requestQuery(request, ["before", "limit"]);
            const result = await repository.listUserAccess({
                actorUserId,
                before: optionalCursor(query),
                limit: limit(query),
            });
            return { users: result.items, nextCursor: result.nextCursor };
        }),
    );
}

function authenticated(auth: AuthService, handler: AuthenticatedHandler) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        try {
            return await handler(request, reply, current.user.id);
        } catch (error) {
            if (error instanceof InvalidRequest)
                return reply.code(400).send({ error: "invalid_request", message: error.message });
            if (error instanceof OperationsError)
                return reply.code(operationStatus(error.code)).send({
                    error: error.code,
                    message: error.message,
                });
            throw error;
        }
    };
}

function operationStatus(code: OperationsError["code"]): 400 | 403 | 404 | 409 {
    if (code === "invalid") return 400;
    if (code === "forbidden") return 403;
    if (code === "not_found") return 404;
    return 409;
}

function auditContext(request: FastifyRequest) {
    return { request: requestMetadata(request) };
}

function requestBody(request: FastifyRequest, allowed: readonly string[]): Record<string, unknown> {
    const body = record(request.body, "Request body");
    onlyKeys(body, allowed, "request body");
    return body;
}

function emptyBody(request: FastifyRequest): void {
    if (request.body === undefined || request.body === null) return;
    const body = record(request.body, "Request body");
    onlyKeys(body, [], "request body");
}

function requestQuery(
    request: FastifyRequest,
    allowed: readonly string[],
): Record<string, unknown> {
    const query = record(request.query, "Query");
    onlyKeys(query, allowed, "query");
    return query;
}

function emptyQuery(request: FastifyRequest): void {
    requestQuery(request, []);
}

function record(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new InvalidRequest(`${name} must be an object`);
    return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
    const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
    if (unexpected) throw new InvalidRequest(`Unexpected ${name} field: ${unexpected}`);
}

function has(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function pathId(request: FastifyRequest, key: string): string {
    return requiredId(record(request.params, "Path parameters"), key);
}

function requiredId(value: Record<string, unknown>, key: string): string {
    if (!has(value, key)) throw new InvalidRequest(`${key} is required`);
    return id(value[key], key);
}

function optionalId(value: Record<string, unknown>, key: string): string | undefined {
    return has(value, key) ? id(value[key], key) : undefined;
}

function nullableId(value: Record<string, unknown>, key: string): string | null | undefined {
    if (!has(value, key)) return undefined;
    return value[key] === null ? null : id(value[key], key);
}

function id(value: unknown, key: string): string {
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > MAX_ID_LENGTH ||
        value.trim() !== value ||
        hasControl(value)
    )
        throw new InvalidRequest(`${key} must be a valid identifier`);
    return value;
}

function requiredString(value: Record<string, unknown>, key: string, maximum: number): string {
    if (!has(value, key)) throw new InvalidRequest(`${key} is required`);
    return string(value[key], key, maximum);
}

function optionalString(
    value: Record<string, unknown>,
    key: string,
    maximum: number,
): string | undefined {
    return has(value, key) ? string(value[key], key, maximum) : undefined;
}

function nullableString(
    value: Record<string, unknown>,
    key: string,
    maximum: number,
): string | null | undefined {
    if (!has(value, key)) return undefined;
    return value[key] === null ? null : string(value[key], key, maximum);
}

function string(value: unknown, key: string, maximum: number): string {
    if (typeof value !== "string") throw new InvalidRequest(`${key} must be a string`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum || hasControl(normalized))
        throw new InvalidRequest(`${key} must be between 1 and ${maximum} characters`);
    return normalized;
}

function requiredEnum<const T extends readonly string[]>(
    value: Record<string, unknown>,
    key: string,
    allowed: T,
): T[number] {
    if (!has(value, key)) throw new InvalidRequest(`${key} is required`);
    const selected = value[key];
    if (typeof selected !== "string" || !allowed.includes(selected))
        throw new InvalidRequest(`${key} must be one of: ${allowed.join(", ")}`);
    return selected as T[number];
}

function optionalEnum<const T extends readonly string[]>(
    value: Record<string, unknown>,
    key: string,
    allowed: T,
): T[number] | undefined {
    return has(value, key) ? requiredEnum(value, key, allowed) : undefined;
}

function optionalTimestamp(value: Record<string, unknown>, key: string): string | undefined {
    if (!has(value, key)) return undefined;
    if (typeof value[key] !== "string" || !Number.isFinite(Date.parse(value[key])))
        throw new InvalidRequest(`${key} must be an ISO timestamp`);
    return value[key];
}

function optionalCursor(query: Record<string, unknown>): string | undefined {
    if (!has(query, "before")) return undefined;
    const value = query.before;
    if (
        typeof value !== "string" ||
        !value ||
        value.length > MAX_CURSOR_LENGTH ||
        hasControl(value)
    )
        throw new InvalidRequest("before must be a valid cursor");
    return value;
}

function limit(query: Record<string, unknown>): number {
    if (!has(query, "limit")) return 50;
    const raw = query.limit;
    const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 200)
        throw new InvalidRequest("limit must be an integer between 1 and 200");
    return value as number;
}

function optionalJsonObject(
    body: Record<string, unknown>,
    key: string,
): Record<string, unknown> | undefined {
    if (!has(body, key)) return undefined;
    const value = body[key];
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new InvalidRequest(`${key} must be an object`);
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_JSON_BYTES)
        throw new InvalidRequest(`${key} is too large`);
    return value as Record<string, unknown>;
}

function requiredNonNegativeInteger(body: Record<string, unknown>, key: string): number {
    if (!has(body, key)) throw new InvalidRequest(`${key} is required`);
    const value = body[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
        throw new InvalidRequest(`${key} must be a non-negative integer`);
    return value;
}

function optionalNonNegativeInteger(
    body: Record<string, unknown>,
    key: string,
): number | undefined {
    return has(body, key) ? requiredNonNegativeInteger(body, key) : undefined;
}

function storageProvider(body: Record<string, unknown>): string {
    const value = requiredString(body, "storageProvider", 64).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(value))
        throw new InvalidRequest("storageProvider contains unsupported characters");
    return value;
}

function storageKey(body: Record<string, unknown>): string {
    const value = requiredString(body, "storageKey", 1_024);
    const segments = value.split("/");
    if (value.startsWith("/") || value.includes("\\") || segments.some((entry) => entry === ".."))
        throw new InvalidRequest("storageKey must be an opaque relative storage key");
    return value;
}

function optionalChecksum(body: Record<string, unknown>): string | undefined {
    if (!has(body, "checksumSha256")) return undefined;
    const value = body.checksumSha256;
    if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value))
        throw new InvalidRequest("checksumSha256 must contain 64 hexadecimal characters");
    return value.toLowerCase();
}

function optionalExportStatus(value: Record<string, unknown>): DataExportStatus | undefined {
    return optionalEnum(value, "status", [
        "pending",
        "running",
        "complete",
        "failed",
        "cancelled",
        "expired",
    ] as const);
}

function optionalRetentionScope(value: Record<string, unknown>): RetentionScope | undefined {
    return optionalEnum(value, "scope", [
        "messages",
        "files",
        "sync",
        "idempotency",
        "audit",
        "backups",
    ] as const);
}

function hasControl(value: string): boolean {
    return [...value].some((character) => {
        const point = character.codePointAt(0)!;
        return point <= 31 || point === 127;
    });
}

class InvalidRequest extends Error {}
