import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("collaboration HTTP API", () => {
    it("supports sync, files, search, and admin revocation", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            email: "admin@example.com",
            username: "admin_user",
            firstName: "Admin",
        });
        const member = await server.createUser({
            email: "member@example.com",
            username: "member_user",
            firstName: "Member",
        });
        expect(admin.role).toBe("admin");

        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const initialState = await asAdmin.get("/v0/sync/state");
        expect(initialState.statusCode).toBe(200);
        const state = initialState.json().state as { generation: string; sequence: string };

        const created = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Compiler Team",
            slug: "compiler-team",
        });
        expect(created.statusCode).toBe(201);
        const chatId = created.json().chat.id as string;
        await expectStatus(asMember, `/v0/chats/${chatId}/addMember`, { userId: member.id }, 404);
        await expectStatus(asAdmin, `/v0/chats/${chatId}/addMember`, { userId: member.id }, 200);

        const file = await uploadTextFile(asAdmin, "notes.txt", "compiler rollout");
        const sent = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Deployment completed successfully",
            attachmentFileIds: [file.id],
            clientMutationId: "message-one",
        });
        expect(sent.statusCode).toBe(201);
        const retried = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "ignored retry text",
            attachmentFileIds: [file.id],
            clientMutationId: "message-one",
        });
        expect(retried.json().message.id).toBe(sent.json().message.id);

        const memberFiles = await asMember.get("/v0/files");
        expect(memberFiles.json().files.map((item: { id: string }) => item.id)).toContain(file.id);
        const download = await asMember.get(`/v0/files/${file.id}`, {
            headers: { range: "bytes=0-7" },
        });
        expect(download.statusCode).toBe(206);
        expect(download.body).toBe("compiler");

        const search = await asMember.get("/v0/search?q=deplyment");
        expect(search.statusCode).toBe(200);
        expect(
            search.json().results.some((result: { type: string }) => result.type === "message"),
        ).toBe(true);

        const difference = await asMember.post("/v0/sync/getDifference", {
            state,
            limit: 100,
        });
        expect(difference.statusCode).toBe(200);
        expect(difference.json().changedChats.map((chat: { id: string }) => chat.id)).toContain(
            chatId,
        );

        await expectStatus(
            asAdmin,
            "/v0/admin/updateServer",
            { name: "Happy (2) Test", title: "First title" },
            200,
        );
        await expectStatus(asAdmin, "/v0/admin/updateServer", { title: null }, 200);
        const serverProfile = await asAdmin.get("/v0/server");
        expect(serverProfile.json().server).toMatchObject({ name: "Happy (2) Test" });
        expect(serverProfile.json().server).not.toHaveProperty("title");

        const ban = await asAdmin.post(`/v0/admin/users/${member.id}/banUser`);
        expect(ban.statusCode).toBe(200);
        const rejected = await asMember.get("/v0/chats");
        expect(rejected.statusCode).toBe(401);
    });
});

async function expectStatus(
    client: GymRequestClient,
    url: string,
    payload: Record<string, unknown>,
    status: number,
): Promise<void> {
    const response = await client.post(url, payload);
    expect(response.statusCode).toBe(status);
}

async function uploadTextFile(
    client: GymRequestClient,
    filename: string,
    contents: string,
): Promise<{ id: string }> {
    const boundary = "happy2-test-boundary";
    const payload = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${contents}\r\n--${boundary}--\r\n`,
    );
    const response = await client.post("/v0/files/upload", payload, {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(response.statusCode).toBe(201);
    return response.json().file;
}
