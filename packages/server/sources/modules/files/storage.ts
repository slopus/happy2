import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createId } from "@paralleldrive/cuid2";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import type { ServerConfig } from "../config/type.js";
import type { Database, StoredFile, User } from "../database.js";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_SIDE = 2048;
type SharpInstance = ReturnType<typeof sharp>;
type SharpMetadata = Awaited<ReturnType<SharpInstance["metadata"]>>;

export class InvalidUploadError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "InvalidUploadError";
    }
}

export class FileStorage {
    private readonly directory: string;

    constructor(
        private readonly config: ServerConfig,
        private readonly database: Database,
    ) {
        this.directory = config.files.directory;
    }

    async saveAvatarUpload(user: User, input: Buffer, isPublic: boolean): Promise<StoredFile> {
        if (input.length === 0 || input.length > MAX_AVATAR_BYTES)
            throw new InvalidUploadError("Avatar file must be at most 10 MB");
        const image = sharp(input, { limitInputPixels: MAX_AVATAR_SIDE * MAX_AVATAR_SIDE });
        let metadata: SharpMetadata;
        try {
            metadata = await image.metadata();
        } catch (error) {
            throw new InvalidUploadError("Avatar must be a valid image", { cause: error });
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
            throw new InvalidUploadError("Avatar could not be decoded", { cause: error });
        }
        const thumbhash = Buffer.from(
            rgbaToThumbHash(thumbnail.info.width, thumbnail.info.height, thumbnail.data),
        ).toString("base64url");
        const id = createId();
        const file: StoredFile = {
            id,
            userId: user.id,
            uploadedByUserId: user.id,
            isPublic,
            storageName: `${id}.jpg`,
            contentType: "image/jpeg",
            size: encoded.data.length,
            width: encoded.info.width,
            height: encoded.info.height,
            thumbhash,
            kind: "photo",
            originalName: "avatar.jpg",
        };
        await mkdir(this.directory, { recursive: true });
        const destination = join(this.directory, file.storageName);
        const temporary = join(this.directory, `.${id}.${createId()}.tmp`);
        await writeFile(temporary, encoded.data, { mode: 0o600 });
        try {
            await rename(temporary, destination);
            await this.database.createFile(file);
            return file;
        } catch (error) {
            await rm(temporary, { force: true });
            await rm(destination, { force: true });
            throw error;
        }
    }

    async saveAttachmentUpload(
        user: User,
        input: Readable,
        upload: { filename?: string; contentType?: string },
    ): Promise<StoredFile> {
        const id = createId();
        const storageName = `${id}.blob`;
        const originalName = normalizedFilename(upload.filename);
        await mkdir(this.directory, { recursive: true });
        const destination = join(this.directory, storageName);
        const temporary = join(this.directory, `.${id}.${createId()}.tmp`);
        let size = 0;
        const limiter = new Transform({
            transform: (chunk: Buffer, _encoding, callback) => {
                size += chunk.length;
                callback(
                    size > this.config.files.maxUploadBytes
                        ? new InvalidUploadError("Attachment exceeds the configured upload limit")
                        : undefined,
                    chunk,
                );
            },
        });
        try {
            try {
                await pipeline(input, limiter, createWriteStream(temporary, { mode: 0o600 }));
            } catch (error) {
                if (
                    error instanceof InvalidUploadError ||
                    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
                )
                    throw new InvalidUploadError("Attachment exceeds the configured upload limit", {
                        cause: error,
                    });
                throw error;
            }
            if ((input as Readable & { truncated?: boolean }).truncated)
                throw new InvalidUploadError("Attachment exceeds the configured upload limit");
            if (size === 0) throw new InvalidUploadError("Attachment must not be empty");
            await rename(temporary, destination);
            const detected = await detectMedia(destination, upload.contentType);
            const file: StoredFile = {
                id,
                userId: user.id,
                uploadedByUserId: user.id,
                isPublic: false,
                storageName,
                originalName,
                contentType: detected.contentType,
                kind: detected.kind,
                size,
                width: detected.width,
                height: detected.height,
                thumbhash: detected.thumbhash,
            };
            await this.database.createFile(file);
            return file;
        } catch (error) {
            await rm(temporary, { force: true });
            await rm(destination, { force: true });
            throw error;
        }
    }

    pathFor(file: StoredFile): string {
        return join(this.directory, file.storageName);
    }
}

function normalizedFilename(filename: string | undefined): string {
    const normalized = [...basename(filename?.trim() || "attachment")]
        .filter((character) => character.charCodeAt(0) >= 32)
        .join("");
    return (normalized || "attachment").slice(0, 255);
}

async function detectMedia(
    path: string,
    suppliedContentType: string | undefined,
): Promise<{
    kind: "file" | "photo" | "video" | "gif";
    contentType: string;
    width: number;
    height: number;
    thumbhash: string;
}> {
    const handle = await open(path, "r");
    const header = Buffer.alloc(32);
    try {
        await handle.read(header, 0, header.length, 0);
    } finally {
        await handle.close();
    }
    const signature = mediaSignature(header);
    const contentType = signature?.contentType ?? safeContentType(suppliedContentType);
    const kind = signature?.kind ?? (contentType.startsWith("video/") ? "video" : "file");
    if (kind !== "photo" && kind !== "gif")
        return { kind, contentType, width: 0, height: 0, thumbhash: "" };
    try {
        const image = sharp(path, { limitInputPixels: 100_000_000 });
        const metadata = await image.metadata();
        const thumbnail = await image
            .clone()
            .resize(100, 100, { fit: "inside", withoutEnlargement: true })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        return {
            kind,
            contentType,
            width: metadata.width ?? 0,
            height: metadata.height ?? 0,
            thumbhash: Buffer.from(
                rgbaToThumbHash(thumbnail.info.width, thumbnail.info.height, thumbnail.data),
            ).toString("base64url"),
        };
    } catch {
        return {
            kind: "file",
            contentType: "application/octet-stream",
            width: 0,
            height: 0,
            thumbhash: "",
        };
    }
}

function mediaSignature(
    header: Buffer,
): { kind: "photo" | "gif" | "video"; contentType: string } | undefined {
    if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
        return { kind: "photo", contentType: "image/jpeg" };
    if (header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
        return { kind: "photo", contentType: "image/png" };
    if (
        header.subarray(0, 4).toString("ascii") === "RIFF" &&
        header.subarray(8, 12).toString("ascii") === "WEBP"
    )
        return { kind: "photo", contentType: "image/webp" };
    if (
        header.subarray(0, 6).toString("ascii") === "GIF87a" ||
        header.subarray(0, 6).toString("ascii") === "GIF89a"
    )
        return { kind: "gif", contentType: "image/gif" };
    if (header.subarray(4, 8).toString("ascii") === "ftyp") {
        const brands = [];
        for (let offset = 8; offset + 4 <= header.length; offset += 4)
            brands.push(header.subarray(offset, offset + 4).toString("ascii"));
        if (brands.some((brand) => ISO_IMAGE_BRANDS.has(brand))) return undefined;
        if (brands.some((brand) => ISO_VIDEO_BRANDS.has(brand)))
            return { kind: "video", contentType: "video/mp4" };
    }
    if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
        return { kind: "video", contentType: "video/webm" };
    return undefined;
}

const ISO_VIDEO_BRANDS = new Set([
    "isom",
    "iso2",
    "iso5",
    "iso6",
    "avc1",
    "mp41",
    "mp42",
    "M4V ",
    "MSNV",
    "qt  ",
]);
const ISO_IMAGE_BRANDS = new Set(["avif", "avis", "heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

function avatarThumbnail(image: SharpInstance) {
    return image
        .clone()
        .resize(100, 100, { fit: "cover" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
}

function encodeAvatar(image: SharpInstance) {
    return image
        .clone()
        .rotate()
        .resize(1024, 1024, { fit: "cover" })
        .jpeg({ quality: 88, progressive: true, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
}

function safeContentType(value: string | undefined): string {
    return value && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)
        ? value.toLowerCase()
        : "application/octet-stream";
}
