import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("projects group every public and private channel", () => {
    it("provisions a default project and durably groups explicit, defaulted, and child channels without widening privacy", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({
            username: "project_owner",
            firstName: "Project owner",
        });
        const outsider = await server.createUser({
            username: "project_outsider",
            firstName: "Project outsider",
        });
        const asOwner = server.as(owner);
        const asOutsider = server.as(outsider);

        const initialProjects = await projects(asOwner);
        const initialChats = await chats(asOwner);
        const welcome = chatBySlug(initialChats, "welcome");
        expect(welcome).toMatchObject({
            kind: "public_channel",
            projectId: expect.any(String),
        });
        const defaultProjectId = welcome.projectId as string;
        expect(projectById(initialProjects, defaultProjectId)).toMatchObject({
            id: defaultProjectId,
        });
        expect(initialProjects).toHaveLength(1);

        const defaultAgentConversation = initialChats.find(
            (chat) => chat.isDefaultAgentConversation === true,
        );
        expect(defaultAgentConversation).toMatchObject({ kind: "dm" });
        expect(defaultAgentConversation).not.toHaveProperty("projectId");

        const direct = await asOwner.post("/v0/chats/createDirectMessage", {
            userId: outsider.id,
        });
        expect(direct.statusCode).toBe(201);
        expect(direct.json().chat).toMatchObject({ kind: "dm", dmType: "direct" });
        expect(direct.json().chat).not.toHaveProperty("projectId");

        const defaulted = await asOwner.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Default project channel",
            slug: "default-project-channel",
        });
        expect(defaulted.statusCode).toBe(201);
        expect(defaulted.json().chat).toMatchObject({
            kind: "public_channel",
            projectId: defaultProjectId,
        });

        const unknownProject = await asOwner.post("/v0/chats/createChannel", {
            projectId: "unknown-project",
            kind: "public_channel",
            name: "Nowhere",
            slug: "nowhere",
        });
        expect(unknownProject.statusCode).toBe(404);

        const beforePublicProject = await syncState(asOwner);
        const publicCreation = await asOwner.post("/v0/projects/createProject", {
            name: "Public launch",
            description: "A visible project with its required first channel.",
            initialChannel: {
                kind: "public_channel",
                name: "Launch planning",
                slug: "launch-planning",
                topic: "Coordinate the public launch",
            },
        });
        expect(publicCreation.statusCode).toBe(201);
        const publicProject = publicCreation.json().project as Project;
        const publicChannel = publicCreation.json().chat as Chat;
        expect(publicProject).toMatchObject({
            id: expect.any(String),
            name: "Public launch",
            description: "A visible project with its required first channel.",
        });
        expect(publicChannel).toMatchObject({
            kind: "public_channel",
            name: "Launch planning",
            slug: "launch-planning",
            topic: "Coordinate the public launch",
            projectId: publicProject.id,
        });
        expect(publicCreation.json().sync).toBeDefined();

        const projectDifference = await asOwner.post("/v0/sync/getDifference", {
            state: beforePublicProject,
            limit: 100,
        });
        expect(projectDifference.statusCode).toBe(200);
        expect(projectDifference.json().areas).toContain("projects");
        expect(
            projectDifference.json().changedChats.map((chat: { id: string }) => chat.id),
        ).toContain(publicChannel.id);

        const explicitPublic = await asOwner.post("/v0/chats/createChannel", {
            projectId: publicProject.id,
            kind: "public_channel",
            name: "Public follow-up",
            slug: "public-follow-up",
        });
        expect(explicitPublic.statusCode).toBe(201);
        expect(explicitPublic.json().chat.projectId).toBe(publicProject.id);

        const beforePrivateProject = await syncState(asOutsider);
        const privateCreation = await asOwner.post("/v0/projects/createProject", {
            name: "Private research",
            initialChannel: {
                kind: "private_channel",
                name: "Research notes",
                slug: "research-notes",
                topic: "Confidential research",
            },
        });
        expect(privateCreation.statusCode).toBe(201);
        const privateProject = privateCreation.json().project as Project;
        const privateChannel = privateCreation.json().chat as Chat;
        expect(privateChannel).toMatchObject({
            kind: "private_channel",
            projectId: privateProject.id,
        });
        const privateOutsiderDifference = await asOutsider.post("/v0/sync/getDifference", {
            state: beforePrivateProject,
            limit: 100,
        });
        expect(privateOutsiderDifference.statusCode).toBe(200);
        expect(privateOutsiderDifference.json().areas).not.toContain("projects");
        expect(
            privateOutsiderDifference.json().changedChats.map((chat: { id: string }) => chat.id),
        ).not.toContain(privateChannel.id);
        expect(
            (
                await asOutsider.post("/v0/chats/createChannel", {
                    projectId: privateProject.id,
                    kind: "public_channel",
                    name: "Leaked project attachment",
                    slug: "leaked-project-attachment",
                })
            ).statusCode,
        ).toBe(404);

        const explicitPrivate = await asOwner.post("/v0/chats/createChannel", {
            projectId: privateProject.id,
            kind: "private_channel",
            name: "Private follow-up",
            slug: "private-follow-up",
        });
        expect(explicitPrivate.statusCode).toBe(201);
        expect(explicitPrivate.json().chat.projectId).toBe(privateProject.id);

        const child = await asOwner.post(`/v0/chats/${privateChannel.id}/createChildChannel`, {
            name: "Research experiment",
            slug: "research-experiment",
            topic: "An inherited project conversation",
        });
        expect(child.statusCode).toBe(201);
        expect(child.json().chat).toMatchObject({
            parentChatId: privateChannel.id,
            projectId: privateProject.id,
        });

        expect((await asOutsider.get(`/v0/chats/${privateChannel.id}`)).statusCode).toBe(404);
        expect(
            (await asOutsider.get(`/v0/chats/${child.json().chat.id as string}`)).statusCode,
        ).toBe(404);
        expect((await projects(asOutsider)).map((project) => project.id)).not.toContain(
            privateProject.id,
        );
        const outsiderChatIds = (await chats(asOutsider)).map((chat) => chat.id);
        expect(outsiderChatIds).not.toContain(privateChannel.id);
        expect(outsiderChatIds).not.toContain(child.json().chat.id);
        expect((await projects(asOutsider)).map((project) => project.id)).toContain(
            publicProject.id,
        );

        const beforeMembershipGrant = await syncState(asOutsider);
        const membershipGrant = await asOwner.post(`/v0/chats/${privateChannel.id}/addMember`, {
            userId: outsider.id,
        });
        expect(membershipGrant.statusCode).toBe(200);
        const grantedDifference = await asOutsider.post("/v0/sync/getDifference", {
            state: beforeMembershipGrant,
            limit: 100,
        });
        expect(grantedDifference.statusCode).toBe(200);
        expect(grantedDifference.json().areas).toContain("projects");
        expect(
            grantedDifference.json().changedChats.map((chat: { id: string }) => chat.id),
        ).toContain(privateChannel.id);
        expect((await projects(asOutsider)).map((project) => project.id)).toContain(
            privateProject.id,
        );

        const beforeMembershipRemoval = await syncState(asOutsider);
        const membershipRemoval = await asOwner.post(
            `/v0/chats/${privateChannel.id}/removeMember`,
            { userId: outsider.id },
        );
        expect(membershipRemoval.statusCode).toBe(200);
        const removedDifference = await asOutsider.post("/v0/sync/getDifference", {
            state: beforeMembershipRemoval,
            limit: 100,
        });
        expect(removedDifference.statusCode).toBe(200);
        expect(removedDifference.json().areas).toContain("projects");
        expect(removedDifference.json().removedChatIds).toContain(privateChannel.id);
        expect((await projects(asOutsider)).map((project) => project.id)).not.toContain(
            privateProject.id,
        );

        const beforePublicExposure = await syncState(asOutsider);
        const exposedChannel = await asOwner.post("/v0/chats/createChannel", {
            projectId: privateProject.id,
            kind: "public_channel",
            name: "Published research",
            slug: "published-research",
        });
        expect(exposedChannel.statusCode).toBe(201);
        const exposedDifference = await asOutsider.post("/v0/sync/getDifference", {
            state: beforePublicExposure,
            limit: 100,
        });
        expect(exposedDifference.statusCode).toBe(200);
        expect(exposedDifference.json().areas).toContain("projects");
        expect(
            exposedDifference.json().changedChats.map((chat: { id: string }) => chat.id),
        ).toContain(exposedChannel.json().chat.id);
        expect((await projects(asOutsider)).map((project) => project.id)).toContain(
            privateProject.id,
        );

        const exposedChannelId = exposedChannel.json().chat.id as string;
        const beforeHidingPublicChannel = await syncState(asOutsider);
        const hiddenChannel = await asOwner.post(`/v0/chats/${exposedChannelId}/updateChannel`, {
            isListed: false,
        });
        expect(hiddenChannel.statusCode).toBe(200);
        const hiddenDifference = await asOutsider.post("/v0/sync/getDifference", {
            state: beforeHidingPublicChannel,
            limit: 100,
        });
        expect(hiddenDifference.statusCode).toBe(200);
        expect(hiddenDifference.json().areas).toContain("projects");
        expect(hiddenDifference.json().removedChatIds).toContain(exposedChannelId);
        expect((await projects(asOutsider)).map((project) => project.id)).not.toContain(
            privateProject.id,
        );

        const beforeShowingPublicChannel = await syncState(asOutsider);
        const shownChannel = await asOwner.post(`/v0/chats/${exposedChannelId}/updateChannel`, {
            isListed: true,
        });
        expect(shownChannel.statusCode).toBe(200);
        const shownDifference = await asOutsider.post("/v0/sync/getDifference", {
            state: beforeShowingPublicChannel,
            limit: 100,
        });
        expect(shownDifference.statusCode).toBe(200);
        expect(shownDifference.json().areas).toContain("projects");
        expect(
            shownDifference.json().changedChats.map((chat: { id: string }) => chat.id),
        ).toContain(exposedChannelId);

        const beforePublicChannelDeletion = await syncState(asOutsider);
        const deletedChannel = await asOwner.post(`/v0/chats/${exposedChannelId}/deleteChannel`, {
            reason: "Return the project to private work",
        });
        expect(deletedChannel.statusCode).toBe(200);
        const deletedDifference = await asOutsider.post("/v0/sync/getDifference", {
            state: beforePublicChannelDeletion,
            limit: 100,
        });
        expect(deletedDifference.statusCode).toBe(200);
        expect(deletedDifference.json().areas).toContain("projects");
        expect(deletedDifference.json().removedChatIds).toContain(exposedChannelId);
        expect((await projects(asOutsider)).map((project) => project.id)).not.toContain(
            privateProject.id,
        );

        const ownerProjects = await projects(asOwner);
        const ownerChannels = (await chats(asOwner)).filter(
            (chat) => chat.kind === "public_channel" || chat.kind === "private_channel",
        );
        for (const project of ownerProjects)
            expect(ownerChannels.some((chat) => chat.projectId === project.id)).toBe(true);

        await server.restart();
        expect(projectById(await projects(asOwner), publicProject.id)).toMatchObject({
            name: "Public launch",
        });
        expect(projectById(await projects(asOwner), privateProject.id)).toMatchObject({
            name: "Private research",
        });
        expect(chatBySlug(await chats(asOwner), "public-follow-up").projectId).toBe(
            publicProject.id,
        );
        expect(chatBySlug(await chats(asOwner), "private-follow-up").projectId).toBe(
            privateProject.id,
        );
        expect(chatBySlug(await chats(asOwner), "research-experiment").projectId).toBe(
            privateProject.id,
        );
        expect((await chats(asOutsider)).map((chat) => chat.slug)).not.toContain(
            "published-research",
        );
    });

    it("targets private project realtime hints without publishing their projects area server-wide", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "project_realtime_owner" });
        const administrator = await server.createUser({
            username: "project_realtime_administrator",
        });
        const outsider = await server.createUser({ username: "project_realtime_outsider" });
        const asOwner = server.as(owner);
        const asAdministrator = server.as(administrator);
        expect(
            (
                await asOwner.post(`/v0/admin/users/${administrator.id}/updateUser`, {
                    role: "admin",
                })
            ).statusCode,
        ).toBe(200);
        const baseUrl = await server.listen();
        const ownerAbort = new AbortController();
        const administratorAbort = new AbortController();
        const outsiderAbort = new AbortController();
        const ownerEvents = new SseFrames(
            (
                await fetch(`${baseUrl}/v0/sync/events`, {
                    headers: { authorization: `Bearer ${owner.token}` },
                    signal: ownerAbort.signal,
                })
            ).body!.getReader(),
        );
        const administratorEvents = new SseFrames(
            (
                await fetch(`${baseUrl}/v0/sync/events`, {
                    headers: { authorization: `Bearer ${administrator.token}` },
                    signal: administratorAbort.signal,
                })
            ).body!.getReader(),
        );
        const outsiderEvents = new SseFrames(
            (
                await fetch(`${baseUrl}/v0/sync/events`, {
                    headers: { authorization: `Bearer ${outsider.token}` },
                    signal: outsiderAbort.signal,
                })
            ).body!.getReader(),
        );
        expect((await ownerEvents.next()).name).toBe("ready");
        expect((await administratorEvents.next()).name).toBe("ready");
        expect((await outsiderEvents.next()).name).toBe("ready");

        const administratorBeforePrivateProject = await syncState(asAdministrator);
        const privateCreation = await asOwner.post("/v0/projects/createProject", {
            name: "Realtime private",
            initialChannel: {
                kind: "private_channel",
                name: "Private realtime",
                slug: "private-realtime",
            },
        });
        expect(privateCreation.statusCode).toBe(201);
        const ownerPrivateHint = await ownerEvents.until(
            (frame) =>
                frame.name === "sync" &&
                (frame.data as { areas?: string[] }).areas?.includes("projects") === true,
        );
        expect(ownerPrivateHint.data).toMatchObject({
            sequence: privateCreation.json().sync.sequence,
            areas: expect.arrayContaining(["projects"]),
        });
        const administratorPrivateHint = await administratorEvents.until(
            (frame) =>
                frame.name === "sync" &&
                (frame.data as { areas?: string[] }).areas?.includes("projects") === true,
        );
        expect(administratorPrivateHint.data).toMatchObject({
            sequence: privateCreation.json().sync.sequence,
            areas: expect.arrayContaining(["projects"]),
        });
        const administratorPrivateDifference = await asAdministrator.post(
            "/v0/sync/getDifference",
            { state: administratorBeforePrivateProject, limit: 100 },
        );
        expect(administratorPrivateDifference.statusCode).toBe(200);
        expect(administratorPrivateDifference.json().areas).toContain("projects");
        const privateProjectId = privateCreation.json().project.id as string;
        expect((await projects(asAdministrator)).map((project) => project.id)).toContain(
            privateProjectId,
        );

        const publicCreation = await asOwner.post("/v0/projects/createProject", {
            name: "Realtime public",
            initialChannel: {
                kind: "public_channel",
                name: "Public realtime",
                slug: "public-realtime",
            },
        });
        expect(publicCreation.statusCode).toBe(201);
        const outsiderFirstSync = await outsiderEvents.until((frame) => frame.name === "sync");
        expect(outsiderFirstSync.data).toMatchObject({
            sequence: publicCreation.json().sync.sequence,
            areas: expect.arrayContaining(["projects"]),
        });
        expect(outsiderFirstSync.data).not.toMatchObject({
            sequence: privateCreation.json().sync.sequence,
        });

        ownerAbort.abort();
        administratorAbort.abort();
        outsiderAbort.abort();
        await Promise.all([
            ownerEvents.cancel(),
            administratorEvents.cancel(),
            outsiderEvents.cancel(),
        ]);

        const beforeDemotion = await syncState(asAdministrator);
        expect(
            (
                await asOwner.post(`/v0/admin/users/${administrator.id}/updateUser`, {
                    role: "member",
                })
            ).statusCode,
        ).toBe(200);
        const demotionDifference = await asAdministrator.post("/v0/sync/getDifference", {
            state: beforeDemotion,
            limit: 100,
        });
        expect(demotionDifference.statusCode).toBe(200);
        expect(demotionDifference.json().areas).toContain("projects");
        expect((await projects(asAdministrator)).map((project) => project.id)).not.toContain(
            privateProjectId,
        );

        const beforePromotion = await syncState(asAdministrator);
        const secondPrivateCreation = await asOwner.post("/v0/projects/createProject", {
            name: "Private before promotion",
            initialChannel: {
                kind: "private_channel",
                name: "Promotion private",
                slug: "promotion-private",
            },
        });
        expect(secondPrivateCreation.statusCode).toBe(201);
        const secondPrivateProjectId = secondPrivateCreation.json().project.id as string;
        expect((await projects(asAdministrator)).map((project) => project.id)).not.toContain(
            secondPrivateProjectId,
        );
        expect(
            (
                await asOwner.post(`/v0/admin/users/${administrator.id}/updateUser`, {
                    role: "admin",
                })
            ).statusCode,
        ).toBe(200);
        const promotionDifference = await asAdministrator.post("/v0/sync/getDifference", {
            state: beforePromotion,
            limit: 100,
        });
        expect(promotionDifference.statusCode).toBe(200);
        expect(promotionDifference.json().areas).toContain("projects");
        const promotedProjectIds = (await projects(asAdministrator)).map((project) => project.id);
        expect(promotedProjectIds).toContain(privateProjectId);
        expect(promotedProjectIds).toContain(secondPrivateProjectId);
    });
});

interface Project {
    id: string;
    name: string;
    description?: string;
}

interface Chat {
    id: string;
    kind: "dm" | "public_channel" | "private_channel";
    projectId?: string;
    name?: string;
    slug?: string;
    topic?: string;
    parentChatId?: string;
    dmType?: "direct" | "group";
    isDefaultAgentConversation?: boolean;
}

async function projects(client: GymRequestClient): Promise<Project[]> {
    const response = await client.get("/v0/projects");
    expect(response.statusCode).toBe(200);
    return response.json().projects as Project[];
}

async function chats(client: GymRequestClient): Promise<Chat[]> {
    const response = await client.get("/v0/chats");
    expect(response.statusCode).toBe(200);
    return response.json().chats as Chat[];
}

async function syncState(client: GymRequestClient): Promise<{
    generation: string;
    sequence: string;
}> {
    const response = await client.get("/v0/sync/state");
    expect(response.statusCode).toBe(200);
    return response.json().state;
}

function projectById(projects: Project[], projectId: string): Project {
    const project = projects.find((candidate) => candidate.id === projectId);
    expect(project).toBeDefined();
    return project!;
}

function chatBySlug(chats: Chat[], slug: string): Chat {
    const chat = chats.find((candidate) => candidate.slug === slug);
    expect(chat).toBeDefined();
    return chat!;
}

class SseFrames {
    private buffer = "";

    constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

    async next(): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const delimiter = this.buffer.indexOf("\n\n");
            if (delimiter >= 0) {
                const frame = this.buffer.slice(0, delimiter);
                this.buffer = this.buffer.slice(delimiter + 2);
                const name = /^event: ([^\n]+)$/m.exec(frame)?.[1];
                const rawData = /^data: (.*)$/m.exec(frame)?.[1];
                if (name && rawData) return { name, data: JSON.parse(rawData) };
                continue;
            }
            const result = await withTimeout(this.reader.read(), 3_000);
            if (result.done) throw new Error("SSE stream ended before the expected frame");
            this.buffer += new TextDecoder().decode(result.value, { stream: true });
        }
    }

    async until(
        predicate: (frame: { name: string; data: unknown }) => boolean,
    ): Promise<{ name: string; data: unknown }> {
        for (;;) {
            const frame = await this.next();
            if (predicate(frame)) return frame;
        }
    }

    async cancel(): Promise<void> {
        await this.reader.cancel().catch(() => undefined);
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for an SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
