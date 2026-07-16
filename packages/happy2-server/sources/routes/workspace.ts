import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import { CollaborationError } from "../modules/collaboration/types.js";
import {
    MAX_WORKSPACE_TEXT_FILE_BYTES,
    WorkspaceError,
    workspaceDirectoryPageLimit,
    type WorkspaceService,
    type WorkspaceTextPatch,
} from "../modules/workspace/index.js";

const MAX_ID_LENGTH = 128;
const MAX_CURSOR_LENGTH = 4_096;
const MAX_FILE_VERSION_LENGTH = 256;
const MAX_PATCH_EDITS = 1_000;
const WORKSPACE_WRITE_BODY_BYTES = MAX_WORKSPACE_TEXT_FILE_BYTES * 6 + 64 * 1024;

export function registerWorkspaceRoutes(
    app: FastifyInstance,
    auth: AuthService,
    workspaces: WorkspaceService,
): void {
    app.get("/v0/chats/:chatId/workspace", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        try {
            const query = requestQuery(request, ["directory", "cursor", "limit"]);
            if (has(query, "directory")) {
                const directory = queryString(query, "directory", 16_384, true);
                const cursor = has(query, "cursor")
                    ? queryString(query, "cursor", MAX_CURSOR_LENGTH, false)
                    : undefined;
                const limit = directoryPageLimit(
                    has(query, "limit") ? queryInteger(query, "limit") : undefined,
                );
                return sendWorkspace(
                    request,
                    reply,
                    await workspaces.getDirectory({
                        userId: current.user.id,
                        chatId: pathId(request, "chatId"),
                        directory,
                        cursor,
                        limit,
                    }),
                );
            }
            if (has(query, "cursor") || has(query, "limit"))
                throw new InvalidRequest("cursor and limit require directory");
            return sendWorkspace(
                request,
                reply,
                await workspaces.getSnapshot(current.user.id, pathId(request, "chatId")),
            );
        } catch (error) {
            return sendWorkspaceError(reply, error);
        }
    });

    app.get("/v0/chats/:chatId/workspace/file", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        try {
            const query = requestQuery(request, ["path"]);
            return reply.send({
                file: await workspaces.getFile({
                    userId: current.user.id,
                    chatId: pathId(request, "chatId"),
                    path: queryString(query, "path", 16_384, false),
                }),
            });
        } catch (error) {
            return sendWorkspaceError(reply, error);
        }
    });

    app.post(
        "/v0/chats/:chatId/workspace/writeFile",
        { bodyLimit: WORKSPACE_WRITE_BODY_BYTES },
        async (request, reply) => {
            const current = await auth.authenticate(request);
            if (!current) return reply.code(401).send({ error: "unauthorized" });
            try {
                const body = requestBody(request, ["path", "expectedVersion", "content", "patch"]);
                const expectedVersion = nullableVersion(body.expectedVersion);
                const content = has(body, "content")
                    ? bodyString(body, "content", Number.MAX_SAFE_INTEGER, true)
                    : undefined;
                const patch = has(body, "patch") ? textPatch(body.patch) : undefined;
                if ((content === undefined) === (patch === undefined))
                    throw new InvalidRequest("Provide exactly one of content or patch");
                const file = await workspaces.writeFile({
                    userId: current.user.id,
                    chatId: pathId(request, "chatId"),
                    path: bodyString(body, "path", 16_384, false),
                    expectedVersion,
                    content,
                    patch,
                });
                return reply.code(file.created ? 201 : 200).send({ file });
            } catch (error) {
                return sendWorkspaceError(reply, error);
            }
        },
    );

    app.post("/v0/chats/:chatId/workspace/deleteFile", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        try {
            const body = requestBody(request, ["path", "expectedVersion"]);
            return reply.send({
                file: await workspaces.deleteFile({
                    userId: current.user.id,
                    chatId: pathId(request, "chatId"),
                    path: bodyString(body, "path", 16_384, false),
                    expectedVersion: bodyString(
                        body,
                        "expectedVersion",
                        MAX_FILE_VERSION_LENGTH,
                        false,
                    ),
                }),
            });
        } catch (error) {
            return sendWorkspaceError(reply, error);
        }
    });
}

function sendWorkspaceError(reply: FastifyReply, error: unknown) {
    if (error instanceof InvalidRequest)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    if (error instanceof CollaborationError)
        return reply.code(404).send({ error: "not_found", message: error.message });
    if (!(error instanceof WorkspaceError)) throw error;
    switch (error.code) {
        case "stale_cursor":
            return reply
                .code(409)
                .send({ error: "workspace_cursor_stale", message: error.message });
        case "conflict":
            return reply.code(409).send({
                error: "workspace_file_conflict",
                message: error.message,
                currentVersion: error.currentVersion ?? null,
            });
        case "invalid_patch":
            return reply
                .code(400)
                .send({ error: "invalid_workspace_patch", message: error.message });
        case "too_large":
            return reply
                .code(413)
                .send({ error: "workspace_file_too_large", message: error.message });
        case "not_text":
            return reply
                .code(415)
                .send({ error: "workspace_file_not_text", message: error.message });
        case "not_found":
            return reply.code(404).send({ error: "not_found", message: error.message });
    }
}

function directoryPageLimit(value: number | undefined): number {
    try {
        return workspaceDirectoryPageLimit(value);
    } catch (error) {
        if (error instanceof RangeError) throw new InvalidRequest(error.message);
        throw error;
    }
}

function sendWorkspace(
    request: FastifyRequest,
    reply: FastifyReply,
    workspace: { readonly revision: string },
) {
    const etag = `"${workspace.revision}"`;
    reply.header("cache-control", "private, no-cache").header("etag", etag);
    if (etagMatches(request.headers["if-none-match"], etag)) return reply.code(304).send();
    return reply.send({ workspace });
}

function etagMatches(value: string | string[] | undefined, etag: string): boolean {
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return values.some((header) =>
        header.split(",").some((candidate) => {
            const tag = candidate.trim();
            return tag === "*" || tag === etag || tag === `W/${etag}`;
        }),
    );
}

function requestQuery(
    request: FastifyRequest,
    allowed: readonly string[],
): Record<string, unknown> {
    if (!request.query || typeof request.query !== "object" || Array.isArray(request.query))
        throw new InvalidRequest("Query parameters are invalid");
    const query = request.query as Record<string, unknown>;
    const unexpected = Object.keys(query).find((key) => !allowed.includes(key));
    if (unexpected) throw new InvalidRequest(`Unexpected query parameter: ${unexpected}`);
    return query;
}

function requestBody(request: FastifyRequest, allowed: readonly string[]): Record<string, unknown> {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body))
        throw new InvalidRequest("Request body is invalid");
    const body = request.body as Record<string, unknown>;
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) throw new InvalidRequest(`Unexpected body field: ${unexpected}`);
    return body;
}

function pathId(request: FastifyRequest, key: string): string {
    const value = (request.params as Record<string, unknown>)[key];
    if (typeof value !== "string" || !value || value.length > MAX_ID_LENGTH)
        throw new InvalidRequest(`${key} is invalid`);
    return value;
}

class InvalidRequest extends Error {}

function has(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function queryString(
    query: Record<string, unknown>,
    key: string,
    maximumLength: number,
    allowEmpty: boolean,
): string {
    const value = query[key];
    if (typeof value !== "string" || (!allowEmpty && !value) || value.length > maximumLength)
        throw new InvalidRequest(`${key} is invalid`);
    return value;
}

function bodyString(
    body: Record<string, unknown>,
    key: string,
    maximumLength: number,
    allowEmpty: boolean,
): string {
    const value = body[key];
    if (typeof value !== "string" || (!allowEmpty && !value) || value.length > maximumLength)
        throw new InvalidRequest(`${key} is invalid`);
    return value;
}

function nullableVersion(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== "string" || !value || value.length > MAX_FILE_VERSION_LENGTH)
        throw new InvalidRequest("expectedVersion is invalid");
    return value;
}

function textPatch(value: unknown): WorkspaceTextPatch {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new InvalidRequest("patch is invalid");
    const patch = value as Record<string, unknown>;
    if (Object.keys(patch).some((key) => key !== "edits") || !Array.isArray(patch.edits))
        throw new InvalidRequest("patch is invalid");
    if (patch.edits.length > MAX_PATCH_EDITS)
        throw new InvalidRequest(`patch may contain at most ${MAX_PATCH_EDITS} edits`);
    return {
        edits: patch.edits.map((value): WorkspaceTextPatch["edits"][number] => {
            if (!value || typeof value !== "object" || Array.isArray(value))
                throw new InvalidRequest("patch edit is invalid");
            const edit = value as Record<string, unknown>;
            if (Object.keys(edit).some((key) => !["start", "end", "text"].includes(key)))
                throw new InvalidRequest("patch edit is invalid");
            if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end))
                throw new InvalidRequest("patch edit offsets are invalid");
            if (typeof edit.text !== "string")
                throw new InvalidRequest("patch edit text is invalid");
            return { start: edit.start as number, end: edit.end as number, text: edit.text };
        }),
    };
}

function queryInteger(query: Record<string, unknown>, key: string): number {
    const value = query[key];
    if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value))
        throw new InvalidRequest(`${key} is invalid`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new InvalidRequest(`${key} is invalid`);
    return parsed;
}
