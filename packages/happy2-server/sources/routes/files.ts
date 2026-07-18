import { fileCanAccess } from "../modules/file/fileCanAccess.js";
import { fileDeleteOwnedUnreferenced } from "../modules/file/fileDeleteOwnedUnreferenced.js";
import { fileFind } from "../modules/file/fileFind.js";
import { fileFindUploadedBy } from "../modules/file/fileFindUploadedBy.js";
import type { StoredFile } from "../modules/file/types.js";
import { userSetPhoto } from "../modules/user/userSetPhoto.js";
import { type DrizzleExecutor } from "../modules/drizzle.js";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { TokenService } from "../modules/auth/tokens.js";
import type { ServerConfig } from "../modules/config/type.js";
import {
    FileQuotaExceededError,
    FileStorage,
    InvalidUploadError,
    UploadRejectedError,
    type AvatarCrop,
} from "../modules/files/storage.js";
import {
    UploadIncompleteError,
    UploadLimitError,
    UploadNotFoundError,
    UploadOffsetError,
    type ResumableUpload,
} from "../modules/files/provider.js";
export function registerFileRoutes(
    app: FastifyInstance,
    config: ServerConfig,
    auth: AuthService,
    executor: DrizzleExecutor,
    tokens: TokenService,
    files: FileStorage,
): void {
    app.get("/v0/me", async (request, reply) => {
        const current = await auth.authenticate(request);
        return current
            ? {
                  user: current.user,
              }
            : reply.code(401).send({
                  error: "unauthorized",
              });
    });
    app.post("/v0/me/uploadAvatarFile", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current)
            return reply.code(401).send({
                error: "unauthorized",
            });
        const upload = await request.file();
        if (!upload)
            return reply.code(400).send({
                error: "avatar_required",
            });
        let input: Buffer;
        try {
            input = await readLimited(upload.file, 10 * 1024 * 1024);
        } catch (error) {
            if (error instanceof InvalidUploadError)
                return reply.code(400).send({
                    error: "invalid_avatar",
                    message: error.message,
                });
            throw error;
        }
        const visibility = multipartFieldValue(upload.fields.visibility);
        if (visibility !== "public" && visibility !== "private")
            return reply.code(400).send({
                error: "visibility_required",
            });
        const crop = avatarCropParse(multipartFieldValue(upload.fields.crop));
        if (!crop)
            return reply.code(400).send({
                error: "invalid_avatar_crop",
                message: "Avatar crop must contain integer x, y, width, and height values",
            });
        try {
            const file = await files.saveAvatarUpload(
                current.user,
                input,
                crop,
                visibility === "public",
            );
            return reply.code(201).send({
                file: await fileResponse(files, file, false),
            });
        } catch (error) {
            if (error instanceof FileQuotaExceededError || error instanceof UploadRejectedError)
                return sendUploadError(reply, request.log, error);
            if (error instanceof InvalidUploadError)
                return reply.code(400).send({
                    error: "invalid_avatar",
                    message: error.message,
                });
            request.log.error(
                {
                    err: error,
                },
                "Avatar upload failed",
            );
            return reply.code(500).send({
                error: "internal_server_error",
            });
        }
    });
    app.post("/v0/me/updateAvatar", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current)
            return reply.code(401).send({
                error: "unauthorized",
            });
        const fileId = (
            request.body as
                | {
                      fileId?: unknown;
                  }
                | undefined
        )?.fileId;
        if (typeof fileId !== "string")
            return reply.code(400).send({
                error: "file_id_required",
            });
        const file = await fileFindUploadedBy(executor, fileId, current.user.id);
        if (!file || !file.isPublic)
            return reply.code(400).send({
                error: "avatar_requires_own_public_file",
            });
        return (await userSetPhoto(executor, current.user.id, file.id))
            ? {
                  user: {
                      ...current.user,
                      photoFileId: file.id,
                  },
              }
            : reply.code(400).send({
                  error: "avatar_update_failed",
              });
    });
    if (executor) {
        app.post("/v0/files/upload", async (request, reply) => {
            const current = await auth.authenticate(request);
            if (!current)
                return reply.code(401).send({
                    error: "unauthorized",
                });
            const upload = await request.file();
            if (!upload)
                return reply.code(400).send({
                    error: "file_required",
                });
            try {
                const file = await files.saveAttachmentUpload(current.user, upload.file, {
                    filename: upload.filename,
                    contentType: upload.mimetype,
                });
                return reply.code(201).send({
                    file: await fileResponse(files, file, true),
                });
            } catch (error) {
                return sendUploadError(reply, request.log, error);
            }
        });
        app.post("/v0/files/createUpload", async (request, reply) => {
            const current = await auth.authenticate(request);
            if (!current)
                return reply.code(401).send({
                    error: "unauthorized",
                });
            const body = request.body as
                | {
                      filename?: unknown;
                      contentType?: unknown;
                      size?: unknown;
                  }
                | undefined;
            if (
                (body?.filename !== undefined && typeof body.filename !== "string") ||
                (body?.contentType !== undefined && typeof body.contentType !== "string") ||
                typeof body?.size !== "number"
            )
                return reply.code(400).send({
                    error: "invalid_upload_request",
                });
            try {
                const upload = await files.createResumableUpload(current.user, {
                    filename: body.filename,
                    contentType: body.contentType,
                    size: body.size,
                });
                return reply.code(201).send({
                    upload: uploadResponse(upload),
                });
            } catch (error) {
                return sendUploadError(reply, request.log, error);
            }
        });
        app.get("/v0/files/:uploadId/uploadState", async (request, reply) => {
            const current = await auth.authenticate(request);
            if (!current)
                return reply.code(401).send({
                    error: "unauthorized",
                });
            const uploadId = (
                request.params as {
                    uploadId?: string;
                }
            ).uploadId;
            const upload = uploadId
                ? await files.resumableUploadState(current.user.id, uploadId)
                : undefined;
            return upload
                ? {
                      upload: uploadResponse(upload),
                  }
                : reply.code(404).send({
                      error: "not_found",
                  });
        });
        app.post("/v0/files/:uploadId/appendUpload", async (request, reply) => {
            const current = await auth.authenticate(request);
            if (!current)
                return reply.code(401).send({
                    error: "unauthorized",
                });
            const uploadId = (
                request.params as {
                    uploadId?: string;
                }
            ).uploadId;
            const offset = parseUploadOffset(request.headers["upload-offset"]);
            if (!uploadId || offset === undefined)
                return reply.code(400).send({
                    error: "upload_offset_required",
                });
            try {
                const part = await request.file();
                if (!part)
                    return reply.code(400).send({
                        error: "file_required",
                    });
                const upload = await files.appendResumableUpload(
                    current.user.id,
                    uploadId,
                    offset,
                    part.file,
                );
                return upload
                    ? {
                          upload: uploadResponse(upload),
                      }
                    : reply.code(404).send({
                          error: "not_found",
                      });
            } catch (error) {
                if (error instanceof UploadOffsetError)
                    return reply
                        .code(409)
                        .header("upload-offset", String(error.actualOffset))
                        .send({
                            error: "upload_offset_mismatch",
                            offset: error.actualOffset,
                        });
                if (error instanceof UploadLimitError)
                    return reply.code(400).send({
                        error: "invalid_upload_chunk",
                    });
                return sendUploadError(reply, request.log, error);
            }
        });
        app.post("/v0/files/:uploadId/completeUpload", async (request, reply) => {
            const current = await auth.authenticate(request);
            if (!current)
                return reply.code(401).send({
                    error: "unauthorized",
                });
            const uploadId = (
                request.params as {
                    uploadId?: string;
                }
            ).uploadId;
            if (!uploadId)
                return reply.code(404).send({
                    error: "not_found",
                });
            try {
                const file = await files.completeResumableUpload(current.user, uploadId);
                return file
                    ? reply.code(201).send({
                          file: await fileResponse(files, file, true),
                      })
                    : reply.code(404).send({
                          error: "not_found",
                      });
            } catch (error) {
                if (error instanceof UploadIncompleteError)
                    return reply.code(409).send({
                        error: "upload_incomplete",
                        offset: error.actualOffset,
                        size: error.expectedSize,
                    });
                return sendUploadError(reply, request.log, error);
            }
        });
        app.post("/v0/files/:uploadId/cancelUpload", async (request, reply) => {
            const current = await auth.authenticate(request);
            if (!current)
                return reply.code(401).send({
                    error: "unauthorized",
                });
            const uploadId = (
                request.params as {
                    uploadId?: string;
                }
            ).uploadId;
            return uploadId && (await files.cancelResumableUpload(current.user.id, uploadId))
                ? {
                      cancelled: true,
                  }
                : reply.code(404).send({
                      error: "not_found",
                  });
        });
    }
    app.post("/v0/files/:fileId/deleteFile", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current)
            return reply.code(401).send({
                error: "unauthorized",
            });
        const fileId = (
            request.params as {
                fileId?: string;
            }
        ).fileId;
        if (!fileId)
            return reply.code(404).send({
                error: "not_found",
            });
        const body = (request.body ?? {}) as {
            reason?: unknown;
        };
        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            Object.keys(body).some((key) => key !== "reason") ||
            (body.reason !== undefined &&
                (typeof body.reason !== "string" || body.reason.length > 500))
        )
            return reply.code(400).send({
                error: "invalid_request",
            });
        const file = await fileFindUploadedBy(executor, fileId, current.user.id);
        if (!file)
            return reply.code(404).send({
                error: "not_found",
            });
        const result = await fileDeleteOwnedUnreferenced(
            executor,
            fileId,
            current.user.id,
            typeof body.reason === "string" ? body.reason : undefined,
        );
        if (result === "not_found")
            return reply.code(404).send({
                error: "not_found",
            });
        if (result === "in_use")
            return reply.code(409).send({
                error: "file_in_use",
            });
        await files.deleteStoredFile(file).catch((error: unknown) => {
            request.log.error(
                {
                    err: error,
                    fileId,
                },
                "Deleted file storage cleanup failed",
            );
        });
        return {
            deleted: true,
        };
    });
    app.post("/v0/files/:fileId/createSignedUrl", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current)
            return reply.code(401).send({
                error: "unauthorized",
            });
        const fileId = (
            request.params as {
                fileId?: string;
            }
        ).fileId;
        const file = fileId ? await fileFind(executor, fileId) : undefined;
        const accessible =
            file &&
            (file.uploadedByUserId === current.user.id ||
                file.isPublic ||
                (await fileCanAccess(executor, current.user.id, file.id)));
        return !file
            ? reply.code(404).send({
                  error: "not_found",
              })
            : !accessible
              ? reply.code(404).send({
                    error: "not_found",
                })
              : {
                    signedUrl: await signedUrl(config, tokens, file.id),
                };
    });
    app.get("/v0/files/:fileId", async (request, reply) => {
        const fileId = (
            request.params as {
                fileId?: string;
            }
        ).fileId;
        const token = (
            request.query as {
                token?: string;
            }
        ).token;
        if (!fileId)
            return reply.code(404).send({
                error: "not_found",
            });
        const file = await fileFind(executor, fileId);
        if (!file)
            return reply.code(404).send({
                error: "not_found",
            });
        if (token) {
            try {
                if ((await tokens.verifyFileUrlToken(token)) !== fileId)
                    return reply.code(401).send({
                        error: "invalid_file_url",
                    });
            } catch {
                return reply.code(401).send({
                    error: "invalid_file_url",
                });
            }
        } else {
            const current = await auth.authenticate(request);
            if (!current)
                return reply.code(401).send({
                    error: "unauthorized",
                });
            const accessible =
                file.isPublic ||
                file.uploadedByUserId === current.user.id ||
                (await fileCanAccess(executor, current.user.id, file.id));
            if (!accessible)
                return reply.code(404).send({
                    error: "not_found",
                });
        }
        const range = parseRange(request.headers.range, file.size);
        if (range === "invalid")
            return reply.code(416).header("content-range", `bytes */${file.size}`).send({
                error: "invalid_range",
            });
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
            return response.send(files.open(file, range));
        }
        return response.header("content-length", String(file.size)).send(files.open(file));
    });
    for (const variant of ["thumbnail", "preview"] as const) {
        app.get(`/v0/files/:fileId/${variant}`, async (request, reply) => {
            const fileId = (
                request.params as {
                    fileId?: string;
                }
            ).fileId;
            const token = (
                request.query as {
                    token?: string;
                }
            ).token;
            if (!fileId)
                return reply.code(404).send({
                    error: "not_found",
                });
            const file = await fileFind(executor, fileId);
            if (!file)
                return reply.code(404).send({
                    error: "not_found",
                });
            if (token) {
                try {
                    if ((await tokens.verifyFileUrlToken(token)) !== fileId)
                        return reply.code(401).send({
                            error: "invalid_file_url",
                        });
                } catch {
                    return reply.code(401).send({
                        error: "invalid_file_url",
                    });
                }
            } else {
                const current = await auth.authenticate(request);
                if (!current)
                    return reply.code(401).send({
                        error: "unauthorized",
                    });
                const accessible =
                    file.isPublic ||
                    file.uploadedByUserId === current.user.id ||
                    (await fileCanAccess(executor, current.user.id, file.id));
                if (!accessible)
                    return reply.code(404).send({
                        error: "not_found",
                    });
            }
            const asset = await files.variant(file, variant);
            return asset
                ? reply
                      .type(asset.contentType)
                      .header("content-length", String(asset.size))
                      .header("cache-control", "private, max-age=300")
                      .header("x-content-type-options", "nosniff")
                      .header("content-disposition", "inline")
                      .send(asset.stream)
                : reply.code(404).send({
                      error: "not_found",
                  });
        });
    }
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
):
    | {
          start: number;
          end: number;
      }
    | "invalid"
    | undefined {
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
    return {
        start,
        end: Math.min(end, size - 1),
    };
}
async function signedUrl(
    config: ServerConfig,
    tokens: TokenService,
    fileId: string,
): Promise<{
    url: string;
    expiresAt: string;
}> {
    const expiresAt = new Date(Date.now() + config.files.signedUrlExpirySeconds * 1000);
    const url = new URL(`/v0/files/${fileId}`, config.server.publicUrl);
    url.searchParams.set(
        "token",
        await tokens.issueFileUrlToken(fileId, config.files.signedUrlExpirySeconds),
    );
    return {
        url: url.toString(),
        expiresAt: expiresAt.toISOString(),
    };
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
function multipartFieldValue(field: unknown): unknown {
    const part = Array.isArray(field) ? field[0] : field;
    return (
        part as
            | {
                  value?: unknown;
              }
            | undefined
    )?.value;
}
function avatarCropParse(value: unknown): AvatarCrop | undefined {
    if (typeof value !== "string") return undefined;
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return undefined;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const candidate = parsed as Partial<Record<keyof AvatarCrop, unknown>>;
    if (
        Object.keys(parsed).length !== 4 ||
        !Number.isSafeInteger(candidate.x) ||
        !Number.isSafeInteger(candidate.y) ||
        !Number.isSafeInteger(candidate.width) ||
        !Number.isSafeInteger(candidate.height)
    )
        return undefined;
    return candidate as AvatarCrop;
}
async function fileResponse(files: FileStorage, file: StoredFile, includeVariants: boolean) {
    const variants = includeVariants ? await files.variantSizes(file) : {};
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
        thumbnailUrl:
            variants.thumbnail === undefined ? undefined : `/v0/files/${file.id}/thumbnail`,
        previewUrl: variants.preview === undefined ? undefined : `/v0/files/${file.id}/preview`,
    };
}
function uploadResponse(upload: ResumableUpload) {
    return {
        id: upload.id,
        filename: upload.filename,
        contentType: upload.contentType,
        size: upload.size,
        offset: upload.offset,
        createdAt: upload.createdAt,
        updatedAt: upload.updatedAt,
    };
}
function parseUploadOffset(value: string | string[] | undefined): number | undefined {
    const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
function sendUploadError(reply: FastifyReply, log: FastifyBaseLogger, error: unknown) {
    if (error instanceof UploadNotFoundError)
        return reply.code(404).send({
            error: "not_found",
        });
    if (error instanceof FileQuotaExceededError)
        return reply.code(413).send({
            error: "file_quota_exceeded",
            scope: error.scope,
            limit: error.limit,
        });
    if (error instanceof UploadRejectedError)
        return reply.code(422).send({
            error: "upload_rejected",
        });
    if (error instanceof InvalidUploadError)
        return reply.code(400).send({
            error: "invalid_file",
            message: error.message,
        });
    log.error(
        {
            err: error,
        },
        "File upload failed",
    );
    return reply.code(500).send({
        error: "internal_server_error",
    });
}
