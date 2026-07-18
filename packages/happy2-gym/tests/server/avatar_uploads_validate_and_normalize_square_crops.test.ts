import type { LightMyRequestResponse } from "fastify";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

interface AvatarCrop {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

interface UploadedAvatar {
    readonly id: string;
    readonly kind: "photo";
    readonly contentType: "image/jpeg";
    readonly width: number;
    readonly height: number;
    readonly isPublic: boolean;
    readonly thumbhash: string;
}

describe("avatar uploads validate and normalize square crops", () => {
    it("applies crop coordinates after orientation and persists one normalized square JPEG", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "avatar_crop_owner" });
        const viewer = await server.createUser({ username: "avatar_crop_viewer" });
        const asOwner = server.as(owner);
        const asViewer = server.as(viewer);
        const source = await orientedStripeJpeg();

        const privateAvatar = await uploadAvatar(
            asOwner,
            source,
            {
                x: 0,
                y: 100,
                width: 200,
                height: 200,
            },
            "private",
        );
        expect(privateAvatar).toMatchObject({
            kind: "photo",
            contentType: "image/jpeg",
            width: 1024,
            height: 1024,
            isPublic: false,
        });
        expect(privateAvatar.thumbhash.length).toBeGreaterThan(0);
        expect((await asOwner.get(`/v0/files/${privateAvatar.id}`)).statusCode).toBe(200);
        expect((await asViewer.get(`/v0/files/${privateAvatar.id}`)).statusCode).toBe(404);
        expect(
            (await asOwner.post("/v0/me/updateAvatar", { fileId: privateAvatar.id })).statusCode,
        ).toBe(400);

        const publicAvatar = await uploadAvatar(
            asOwner,
            source,
            {
                x: 0,
                y: 100,
                width: 200,
                height: 200,
            },
            "public",
        );
        const stored = await asViewer.get(`/v0/files/${publicAvatar.id}`);
        expect(stored.statusCode).toBe(200);
        const metadata = await sharp(stored.rawPayload).metadata();
        expect(metadata).toMatchObject({ format: "jpeg", width: 1024, height: 1024 });
        expect(metadata.orientation).toBeUndefined();
        const pixels = await sharp(stored.rawPayload).raw().toBuffer({ resolveWithObject: true });
        expectRgbNear(
            sampleRgb(pixels.data, pixels.info.width, pixels.info.channels, 512, 128),
            [20, 240, 20],
        );
        expectRgbNear(
            sampleRgb(pixels.data, pixels.info.width, pixels.info.channels, 512, 896),
            [20, 20, 240],
        );

        const mirroredAvatar = await uploadAvatar(
            asOwner,
            await orientedStripeJpeg(2),
            { x: 0, y: 0, width: 100, height: 100 },
            "public",
        );
        const mirroredPixels = await sharp(
            (await asViewer.get(`/v0/files/${mirroredAvatar.id}`)).rawPayload,
        )
            .raw()
            .toBuffer({ resolveWithObject: true });
        expectRgbNear(
            sampleRgb(
                mirroredPixels.data,
                mirroredPixels.info.width,
                mirroredPixels.info.channels,
                512,
                512,
            ),
            [20, 20, 240],
        );

        expect(
            (await asViewer.post("/v0/me/updateAvatar", { fileId: publicAvatar.id })).statusCode,
        ).toBe(400);
        const updated = await asOwner.post("/v0/me/updateAvatar", { fileId: publicAvatar.id });
        expect(updated.statusCode).toBe(200);
        expect(updated.json().user).toMatchObject({ id: owner.id, photoFileId: publicAvatar.id });
        expect((await asViewer.get("/v0/contacts")).json().users).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: owner.id, photoFileId: publicAvatar.id }),
            ]),
        );

        await server.restart();

        expect((await asOwner.get("/v0/me")).json().user.photoFileId).toBe(publicAvatar.id);
        expect((await asViewer.get(`/v0/files/${publicAvatar.id}`)).statusCode).toBe(200);
        expect((await asViewer.get(`/v0/files/${privateAvatar.id}`)).statusCode).toBe(404);
    });

    it("rejects unsafe image inputs and invalid crop contracts before persistence", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "avatar_validation_owner" });
        const asOwner = server.as(owner);
        const square = await solidPng(32, 32);
        const animation = animatedGif();
        expect((await sharp(animation, { animated: true }).metadata()).pages).toBe(2);
        const cases: ReadonlyArray<{
            readonly name: string;
            readonly contents: Buffer;
            readonly crop?: unknown;
            readonly expectedError: string;
        }> = [
            {
                name: "missing crop",
                contents: square,
                expectedError: "invalid_avatar_crop",
            },
            {
                name: "malformed crop",
                contents: square,
                crop: { x: 0, y: 0, width: 32 },
                expectedError: "invalid_avatar_crop",
            },
            {
                name: "non-square crop",
                contents: square,
                crop: { x: 0, y: 0, width: 32, height: 31 },
                expectedError: "invalid_avatar",
            },
            {
                name: "out-of-bounds crop",
                contents: square,
                crop: { x: 1, y: 0, width: 32, height: 32 },
                expectedError: "invalid_avatar",
            },
            {
                name: "negative crop origin",
                contents: square,
                crop: { x: -1, y: 0, width: 16, height: 16 },
                expectedError: "invalid_avatar",
            },
            {
                name: "zero-size crop",
                contents: square,
                crop: { x: 0, y: 0, width: 0, height: 0 },
                expectedError: "invalid_avatar",
            },
            {
                name: "fractional crop",
                contents: square,
                crop: { x: 0, y: 0, width: 16.5, height: 16.5 },
                expectedError: "invalid_avatar_crop",
            },
            {
                name: "corrupt image",
                contents: Buffer.from("not an image"),
                crop: { x: 0, y: 0, width: 1, height: 1 },
                expectedError: "invalid_avatar",
            },
            {
                name: "animated image",
                contents: animation,
                crop: { x: 0, y: 0, width: 1, height: 1 },
                expectedError: "invalid_avatar",
            },
            {
                name: "oversized dimensions",
                contents: await solidPng(2049, 1),
                crop: { x: 0, y: 0, width: 1, height: 1 },
                expectedError: "invalid_avatar",
            },
            {
                name: "oversized bytes",
                contents: Buffer.alloc(10 * 1024 * 1024 + 1),
                crop: { x: 0, y: 0, width: 1, height: 1 },
                expectedError: "invalid_avatar",
            },
        ];

        for (const fixture of cases) {
            const response = await avatarRequest(asOwner, fixture.contents, fixture.crop, "public");
            expect(response.statusCode, fixture.name).toBe(400);
            expect(response.json().error, fixture.name).toBe(fixture.expectedError);
        }
        expect((await asOwner.get("/v0/files?kind=photo")).json().files).toEqual([]);
    });
});

async function uploadAvatar(
    client: GymRequestClient,
    contents: Buffer,
    crop: AvatarCrop,
    visibility: "public" | "private",
): Promise<UploadedAvatar> {
    const response = await avatarRequest(client, contents, crop, visibility);
    expect(response.statusCode).toBe(201);
    return response.json().file as UploadedAvatar;
}

function avatarRequest(
    client: GymRequestClient,
    contents: Buffer,
    crop: unknown,
    visibility: "public" | "private",
): Promise<LightMyRequestResponse> {
    return postMultipart(client, "/v0/me/uploadAvatarFile", [
        { name: "visibility", value: visibility },
        {
            name: "file",
            filename: "avatar-source",
            contentType: "application/octet-stream",
            contents,
        },
        ...(crop === undefined ? [] : [{ name: "crop", value: JSON.stringify(crop) }]),
    ]);
}

async function postMultipart(
    client: GymRequestClient,
    url: string,
    parts: Array<
        | { name: string; value: string }
        | { name: string; filename: string; contentType: string; contents: Buffer }
    >,
): Promise<LightMyRequestResponse> {
    const boundary = "happy2-gym-avatar-crop-boundary";
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

async function orientedStripeJpeg(orientation = 6): Promise<Buffer> {
    const width = 300;
    const height = 200;
    const channels = 3;
    const pixels = Buffer.alloc(width * height * channels);
    const colors = [
        [240, 20, 20],
        [20, 240, 20],
        [20, 20, 240],
    ] as const;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const color = colors[Math.floor(x / 100)]!;
            const offset = (y * width + x) * channels;
            pixels[offset] = color[0];
            pixels[offset + 1] = color[1];
            pixels[offset + 2] = color[2];
        }
    }
    return sharp(pixels, { raw: { width, height, channels } })
        .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
        .withMetadata({ orientation })
        .toBuffer();
}

function solidPng(width: number, height: number): Promise<Buffer> {
    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { r: 51, g: 102, b: 153, alpha: 1 },
        },
    })
        .png()
        .toBuffer();
}

function animatedGif(): Buffer {
    return Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAAh+QQBAAAAACwAAAAAAQABAAACAUQAOw==",
        "base64",
    );
}

function sampleRgb(
    pixels: Buffer,
    width: number,
    channels: number,
    x: number,
    y: number,
): readonly number[] {
    const offset = (y * width + x) * channels;
    return [...pixels.subarray(offset, offset + 3)];
}

function expectRgbNear(actual: readonly number[], expected: readonly number[]): void {
    expect(actual).toHaveLength(3);
    for (let channel = 0; channel < 3; channel += 1)
        expect(Math.abs(actual[channel]! - expected[channel]!)).toBeLessThanOrEqual(20);
}
