import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("document file attachments", () => {
    it("expands document-scoped access, protects referenced files, and cleans relations durably", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "document_file_owner" });
        const collaborator = await server.createUser({ username: "document_file_collaborator" });
        const outsider = await server.createUser({ username: "document_file_outsider" });
        const asOwner = server.as(owner);
        const asCollaborator = server.as(collaborator);
        const asOutsider = server.as(outsider);
        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Document files",
            slug: "document-files",
        });
        const chatId = channel.json().chat.id as string;
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: collaborator.id }))
                .statusCode,
        ).toBe(200);
        const created = await asOwner.post(`/v0/chats/${chatId}/createDocument`, {
            title: "Launch packet",
        });
        const documentId = created.json().document.id as string;
        expect(created.json().document.fileAttachments).toEqual([]);
        const ownerFile = await uploadFile(asOwner, "launch.txt", "Launch privately");
        const outsiderFile = await uploadFile(asOutsider, "secret.txt", "Not attachable");
        expect((await asCollaborator.get(`/v0/files/${ownerFile.id}`)).statusCode).toBe(404);
        expect(
            (
                await asOwner.post(`/v0/documents/${documentId}/attachFile`, {
                    fileId: outsiderFile.id,
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await asOutsider.post(`/v0/documents/${documentId}/attachFile`, {
                    fileId: ownerFile.id,
                })
            ).statusCode,
        ).toBe(404);
        const baseline = (await asCollaborator.get("/v0/sync/state")).json().state;

        const attached = await asOwner.post(`/v0/documents/${documentId}/attachFile`, {
            fileId: ownerFile.id,
        });
        expect(attached.statusCode).toBe(201);
        expect(attached.json()).toMatchObject({
            attachment: {
                file: {
                    id: ownerFile.id,
                    originalName: "launch.txt",
                    contentType: "text/plain",
                    uploadedByUserId: owner.id,
                },
                position: 0,
                attachedByUserId: owner.id,
            },
            document: {
                id: documentId,
                fileAttachments: [{ file: { id: ownerFile.id }, position: 0 }],
            },
            sync: { areas: ["documents"] },
        });
        const replayed = await asOwner.post(`/v0/documents/${documentId}/attachFile`, {
            fileId: ownerFile.id,
        });
        expect(replayed.statusCode).toBe(200);
        expect(replayed.json().document.fileAttachments).toHaveLength(1);
        expect(replayed.json()).not.toHaveProperty("sync");
        expect((await asCollaborator.get(`/v0/files/${ownerFile.id}`)).body).toBe(
            "Launch privately",
        );
        expect((await asOutsider.get(`/v0/files/${ownerFile.id}`)).statusCode).toBe(404);
        expect(
            (await asCollaborator.get(`/v0/documents/${documentId}`)).json().document
                .fileAttachments,
        ).toEqual([
            expect.objectContaining({ file: expect.objectContaining({ id: ownerFile.id }) }),
        ]);
        expect(
            (
                await asCollaborator.post(`/v0/documents/${documentId}/getDifference`, {
                    afterSequence: "0",
                })
            ).json().document.fileAttachments,
        ).toEqual([
            expect.objectContaining({ file: expect.objectContaining({ id: ownerFile.id }) }),
        ]);
        expect(
            (await asCollaborator.post("/v0/sync/getDifference", { state: baseline })).json().areas,
        ).toContain("documents");
        expect((await asOwner.post(`/v0/files/${ownerFile.id}/deleteFile`)).statusCode).toBe(409);

        const collaboratorFile = await uploadFile(
            asCollaborator,
            "review.txt",
            "Collaborator review",
        );
        const second = await asCollaborator.post(`/v0/documents/${documentId}/attachFile`, {
            fileId: collaboratorFile.id,
        });
        expect(second.statusCode).toBe(201);
        expect(second.json().attachment).toMatchObject({
            file: { id: collaboratorFile.id },
            position: 1,
            attachedByUserId: collaborator.id,
        });
        expect((await asOwner.get(`/v0/files/${collaboratorFile.id}`)).body).toBe(
            "Collaborator review",
        );

        await server.restart();
        expect(
            (await asCollaborator.get(`/v0/documents/${documentId}`)).json().document
                .fileAttachments,
        ).toEqual([
            expect.objectContaining({ file: expect.objectContaining({ id: ownerFile.id }) }),
            expect.objectContaining({ file: expect.objectContaining({ id: collaboratorFile.id }) }),
        ]);
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/removeMember`, { userId: collaborator.id }))
                .statusCode,
        ).toBe(200);
        expect((await asCollaborator.get(`/v0/files/${ownerFile.id}`)).statusCode).toBe(404);
        expect(
            (await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: collaborator.id }))
                .statusCode,
        ).toBe(200);
        expect((await asCollaborator.get(`/v0/files/${ownerFile.id}`)).statusCode).toBe(200);

        const detached = await asCollaborator.post(`/v0/documents/${documentId}/detachFile`, {
            fileId: ownerFile.id,
        });
        expect(detached.statusCode).toBe(200);
        expect(detached.json()).toMatchObject({
            fileId: ownerFile.id,
            document: {
                id: documentId,
                fileAttachments: [{ file: { id: collaboratorFile.id }, position: 1 }],
            },
            sync: { areas: ["documents"] },
        });
        expect((await asCollaborator.get(`/v0/files/${ownerFile.id}`)).statusCode).toBe(404);
        expect((await asOwner.post(`/v0/files/${ownerFile.id}/deleteFile`)).statusCode).toBe(200);
        expect(
            (
                await asCollaborator.post(`/v0/documents/${documentId}/detachFile`, {
                    fileId: ownerFile.id,
                })
            ).statusCode,
        ).toBe(404);

        expect((await asOwner.post(`/v0/documents/${documentId}/delete`, {})).statusCode).toBe(200);
        expect((await asOwner.get(`/v0/files/${collaboratorFile.id}`)).statusCode).toBe(404);
        expect(
            (await asCollaborator.post(`/v0/files/${collaboratorFile.id}/deleteFile`)).statusCode,
        ).toBe(200);
    });

    it("serializes concurrent idempotent replays and append positions", async () => {
        await using server = await createGymServer({ databaseMode: "file" });
        const owner = await server.createUser({ username: "document_file_race_owner" });
        const asOwner = server.as(owner);
        const created = await asOwner.post("/v0/documents/create", { title: "Concurrent files" });
        const documentId = created.json().document.id as string;
        const files = await Promise.all(
            ["one", "two", "three", "four"].map((name) => uploadFile(asOwner, `${name}.txt`, name)),
        );

        const replayed = await Promise.all([
            asOwner.post(`/v0/documents/${documentId}/attachFile`, { fileId: files[0]!.id }),
            asOwner.post(`/v0/documents/${documentId}/attachFile`, { fileId: files[0]!.id }),
        ]);
        expect(replayed.map((response) => response.statusCode).sort()).toEqual([200, 201]);
        const appended = await Promise.all(
            files
                .slice(1)
                .map((file) =>
                    asOwner.post(`/v0/documents/${documentId}/attachFile`, { fileId: file.id }),
                ),
        );
        expect(appended.map((response) => response.statusCode)).toEqual([201, 201, 201]);
        const attachments = (await asOwner.get(`/v0/documents/${documentId}`)).json().document
            .fileAttachments as Array<{ file: { id: string }; position: number }>;
        expect(new Set(attachments.map((attachment) => attachment.file.id))).toEqual(
            new Set(files.map((file) => file.id)),
        );
        expect(attachments.map((attachment) => attachment.position)).toEqual([0, 1, 2, 3]);
    });
});

interface UploadedFile {
    readonly id: string;
}

async function uploadFile(
    client: GymRequestClient,
    filename: string,
    contents: string,
): Promise<UploadedFile> {
    const boundary = "happy2-gym-document-file-boundary";
    const payload = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n`,
        ),
        Buffer.from(contents),
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await client.post("/v0/files/upload", payload, {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(response.statusCode).toBe(201);
    return response.json().file as UploadedFile;
}
