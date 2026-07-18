import { happyStateCreate } from "happy2-state";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("avatar changes reconcile through the real in-memory server", () => {
    it("reconciles another user's new avatar into this client's contacts over SSE", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({
            username: "avatar_sync_owner",
            firstName: "Owner",
        });
        const viewer = await server.createUser({
            username: "avatar_sync_viewer",
            firstName: "Viewer",
        });

        const transport = await createGymStateTransport(server, viewer);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();

        const directory = state.directory();
        await state.whenIdle();
        expect(
            directory.getState().users.find((item) => item.id === owner.id)?.photoFileId,
        ).toBeUndefined();

        // The owner uploads and adopts a public avatar through the real server.
        const asOwner = server.as(owner);
        const upload = await postMultipart(asOwner, "/v0/me/uploadAvatarFile", [
            { name: "visibility", value: "public" },
            {
                name: "file",
                filename: "avatar.png",
                contentType: "image/png",
                contents: onePixelPng(),
            },
            { name: "crop", value: JSON.stringify({ x: 0, y: 0, width: 1, height: 1 }) },
        ]);
        expect(upload.statusCode).toBe(201);
        const fileId = upload.json().file.id as string;
        expect((await asOwner.post("/v0/me/updateAvatar", { fileId })).statusCode).toBe(200);

        // The owner's `user.updated` sync event refreshes the viewer's cached
        // contacts, so the new photoFileId reconciles without a manual reload.
        await expect
            .poll(
                () => directory.getState().users.find((item) => item.id === owner.id)?.photoFileId,
                {
                    timeout: 3_000,
                },
            )
            .toBe(fileId);
    });
});

async function postMultipart(
    client: GymRequestClient,
    url: string,
    parts: Array<
        | { name: string; value: string }
        | { name: string; filename: string; contentType: string; contents: Buffer }
    >,
) {
    const boundary = "happy2-gym-avatar-boundary";
    const payload: Buffer[] = [];
    for (const part of parts) {
        payload.push(Buffer.from(`--${boundary}\r\n`));
        if ("value" in part) {
            payload.push(
                Buffer.from(
                    `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`,
                ),
            );
        } else {
            payload.push(
                Buffer.from(
                    `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
                ),
                part.contents,
                Buffer.from("\r\n"),
            );
        }
    }
    payload.push(Buffer.from(`--${boundary}--\r\n`));
    return client.post(url, Buffer.concat(payload), {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
}

function onePixelPng(): Buffer {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        Buffer.from("89504e470d0a1a0a", "hex"),
        pngChunk("IHDR", header),
        pngChunk("IDAT", deflateSync(Buffer.from([0, 0x33, 0x66, 0x99, 0xff]))),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}

function pngChunk(type: string, contents: Buffer): Buffer {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(contents.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), contents])), 0);
    return Buffer.concat([head, contents, crc]);
}

function crc32(input: Buffer): number {
    let value = 0xffffffff;
    for (const byte of input) {
        value ^= byte;
        for (let bit = 0; bit < 8; bit += 1)
            value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    return (value ^ 0xffffffff) >>> 0;
}
