import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import { CollaborationError } from "../modules/chat/types.js";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { roleCreate } from "../modules/permission/roleCreate.js";
import { roleDelete } from "../modules/permission/roleDelete.js";
import { roleList } from "../modules/permission/roleList.js";
import { roleUpdate } from "../modules/permission/roleUpdate.js";
import {
    permissions,
    type Permission,
    type PermissionMutation,
} from "../modules/permission/types.js";
import { userPermissionGet } from "../modules/permission/userPermissionGet.js";
import { userPermissionUpdate } from "../modules/permission/userPermissionUpdate.js";
import { userRoleAssign } from "../modules/permission/userRoleAssign.js";
import { userRoleUnassign } from "../modules/permission/userRoleUnassign.js";
import { realtimeTopics, type PubSub, type SyncHintEvent } from "../modules/realtime/index.js";

const MAX_ID_LENGTH = 128;
const MAX_ROLE_NAME_LENGTH = 100;
const MAX_ROLE_DESCRIPTION_LENGTH = 1_000;

export function registerPermissionRoutes(
    app: FastifyInstance,
    auth: AuthService,
    executor: DrizzleExecutor,
    pubsub: PubSub,
): void {
    app.get(
        "/v0/admin/roles",
        authenticated(auth, async (_request, _reply, actorUserId) => ({
            permissions,
            roles: await roleList(executor, actorUserId),
        })),
    );
    app.post(
        "/v0/admin/roles/createRole",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, ["name", "description", "permissions"]);
            const result = await roleCreate(executor, {
                actorUserId,
                name: requiredText(body, "name", MAX_ROLE_NAME_LENGTH),
                description: optionalText(body, "description", MAX_ROLE_DESCRIPTION_LENGTH),
                permissions: permissionList(body, "permissions"),
            });
            await publishPermissionMutation(request, pubsub, actorUserId, result.mutation);
            return reply.code(201).send({ role: result.role, sync: result.mutation.sync });
        }),
    );
    app.post(
        "/v0/admin/roles/:roleId/updateRole",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["name", "description", "permissions"]);
            if (Object.keys(body).length === 0)
                throw new InvalidRequest("At least one role field is required");
            const mutation = await roleUpdate(executor, {
                actorUserId,
                roleId: pathId(request, "roleId"),
                ...(has(body, "name")
                    ? { name: requiredText(body, "name", MAX_ROLE_NAME_LENGTH) }
                    : {}),
                ...(has(body, "description")
                    ? {
                          description:
                              body.description === null
                                  ? null
                                  : requiredText(body, "description", MAX_ROLE_DESCRIPTION_LENGTH),
                      }
                    : {}),
                ...(has(body, "permissions")
                    ? { permissions: permissionList(body, "permissions") }
                    : {}),
            });
            await publishPermissionMutation(request, pubsub, actorUserId, mutation);
            return { sync: mutation.sync };
        }),
    );
    app.post(
        "/v0/admin/roles/:roleId/deleteRole",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyBody(request);
            const mutation = await roleDelete(executor, {
                actorUserId,
                roleId: pathId(request, "roleId"),
            });
            await publishPermissionMutation(request, pubsub, actorUserId, mutation);
            return { sync: mutation.sync };
        }),
    );
    app.get(
        "/v0/admin/users/:userId/permissions",
        authenticated(auth, async (request, _reply, actorUserId) => ({
            permissions: await userPermissionGet(executor, {
                actorUserId,
                userId: pathId(request, "userId"),
            }),
        })),
    );
    app.post(
        "/v0/admin/users/:userId/updatePermissions",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["permissions"]);
            const mutation = await userPermissionUpdate(executor, {
                actorUserId,
                userId: pathId(request, "userId"),
                permissions: permissionList(body, "permissions"),
            });
            await publishPermissionMutation(request, pubsub, actorUserId, mutation);
            return { sync: mutation.sync };
        }),
    );
    app.post(
        "/v0/admin/users/:userId/assignRole",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["roleId"]);
            const mutation = await userRoleAssign(executor, {
                actorUserId,
                userId: pathId(request, "userId"),
                roleId: id(body.roleId, "roleId"),
            });
            await publishPermissionMutation(request, pubsub, actorUserId, mutation);
            return { sync: mutation.sync };
        }),
    );
    app.post(
        "/v0/admin/users/:userId/unassignRole",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["roleId"]);
            const mutation = await userRoleUnassign(executor, {
                actorUserId,
                userId: pathId(request, "userId"),
                roleId: id(body.roleId, "roleId"),
            });
            await publishPermissionMutation(request, pubsub, actorUserId, mutation);
            return { sync: mutation.sync };
        }),
    );
}

type AuthenticatedHandler = (
    request: FastifyRequest,
    reply: FastifyReply,
    actorUserId: string,
) => Promise<unknown>;

function authenticated(auth: AuthService, handler: AuthenticatedHandler) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        try {
            return await handler(request, reply, current.user.id);
        } catch (error) {
            if (error instanceof InvalidRequest)
                return reply.code(400).send({ error: "invalid_request", message: error.message });
            if (error instanceof CollaborationError)
                return reply
                    .code(
                        error.code === "invalid"
                            ? 400
                            : error.code === "forbidden"
                              ? 403
                              : error.code === "not_found"
                                ? 404
                                : 409,
                    )
                    .send({ error: error.code, message: error.message });
            throw error;
        }
    };
}

async function publishPermissionMutation(
    request: FastifyRequest,
    pubsub: PubSub,
    actorUserId: string,
    mutation: PermissionMutation,
): Promise<void> {
    const event: SyncHintEvent = { type: "sync", ...mutation.sync };
    const topics = mutation.broadcast
        ? [realtimeTopics.server]
        : [...new Set([actorUserId, ...mutation.affectedUserIds])].map(realtimeTopics.user);
    const batchSize = 32;
    for (let index = 0; index < topics.length; index += batchSize) {
        const results = await Promise.allSettled(
            topics.slice(index, index + batchSize).map((topic) => pubsub.publish(topic, event)),
        );
        for (const result of results)
            if (result.status === "rejected")
                request.log.warn({ err: result.reason }, "Could not publish permission sync hint");
    }
}

function requestBody(request: FastifyRequest, allowed: readonly string[]) {
    const body = record(request.body, "Request body");
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) throw new InvalidRequest(`Unexpected request body field: ${unexpected}`);
    return body;
}

function emptyBody(request: FastifyRequest): void {
    if (request.body === undefined || request.body === null) return;
    requestBody(request, []);
}

function pathId(request: FastifyRequest, key: string): string {
    return id(record(request.params, "Path parameters")[key], key);
}

function permissionList(body: Record<string, unknown>, key: string): Permission[] {
    const value = body[key];
    if (!Array.isArray(value)) throw new InvalidRequest(`${key} must be an array`);
    if (new Set(value).size !== value.length)
        throw new InvalidRequest(`${key} must not contain duplicates`);
    for (const permission of value)
        if (typeof permission !== "string" || !permissions.includes(permission as Permission))
            throw new InvalidRequest(`${key} contains an unknown permission`);
    const selected = new Set(value as Permission[]);
    return permissions.filter((permission) => selected.has(permission));
}

function requiredText(body: Record<string, unknown>, key: string, maximum: number): string {
    const value = body[key];
    if (typeof value !== "string") throw new InvalidRequest(`${key} must be a string`);
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maximum || hasControlCharacters(trimmed))
        throw new InvalidRequest(`${key} must be between 1 and ${maximum} safe characters`);
    return trimmed;
}

function optionalText(
    body: Record<string, unknown>,
    key: string,
    maximum: number,
): string | undefined {
    if (!has(body, key) || body[key] === null) return undefined;
    return requiredText(body, key, maximum);
}

function id(value: unknown, name: string): string {
    if (
        typeof value !== "string" ||
        !value ||
        value.length > MAX_ID_LENGTH ||
        value.trim() !== value ||
        hasControlCharacters(value)
    )
        throw new InvalidRequest(`${name} must be a valid identifier`);
    return value;
}

function record(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new InvalidRequest(`${name} must be an object`);
    return value as Record<string, unknown>;
}

function has(body: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(body, key);
}

function hasControlCharacters(value: string): boolean {
    for (const character of value) {
        const code = character.codePointAt(0)!;
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

class InvalidRequest extends Error {}
