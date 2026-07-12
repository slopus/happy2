import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { TokenService } from "../modules/auth/tokens.js";
import type { ServerConfig } from "../modules/config/type.js";
import type { Database } from "../modules/database.js";
import { FileStorage } from "../modules/files/storage.js";

export function registerFileRoutes(
    app: FastifyInstance,
    config: ServerConfig,
    auth: AuthService,
    database: Database,
    tokens: TokenService,
    files: FileStorage,
): void {
    app.get("/v0/me", async (request, reply) => {
        const current = await auth.authenticate(request);
        return current ? { user: current.user } : reply.code(401).send({ error: "unauthorized" });
    });
    app.post("/v0/me/uploadAvatarFile", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        const upload = await request.file();
        if (!upload) return reply.code(400).send({ error: "avatar_required" });
        const visibilityField = upload.fields.visibility;
        const visibilityPart = Array.isArray(visibilityField)
            ? visibilityField[0]
            : visibilityField;
        const visibility = (visibilityPart as { value?: unknown } | undefined)?.value;
        if (visibility !== "public" && visibility !== "private")
            return reply.code(400).send({ error: "visibility_required" });
        try {
            const file = await files.saveAvatarUpload(
                current.user,
                await upload.toBuffer(),
                visibility === "public",
            );
            return reply.code(201).send({ file: fileResponse(file) });
        } catch (error) {
            return reply.code(400).send({
                error: "invalid_avatar",
                message: error instanceof Error ? error.message : "Avatar upload failed",
            });
        }
    });
    app.post("/v0/me/updateAvatar", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        const fileId = (request.body as { fileId?: unknown } | undefined)?.fileId;
        if (typeof fileId !== "string") return reply.code(400).send({ error: "file_id_required" });
        const file = await database.findFileUploadedBy(fileId, current.user.id);
        if (!file || !file.isPublic)
            return reply.code(400).send({ error: "avatar_requires_own_public_file" });
        return (await database.setUserPhoto(current.user.id, file.id))
            ? { user: { ...current.user, photoFileId: file.id } }
            : reply.code(400).send({ error: "avatar_update_failed" });
    });
    app.post("/v0/files/:fileId/createSignedUrl", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        const fileId = (request.params as { fileId?: string }).fileId;
        const file = fileId
            ? await database.findFileUploadedBy(fileId, current.user.id)
            : undefined;
        return !file
            ? reply.code(404).send({ error: "not_found" })
            : file.isPublic
              ? reply.code(400).send({ error: "public_file_does_not_need_signed_url" })
              : { signedUrl: await signedUrl(config, tokens, file.id) };
    });
    app.get("/v0/files/:fileId", async (request, reply) => {
        const fileId = (request.params as { fileId?: string }).fileId;
        const token = (request.query as { token?: string }).token;
        if (!fileId) return reply.code(404).send({ error: "not_found" });
        const file = await database.findFile(fileId);
        if (!file) return reply.code(404).send({ error: "not_found" });
        if (file.isPublic) {
            if (!(await auth.authenticate(request)))
                return reply.code(401).send({ error: "unauthorized" });
        } else {
            if (!token) return reply.code(401).send({ error: "invalid_file_url" });
            try {
                if ((await tokens.verifyFileUrlToken(token)) !== fileId)
                    return reply.code(401).send({ error: "invalid_file_url" });
            } catch {
                return reply.code(401).send({ error: "invalid_file_url" });
            }
        }
        return reply
            .type(file.contentType)
            .header("cache-control", "private, max-age=300")
            .send(createReadStream(files.pathFor(file)));
    });
}
async function signedUrl(
    config: ServerConfig,
    tokens: TokenService,
    fileId: string,
): Promise<{ url: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + config.files.signedUrlExpirySeconds * 1000);
    const url = new URL(`/v0/files/${fileId}`, config.server.publicUrl);
    url.searchParams.set(
        "token",
        await tokens.issueFileUrlToken(fileId, config.files.signedUrlExpirySeconds),
    );
    return { url: url.toString(), expiresAt: expiresAt.toISOString() };
}
function fileResponse(file: {
    id: string;
    isPublic: boolean;
    contentType: string;
    size: number;
    width: number;
    height: number;
    thumbhash: string;
}) {
    return {
        id: file.id,
        isPublic: file.isPublic,
        contentType: file.contentType,
        size: file.size,
        width: file.width,
        height: file.height,
        thumbhash: file.thumbhash,
    };
}
