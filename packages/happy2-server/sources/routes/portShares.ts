import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { PortShareService } from "../modules/port-share/service.js";
import { PortShareError } from "../modules/port-share/types.js";

/** Registers member-facing port-share reads, disable actions, and one-hour browser access-token issuance. */
export function registerPortShareRoutes(
    app: FastifyInstance,
    auth: AuthService,
    portShares: PortShareService,
): void {
    app.get("/v0/chats/:chatId/portShares", async (request, reply) => {
        try {
            const actorUserId = await authenticatedUserId(request, reply, auth);
            if (!actorUserId) return;
            return {
                portShares: await portShares.list(actorUserId, pathIdentifier(request, "chatId")),
            };
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post(
        "/v0/chats/:chatId/portShares/:portShareId/disablePortShare",
        async (request, reply) => {
            try {
                const actorUserId = await authenticatedUserId(request, reply, auth);
                if (!actorUserId) return;
                emptyBody(request.body);
                return await portShares.disable({
                    actorUserId,
                    chatId: pathIdentifier(request, "chatId"),
                    portShareId: pathIdentifier(request, "portShareId"),
                });
            } catch (error) {
                const response = handled(reply, error);
                if (response) return response;
                throw error;
            }
        },
    );
    app.post("/v0/portShares/:portShareId/createAccessToken", async (request, reply) => {
        try {
            const actorUserId = await authenticatedUserId(request, reply, auth);
            if (!actorUserId) return;
            emptyBody(request.body);
            return await portShares.issueAccessToken({
                actorUserId,
                portShareId: pathIdentifier(request, "portShareId"),
            });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
}

async function authenticatedUserId(
    request: FastifyRequest,
    reply: FastifyReply,
    auth: AuthService,
): Promise<string | undefined> {
    const actor = await auth.authenticate(request);
    if (actor) return actor.user.id;
    reply.code(401).send({ error: "unauthorized" });
    return undefined;
}

function pathIdentifier(request: FastifyRequest, name: string): string {
    const value = (request.params as Record<string, unknown>)[name];
    if (typeof value !== "string" || !value || value.length > 128 || /\s/.test(value))
        throw new PortShareError("invalid", `${name} must be a valid identifier`);
    return value;
}

function emptyBody(value: unknown): void {
    if (value === undefined || value === null) return;
    if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 0)
        throw new PortShareError("invalid", "Request body must be empty");
}

function handled(reply: FastifyReply, error: unknown) {
    if (!(error instanceof PortShareError)) return undefined;
    return reply
        .code(
            error.code === "not_found"
                ? 404
                : error.code === "forbidden"
                  ? 403
                  : error.code === "conflict"
                    ? 409
                    : error.code === "not_ready"
                      ? 503
                      : 400,
        )
        .send({ error: error.code, message: error.message });
}
