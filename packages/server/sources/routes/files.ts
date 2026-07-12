import type { FastifyInstance } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { TokenService } from "../modules/auth/tokens.js";
import type { ServerConfig } from "../modules/config/type.js";
import type { Database } from "../modules/database.js";
import type { CollaborationRepository } from "../modules/collaboration/repository.js";
import { FileStorage, InvalidUploadError } from "../modules/files/storage.js";

export function registerFileRoutes(
    app: FastifyInstance,
    config: ServerConfig,
    auth: AuthService,
    database: Database,
    tokens: TokenService,
    files: FileStorage,
    collaboration?: CollaborationRepository,
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
                await readLimited(upload.file, 10 * 1024 * 1024),
                visibility === "public",
            );
            return reply.code(201).send({ file: fileResponse(file) });
        } catch (error) {
            if (error instanceof InvalidUploadError)
                return reply.code(400).send({ error: "invalid_avatar", message: error.message });
            request.log.error({ err: error }, "Avatar upload failed");
            return reply.code(500).send({ error: "internal_server_error" });
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
    if (collaboration) {
        app.post("/v0/files/upload", async (request, reply) => {
            const current = await auth.authenticate(request);
            if (!current) return reply.code(401).send({ error: "unauthorized" });
            const upload = await request.file();
            if (!upload) return reply.code(400).send({ error: "file_required" });
            try {
                const file = await files.saveAttachmentUpload(current.user, upload.file, {
                    filename: upload.filename,
                    contentType: upload.mimetype,
                });
                return reply.code(201).send({ file: fileResponse(file) });
            } catch (error) {
                if (error instanceof InvalidUploadError)
                    return reply.code(400).send({ error: "invalid_file", message: error.message });
                request.log.error({ err: error }, "File upload failed");
                return reply.code(500).send({ error: "internal_server_error" });
            }
        });
    }
    app.post("/v0/files/:fileId/createSignedUrl", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        const fileId = (request.params as { fileId?: string }).fileId;
        const file = fileId ? await database.findFile(fileId) : undefined;
        const accessible =
            file &&
            (file.uploadedByUserId === current.user.id ||
                file.isPublic ||
                (collaboration
                    ? await collaboration.canAccessFile(current.user.id, file.id)
                    : false));
        return !file
            ? reply.code(404).send({ error: "not_found" })
            : !accessible
              ? reply.code(404).send({ error: "not_found" })
              : { signedUrl: await signedUrl(config, tokens, file.id) };
    });
    app.get("/v0/files/:fileId", async (request, reply) => {
        const fileId = (request.params as { fileId?: string }).fileId;
        const token = (request.query as { token?: string }).token;
        if (!fileId) return reply.code(404).send({ error: "not_found" });
        const file = await database.findFile(fileId);
        if (!file) return reply.code(404).send({ error: "not_found" });
        if (token) {
            try {
                if ((await tokens.verifyFileUrlToken(token)) !== fileId)
                    return reply.code(401).send({ error: "invalid_file_url" });
            } catch {
                return reply.code(401).send({ error: "invalid_file_url" });
            }
        } else {
            const current = await auth.authenticate(request);
            if (!current) return reply.code(401).send({ error: "unauthorized" });
            const accessible =
                file.isPublic ||
                file.uploadedByUserId === current.user.id ||
                (collaboration
                    ? await collaboration.canAccessFile(current.user.id, file.id)
                    : false);
            if (!accessible) return reply.code(404).send({ error: "not_found" });
        }
        const range = parseRange(request.headers.range, file.size);
        if (range === "invalid")
            return reply
                .code(416)
                .header("content-range", `bytes */${file.size}`)
                .send({ error: "invalid_range" });
        const response = reply
            .type(file.contentType)
            .header("cache-control", "private, max-age=300")
            .header("x-content-type-options", "nosniff")
            .header("accept-ranges", "bytes")
            .header(
                "content-disposition",
                `${file.kind === "photo" || file.kind === "gif" || file.kind === "video" ? "inline" : "attachment"}; filename*=UTF-8''${encodeFilename(file.originalName ?? "attachment")}`,
            );
        if (range) {
            response
                .code(206)
                .header("content-range", `bytes ${range.start}-${range.end}/${file.size}`)
                .header("content-length", String(range.end - range.start + 1));
            return response.send(files.createReadStream(file, range));
        }
        return response
            .header("content-length", String(file.size))
            .send(files.createReadStream(file));
    });
}

function encodeFilename(value: string): string {
    return encodeURIComponent(value).replace(
        /['()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

function parseRange(
    header: string | undefined,
    size: number,
): { start: number; end: number } | "invalid" | undefined {
    if (!header) return undefined;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (!match[1] && !match[2])) return "invalid";
    let start: number;
    let end: number;
    if (!match[1]) {
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
    }
    if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        start >= size
    )
        return "invalid";
    return { start, end: Math.min(end, size - 1) };
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

async function readLimited(
    stream: NodeJS.ReadableStream & AsyncIterable<Buffer | string>,
    maximum: number,
): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maximum) throw new InvalidUploadError(`Upload must be at most ${maximum} bytes`);
        chunks.push(buffer);
    }
    return Buffer.concat(chunks, size);
}
function fileResponse(file: {
    id: string;
    isPublic: boolean;
    contentType: string;
    size: number;
    width: number;
    height: number;
    thumbhash: string;
    kind: "file" | "photo" | "video" | "gif";
    originalName?: string;
    durationMs?: number;
}) {
    return {
        id: file.id,
        isPublic: file.isPublic,
        contentType: file.contentType,
        size: file.size,
        width: file.width,
        height: file.height,
        thumbhash: file.thumbhash,
        kind: file.kind,
        originalName: file.originalName,
        durationMs: file.durationMs,
    };
}
