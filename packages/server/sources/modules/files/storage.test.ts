import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../config/defaults.js";
import { Database, type User } from "../database.js";
import { UploadOffsetError } from "./provider.js";
import type { MalwareScanner } from "./scanner.js";
import { FileQuotaExceededError, FileStorage, UploadRejectedError } from "./storage.js";

describe("attachment storage", () => {
    let directory: string;
    let database: Database;
    let storage: FileStorage;
    let user: User;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "rigged-files-"));
        const config = defaultConfig();
        config.database.url = `file:${join(directory, "rigged.db")}`;
        config.files.directory = join(directory, "files");
        database = new Database(config.database.url);
        await database.migrate();
        const account = await database.createPasswordAccount("files@example.com", "unused");
        user = await database.createProfile(account.id, {
            firstName: "Files",
            username: "files_user",
        });
        storage = new FileStorage(config, database);
    });

    afterEach(async () => {
        database.close();
        await rm(directory, { recursive: true, force: true });
    });

    it("recognizes photos, animated GIFs, videos, and generic files", async () => {
        const png = await sharp({
            create: { width: 2, height: 3, channels: 4, background: "#ff0000" },
        })
            .png()
            .toBuffer();
        const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
        const mp4 = Buffer.concat([
            Buffer.from("000000186674797069736f6d", "hex"),
            Buffer.alloc(24),
        ]);
        const photo = await save(storage, user, png, "photo.png", "image/png");
        const animation = await save(storage, user, gif, "party.gif", "image/gif");
        const video = await save(storage, user, mp4, "clip.mp4", "video/mp4");
        const file = await save(
            storage,
            user,
            Buffer.from("plain text"),
            "notes.txt",
            "text/plain",
        );
        expect(photo).toMatchObject({ kind: "photo", width: 2, height: 3 });
        expect(await storage.variant(photo, "thumbnail")).toMatchObject({
            contentType: "image/webp",
        });
        expect(animation).toMatchObject({ kind: "gif", width: 1, height: 1 });
        expect(video).toMatchObject({ kind: "video", contentType: "video/mp4" });
        expect(file).toMatchObject({ kind: "file", contentType: "text/plain" });
    });

    it("extracts dimensions and duration from an MP4 container", async () => {
        const movieHeader = Buffer.alloc(100);
        movieHeader.writeUInt32BE(1000, 12);
        movieHeader.writeUInt32BE(2500, 16);
        const trackHeader = Buffer.alloc(84);
        trackHeader.writeUInt32BE(640 * 65_536, trackHeader.length - 8);
        trackHeader.writeUInt32BE(360 * 65_536, trackHeader.length - 4);
        const mp4 = Buffer.concat([
            box("ftyp", Buffer.concat([Buffer.from("isom"), Buffer.alloc(12)])),
            box(
                "moov",
                Buffer.concat([box("mvhd", movieHeader), box("trak", box("tkhd", trackHeader))]),
            ),
        ]);
        const video = await save(storage, user, mp4, "demo.mp4", "application/octet-stream");
        expect(video).toMatchObject({
            kind: "video",
            contentType: "video/mp4",
            width: 640,
            height: 360,
            durationMs: 2500,
        });
    });

    it("resumes after recreating the service and rejects stale offsets", async () => {
        const upload = await storage.createResumableUpload(user, {
            filename: "resume.txt",
            contentType: "text/plain",
            size: 6,
        });
        await storage.appendResumableUpload(user.id, upload.id, 0, Readable.from("abc"));
        await expect(
            storage.appendResumableUpload(user.id, upload.id, 0, Readable.from("x")),
        ).rejects.toEqual(expect.objectContaining<Partial<UploadOffsetError>>({ actualOffset: 3 }));

        storage = new FileStorage(config(), database);
        expect(await storage.resumableUploadState(user.id, upload.id)).toMatchObject({ offset: 3 });
        expect(await storage.resumableUploadState("another-user", upload.id)).toBeUndefined();
        await storage.appendResumableUpload(user.id, upload.id, 3, Readable.from("def"));
        const file = await storage.completeResumableUpload(user, upload.id);
        expect(file).toMatchObject({ originalName: "resume.txt", size: 6 });
        expect(await streamBuffer(storage.open(file!))).toEqual(Buffer.from("abcdef"));
    });

    it("enforces a durable per-user quota", async () => {
        const quotaConfig = config();
        quotaConfig.files.perUserQuotaBytes = 5;
        storage = new FileStorage(quotaConfig, database);
        await save(storage, user, Buffer.from("12345"), "one.txt", "text/plain");
        await expect(
            save(storage, user, Buffer.from("6"), "two.txt", "text/plain"),
        ).rejects.toBeInstanceOf(FileQuotaExceededError);
    });

    it("serializes quota reservations across local service instances", async () => {
        const quotaConfig = config();
        quotaConfig.files.perUserQuotaBytes = 4;
        const first = new FileStorage(quotaConfig, database);
        const second = new FileStorage(quotaConfig, database);
        const results = await Promise.allSettled([
            save(first, user, Buffer.from("123"), "one.txt", "text/plain"),
            save(second, user, Buffer.from("456"), "two.txt", "text/plain"),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(
            FileQuotaExceededError,
        );
    });

    it("quarantines scanner detections without creating a file record", async () => {
        const scanner: MalwareScanner = {
            scan: async () => ({ verdict: "infected", threat: "test signature" }),
        };
        storage = new FileStorage(config(), database, { scanner });
        await expect(
            save(storage, user, Buffer.from("unsafe"), "unsafe.bin", "application/octet-stream"),
        ).rejects.toBeInstanceOf(UploadRejectedError);
        const entries = await readdir(join(config().files.directory, ".quarantine"));
        expect(entries.some((entry) => entry.endsWith(".blob"))).toBe(true);
    });

    it("expires abandoned resumable uploads and releases their reservations", async () => {
        const quotaConfig = config();
        quotaConfig.files.perUserQuotaBytes = 4;
        storage = new FileStorage(quotaConfig, database);
        const upload = await storage.createResumableUpload(user, { size: 4 });
        await storage.runMaintenance({
            now: new Date(Date.now() + quotaConfig.files.incompleteUploadExpirySeconds * 1000 + 1),
        });
        expect(await storage.resumableUploadState(user.id, upload.id)).toBeUndefined();
        await expect(storage.createResumableUpload(user, { size: 4 })).resolves.toMatchObject({
            size: 4,
        });
    });

    it("removes orphan objects and reconciles quota from authoritative records", async () => {
        const quotaConfig = config();
        quotaConfig.files.perUserQuotaBytes = 4;
        storage = new FileStorage(quotaConfig, database);
        const orphan = await save(storage, user, Buffer.from("1234"), "orphan.txt", "text/plain");
        const maintenance = await storage.runMaintenance({
            now: new Date(Date.now() + 1000),
            referencedFiles: [],
            orphanGraceMs: 0,
        });
        expect(maintenance.deletedOrphanStorageNames).toContain(orphan.storageName);
        await expect(
            save(storage, user, Buffer.from("5678"), "replacement.txt", "text/plain"),
        ).resolves.toMatchObject({ size: 4 });
    });

    function config() {
        const value = defaultConfig();
        value.database.url = `file:${join(directory, "rigged.db")}`;
        value.files.directory = join(directory, "files");
        return value;
    }
});

async function save(
    storage: FileStorage,
    user: User,
    contents: Buffer,
    filename: string,
    contentType: string,
) {
    return storage.saveAttachmentUpload(user, Readable.from(contents), { filename, contentType });
}

function box(type: string, body: Buffer): Buffer {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(body.length + header.length, 0);
    header.write(type, 4, "ascii");
    return Buffer.concat([header, body]);
}

async function streamBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}
