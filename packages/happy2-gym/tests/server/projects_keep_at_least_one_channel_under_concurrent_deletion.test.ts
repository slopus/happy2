import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("project channel deletion invariants", () => {
    it("keeps one live channel when both project channels are deleted concurrently", async () => {
        await using server = await createGymServer({ databaseMode: "file" });
        const owner = await server.createUser({ username: "project_deletion_owner" });
        const client = server.as(owner);

        const createdProject = await client.post("/v0/projects/createProject", {
            name: "Durable private project",
            initialChannel: {
                kind: "private_channel",
                name: "First private channel",
                slug: "first-private-channel",
            },
        });
        expect(createdProject.statusCode).toBe(201);
        const projectId = createdProject.json().project.id as string;
        const firstChatId = createdProject.json().chat.id as string;
        expect(createdProject.json().chat).toMatchObject({
            kind: "private_channel",
            projectId,
        });

        const soleChannelDeletion = await client.post(`/v0/chats/${firstChatId}/deleteChannel`, {});
        expect(soleChannelDeletion.statusCode).toBe(400);
        expect(projectChatIds(await chats(client), projectId)).toEqual([firstChatId]);

        const createdSecondChannel = await client.post("/v0/chats/createChannel", {
            projectId,
            kind: "private_channel",
            name: "Second private channel",
            slug: "second-private-channel",
        });
        expect(createdSecondChannel.statusCode).toBe(201);
        const secondChatId = createdSecondChannel.json().chat.id as string;
        expect(createdSecondChannel.json().chat.projectId).toBe(projectId);

        const deletions = await Promise.all([
            client.post(`/v0/chats/${firstChatId}/deleteChannel`, {}),
            client.post(`/v0/chats/${secondChatId}/deleteChannel`, {}),
        ]);
        expect(deletions.map((response) => response.statusCode).sort((a, b) => a - b)).toEqual([
            200, 400,
        ]);

        const survivingChatIds = projectChatIds(await chats(client), projectId);
        expect(survivingChatIds).toHaveLength(1);
        expect([firstChatId, secondChatId]).toContain(survivingChatIds[0]);

        await server.restart();
        expect(projectChatIds(await chats(client), projectId)).toEqual(survivingChatIds);
    });
});

interface Chat {
    id: string;
    projectId?: string;
}

async function chats(client: GymRequestClient): Promise<Chat[]> {
    const response = await client.get("/v0/chats");
    expect(response.statusCode).toBe(200);
    return response.json().chats as Chat[];
}

function projectChatIds(chats: Chat[], projectId: string): string[] {
    return chats.filter((chat) => chat.projectId === projectId).map((chat) => chat.id);
}
