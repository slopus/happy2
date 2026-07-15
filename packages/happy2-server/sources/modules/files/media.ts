import { open } from "node:fs/promises";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import type { MediaVariant } from "./provider.js";

export interface MediaAnalysis {
    kind: "file" | "photo" | "video" | "gif";
    contentType: string;
    width: number;
    height: number;
    durationMs?: number;
    thumbhash: string;
    variants: Partial<Record<MediaVariant, Buffer>>;
}

/** External processors can add ffmpeg-backed video thumbnails/transcoding. */
export interface MediaProcessor {
    inspect(path: string, suppliedContentType?: string): Promise<MediaAnalysis>;
}

export class BuiltinMediaProcessor implements MediaProcessor {
    async inspect(path: string, suppliedContentType?: string): Promise<MediaAnalysis> {
        const handle = await open(path, "r");
        const header = Buffer.alloc(64);
        try {
            await handle.read(header, 0, header.length, 0);
        } finally {
            await handle.close();
        }
        const signature = mediaSignature(header);
        const contentType = signature?.contentType ?? safeContentType(suppliedContentType);
        const kind = signature?.kind ?? (contentType.startsWith("video/") ? "video" : "file");
        if (kind === "photo" || kind === "gif") return inspectImage(path, kind, contentType);
        if (kind === "video") {
            const video =
                contentType === "video/x-msvideo"
                    ? await inspectAvi(path)
                    : contentType === "video/webm" || contentType === "video/x-matroska"
                      ? await inspectWebm(path)
                      : await inspectMp4(path);
            return {
                kind,
                contentType,
                width: video.width,
                height: video.height,
                durationMs: video.durationMs,
                thumbhash: "",
                variants: {},
            };
        }
        return { kind, contentType, width: 0, height: 0, thumbhash: "", variants: {} };
    }
}

async function inspectImage(
    path: string,
    kind: "photo" | "gif",
    contentType: string,
): Promise<MediaAnalysis> {
    try {
        const image = sharp(path, { limitInputPixels: 100_000_000, animated: false });
        const metadata = await image.metadata();
        const oriented = orientedDimensions(
            metadata.width ?? 0,
            metadata.pageHeight ?? metadata.height ?? 0,
            metadata.orientation,
        );
        const thumbhashInput = await image
            .clone()
            .autoOrient()
            .resize(100, 100, { fit: "inside", withoutEnlargement: true })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const [thumbnail, preview] = await Promise.all([
            image
                .clone()
                .autoOrient()
                .resize(320, 320, { fit: "inside", withoutEnlargement: true })
                .webp({ quality: 78 })
                .toBuffer(),
            image
                .clone()
                .autoOrient()
                .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
                .webp({ quality: 84 })
                .toBuffer(),
        ]);
        const delays = metadata.delay ?? [];
        const durationMs = kind === "gif" && delays.length > 0 ? sum(delays) : undefined;
        return {
            kind,
            contentType,
            width: oriented.width,
            height: oriented.height,
            durationMs,
            thumbhash: Buffer.from(
                rgbaToThumbHash(
                    thumbhashInput.info.width,
                    thumbhashInput.info.height,
                    thumbhashInput.data,
                ),
            ).toString("base64url"),
            variants: { thumbnail, preview },
        };
    } catch {
        // A claimed image that cannot be safely decoded is served as a download.
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

interface VideoMetadata {
    width: number;
    height: number;
    durationMs?: number;
}

async function inspectMp4(path: string): Promise<VideoMetadata> {
    const handle = await open(path, "r");
    try {
        const file = await handle.stat();
        let position = 0;
        let boxesInspected = 0;
        while (position + 8 <= file.size && boxesInspected < 4_096) {
            boxesInspected += 1;
            const header = Buffer.alloc(16);
            const { bytesRead } = await handle.read(header, 0, header.length, position);
            if (bytesRead < 8) break;
            const box = mp4BoxHeader(header, 0, file.size - position);
            if (!box || box.size < box.headerSize) break;
            if (box.type === "moov" && box.size <= 16 * 1024 * 1024) {
                const buffer = Buffer.alloc(box.size);
                await handle.read(buffer, 0, buffer.length, position);
                return parseMoov(buffer, box.headerSize);
            }
            position += box.size;
        }
    } catch {
        // Truncated and unusual containers still remain playable as video files.
    } finally {
        await handle.close();
    }
    return { width: 0, height: 0 };
}

function parseMoov(buffer: Buffer, headerSize: number): VideoMetadata {
    let durationMs: number | undefined;
    let width = 0;
    let height = 0;
    walkMp4Boxes(buffer, headerSize, buffer.length, (type, box, contentOffset, end) => {
        if (type === "mvhd") durationMs = mp4Duration(box, contentOffset, end);
        if (type === "tkhd" && end - contentOffset >= 8) {
            const candidateWidth = box.readUInt32BE(end - 8) / 65_536;
            const candidateHeight = box.readUInt32BE(end - 4) / 65_536;
            if (candidateWidth > 0 && candidateHeight > 0) {
                width = Math.round(candidateWidth);
                height = Math.round(candidateHeight);
            }
        }
    });
    return { width, height, durationMs };
}

async function inspectAvi(path: string): Promise<VideoMetadata> {
    const handle = await open(path, "r");
    try {
        const file = await handle.stat();
        const buffer = Buffer.alloc(Math.min(file.size, 1024 * 1024));
        await handle.read(buffer, 0, buffer.length, 0);
        const header = buffer.indexOf("avih", 0, "ascii");
        if (header < 0 || header + 48 > buffer.length) return { width: 0, height: 0 };
        const data = header + 8;
        const microsecondsPerFrame = buffer.readUInt32LE(data);
        const totalFrames = buffer.readUInt32LE(data + 16);
        return {
            width: buffer.readUInt32LE(data + 32),
            height: buffer.readUInt32LE(data + 36),
            durationMs:
                microsecondsPerFrame > 0 && totalFrames > 0
                    ? Math.round((microsecondsPerFrame * totalFrames) / 1000)
                    : undefined,
        };
    } catch {
        return { width: 0, height: 0 };
    } finally {
        await handle.close();
    }
}

function walkMp4Boxes(
    buffer: Buffer,
    start: number,
    end: number,
    visitor: (type: string, buffer: Buffer, contentOffset: number, end: number) => void,
): void {
    let position = start;
    while (position + 8 <= end) {
        const box = mp4BoxHeader(buffer, position, end - position);
        if (!box || box.size < box.headerSize || position + box.size > end) return;
        const contentOffset = position + box.headerSize;
        const boxEnd = position + box.size;
        visitor(box.type, buffer, contentOffset, boxEnd);
        if (MP4_CONTAINER_BOXES.has(box.type)) walkMp4Boxes(buffer, contentOffset, boxEnd, visitor);
        position = boxEnd;
    }
}

function mp4BoxHeader(
    buffer: Buffer,
    offset: number,
    remaining: number,
): { type: string; size: number; headerSize: number } | undefined {
    if (offset + 8 > buffer.length) return undefined;
    const size32 = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (size32 === 1) {
        if (offset + 16 > buffer.length) return undefined;
        const size64 = buffer.readBigUInt64BE(offset + 8);
        if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
        return { type, size: Number(size64), headerSize: 16 };
    }
    return { type, size: size32 === 0 ? remaining : size32, headerSize: 8 };
}

function mp4Duration(buffer: Buffer, offset: number, end: number): number | undefined {
    if (offset + 4 > end) return undefined;
    const version = buffer[offset];
    const timescaleOffset = offset + (version === 1 ? 20 : 12);
    const durationOffset = timescaleOffset + 4;
    if (durationOffset + (version === 1 ? 8 : 4) > end) return undefined;
    const timescale = buffer.readUInt32BE(timescaleOffset);
    if (timescale === 0) return undefined;
    const duration =
        version === 1
            ? Number(buffer.readBigUInt64BE(durationOffset))
            : buffer.readUInt32BE(durationOffset);
    return Math.round((duration / timescale) * 1000);
}

async function inspectWebm(path: string): Promise<VideoMetadata> {
    const handle = await open(path, "r");
    try {
        const file = await handle.stat();
        const buffer = Buffer.alloc(Math.min(file.size, 8 * 1024 * 1024));
        await handle.read(buffer, 0, buffer.length, 0);
        const timecodeScale =
            readEbmlUnsigned(buffer, Buffer.from([0x2a, 0xd7, 0xb1])) ?? 1_000_000;
        const duration = readEbmlFloat(buffer, Buffer.from([0x44, 0x89]));
        return {
            width: readEbmlUnsigned(buffer, Buffer.from([0xb0])) ?? 0,
            height: readEbmlUnsigned(buffer, Buffer.from([0xba])) ?? 0,
            durationMs:
                duration === undefined
                    ? undefined
                    : Math.round((duration * timecodeScale) / 1_000_000),
        };
    } catch {
        return { width: 0, height: 0 };
    } finally {
        await handle.close();
    }
}

function readEbmlUnsigned(buffer: Buffer, id: Buffer): number | undefined {
    const value = readEbmlPayload(buffer, id);
    if (!value || value.length > 6) return undefined;
    let result = 0;
    for (const byte of value) result = result * 256 + byte;
    return result;
}

function readEbmlFloat(buffer: Buffer, id: Buffer): number | undefined {
    const value = readEbmlPayload(buffer, id);
    return value?.length === 4
        ? value.readFloatBE(0)
        : value?.length === 8
          ? value.readDoubleBE(0)
          : undefined;
}

function readEbmlPayload(buffer: Buffer, id: Buffer): Buffer | undefined {
    let position = 0;
    while ((position = buffer.indexOf(id, position)) >= 0) {
        const size = readEbmlVint(buffer, position + id.length);
        if (size && size.value <= 1024 && size.end + size.value <= buffer.length)
            return buffer.subarray(size.end, size.end + size.value);
        position += id.length;
    }
    return undefined;
}

function readEbmlVint(buffer: Buffer, offset: number): { value: number; end: number } | undefined {
    if (offset >= buffer.length) return undefined;
    const first = buffer[offset];
    let mask = 0x80;
    let length = 1;
    while (length <= 8 && !(first & mask)) {
        mask >>= 1;
        length += 1;
    }
    if (length > 8 || offset + length > buffer.length) return undefined;
    let value = first & (mask - 1);
    for (let index = 1; index < length; index += 1) value = value * 256 + buffer[offset + index];
    return { value, end: offset + length };
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
        return {
            kind:
                header.subarray(12, 16).toString("ascii") === "VP8X" && header[20] & 0x02
                    ? "gif"
                    : "photo",
            contentType: "image/webp",
        };
    if (
        header.subarray(0, 6).toString("ascii") === "GIF87a" ||
        header.subarray(0, 6).toString("ascii") === "GIF89a"
    )
        return { kind: "gif", contentType: "image/gif" };
    if (
        header.subarray(0, 4).toString("ascii") === "RIFF" &&
        header.subarray(8, 12).toString("ascii") === "AVI "
    )
        return { kind: "video", contentType: "video/x-msvideo" };
    if (header.subarray(0, 2).equals(Buffer.from("BM")))
        return { kind: "photo", contentType: "image/bmp" };
    if (
        header.subarray(0, 4).equals(Buffer.from("49492a00", "hex")) ||
        header.subarray(0, 4).equals(Buffer.from("4d4d002a", "hex"))
    )
        return { kind: "photo", contentType: "image/tiff" };
    if (header.subarray(4, 8).toString("ascii") === "ftyp") {
        const brands = [];
        for (let offset = 8; offset + 4 <= header.length; offset += 4)
            brands.push(header.subarray(offset, offset + 4).toString("ascii"));
        const imageBrand = brands.find((brand) => ISO_IMAGE_BRANDS.has(brand));
        if (imageBrand)
            return {
                kind: imageBrand === "avis" ? "gif" : "photo",
                contentType: imageBrand.startsWith("av") ? "image/avif" : "image/heic",
            };
        if (brands.some((brand) => ISO_VIDEO_BRANDS.has(brand)))
            return {
                kind: "video",
                contentType: brands.includes("qt  ") ? "video/quicktime" : "video/mp4",
            };
    }
    if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
        return {
            kind: "video",
            contentType: header.includes(Buffer.from("matroska"))
                ? "video/x-matroska"
                : "video/webm",
        };
    return undefined;
}

function safeContentType(value: string | undefined): string {
    return value && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)
        ? value.toLowerCase()
        : "application/octet-stream";
}

function orientedDimensions(
    width: number,
    height: number,
    orientation: number | undefined,
): { width: number; height: number } {
    return orientation && orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width, height };
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

const MP4_CONTAINER_BOXES = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "udta"]);
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
