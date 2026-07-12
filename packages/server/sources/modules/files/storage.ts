import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import type { ServerConfig } from "../config/type.js";
import type { Database, StoredFile, User } from "../database.js";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_SIDE = 2048;

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
            throw new Error("Avatar file must be at most 10 MB");
        const image = sharp(input, { limitInputPixels: MAX_AVATAR_SIDE * MAX_AVATAR_SIDE });
        const metadata = await image.metadata();
        if (
            !metadata.width ||
            !metadata.height ||
            metadata.width > MAX_AVATAR_SIDE ||
            metadata.height > MAX_AVATAR_SIDE
        )
            throw new Error("Avatar dimensions must not exceed 2048px");
        const thumbnail = await image
            .clone()
            .resize(100, 100, { fit: "cover" })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const thumbhash = Buffer.from(
            rgbaToThumbHash(thumbnail.info.width, thumbnail.info.height, thumbnail.data),
        ).toString("base64url");
        const encoded = await image
            .rotate()
            .resize(1024, 1024, { fit: "cover" })
            .jpeg({ quality: 88, progressive: true, mozjpeg: true })
            .toBuffer({ resolveWithObject: true });
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

    pathFor(file: StoredFile): string {
        return join(this.directory, file.storageName);
    }
}
