import { fileFind } from "../file/fileFind.js";
import { fileCreate } from "../file/fileCreate.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { basename, join } from "node:path";
import { Transform, type Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createId } from "@paralleldrive/cuid2";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import type { ServerConfig } from "../config/type.js";
import type { StoredFile } from "../file/types.js";
import type { User } from "../user/types.js";
import { BuiltinMediaProcessor, type MediaAnalysis, type MediaProcessor } from "./media.js";
import {
    LocalFileStorageProvider,
    parseCompletion,
    parseUpload,
    UploadIncompleteError,
    UploadLimitError,
    UploadNotFoundError,
    UploadOffsetError,
    type ByteRange,
    type CleanupResult,
    type CompletedResumableUpload,
    type FileStorageProvider,
    type MediaVariant,
    type ResumableUpload,
    type StageOptions,
    type StagedObject,
} from "./provider.js";
import {
    LocalFileQuotaPolicy,
    type FileQuotaPolicy,
    QuotaExceededError,
    type QuotaScope,
} from "./quota.js";
import { CommandMalwareScanner, DisabledMalwareScanner, type MalwareScanner } from "./scanner.js";
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_SIDE = 2048;
type SharpInstance = ReturnType<typeof sharp>;
type SharpMetadata = Awaited<ReturnType<SharpInstance["metadata"]>>;
type PersistedScan = {
    status: "clean" | "failed" | "skipped";
    result?: unknown;
};
export interface FileStorageFileSystem {
    mkdir(path: string): Promise<unknown>;
    readHeader(path: string, maximumBytes: number): Promise<Buffer>;
    imageSource(path: string): Promise<string | Buffer>;
    rename(from: string, to: string): Promise<unknown>;
    rm(path: string): Promise<unknown>;
    writeFile(path: string, contents: Buffer): Promise<unknown>;
    createReadStream(
        path: string,
        range?: {
            start: number;
            end: number;
        },
    ): Readable;
    createWriteStream(path: string): Writable;
}
export class InvalidUploadError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "InvalidUploadError";
    }
}
export class UploadRejectedError extends Error {
    constructor(readonly reason: "malware" | "scanner_unavailable") {
        super("Upload was rejected by the file safety policy");
        this.name = "UploadRejectedError";
    }
}
export class FileQuotaExceededError extends InvalidUploadError {
    constructor(
        readonly scope: QuotaScope,
        readonly limit: number,
    ) {
        super(`${scope === "user" ? "User" : "Server"} file quota exceeded`);
        this.name = "FileQuotaExceededError";
    }
}
export interface FileStorageOptions {
    provider?: FileStorageProvider;
    quota?: FileQuotaPolicy;
    scanner?: MalwareScanner;
    mediaProcessor?: MediaProcessor;
}
export class FileStorage {
    private readonly provider: FileStorageProvider;
    private readonly quota: FileQuotaPolicy;
    private readonly scanner: MalwareScanner;
    private readonly mediaProcessor: MediaProcessor;
    constructor(
        private readonly config: ServerConfig,
        private readonly executor: DrizzleExecutor,
        optionsOrFileSystem: FileStorageOptions | FileStorageFileSystem = {},
    ) {
        const options: FileStorageOptions = isFileStorageFileSystem(optionsOrFileSystem)
            ? {
                  provider: new FileSystemStorageProvider(
                      config.files.directory,
                      optionsOrFileSystem,
                  ),
                  quota: new MemoryFileQuotaPolicy(
                      {
                          perUserBytes: config.files.perUserQuotaBytes,
                          serverBytes: config.files.serverQuotaBytes,
                      },
                      optionsOrFileSystem,
                  ),
                  mediaProcessor: new FileSystemMediaProcessor(optionsOrFileSystem),
              }
            : optionsOrFileSystem;
        this.provider = options.provider ?? new LocalFileStorageProvider(config.files.directory);
        this.quota =
            options.quota ??
            new LocalFileQuotaPolicy(
                config.files.directory,
                {
                    perUserBytes: config.files.perUserQuotaBytes,
                    serverBytes: config.files.serverQuotaBytes,
                },
                () => this.provider.committedBytes(),
            );
        this.scanner = options.scanner ?? configuredScanner(config);
        this.mediaProcessor = options.mediaProcessor ?? new BuiltinMediaProcessor();
    }
    async saveAvatarUpload(user: User, input: Buffer, isPublic: boolean): Promise<StoredFile> {
        if (input.length === 0 || input.length > MAX_AVATAR_BYTES)
            throw new InvalidUploadError("Avatar file must be at most 10 MB");
        const image = sharp(input, {
            limitInputPixels: MAX_AVATAR_SIDE * MAX_AVATAR_SIDE,
        });
        let metadata: SharpMetadata;
        try {
            metadata = await image.metadata();
        } catch (error) {
            throw new InvalidUploadError("Avatar must be a valid image", {
                cause: error,
            });
        }
        if (
            !metadata.width ||
            !metadata.height ||
            metadata.width > MAX_AVATAR_SIDE ||
            metadata.height > MAX_AVATAR_SIDE
        )
            throw new InvalidUploadError("Avatar dimensions must not exceed 2048px");
        let thumbnail: Awaited<ReturnType<typeof avatarThumbnail>>;
        let encoded: Awaited<ReturnType<typeof encodeAvatar>>;
        try {
            [thumbnail, encoded] = await Promise.all([avatarThumbnail(image), encodeAvatar(image)]);
        } catch (error) {
            throw new InvalidUploadError("Avatar could not be decoded", {
                cause: error,
            });
        }
        const thumbhash = Buffer.from(
            rgbaToThumbHash(thumbnail.info.width, thumbnail.info.height, thumbnail.data),
        ).toString("base64url");
        const reservationId = createId();
        await this.quota.reserve({
            id: reservationId,
            ownerUserId: user.id,
            bytes: encoded.data.length,
        });
        let staged: StagedObject;
        try {
            staged = await this.provider.stageBuffer(encoded.data, reservationId);
        } catch (error) {
            await this.quota.release(reservationId);
            throw mapQuotaError(error);
        }
        const file: StoredFile = {
            id: reservationId,
            userId: user.id,
            uploadedByUserId: user.id,
            isPublic,
            storageName: `${reservationId}.jpg`,
            contentType: "image/jpeg",
            size: encoded.data.length,
            width: encoded.info.width,
            height: encoded.info.height,
            thumbhash,
            kind: "photo",
            originalName: "avatar.jpg",
        };
        try {
            const scan = await this.assertSafe(staged);
            return await this.commitFile(file, staged, {}, file.size, scan);
        } catch (error) {
            await this.provider.discard(staged);
            if (!(error instanceof UploadRejectedError)) await this.quota.release(file.id);
            throw mapQuotaError(error);
        }
    }
    async saveAttachmentUpload(
        user: User,
        input: Readable,
        upload: {
            filename?: string;
            contentType?: string;
        },
    ): Promise<StoredFile> {
        const reservationId = createId();
        let staged: StagedObject;
        try {
            await this.quota.reserve({
                id: reservationId,
                ownerUserId: user.id,
                bytes: 1,
            });
            staged = await this.provider.stage(input, this.config.files.maxUploadBytes, {
                id: reservationId,
                onBytes: (bytes) => this.quota.resizeReservation(reservationId, bytes),
            });
        } catch (error) {
            await this.quota.release(reservationId);
            if (
                error instanceof UploadLimitError ||
                (
                    error as {
                        code?: unknown;
                    }
                ).code === "FST_REQ_FILE_TOO_LARGE"
            )
                throw new InvalidUploadError("Attachment exceeds the configured upload limit", {
                    cause: error,
                });
            throw mapQuotaError(error);
        }
        if (staged.size === 0) {
            await this.provider.discard(staged);
            await this.quota.release(reservationId);
            throw new InvalidUploadError("Attachment must not be empty");
        }
        return this.saveStagedAttachment(
            user,
            staged,
            {
                filename: upload.filename,
                contentType: upload.contentType,
            },
            reservationId,
        );
    }
    async createResumableUpload(
        user: User,
        input: {
            filename?: string;
            contentType?: string;
            size: number;
        },
    ): Promise<ResumableUpload> {
        if (
            !Number.isSafeInteger(input.size) ||
            input.size < 1 ||
            input.size > this.config.files.maxUploadBytes
        )
            throw new InvalidUploadError("Upload size is outside the configured limit");
        const id = createId();
        try {
            await this.quota.reserve({
                id,
                ownerUserId: user.id,
                bytes: input.size,
            });
            return await this.provider.createResumable({
                id,
                ownerUserId: user.id,
                filename: normalizedFilename(input.filename),
                contentType: safeContentType(input.contentType),
                size: input.size,
            });
        } catch (error) {
            await this.quota.release(id);
            throw mapQuotaError(error);
        }
    }
    async resumableUploadState(
        userId: string,
        uploadId: string,
    ): Promise<ResumableUpload | undefined> {
        const upload = await this.provider.resumableState(uploadId);
        return upload?.ownerUserId === userId ? upload : undefined;
    }
    async appendResumableUpload(
        userId: string,
        uploadId: string,
        expectedOffset: number,
        input: Readable,
    ): Promise<ResumableUpload | undefined> {
        const state = await this.resumableUploadState(userId, uploadId);
        if (!state) return undefined;
        return this.provider.appendResumable(
            uploadId,
            expectedOffset,
            input,
            this.config.files.resumableChunkBytes,
        );
    }
    async completeResumableUpload(user: User, uploadId: string): Promise<StoredFile | undefined> {
        const completed = await this.provider.completedResumable(uploadId);
        if (completed)
            return completed.ownerUserId === user.id
                ? await fileFind(this.executor, completed.fileId)
                : undefined;
        const state = await this.resumableUploadState(user.id, uploadId);
        if (!state) return undefined;
        const durable = await fileFind(this.executor, uploadId);
        if (durable) {
            await this.provider
                .recordResumableCompletion({
                    uploadId,
                    ownerUserId: user.id,
                    fileId: durable.id,
                    completedAt: new Date().toISOString(),
                })
                .catch(() => undefined);
            return durable;
        }
        const { upload, staged } = await this.provider.finishResumable(uploadId);
        let file: StoredFile;
        try {
            file = await this.saveStagedAttachment(
                user,
                staged,
                {
                    filename: upload.filename,
                    contentType: upload.contentType,
                },
                upload.id,
            );
        } catch (error) {
            await this.quota.release(upload.id);
            throw error;
        }
        await this.provider
            .recordResumableCompletion({
                uploadId: upload.id,
                ownerUserId: user.id,
                fileId: file.id,
                completedAt: new Date().toISOString(),
            })
            .catch(() => undefined);
        return file;
    }
    async cancelResumableUpload(userId: string, uploadId: string): Promise<boolean> {
        const state = await this.resumableUploadState(userId, uploadId);
        if (!state) return false;
        const cancelled = await this.provider.cancelResumable(uploadId);
        if (cancelled) await this.quota.release(uploadId);
        return cancelled;
    }
    open(file: StoredFile, range?: ByteRange): Readable {
        return this.provider.open(file.storageName, range);
    }
    async variant(
        file: StoredFile,
        variant: MediaVariant,
    ): Promise<
        | {
              size: number;
              contentType: "image/webp";
              stream: Readable;
          }
        | undefined
    > {
        const size = await this.provider.variantSize(file.storageName, variant);
        return size === undefined
            ? undefined
            : {
                  size,
                  contentType: "image/webp",
                  stream: this.provider.openVariant(file.storageName, variant),
              };
    }
    async variantSizes(file: StoredFile): Promise<Partial<Record<MediaVariant, number>>> {
        const [thumbnail, preview] = await Promise.allSettled([
            this.provider.variantSize(file.storageName, "thumbnail"),
            this.provider.variantSize(file.storageName, "preview"),
        ]);
        return {
            thumbnail: thumbnail.status === "fulfilled" ? thumbnail.value : undefined,
            preview: preview.status === "fulfilled" ? preview.value : undefined,
        };
    }

    /** Local-only compatibility helper; consumers should prefer open(). */
    pathFor(file: StoredFile): string {
        if (!this.provider.pathFor) throw new Error("Storage provider does not expose local paths");
        return this.provider.pathFor(file.storageName);
    }

    /** Call only after the durable file record and references have been removed. */
    async deleteStoredFile(file: StoredFile): Promise<void> {
        await this.provider.delete(file.storageName);
        await this.quota.release(file.id);
    }

    /**
     * Maintenance is intentionally caller-driven so deployments can run it
     * under a distributed lease. It cleans abandoned uploads/quarantine and,
     * when given the authoritative file records, unreferenced local objects.
     */
    async runMaintenance(input: {
        now?: Date;
        referencedFiles?: Iterable<StoredFile>;
        orphanGraceMs?: number;
    }): Promise<{
        expiredUploadIds: string[];
        deletedQuarantineObjects: number;
        deletedOrphanStorageNames: string[];
    }> {
        const now = input.now ?? new Date();
        const temporaryBefore = new Date(
            now.getTime() - this.config.files.incompleteUploadExpirySeconds * 1000,
        );
        const quarantineBefore = new Date(
            now.getTime() - this.config.files.quarantineRetentionSeconds * 1000,
        );
        const cleanup = await this.provider.cleanup(temporaryBefore, quarantineBefore);
        await Promise.all(
            [...cleanup.expiredUploadIds, ...cleanup.deletedQuarantineIds].map((id) =>
                this.quota.release(id),
            ),
        );
        let deletedOrphanStorageNames: string[] = [];
        if (input.referencedFiles) {
            const files = [...input.referencedFiles];
            deletedOrphanStorageNames = await this.provider.cleanupOrphans(
                new Set(files.map((file) => file.storageName)),
                new Date(now.getTime() - (input.orphanGraceMs ?? 24 * 60 * 60 * 1000)),
            );
            await Promise.all(
                deletedOrphanStorageNames.map(async (storageName) => {
                    const id = storageName.replace(/\.(?:blob|jpg)$/, "");
                    if (id !== storageName) await this.quota.release(id);
                }),
            );
            const committed = await Promise.all(
                files.map(async (file) => ({
                    id: file.id,
                    ownerUserId: file.uploadedByUserId,
                    bytes:
                        file.size +
                        ((await this.provider.variantSize(file.storageName, "thumbnail")) ?? 0) +
                        ((await this.provider.variantSize(file.storageName, "preview")) ?? 0),
                })),
            );
            await this.quota.reconcileCommitted(committed);
        }
        return {
            ...cleanup,
            deletedOrphanStorageNames,
        };
    }
    private async saveStagedAttachment(
        user: User,
        staged: StagedObject,
        upload: {
            filename?: string;
            contentType?: string;
        },
        resumableReservationId?: string,
    ): Promise<StoredFile> {
        let fileId: string | undefined;
        try {
            const scan = await this.assertSafe(staged);
            const media = await this.mediaProcessor.inspect(
                staged.inspectionPath,
                upload.contentType,
            );
            fileId = resumableReservationId ?? staged.id;
            const file: StoredFile = {
                id: fileId,
                userId: user.id,
                uploadedByUserId: user.id,
                isPublic: false,
                storageName: `${fileId}.blob`,
                originalName: normalizedFilename(upload.filename),
                contentType: media.contentType,
                kind: media.kind,
                size: staged.size,
                width: media.width,
                height: media.height,
                thumbhash: media.thumbhash,
                durationMs: media.durationMs,
            };
            const storedBytes =
                staged.size +
                Object.values(media.variants).reduce(
                    (total, variant) => total + (variant?.length ?? 0),
                    0,
                );
            if (resumableReservationId)
                await this.quota.resizeReservation(resumableReservationId, storedBytes);
            else await this.prepareQuota(file.id, user.id, storedBytes);
            return await this.commitFile(file, staged, media.variants, storedBytes, scan);
        } catch (error) {
            await this.provider.discard(staged);
            if (!(error instanceof UploadRejectedError)) {
                if (fileId) await this.quota.release(fileId);
                else if (resumableReservationId) await this.quota.release(resumableReservationId);
            }
            throw mapQuotaError(error);
        }
    }
    private async prepareQuota(id: string, ownerUserId: string, bytes: number): Promise<void> {
        await this.quota.reserve({
            id,
            ownerUserId,
            bytes,
        });
    }
    private async assertSafe(staged: StagedObject): Promise<PersistedScan> {
        const result = await this.scanner.scan(staged.inspectionPath);
        if (result.verdict === "clean")
            return {
                status: this.scanner instanceof DisabledMalwareScanner ? "skipped" : "clean",
            };
        if (result.verdict === "error" && this.config.files.malwareScanFailureMode === "allow")
            return {
                status: "failed",
                result: {
                    message: result.message,
                },
            };
        await this.provider.quarantine(
            staged,
            result.verdict === "infected" ? "malware" : "scanner_unavailable",
        );
        throw new UploadRejectedError(
            result.verdict === "infected" ? "malware" : "scanner_unavailable",
        );
    }
    private async commitFile(
        file: StoredFile,
        staged: StagedObject,
        variants: Partial<Record<MediaVariant, Buffer>>,
        storedBytes: number,
        scan: PersistedScan,
    ): Promise<StoredFile> {
        let committed = false;
        try {
            await this.provider.commit(staged, file.storageName);
            committed = true;
            for (const [variant, contents] of Object.entries(variants) as [
                MediaVariant,
                Buffer | undefined,
            ][]) {
                if (contents) await this.provider.writeVariant(file.storageName, variant, contents);
            }
            await fileCreate(this.executor, file, scan);
            // Once the database row exists the upload is durable. A failed
            // ledger state transition remains a conservative reservation and
            // is repaired by the next authoritative maintenance pass.
            await this.quota.commit(file.id, storedBytes).catch(() => undefined);
            return file;
        } catch (error) {
            if (committed) await this.provider.delete(file.storageName);
            await this.quota.release(file.id);
            throw error;
        }
    }
    createReadStream(
        file: StoredFile,
        range?: {
            start: number;
            end: number;
        },
    ): Readable {
        return this.open(file, range);
    }
}

/** Compatibility adapter used by the in-memory gym harness. */
class FileSystemStorageProvider implements FileStorageProvider {
    private readonly sizes = new Map<string, number>();
    private readonly committed = new Map<string, number>();
    private readonly variants = new Map<string, number>();
    private readonly uploads = new Map<string, ResumableUpload>();
    private readonly completions = new Map<string, CompletedResumableUpload>();
    private readonly quarantineTimes = new Map<string, number>();
    constructor(
        private readonly directory: string,
        private readonly fileSystem: FileStorageFileSystem,
    ) {}
    async stage(
        input: Readable,
        maximumBytes: number,
        options: StageOptions = {},
    ): Promise<StagedObject> {
        const id = options.id ?? createId();
        const path = this.stagingPath(id);
        await this.fileSystem.mkdir(join(this.directory, ".staging"));
        let size = 0;
        const limiter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                size += chunk.length;
                if (size > maximumBytes) {
                    callback(new UploadLimitError("Upload exceeds the configured limit"));
                    return;
                }
                if (!options.onBytes) {
                    callback(undefined, chunk);
                    return;
                }
                void options.onBytes(size).then(
                    () => callback(undefined, chunk),
                    (error: unknown) => callback(error as Error),
                );
            },
        });
        try {
            await pipeline(input, limiter, this.fileSystem.createWriteStream(path));
            if (
                (
                    input as Readable & {
                        truncated?: boolean;
                    }
                ).truncated
            )
                throw new UploadLimitError("Upload exceeds the configured limit");
            this.sizes.set(path, size);
            return {
                id,
                size,
                inspectionPath: path,
            };
        } catch (error) {
            await this.fileSystem.rm(path);
            this.sizes.delete(path);
            throw error;
        }
    }
    async stageBuffer(input: Buffer, suppliedId?: string): Promise<StagedObject> {
        const id = suppliedId ?? createId();
        const path = this.stagingPath(id);
        await this.fileSystem.mkdir(join(this.directory, ".staging"));
        await this.fileSystem.writeFile(path, input);
        this.sizes.set(path, input.length);
        return {
            id,
            size: input.length,
            inspectionPath: path,
        };
    }
    async commit(staged: StagedObject, storageName: string): Promise<void> {
        const target = this.objectPath(storageName);
        await this.fileSystem.rename(staged.inspectionPath, target);
        this.sizes.delete(staged.inspectionPath);
        this.sizes.set(target, staged.size);
        this.committed.set(storageName, Date.now());
    }
    async discard(staged: StagedObject): Promise<void> {
        await this.fileSystem.rm(staged.inspectionPath);
        this.sizes.delete(staged.inspectionPath);
    }
    async quarantine(staged: StagedObject): Promise<void> {
        const target = join(this.directory, ".quarantine", `${staged.id}.blob`);
        await this.fileSystem.mkdir(join(this.directory, ".quarantine"));
        await this.fileSystem.rename(staged.inspectionPath, target);
        const size = this.sizes.get(staged.inspectionPath) ?? staged.size;
        this.sizes.delete(staged.inspectionPath);
        this.sizes.set(target, size);
        this.quarantineTimes.set(target, Date.now());
    }
    open(storageName: string, range?: ByteRange): Readable {
        return this.fileSystem.createReadStream(this.objectPath(storageName), range);
    }
    pathFor(storageName: string): string {
        return this.objectPath(storageName);
    }
    async sizeOf(storageName: string): Promise<number | undefined> {
        return this.knownSize(this.objectPath(storageName));
    }
    async writeVariant(storageName: string, variant: MediaVariant, input: Buffer): Promise<void> {
        const path = this.variantPath(storageName, variant);
        await this.fileSystem.writeFile(path, input);
        this.sizes.set(path, input.length);
        this.variants.set(`${storageName}:${variant}`, input.length);
    }
    openVariant(storageName: string, variant: MediaVariant): Readable {
        return this.fileSystem.createReadStream(this.variantPath(storageName, variant));
    }
    async variantSize(storageName: string, variant: MediaVariant): Promise<number | undefined> {
        return (
            this.variants.get(`${storageName}:${variant}`) ??
            (await this.knownSize(this.variantPath(storageName, variant)))
        );
    }
    async delete(storageName: string): Promise<void> {
        await Promise.all([
            this.fileSystem.rm(this.objectPath(storageName)),
            this.fileSystem.rm(this.variantPath(storageName, "thumbnail")),
            this.fileSystem.rm(this.variantPath(storageName, "preview")),
        ]);
        this.sizes.delete(this.objectPath(storageName));
        this.committed.delete(storageName);
        for (const variant of ["thumbnail", "preview"] as const) {
            this.sizes.delete(this.variantPath(storageName, variant));
            this.variants.delete(`${storageName}:${variant}`);
        }
    }
    async committedBytes(): Promise<number> {
        let total = 0;
        for (const name of this.committed.keys())
            total += this.sizes.get(this.objectPath(name)) ?? 0;
        for (const size of this.variants.values()) total += size;
        return total;
    }
    async createResumable(
        input: Omit<ResumableUpload, "offset" | "createdAt" | "updatedAt">,
    ): Promise<ResumableUpload> {
        if (await this.resumableState(input.id)) throw new Error("Upload already exists");
        const now = new Date().toISOString();
        const upload = {
            ...input,
            offset: 0,
            createdAt: now,
            updatedAt: now,
        };
        await this.fileSystem.mkdir(join(this.directory, ".uploads"));
        await this.fileSystem.writeFile(this.uploadPath(input.id), Buffer.alloc(0));
        this.sizes.set(this.uploadPath(input.id), 0);
        await this.writeUploadManifest(upload);
        this.uploads.set(input.id, upload);
        return {
            ...upload,
        };
    }
    async resumableState(uploadId: string): Promise<ResumableUpload | undefined> {
        const cached = this.uploads.get(uploadId);
        if (cached)
            return {
                ...cached,
            };
        try {
            const source = await this.fileSystem.imageSource(this.uploadManifestPath(uploadId));
            const upload = parseUpload(Buffer.from(source).toString("utf8"));
            this.uploads.set(uploadId, upload);
            this.sizes.set(this.uploadPath(uploadId), upload.offset);
            return {
                ...upload,
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }
    }
    async appendResumable(
        uploadId: string,
        expectedOffset: number,
        input: Readable,
        maximumChunkBytes: number,
    ): Promise<ResumableUpload> {
        const upload = await this.resumableState(uploadId);
        if (!upload) throw new UploadNotFoundError();
        if (upload.offset !== expectedOffset) throw new UploadOffsetError(upload.offset);
        const chunk = await readStream(input, maximumChunkBytes);
        if (chunk.length === 0 || upload.offset + chunk.length > upload.size)
            throw new UploadLimitError("Upload chunk exceeds its declared size");
        const path = this.uploadPath(uploadId);
        const existing = await this.fileSystem.imageSource(path);
        const prefix = Buffer.isBuffer(existing) ? existing : Buffer.alloc(0);
        const contents = Buffer.concat([prefix.subarray(0, upload.offset), chunk]);
        await this.fileSystem.writeFile(path, contents);
        upload.offset = contents.length;
        upload.updatedAt = new Date().toISOString();
        await this.writeUploadManifest(upload);
        this.uploads.set(uploadId, upload);
        this.sizes.set(path, contents.length);
        return {
            ...upload,
        };
    }
    async finishResumable(uploadId: string): Promise<{
        upload: ResumableUpload;
        staged: StagedObject;
    }> {
        const upload = await this.resumableState(uploadId);
        if (!upload) throw new UploadNotFoundError();
        if (upload.offset !== upload.size)
            throw new UploadIncompleteError(upload.offset, upload.size);
        const inspectionPath = this.stagingPath(uploadId);
        try {
            await this.fileSystem.rename(this.uploadPath(uploadId), inspectionPath);
        } catch (error) {
            if (
                (error as NodeJS.ErrnoException).code !== "ENOENT" ||
                (await this.knownSize(inspectionPath)) !== upload.size
            )
                throw error;
        }
        this.sizes.delete(this.uploadPath(uploadId));
        this.sizes.set(inspectionPath, upload.size);
        return {
            upload: {
                ...upload,
            },
            staged: {
                id: uploadId,
                size: upload.size,
                inspectionPath,
            },
        };
    }
    async completedResumable(uploadId: string): Promise<CompletedResumableUpload | undefined> {
        const cached = this.completions.get(uploadId);
        if (cached)
            return {
                ...cached,
            };
        try {
            const source = await this.fileSystem.imageSource(this.receiptPath(uploadId));
            const completion = parseCompletion(Buffer.from(source).toString("utf8"));
            this.completions.set(uploadId, completion);
            return {
                ...completion,
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }
    }
    async recordResumableCompletion(completion: CompletedResumableUpload): Promise<void> {
        await this.fileSystem.mkdir(join(this.directory, ".receipts"));
        await this.fileSystem.writeFile(
            this.receiptPath(completion.uploadId),
            Buffer.from(JSON.stringify(completion)),
        );
        await this.fileSystem.rm(this.uploadManifestPath(completion.uploadId));
        this.uploads.delete(completion.uploadId);
        this.completions.set(completion.uploadId, {
            ...completion,
        });
    }
    async cancelResumable(uploadId: string): Promise<boolean> {
        if (!(await this.resumableState(uploadId))) return false;
        this.uploads.delete(uploadId);
        await Promise.all([
            this.fileSystem.rm(this.uploadPath(uploadId)),
            this.fileSystem.rm(this.uploadManifestPath(uploadId)),
            this.fileSystem.rm(this.stagingPath(uploadId)),
        ]);
        this.sizes.delete(this.uploadPath(uploadId));
        return true;
    }
    async cleanup(before: Date, quarantineBefore: Date): Promise<CleanupResult> {
        const expiredUploadIds: string[] = [];
        for (const [id, upload] of this.uploads) {
            if (Date.parse(upload.updatedAt) >= before.getTime()) continue;
            await this.cancelResumable(id);
            expiredUploadIds.push(id);
        }
        let deletedQuarantineObjects = 0;
        const deletedQuarantineIds: string[] = [];
        for (const [path, createdAt] of this.quarantineTimes) {
            if (createdAt >= quarantineBefore.getTime()) continue;
            await this.fileSystem.rm(path);
            this.sizes.delete(path);
            this.quarantineTimes.delete(path);
            deletedQuarantineObjects += 1;
            deletedQuarantineIds.push(basename(path, ".blob"));
        }
        return {
            expiredUploadIds,
            deletedQuarantineIds,
            deletedQuarantineObjects,
        };
    }
    async cleanupOrphans(referencedStorageNames: Set<string>, before: Date): Promise<string[]> {
        const deleted: string[] = [];
        for (const [storageName, createdAt] of this.committed) {
            if (referencedStorageNames.has(storageName) || createdAt >= before.getTime()) continue;
            await this.delete(storageName);
            deleted.push(storageName);
        }
        return deleted;
    }
    private stagingPath(id: string): string {
        return join(this.directory, ".staging", `${id}.part`);
    }
    private uploadPath(id: string): string {
        return join(this.directory, ".uploads", `${id}.part`);
    }
    private uploadManifestPath(id: string): string {
        return join(this.directory, ".uploads", `${id}.json`);
    }
    private receiptPath(id: string): string {
        return join(this.directory, ".receipts", `${id}.json`);
    }
    private async writeUploadManifest(upload: ResumableUpload): Promise<void> {
        await this.fileSystem.writeFile(
            this.uploadManifestPath(upload.id),
            Buffer.from(JSON.stringify(upload)),
        );
    }
    private async knownSize(path: string): Promise<number | undefined> {
        const cached = this.sizes.get(path);
        if (cached !== undefined) return cached;
        try {
            const source = await this.fileSystem.imageSource(path);
            const size = Buffer.byteLength(source);
            this.sizes.set(path, size);
            return size;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }
    }
    private objectPath(storageName: string): string {
        return join(this.directory, storageName);
    }
    private variantPath(storageName: string, variant: MediaVariant): string {
        return join(this.directory, `.${storageName}.${variant}.webp`);
    }
}
const compatibilityQuotaLedgers = new WeakMap<
    FileStorageFileSystem,
    Map<
        string,
        {
            ownerUserId: string;
            bytes: number;
            committed: boolean;
        }
    >
>();
class MemoryFileQuotaPolicy implements FileQuotaPolicy {
    private readonly entries: Map<
        string,
        {
            ownerUserId: string;
            bytes: number;
            committed: boolean;
        }
    >;
    constructor(
        private readonly limits: {
            perUserBytes: number;
            serverBytes: number;
        },
        fileSystem: FileStorageFileSystem,
    ) {
        const entries = compatibilityQuotaLedgers.get(fileSystem) ?? new Map();
        compatibilityQuotaLedgers.set(fileSystem, entries);
        this.entries = entries;
    }
    async reserve(input: { id: string; ownerUserId: string; bytes: number }): Promise<void> {
        if (this.entries.has(input.id)) throw new Error("Quota reservation already exists");
        this.assertCapacity(input.ownerUserId, input.bytes);
        this.entries.set(input.id, {
            ...input,
            committed: false,
        });
    }
    async resizeReservation(id: string, actualBytes: number): Promise<void> {
        const entry = this.required(id);
        this.assertCapacity(entry.ownerUserId, actualBytes - entry.bytes);
        entry.bytes = actualBytes;
    }
    async commit(id: string, actualBytes: number): Promise<void> {
        await this.resizeReservation(id, actualBytes);
        this.required(id).committed = true;
    }
    async release(id: string): Promise<void> {
        this.entries.delete(id);
    }
    async reconcileCommitted(
        files: Iterable<{
            id: string;
            ownerUserId: string;
            bytes: number;
        }>,
    ): Promise<void> {
        for (const [id, entry] of this.entries) if (entry.committed) this.entries.delete(id);
        for (const file of files)
            this.entries.set(file.id, {
                ...file,
                committed: true,
            });
    }
    private required(id: string) {
        const entry = this.entries.get(id);
        if (!entry) throw new Error("Quota reservation does not exist");
        return entry;
    }
    private assertCapacity(ownerUserId: string, addedBytes: number): void {
        if (addedBytes <= 0) return;
        const userBytes = [...this.entries.values()]
            .filter((entry) => entry.ownerUserId === ownerUserId)
            .reduce((total, entry) => total + entry.bytes, 0);
        if (this.limits.perUserBytes > 0 && userBytes + addedBytes > this.limits.perUserBytes)
            throw new QuotaExceededError("user", this.limits.perUserBytes);
        const serverBytes = [...this.entries.values()].reduce(
            (total, entry) => total + entry.bytes,
            0,
        );
        if (this.limits.serverBytes > 0 && serverBytes + addedBytes > this.limits.serverBytes)
            throw new QuotaExceededError("server", this.limits.serverBytes);
    }
}
class FileSystemMediaProcessor implements MediaProcessor {
    constructor(private readonly fileSystem: FileStorageFileSystem) {}
    async inspect(path: string, suppliedContentType?: string): Promise<MediaAnalysis> {
        const header = await this.fileSystem.readHeader(path, 64);
        const signature = memoryMediaSignature(header);
        const contentType =
            signature?.contentType ??
            safeContentType(suppliedContentType) ??
            "application/octet-stream";
        const kind = signature?.kind ?? (contentType.startsWith("video/") ? "video" : "file");
        if (kind !== "photo" && kind !== "gif")
            return {
                kind,
                contentType,
                width: 0,
                height: 0,
                thumbhash: "",
                variants: {},
            };
        try {
            const source = await this.fileSystem.imageSource(path);
            const image = sharp(source, {
                limitInputPixels: 100_000_000,
                animated: false,
            });
            const metadata = await image.metadata();
            const thumbhashInput = await image
                .clone()
                .resize(100, 100, {
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .ensureAlpha()
                .raw()
                .toBuffer({
                    resolveWithObject: true,
                });
            const [thumbnail, preview] = await Promise.all([
                image
                    .clone()
                    .resize(320, 320, {
                        fit: "inside",
                        withoutEnlargement: true,
                    })
                    .webp({
                        quality: 78,
                    })
                    .toBuffer(),
                image
                    .clone()
                    .resize(1600, 1600, {
                        fit: "inside",
                        withoutEnlargement: true,
                    })
                    .webp({
                        quality: 84,
                    })
                    .toBuffer(),
            ]);
            return {
                kind,
                contentType,
                width: metadata.width ?? 0,
                height: metadata.pageHeight ?? metadata.height ?? 0,
                durationMs:
                    kind === "gif" && metadata.delay?.length
                        ? metadata.delay.reduce((total, delay) => total + delay, 0)
                        : undefined,
                thumbhash: Buffer.from(
                    rgbaToThumbHash(
                        thumbhashInput.info.width,
                        thumbhashInput.info.height,
                        thumbhashInput.data,
                    ),
                ).toString("base64url"),
                variants: {
                    thumbnail,
                    preview,
                },
            };
        } catch {
            return {
                kind: "file",
                contentType,
                width: 0,
                height: 0,
                thumbhash: "",
                variants: {},
            };
        }
    }
}
function isFileStorageFileSystem(
    value: FileStorageOptions | FileStorageFileSystem,
): value is FileStorageFileSystem {
    return typeof (value as FileStorageFileSystem).createWriteStream === "function";
}
function memoryMediaSignature(header: Buffer):
    | {
          kind: "photo" | "gif" | "video";
          contentType: string;
      }
    | undefined {
    if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
        return {
            kind: "photo",
            contentType: "image/jpeg",
        };
    if (header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
        return {
            kind: "photo",
            contentType: "image/png",
        };
    if (header.subarray(0, 6).toString("ascii").startsWith("GIF8"))
        return {
            kind: "gif",
            contentType: "image/gif",
        };
    if (
        header.subarray(0, 4).toString("ascii") === "RIFF" &&
        header.subarray(8, 12).toString("ascii") === "WEBP"
    )
        return {
            kind: "photo",
            contentType: "image/webp",
        };
    if (header.subarray(4, 8).toString("ascii") === "ftyp")
        return {
            kind: "video",
            contentType: "video/mp4",
        };
    if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
        return {
            kind: "video",
            contentType: "video/webm",
        };
    return undefined;
}
async function readStream(input: Readable, maximumBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of input) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > maximumBytes)
            throw new UploadLimitError("Upload chunk exceeds the configured limit");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}
function configuredScanner(config: ServerConfig): MalwareScanner {
    return config.files.malwareScannerCommand
        ? new CommandMalwareScanner(
              config.files.malwareScannerCommand,
              config.files.malwareScannerArguments,
              config.files.malwareScanTimeoutSeconds * 1000,
          )
        : new DisabledMalwareScanner();
}
function normalizedFilename(filename: string | undefined): string {
    const localName = filename?.trim().replaceAll("\\", "/") || "attachment";
    const normalized = [...basename(localName)]
        .filter((character) => character.charCodeAt(0) >= 32)
        .join("");
    return (normalized || "attachment").slice(0, 255);
}
function safeContentType(value: string | undefined): string | undefined {
    return value && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)
        ? value.toLowerCase()
        : undefined;
}
function mapQuotaError(error: unknown): unknown {
    if (error instanceof QuotaExceededError)
        return new FileQuotaExceededError(error.scope, error.limit);
    return error;
}
function avatarThumbnail(image: SharpInstance) {
    return image
        .clone()
        .resize(100, 100, {
            fit: "cover",
        })
        .ensureAlpha()
        .raw()
        .toBuffer({
            resolveWithObject: true,
        });
}
function encodeAvatar(image: SharpInstance) {
    return image
        .clone()
        .rotate()
        .resize(1024, 1024, {
            fit: "cover",
        })
        .jpeg({
            quality: 88,
            progressive: true,
            mozjpeg: true,
        })
        .toBuffer({
            resolveWithObject: true,
        });
}
