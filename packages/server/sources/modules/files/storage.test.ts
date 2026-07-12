import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../config/defaults.js";
import { Database, type User } from "../database.js";
import { FileStorage } from "./storage.js";

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
        const unsupportedAvif = Buffer.concat([
            Buffer.from("000000186674797061766966", "hex"),
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
        const avif = await save(storage, user, unsupportedAvif, "image.avif", "image/avif");
        expect(photo).toMatchObject({ kind: "photo", width: 2, height: 3 });
        expect(animation).toMatchObject({ kind: "gif", width: 1, height: 1 });
        expect(video).toMatchObject({ kind: "video", contentType: "video/mp4" });
        expect(file).toMatchObject({ kind: "file", contentType: "text/plain" });
        expect(avif).toMatchObject({ kind: "file", contentType: "image/avif" });
    });
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
