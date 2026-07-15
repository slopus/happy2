import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, truncate, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createId } from "@paralleldrive/cuid2";
import { withFileLock } from "./lock.js";

export interface ByteRange {
    start: number;
    end: number;
}

export interface StagedObject {
    id: string;
    size: number;
    /** A private local copy used only for inspection before commit. */
    inspectionPath: string;
}

export interface ResumableUpload {
    id: string;
    ownerUserId: string;
    filename: string;
    contentType?: string;
    size: number;
    offset: number;
    createdAt: string;
    updatedAt: string;
}

export interface CleanupResult {
    expiredUploadIds: string[];
    deletedQuarantineIds: string[];
    deletedQuarantineObjects: number;
}

export interface StageOptions {
    id?: string;
    onBytes?: (bytes: number) => Promise<void>;
}

export interface CompletedResumableUpload {
    uploadId: string;
    ownerUserId: string;
    fileId: string;
    completedAt: string;
}

/**
 * Storage boundary used by FileStorage. Remote providers may stage locally for
 * inspection, then implement commit/open with object storage or multipart APIs.
 */
export interface FileStorageProvider {
    stage(input: Readable, maximumBytes: number, options?: StageOptions): Promise<StagedObject>;
    stageBuffer(input: Buffer, id?: string): Promise<StagedObject>;
    commit(staged: StagedObject, storageName: string): Promise<void>;
    discard(staged: StagedObject): Promise<void>;
    quarantine(staged: StagedObject, reason: string): Promise<void>;
    open(storageName: string, range?: ByteRange): Readable;
    pathFor?(storageName: string): string;
    sizeOf(storageName: string): Promise<number | undefined>;
    writeVariant(storageName: string, variant: MediaVariant, input: Buffer): Promise<void>;
    openVariant(storageName: string, variant: MediaVariant): Readable;
    variantSize(storageName: string, variant: MediaVariant): Promise<number | undefined>;
    delete(storageName: string): Promise<void>;
    committedBytes(): Promise<number>;
    createResumable(
        input: Omit<ResumableUpload, "offset" | "createdAt" | "updatedAt">,
    ): Promise<ResumableUpload>;
    resumableState(uploadId: string): Promise<ResumableUpload | undefined>;
    appendResumable(
        uploadId: string,
        expectedOffset: number,
        input: Readable,
        maximumChunkBytes: number,
    ): Promise<ResumableUpload>;
    finishResumable(uploadId: string): Promise<{ upload: ResumableUpload; staged: StagedObject }>;
    completedResumable(uploadId: string): Promise<CompletedResumableUpload | undefined>;
    recordResumableCompletion(completion: CompletedResumableUpload): Promise<void>;
    cancelResumable(uploadId: string): Promise<boolean>;
    cleanup(before: Date, quarantineBefore: Date): Promise<CleanupResult>;
    cleanupOrphans(referencedStorageNames: Set<string>, before: Date): Promise<string[]>;
}

export type MediaVariant = "thumbnail" | "preview";

export class UploadLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UploadLimitError";
    }
}

export class UploadOffsetError extends Error {
    constructor(readonly actualOffset: number) {
        super(`Upload offset is ${actualOffset}`);
        this.name = "UploadOffsetError";
    }
}

export class UploadIncompleteError extends Error {
    constructor(
        readonly actualOffset: number,
        readonly expectedSize: number,
    ) {
        super(`Upload has ${actualOffset} of ${expectedSize} bytes`);
        this.name = "UploadIncompleteError";
    }
}

export class UploadNotFoundError extends Error {
    constructor() {
        super("Upload not found");
        this.name = "UploadNotFoundError";
    }
}

export class LocalFileStorageProvider implements FileStorageProvider {
    private readonly stagingDirectory: string;
    private readonly uploadDirectory: string;
    private readonly quarantineDirectory: string;
    private readonly receiptDirectory: string;
    private readonly lockPath: string;
    private queue: Promise<void> = Promise.resolve();

    constructor(readonly directory: string) {
        this.stagingDirectory = join(directory, ".staging");
        this.uploadDirectory = join(directory, ".uploads");
        this.quarantineDirectory = join(directory, ".quarantine");
        this.receiptDirectory = join(directory, ".receipts");
        this.lockPath = join(directory, ".metadata", "provider.lock");
    }

    async stage(
        input: Readable,
        maximumBytes: number,
        options: StageOptions = {},
    ): Promise<StagedObject> {
        await this.ensureDirectories();
        const id = options.id ?? createId();
        const path = join(this.stagingDirectory, `${id}.part`);
        let size = 0;
        const limiter = new Transform({
            transform: (chunk: Buffer, _encoding, callback) => {
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
            await pipeline(input, limiter, createWriteStream(path, { mode: 0o600 }));
            if ((input as Readable & { truncated?: boolean }).truncated)
                throw new UploadLimitError("Upload exceeds the configured limit");
            return { id, size, inspectionPath: path };
        } catch (error) {
            await rm(path, { force: true });
            throw error;
        }
    }

    async stageBuffer(input: Buffer, suppliedId?: string): Promise<StagedObject> {
        await this.ensureDirectories();
        const id = suppliedId ?? createId();
        const path = join(this.stagingDirectory, `${id}.part`);
        await writeFile(path, input, { mode: 0o600 });
        return { id, size: input.length, inspectionPath: path };
    }

    async commit(staged: StagedObject, storageName: string): Promise<void> {
        await this.ensureDirectories();
        await rename(this.stagedPath(staged), this.objectPath(storageName));
    }

    async discard(staged: StagedObject): Promise<void> {
        await rm(this.stagedPath(staged), { force: true });
    }

    async quarantine(staged: StagedObject, reason: string): Promise<void> {
        await this.ensureDirectories();
        const name = `${staged.id}.blob`;
        await rename(this.stagedPath(staged), join(this.quarantineDirectory, name));
        await writeFile(
            join(this.quarantineDirectory, `${name}.json`),
            JSON.stringify({ createdAt: new Date().toISOString(), reason }),
            { mode: 0o600 },
        );
    }

    open(storageName: string, range?: ByteRange): Readable {
        return createReadStream(this.objectPath(storageName), range);
    }

    pathFor(storageName: string): string {
        return this.objectPath(storageName);
    }

    async sizeOf(storageName: string): Promise<number | undefined> {
        return fileSize(this.objectPath(storageName));
    }

    async writeVariant(storageName: string, variant: MediaVariant, input: Buffer): Promise<void> {
        await writeFile(this.variantPath(storageName, variant), input, { mode: 0o600 });
    }

    openVariant(storageName: string, variant: MediaVariant): Readable {
        return createReadStream(this.variantPath(storageName, variant));
    }

    async variantSize(storageName: string, variant: MediaVariant): Promise<number | undefined> {
        return fileSize(this.variantPath(storageName, variant));
    }

    async delete(storageName: string): Promise<void> {
        await Promise.all([
            rm(this.objectPath(storageName), { force: true }),
            rm(this.variantPath(storageName, "thumbnail"), { force: true }),
            rm(this.variantPath(storageName, "preview"), { force: true }),
        ]);
    }

    async committedBytes(): Promise<number> {
        await this.ensureDirectories();
        let total = 0;
        for (const entry of await readdir(this.directory, { withFileTypes: true })) {
            if (!entry.isFile() || entry.name.startsWith(".")) continue;
            total += (await stat(join(this.directory, entry.name))).size;
        }
        return total;
    }

    async createResumable(
        input: Omit<ResumableUpload, "offset" | "createdAt" | "updatedAt">,
    ): Promise<ResumableUpload> {
        return this.serialized(async () => {
            await this.ensureDirectories();
            if (await this.resumableState(input.id)) throw new Error("Upload already exists");
            const now = new Date().toISOString();
            const upload = { ...input, offset: 0, createdAt: now, updatedAt: now };
            await writeFile(this.uploadDataPath(input.id), Buffer.alloc(0), {
                mode: 0o600,
                flag: "wx",
            });
            try {
                await this.writeUploadManifest(upload);
                return upload;
            } catch (error) {
                await rm(this.uploadDataPath(input.id), { force: true });
                throw error;
            }
        });
    }

    async resumableState(uploadId: string): Promise<ResumableUpload | undefined> {
        try {
            return parseUpload(await readFile(this.uploadManifestPath(uploadId), "utf8"));
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
        return this.serialized(async () => {
            const upload = await this.resumableState(uploadId);
            if (!upload) throw new UploadNotFoundError();
            if (upload.offset !== expectedOffset) throw new UploadOffsetError(upload.offset);
            let chunkBytes = 0;
            const limiter = new Transform({
                transform: (chunk: Buffer, _encoding, callback) => {
                    chunkBytes += chunk.length;
                    callback(
                        chunkBytes > maximumChunkBytes || upload.offset + chunkBytes > upload.size
                            ? new UploadLimitError("Upload chunk exceeds its declared size")
                            : undefined,
                        chunk,
                    );
                },
            });
            const temporary = join(this.uploadDirectory, `.${uploadId}.${createId()}.chunk`);
            try {
                await pipeline(input, limiter, createWriteStream(temporary, { mode: 0o600 }));
                if ((input as Readable & { truncated?: boolean }).truncated)
                    throw new UploadLimitError("Upload chunk exceeds the configured limit");
                if (chunkBytes === 0) throw new UploadLimitError("Upload chunk must not be empty");
                const currentSize = await fileSize(this.uploadDataPath(uploadId));
                if (currentSize === undefined || currentSize < upload.offset)
                    throw new Error("Resumable upload data is corrupt");
                if (currentSize > upload.offset)
                    await truncate(this.uploadDataPath(uploadId), upload.offset);
                const updated = {
                    ...upload,
                    offset: upload.offset + chunkBytes,
                    updatedAt: new Date().toISOString(),
                };
                try {
                    await pipeline(
                        createReadStream(temporary),
                        createWriteStream(this.uploadDataPath(uploadId), {
                            flags: "a",
                            mode: 0o600,
                        }),
                    );
                    await this.writeUploadManifest(updated);
                } catch (error) {
                    await truncate(this.uploadDataPath(uploadId), upload.offset);
                    throw error;
                }
                return updated;
            } finally {
                await rm(temporary, { force: true });
            }
        });
    }

    async finishResumable(
        uploadId: string,
    ): Promise<{ upload: ResumableUpload; staged: StagedObject }> {
        return this.serialized(async () => {
            const upload = await this.resumableState(uploadId);
            if (!upload) throw new UploadNotFoundError();
            if (upload.offset !== upload.size)
                throw new UploadIncompleteError(upload.offset, upload.size);
            await this.ensureDirectories();
            const stagedId = uploadId;
            const staged: StagedObject = {
                id: stagedId,
                size: upload.size,
                inspectionPath: join(this.stagingDirectory, `${stagedId}.part`),
            };
            try {
                await rename(this.uploadDataPath(uploadId), staged.inspectionPath);
            } catch (error) {
                if (
                    (error as NodeJS.ErrnoException).code !== "ENOENT" ||
                    (await fileSize(staged.inspectionPath)) !== upload.size
                )
                    throw error;
            }
            return { upload, staged };
        });
    }

    async cancelResumable(uploadId: string): Promise<boolean> {
        return this.serialized(async () => {
            const upload = await this.resumableState(uploadId);
            if (!upload) return false;
            await Promise.all([
                rm(this.uploadDataPath(uploadId), { force: true }),
                rm(this.uploadManifestPath(uploadId), { force: true }),
            ]);
            return true;
        });
    }

    async completedResumable(uploadId: string): Promise<CompletedResumableUpload | undefined> {
        try {
            return parseCompletion(await readFile(this.receiptPath(uploadId), "utf8"));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw error;
        }
    }

    async recordResumableCompletion(completion: CompletedResumableUpload): Promise<void> {
        await this.ensureDirectories();
        const temporary = join(this.receiptDirectory, `.${completion.uploadId}.${createId()}.tmp`);
        await writeFile(temporary, JSON.stringify(completion), { mode: 0o600 });
        await rename(temporary, this.receiptPath(completion.uploadId));
        await rm(this.uploadManifestPath(completion.uploadId), { force: true });
    }

    async cleanup(before: Date, quarantineBefore: Date): Promise<CleanupResult> {
        return this.serialized(async () => {
            await this.ensureDirectories();
            const expiredUploadIds: string[] = [];
            for (const entry of await readdir(this.uploadDirectory, { withFileTypes: true })) {
                if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
                const upload = await this.resumableState(entry.name.slice(0, -5));
                if (!upload || new Date(upload.updatedAt) >= before) continue;
                expiredUploadIds.push(upload.id);
                await Promise.all([
                    rm(this.uploadDataPath(upload.id), { force: true }),
                    rm(this.uploadManifestPath(upload.id), { force: true }),
                ]);
            }
            for (const entry of await readdir(this.uploadDirectory, { withFileTypes: true })) {
                if (!entry.isFile() || entry.name.endsWith(".json")) continue;
                const path = join(this.uploadDirectory, entry.name);
                if ((await stat(path)).mtime >= before) continue;
                await rm(path, { force: true });
                const uploadId = /^(?:\.)?([a-z0-9]+)(?:\..+)?$/.exec(entry.name)?.[1];
                if (uploadId) expiredUploadIds.push(uploadId);
            }
            for (const entry of await readdir(this.stagingDirectory, { withFileTypes: true })) {
                if (!entry.isFile()) continue;
                const path = join(this.stagingDirectory, entry.name);
                if ((await stat(path)).mtime < before) {
                    await rm(path, { force: true });
                    if (entry.name.endsWith(".part"))
                        expiredUploadIds.push(entry.name.slice(0, -5));
                }
            }
            for (const entry of await readdir(this.receiptDirectory, { withFileTypes: true })) {
                if (!entry.isFile()) continue;
                const path = join(this.receiptDirectory, entry.name);
                if ((await stat(path)).mtime < before) await rm(path, { force: true });
            }
            const deletedQuarantineIds: string[] = [];
            for (const entry of await readdir(this.quarantineDirectory, { withFileTypes: true })) {
                if (!entry.isFile() || entry.name.endsWith(".json")) continue;
                const path = join(this.quarantineDirectory, entry.name);
                if ((await stat(path)).mtime >= quarantineBefore) continue;
                deletedQuarantineIds.push(entry.name.slice(0, -5));
                await Promise.all([rm(path, { force: true }), rm(`${path}.json`, { force: true })]);
            }
            return {
                expiredUploadIds: [...new Set(expiredUploadIds)],
                deletedQuarantineIds: [...new Set(deletedQuarantineIds)],
                deletedQuarantineObjects: deletedQuarantineIds.length,
            };
        });
    }

    async cleanupOrphans(referencedStorageNames: Set<string>, before: Date): Promise<string[]> {
        await this.ensureDirectories();
        const deleted: string[] = [];
        for (const entry of await readdir(this.directory, { withFileTypes: true })) {
            if (
                !entry.isFile() ||
                entry.name.startsWith(".") ||
                entry.name.endsWith(".thumbnail.webp") ||
                entry.name.endsWith(".preview.webp") ||
                !/^[a-z0-9]+\.(?:blob|jpg)$/.test(entry.name) ||
                referencedStorageNames.has(entry.name)
            )
                continue;
            const path = join(this.directory, entry.name);
            if ((await stat(path)).mtime >= before) continue;
            await this.delete(entry.name);
            deleted.push(entry.name);
        }
        return deleted;
    }

    private objectPath(storageName: string): string {
        return safeJoin(this.directory, storageName);
    }

    private stagedPath(staged: StagedObject): string {
        const expected = safeJoin(this.stagingDirectory, `${staged.id}.part`);
        if (expected !== staged.inspectionPath) throw new Error("Invalid staged object");
        return expected;
    }

    private variantPath(storageName: string, variant: MediaVariant): string {
        return this.objectPath(`${storageName}.${variant}.webp`);
    }

    private uploadDataPath(uploadId: string): string {
        return safeJoin(this.uploadDirectory, `${uploadId}.part`);
    }

    private uploadManifestPath(uploadId: string): string {
        return safeJoin(this.uploadDirectory, `${uploadId}.json`);
    }

    private receiptPath(uploadId: string): string {
        return safeJoin(this.receiptDirectory, `${uploadId}.json`);
    }

    private async writeUploadManifest(upload: ResumableUpload): Promise<void> {
        const temporary = join(this.uploadDirectory, `.${upload.id}.${createId()}.tmp`);
        await writeFile(temporary, JSON.stringify(upload), { mode: 0o600 });
        await rename(temporary, this.uploadManifestPath(upload.id));
    }

    private async ensureDirectories(): Promise<void> {
        await Promise.all([
            mkdir(this.directory, { recursive: true, mode: 0o700 }),
            mkdir(this.stagingDirectory, { recursive: true, mode: 0o700 }),
            mkdir(this.uploadDirectory, { recursive: true, mode: 0o700 }),
            mkdir(this.quarantineDirectory, { recursive: true, mode: 0o700 }),
            mkdir(this.receiptDirectory, { recursive: true, mode: 0o700 }),
        ]);
    }

    private async serialized<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.queue;
        let release!: () => void;
        this.queue = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await withFileLock(this.lockPath, operation);
        } finally {
            release();
        }
    }
}

function safeJoin(directory: string, name: string): string {
    if (!name || basename(name) !== name || name === "." || name === "..")
        throw new Error("Invalid storage object name");
    return join(directory, name);
}

async function fileSize(path: string): Promise<number | undefined> {
    try {
        return (await stat(path)).size;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
    }
}

export function parseUpload(input: string): ResumableUpload {
    const value = JSON.parse(input) as Partial<ResumableUpload>;
    if (
        typeof value.id !== "string" ||
        typeof value.ownerUserId !== "string" ||
        typeof value.filename !== "string" ||
        !Number.isSafeInteger(value.size) ||
        value.size! < 1 ||
        !Number.isSafeInteger(value.offset) ||
        value.offset! < 0 ||
        value.offset! > value.size! ||
        typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt)) ||
        typeof value.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.updatedAt)) ||
        (value.contentType !== undefined && typeof value.contentType !== "string")
    )
        throw new Error("Corrupt resumable upload manifest");
    return value as ResumableUpload;
}

export function parseCompletion(input: string): CompletedResumableUpload {
    const value = JSON.parse(input) as Partial<CompletedResumableUpload>;
    if (
        typeof value.uploadId !== "string" ||
        typeof value.ownerUserId !== "string" ||
        typeof value.fileId !== "string" ||
        typeof value.completedAt !== "string" ||
        !Number.isFinite(Date.parse(value.completedAt))
    )
        throw new Error("Corrupt resumable completion receipt");
    return value as CompletedResumableUpload;
}
