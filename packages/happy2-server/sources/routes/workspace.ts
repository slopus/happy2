import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import { CollaborationError } from "../modules/collaboration/types.js";
import {
    WorkspaceError,
    workspaceDirectoryPageLimit,
    type WorkspaceService,
} from "../modules/workspace/index.js";

const MAX_ID_LENGTH = 128;
const MAX_CURSOR_LENGTH = 4_096;

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
            if (error instanceof InvalidRequest)
                return reply.code(400).send({ error: "invalid_request", message: error.message });
            if (error instanceof CollaborationError)
                return reply.code(404).send({ error: "not_found", message: error.message });
            if (error instanceof WorkspaceError) {
                if (error.code === "stale_cursor")
                    return reply
                        .code(409)
                        .send({ error: "workspace_cursor_stale", message: error.message });
                return reply.code(404).send({ error: "not_found", message: error.message });
            }
            throw error;
        }
    });
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

function queryInteger(query: Record<string, unknown>, key: string): number {
    const value = query[key];
    if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value))
        throw new InvalidRequest(`${key} is invalid`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new InvalidRequest(`${key} is invalid`);
    return parsed;
}
