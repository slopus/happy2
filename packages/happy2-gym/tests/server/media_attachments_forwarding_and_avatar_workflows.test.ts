import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("media attachments, forwarding, and avatar workflows", () => {
    it("classifies multipart media by signature and grants only shared-chat readers access across restart", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "media_owner", firstName: "Owner" });
        const member = await server.createUser({ username: "media_member", firstName: "Member" });
        const outsider = await server.createUser({
            username: "media_outsider",
            firstName: "Outsider",
        });
        const asOwner = server.as(owner);
        const asMember = server.as(member);
        const asOutsider = server.as(outsider);

        const text = await uploadAttachment(
            asOwner,
            "release-notes.txt",
            "text/plain",
            Buffer.from("private release notes\n"),
        );
        const photo = await uploadAttachment(
            asOwner,
            "renamed-binary.dat",
            "application/octet-stream",
            onePixelPng(),
        );
        const gif = await uploadAttachment(
            asOwner,
            "animated-as-data.bin",
            "application/octet-stream",
            onePixelGif(),
        );
        const video = await uploadAttachment(
            asOwner,
            "clip-as-text.txt",
            "text/plain",
            mp4Signature(),
        );

        expect(text).toMatchObject({ kind: "file", contentType: "text/plain" });
        expect(photo).toMatchObject({
            kind: "photo",
            contentType: "image/png",
            width: 1,
            height: 1,
            thumbnailUrl: `/v0/files/${photo.id}/thumbnail`,
            previewUrl: `/v0/files/${photo.id}/preview`,
        });
        expect(gif).toMatchObject({
            kind: "gif",
            contentType: "image/gif",
            width: 1,
            height: 1,
            thumbnailUrl: `/v0/files/${gif.id}/thumbnail`,
            previewUrl: `/v0/files/${gif.id}/preview`,
        });
        expect(video).toMatchObject({ kind: "video", contentType: "video/mp4" });

        expect((await asOwner.get(`/v0/files/${text.id}`)).body).toBe("private release notes\n");
        await expectMediaVariants(asOwner, photo.id);
        await expectMediaVariants(asOwner, gif.id);
        expect((await asOwner.get(`/v0/files/${text.id}/thumbnail`)).statusCode).toBe(404);
        expect((await asOwner.get(`/v0/files/${video.id}/preview`)).statusCode).toBe(404);
        for (const fileId of [text.id, photo.id, gif.id, video.id]) {
            expect((await asMember.get(`/v0/files/${fileId}`)).statusCode).toBe(404);
            expect((await asOutsider.get(`/v0/files/${fileId}`)).statusCode).toBe(404);
        }
        expect((await asMember.get(`/v0/files/${photo.id}/preview`)).statusCode).toBe(404);
        expect((await asOutsider.get(`/v0/files/${gif.id}/thumbnail`)).statusCode).toBe(404);

        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Media sharing",
            slug: "media-sharing",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        const shared = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "All media attachment kinds are in this private chat.",
            attachmentFileIds: [text.id, photo.id, gif.id, video.id],
        });
        expect(shared.statusCode).toBe(201);
        expect(shared.json().message.attachments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: text.id, kind: "file" }),
                expect.objectContaining({ id: photo.id, kind: "photo" }),
                expect.objectContaining({ id: gif.id, kind: "gif" }),
                expect.objectContaining({ id: video.id, kind: "video" }),
            ]),
        );
        for (const fileId of [text.id, photo.id, gif.id, video.id])
            expect((await asMember.get(`/v0/files/${fileId}`)).statusCode).toBe(200);
        expect((await asMember.get(`/v0/files/${text.id}`)).body).toBe("private release notes\n");
        await expectMediaVariants(asMember, photo.id);
        await expectMediaVariants(asMember, gif.id);
        expect((await asOutsider.get(`/v0/files/${photo.id}`)).statusCode).toBe(404);
        expect((await asOutsider.get(`/v0/files/${photo.id}/preview`)).statusCode).toBe(404);
        expect(
            (await asMember.get("/v0/files?kind=photo"))
                .json()
                .files.map((file: { id: string }) => file.id),
        ).toContain(photo.id);
        expect(
            (await asMember.get("/v0/files?kind=gif"))
                .json()
                .files.map((file: { id: string }) => file.id),
        ).toContain(gif.id);
        expect(
            (await asMember.get("/v0/files?kind=video"))
                .json()
                .files.map((file: { id: string }) => file.id),
        ).toContain(video.id);

        await server.restart();

        expect((await asMember.get(`/v0/files/${text.id}`)).body).toBe("private release notes\n");
        await expectMediaVariants(asMember, photo.id);
        await expectMediaVariants(asMember, gif.id);
        expect((await asOutsider.get(`/v0/files/${text.id}`)).statusCode).toBe(404);
        expect((await asOutsider.get(`/v0/files/${photo.id}/thumbnail`)).statusCode).toBe(404);
    });

    it("requires a public, owner-uploaded avatar while preserving private avatar file privacy", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "avatar_owner", firstName: "Owner" });
        const viewer = await server.createUser({ username: "avatar_viewer", firstName: "Viewer" });
        const asOwner = server.as(owner);
        const asViewer = server.as(viewer);

        const privateAvatar = await uploadAvatar(asOwner, "private", onePixelPng());
        expect(privateAvatar).toMatchObject({
            kind: "photo",
            isPublic: false,
            contentType: "image/jpeg",
        });
        expect((await asOwner.get(`/v0/files/${privateAvatar.id}`)).statusCode).toBe(200);
        expect((await asViewer.get(`/v0/files/${privateAvatar.id}`)).statusCode).toBe(404);
        expect(
            (await asOwner.post("/v0/me/updateAvatar", { fileId: privateAvatar.id })).statusCode,
        ).toBe(400);

        const publicAvatar = await uploadAvatar(asOwner, "public", onePixelPng());
        expect(publicAvatar).toMatchObject({
            kind: "photo",
            isPublic: true,
            contentType: "image/jpeg",
        });
        expect((await asViewer.get(`/v0/files/${publicAvatar.id}`)).statusCode).toBe(200);
        expect(
            (await asViewer.post("/v0/me/updateAvatar", { fileId: publicAvatar.id })).statusCode,
        ).toBe(400);
        const updated = await asOwner.post("/v0/me/updateAvatar", { fileId: publicAvatar.id });
        expect(updated.statusCode).toBe(200);
        expect(updated.json().user).toMatchObject({ id: owner.id, photoFileId: publicAvatar.id });
        expect((await asOwner.get("/v0/me")).json().user.photoFileId).toBe(publicAvatar.id);
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

    it("grants forwarded attachments to destination members without exposing the source chat", async () => {
        await using server = await createGymServer();
        const sender = await server.createUser({
            username: "forward_media_sender",
            firstName: "Sender",
        });
        const sourceMember = await server.createUser({
            username: "forward_media_source",
            firstName: "Source member",
        });
        const destinationMember = await server.createUser({
            username: "forward_media_destination",
            firstName: "Destination member",
        });
        const asSender = server.as(sender);
        const asSourceMember = server.as(sourceMember);
        const asDestinationMember = server.as(destinationMember);
        const attachment = await uploadAttachment(
            asSender,
            "forwarded-photo.bin",
            "application/octet-stream",
            onePixelPng(),
        );

        const source = await asSender.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Forward source media",
            slug: "forward-source-media",
        });
        const destination = await asSender.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Forward destination media",
            slug: "forward-destination-media",
        });
        expect(source.statusCode).toBe(201);
        expect(destination.statusCode).toBe(201);
        const sourceChatId = source.json().chat.id as string;
        const destinationChatId = destination.json().chat.id as string;
        expect(
            (
                await asSender.post(`/v0/chats/${sourceChatId}/addMember`, {
                    userId: sourceMember.id,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asSender.post(`/v0/chats/${destinationChatId}/addMember`, {
                    userId: destinationMember.id,
                })
            ).statusCode,
        ).toBe(200);
        const original = await asSender.post(`/v0/chats/${sourceChatId}/sendMessage`, {
            text: "This attachment can be forwarded without disclosing its source.",
            attachmentFileIds: [attachment.id],
        });
        expect(original.statusCode).toBe(201);
        const originalMessageId = original.json().message.id as string;
        expect((await asSourceMember.get(`/v0/files/${attachment.id}`)).statusCode).toBe(200);
        expect((await asDestinationMember.get(`/v0/files/${attachment.id}`)).statusCode).toBe(404);
        expect(
            (await asDestinationMember.get(`/v0/files/${attachment.id}/preview`)).statusCode,
        ).toBe(404);

        const forwarded = await asSender.post(`/v0/messages/${originalMessageId}/forwardMessage`, {
            targetChatIds: [destinationChatId],
        });
        expect(forwarded.statusCode).toBe(201);
        const forwardedMessageId = forwarded.json().messages[0].id as string;
        expect(forwarded.json().messages[0]).toMatchObject({
            id: forwardedMessageId,
            chatId: destinationChatId,
            attachments: [expect.objectContaining({ id: attachment.id })],
        });
        expect((await asDestinationMember.get(`/v0/chats/${sourceChatId}`)).statusCode).toBe(404);
        const destinationMessage = await asDestinationMember.get(
            `/v0/messages/${forwardedMessageId}`,
        );
        expect(destinationMessage.statusCode).toBe(200);
        expect(destinationMessage.json().message).toMatchObject({
            id: forwardedMessageId,
            attachments: [expect.objectContaining({ id: attachment.id })],
        });
        expect(destinationMessage.json().message).not.toHaveProperty("forwardedFrom");
        expect((await asDestinationMember.get(`/v0/files/${attachment.id}`)).statusCode).toBe(200);
        await expectMediaVariants(asDestinationMember, attachment.id);

        await server.restart();

        expect((await asDestinationMember.get(`/v0/files/${attachment.id}`)).statusCode).toBe(200);
        await expectMediaVariants(asDestinationMember, attachment.id);
        expect((await asDestinationMember.get(`/v0/chats/${sourceChatId}`)).statusCode).toBe(404);
    });
});

interface UploadedFile {
    id: string;
    kind: "file" | "photo" | "gif" | "video";
    contentType: string;
    width?: number;
    height?: number;
    thumbnailUrl?: string;
    previewUrl?: string;
    isPublic: boolean;
}

async function uploadAttachment(
    client: GymRequestClient,
    filename: string,
    contentType: string,
    contents: Buffer,
): Promise<UploadedFile> {
    const response = await postMultipart(client, "/v0/files/upload", [
        { name: "file", filename, contentType, contents },
    ]);
    expect(response.statusCode).toBe(201);
    return response.json().file as UploadedFile;
}

async function uploadAvatar(
    client: GymRequestClient,
    visibility: "public" | "private",
    contents: Buffer,
): Promise<UploadedFile> {
    const response = await postMultipart(client, "/v0/me/uploadAvatarFile", [
        { name: "visibility", value: visibility },
        { name: "file", filename: "avatar.png", contentType: "image/png", contents },
    ]);
    expect(response.statusCode).toBe(201);
    return response.json().file as UploadedFile;
}

async function expectMediaVariants(client: GymRequestClient, fileId: string): Promise<void> {
    for (const variant of ["thumbnail", "preview"] as const) {
        const response = await client.get(`/v0/files/${fileId}/${variant}`);
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toBe("image/webp");
        expect(Number(response.headers["content-length"])).toBeGreaterThan(0);
    }
}

async function postMultipart(
    client: GymRequestClient,
    url: string,
    parts: Array<
        | { name: string; value: string }
        | { name: string; filename: string; contentType: string; contents: Buffer }
    >,
) {
    const boundary = "happy2-gym-media-boundary";
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

function onePixelGif(): Buffer {
    return Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
}

function mp4Signature(): Buffer {
    return Buffer.concat([Buffer.from("000000186674797069736f6d", "hex"), Buffer.alloc(24)]);
}
