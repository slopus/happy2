import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

/**
 * These are normal black-box expectations: a chat or bot photo advertised to a
 * viewer must be readable by that viewer, even when its original upload was
 * private. The resource reference itself makes that media part of the visible
 * product surface.
 */
describe("referenced media visibility expectations", () => {
    it("should grant a private channel photo to every current channel member", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "channel_photo_owner" });
        const member = await server.createUser({ username: "channel_photo_member" });
        const asOwner = server.as(owner);
        const asMember = server.as(member);
        const photo = await uploadPhoto(asOwner, "channel-photo.png");
        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Photo visibility",
            slug: "photo-visibility",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/updateChannel`, {
                    photoFileId: photo.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asMember.get(`/v0/chats/${chatId}`)).json().chat).toMatchObject({
            photoFileId: photo.id,
        });

        await server.restart();

        // Expected: a member can render the channel photo returned by the chat API.
        // Actual at the time of writing: 404 because channel photo references do not
        // participate in file authorization.
        expect((await asMember.get(`/v0/files/${photo.id}`)).statusCode).toBe(200);
    });

    it("should grant a private bot photo to members who can see that bot's messages", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "bot_photo_admin" });
        const member = await server.createUser({ username: "bot_photo_member" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const photo = await uploadPhoto(asAdmin, "bot-photo.png");
        const bot = await asAdmin.post("/v0/admin/bots/createBot", {
            name: "Photo Bot",
            username: "photo_bot",
            photoFileId: photo.id,
        });
        expect(bot.statusCode).toBe(201);
        const botId = bot.json().bot.id as string;
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Bot photo visibility",
            slug: "bot-photo-visibility",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        const message = await asAdmin.post("/v0/admin/sendAutomatedMessage", {
            chatId,
            botId,
            text: "The bot's identity includes its configured photo.",
        });
        expect(message.statusCode).toBe(201);
        const messageId = message.json().message.id as string;
        expect((await asMember.get(`/v0/messages/${messageId}`)).json().message).toMatchObject({
            senderBot: { id: botId, photoFileId: photo.id },
        });

        await server.restart();

        // Expected: a recipient can render the bot photo advertised with its message.
        // Actual at the time of writing: 404 because bot photo references do not
        // participate in file authorization.
        expect((await asMember.get(`/v0/files/${photo.id}`)).statusCode).toBe(200);
    });
});

async function uploadPhoto(client: GymRequestClient, filename: string): Promise<{ id: string }> {
    const boundary = "rigged-gym-reference-photo";
    const response = await client.post(
        "/v0/files/upload",
        Buffer.concat([
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
            ),
            onePixelPng(),
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
        { headers: { "content-type": `multipart/form-data; boundary=${boundary}` } },
    );
    expect(response.statusCode).toBe(201);
    expect(response.json().file).toMatchObject({ kind: "photo", contentType: "image/png" });
    return response.json().file;
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
    const header = Buffer.alloc(8);
    header.writeUInt32BE(contents.length, 0);
    header.write(type, 4, "ascii");
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), contents])), 0);
    return Buffer.concat([header, contents, checksum]);
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
