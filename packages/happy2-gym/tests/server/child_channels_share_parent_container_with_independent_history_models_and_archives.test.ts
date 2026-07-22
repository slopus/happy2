import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("child channel runtime and lifecycle", () => {
    it("shares the parent container and eligibility while child members independently join and leave", async () => {
        await using rig = await createMockRigDaemon();
        const docker = new MockAgentSandboxRuntime();
        await using server = await agentServer(rig, docker);
        const owner = await server.createUser({ username: "child_channel_owner" });
        const member = await server.createUser({ username: "child_channel_member" });
        const lateMember = await server.createUser({ username: "child_channel_late" });
        const outsider = await server.createUser({ username: "child_channel_outsider" });
        const asOwner = server.as(owner);
        const asMember = server.as(member);
        const images = await configureAgentImages(asOwner);

        expect((await server.get("/v0/agentModels")).statusCode).toBe(401);
        expect((await asOwner.get("/v0/agentModels")).json()).toEqual({
            defaultModelId: "gym/mock-agent",
            models: [
                {
                    id: "gym/mock-agent",
                    name: "Gym mock agent",
                    thinkingLevels: ["low", "medium", "high", "xhigh"],
                    defaultThinkingLevel: "high",
                },
                {
                    id: "gym/alternate-agent",
                    name: "Gym alternate agent",
                    thinkingLevels: ["low", "medium", "high", "xhigh"],
                    defaultThinkingLevel: "high",
                },
            ],
        });

        const parentResponse = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Parent work",
            slug: "parent-work",
        });
        expect(parentResponse.statusCode).toBe(201);
        const parent = parentResponse.json().chat as Record<string, unknown>;
        const parentChatId = parent.id as string;
        expect(
            (await asOwner.post(`/v0/chats/${parentChatId}/addMember`, { userId: member.id }))
                .statusCode,
        ).toBe(200);

        const unsupported = await asOwner.post(`/v0/chats/${parentChatId}/createChildChannel`, {
            name: "Invalid model child",
            slug: "invalid-model-child",
            agentModelId: "gym/missing-agent",
        });
        expect(unsupported.statusCode).toBe(400);
        expect(unsupported.json()).toMatchObject({
            error: "invalid",
            message: "Agent model is not available",
        });

        expect(
            (
                await asMember.post(`/v0/chats/${parentChatId}/createChildChannel`, {
                    name: "Member-created child",
                    slug: "member-created-child",
                })
            ).statusCode,
        ).toBe(403);
        const directoryBaseline = (await asMember.get("/v0/sync/state")).json().state;
        const childResponse = await asOwner.post(`/v0/chats/${parentChatId}/createChildChannel`, {
            name: "Parallel investigation",
            slug: "parallel-investigation",
            agentModelId: "gym/alternate-agent",
        });
        expect(childResponse.statusCode).toBe(201);
        const child = childResponse.json().chat as Record<string, unknown>;
        const childChatId = child.id as string;
        expect(child).toMatchObject({
            kind: "private_channel",
            name: "Parallel investigation",
            parentChatId,
            agentModelId: "gym/alternate-agent",
            ownerUserId: parent.ownerUserId,
            defaultAgentUserId: parent.defaultAgentUserId,
            membershipRole: "owner",
            lastMessageSequence: "0",
        });
        expect((await server.as(outsider).get(`/v0/chats/${childChatId}`)).statusCode).toBe(404);
        expect((await asMember.get(`/v0/chats/${childChatId}`)).statusCode).toBe(404);
        expect(
            (
                await asMember.post("/v0/sync/getDifference", {
                    state: directoryBaseline,
                })
            ).json().areas,
        ).toContain("directories");
        expect((await asMember.get("/v0/directory/channels")).json().channels).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: childChatId })]),
        );
        expect(
            (await server.as(outsider).get("/v0/directory/channels")).json().channels,
        ).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: childChatId })]));
        expect((await asMember.post(`/v0/chats/${childChatId}/join`)).statusCode).toBe(200);
        expect((await asMember.post(`/v0/chats/${childChatId}/leave`)).statusCode).toBe(200);
        expect((await asMember.get("/v0/directory/channels")).json().channels).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: childChatId })]),
        );
        expect((await asMember.post(`/v0/chats/${childChatId}/join`)).statusCode).toBe(200);
        expect((await asOwner.get("/v0/chats")).json().chats).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: parentChatId }),
                expect.objectContaining({ id: childChatId, parentChatId }),
            ]),
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/createChildChannel`, {
                    name: "Too deep",
                    slug: "too-deep",
                })
            ).statusCode,
        ).toBe(400);

        expect((await asOwner.get(`/v0/chats/${parentChatId}/workspace`)).statusCode).toBe(200);
        const written = await asOwner.post(`/v0/chats/${parentChatId}/workspace/writeFile`, {
            path: "shared.txt",
            expectedVersion: null,
            content: "visible from both channels\n",
        });
        expect(written.statusCode).toBe(201);
        expect(
            (await asMember.get(`/v0/chats/${childChatId}/workspace/file?path=shared.txt`)).json(),
        ).toMatchObject({ file: { content: "visible from both channels\n" } });

        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/sendMessage`, {
                    text: "Parent-only prompt",
                    audience: "agents",
                })
            ).statusCode,
        ).toBe(201);
        await waitForMessages(asOwner, parentChatId, 2);
        const childSent = await asMember.post(`/v0/chats/${childChatId}/sendMessage`, {
            text: "Child-only prompt",
            audience: "agents",
        });
        if (childSent.statusCode !== 201)
            throw new Error(`Child send failed: ${JSON.stringify(childSent.json())}`);
        await waitForMessages(asMember, childChatId, 2);
        expect(rig.createdSessions).toHaveLength(2);
        expect(rig.createdSessions[0]).toMatchObject({
            cwd: `${rig.workspaceRoot}/agents/${String(parent.defaultAgentUserId)}/chats/${parentChatId}/workspace`,
        });
        expect(rig.createdSessions[0]!.modelId).toBeUndefined();
        expect(rig.createdSessions[1]).toMatchObject({
            cwd: rig.createdSessions[0]!.cwd,
            docker: rig.createdSessions[0]!.docker,
            modelId: "gym/alternate-agent",
        });
        expect(rig.submittedRuns.map(({ sessionId }) => sessionId)).toEqual([
            "session-1",
            "session-2",
        ]);
        expect(rig.submittedRuns[0]!.text).toContain("Parent-only prompt");
        expect(rig.submittedRuns[0]!.text).not.toContain("Child-only prompt");
        expect(rig.submittedRuns[1]!.text).toContain("Child-only prompt");
        expect(rig.submittedRuns[1]!.text).not.toContain("Parent-only prompt");
        const modelChanged = await asMember.post(`/v0/chats/${childChatId}/changeModel`, {
            modelId: "gym/mock-agent",
        });
        expect(modelChanged.statusCode).toBe(200);
        expect(modelChanged.json().chat).toMatchObject({
            id: childChatId,
            agentModelId: "gym/mock-agent",
        });
        expect(rig.modelChanges).toEqual([{ modelId: "gym/mock-agent", sessionId: "session-2" }]);
        expect(
            (await asOwner.get(`/v0/chats/${parentChatId}`)).json().chat.agentModelId,
        ).toBeUndefined();
        expect(await nonServiceTexts(asOwner, parentChatId)).toEqual([
            "Parent-only prompt",
            "All tests are passing.",
        ]);
        expect(await nonServiceTexts(asMember, childChatId)).toEqual([
            "Child-only prompt",
            "All tests are passing.",
        ]);

        const oldContainer = docker.createdContainers.at(-1)?.containerName;
        if (!oldContainer) throw new Error("The shared child container was not created");
        const changedImage = await asOwner.post(
            `/v0/admin/agents/${String(parent.defaultAgentUserId)}/changeImage`,
            { imageId: images.full.id },
        );
        expect(changedImage.statusCode).toBe(200);
        expect(docker.createdContainers).toHaveLength(2);
        expect(docker.removedContainers).toEqual([oldContainer]);
        const replacementSessions = rig.createdSessions.slice(2);
        expect(replacementSessions).toHaveLength(2);
        expect(new Set(replacementSessions.map(({ cwd }) => cwd))).toEqual(
            new Set([rig.createdSessions[0]!.cwd]),
        );
        expect(new Set(replacementSessions.map(({ docker }) => docker?.container)).size).toBe(1);
        expect(replacementSessions.map(({ modelId }) => modelId).sort()).toEqual([
            "gym/mock-agent",
            undefined,
        ]);

        const specialistCreated = await asOwner.post("/v0/chats/createAgent", {
            name: "Removable specialist",
            username: "child_channel_specialist",
        });
        expect(specialistCreated.statusCode).toBe(201);
        const specialist = (
            (await asOwner.get("/v0/contacts")).json().users as Array<{
                id: string;
                username: string;
            }>
        ).find(({ username }) => username === "child_channel_specialist");
        if (!specialist) throw new Error("The removable specialist was not listed");
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/updateDefaultAgent`, {
                    agentUserId: specialist.id,
                })
            ).statusCode,
        ).toBe(200);
        const sessionsBeforeSpecialistTurns = rig.createdSessions.length;
        for (const [client, chatId, text] of [
            [asOwner, parentChatId, "Specialist parent turn"],
            [asMember, childChatId, "Specialist child turn"],
        ] as const) {
            const before = (await client.get(`/v0/chats/${chatId}/messages`)).json().messages
                .length;
            expect(
                (
                    await client.post(`/v0/chats/${chatId}/sendMessage`, {
                        text,
                        audience: "agents",
                        agentUserIds: [specialist.id],
                    })
                ).statusCode,
            ).toBe(201);
            await waitForMessages(client, chatId, before + 2);
        }
        expect(rig.createdSessions).toHaveLength(sessionsBeforeSpecialistTurns + 2);
        const specialistSessions = rig.createdSessions.slice(sessionsBeforeSpecialistTurns);
        expect(specialistSessions[1]).toMatchObject({
            cwd: specialistSessions[0]!.cwd,
            docker: specialistSessions[0]!.docker,
            modelId: "gym/mock-agent",
        });
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/updateDefaultAgent`, {
                    agentUserId: parent.defaultAgentUserId,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/removeMember`, {
                    userId: specialist.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asOwner.get(`/v0/chats/${childChatId}/members`)).json().users).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: specialist.id })]),
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/updateDefaultAgent`, {
                    agentUserId: specialist.id,
                })
            ).statusCode,
        ).toBe(200);
        const sessionsBeforeRebind = rig.createdSessions.length;
        const messagesBeforeRebind = (await asOwner.get(`/v0/chats/${childChatId}/messages`)).json()
            .messages.length;
        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/sendMessage`, {
                    text: "Recreate both detached specialist bindings",
                    audience: "agents",
                    agentUserIds: [specialist.id],
                })
            ).statusCode,
        ).toBe(201);
        await waitForMessages(asOwner, childChatId, messagesBeforeRebind + 2);
        expect(rig.createdSessions).toHaveLength(sessionsBeforeRebind + 2);
        const reboundSessions = rig.createdSessions.slice(sessionsBeforeRebind);
        expect(reboundSessions[1]).toMatchObject({
            cwd: reboundSessions[0]!.cwd,
            docker: reboundSessions[0]!.docker,
            modelId: "gym/mock-agent",
        });

        expect(
            (await asOwner.post(`/v0/chats/${parentChatId}/addMember`, { userId: lateMember.id }))
                .statusCode,
        ).toBe(200);
        expect((await server.as(lateMember).get(`/v0/chats/${childChatId}`)).statusCode).toBe(404);
        expect((await server.as(lateMember).post(`/v0/chats/${childChatId}/join`)).statusCode).toBe(
            200,
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/addMember`, {
                    userId: outsider.id,
                })
            ).statusCode,
        ).toBe(404);

        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/archiveChannel`, {
                    leave: true,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asOwner.get(`/v0/chats/${parentChatId}`)).json().chat.archivedAt).toBe(
            undefined,
        );
        expect((await asOwner.get(`/v0/chats/${childChatId}`)).json().chat.archivedAt).toEqual(
            expect.any(String),
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/unarchiveChannel`, {
                    join: true,
                })
            ).statusCode,
        ).toBe(200);

        const parentArchived = await asOwner.post(`/v0/chats/${parentChatId}/archiveChannel`, {
            leave: true,
        });
        expect(parentArchived.statusCode).toBe(200);
        expect(parentArchived.json().sync.chats).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ chatId: parentChatId }),
                expect.objectContaining({ chatId: childChatId }),
            ]),
        );
        expect((await asOwner.get(`/v0/chats/${childChatId}`)).json().chat.archivedAt).toEqual(
            expect.any(String),
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/sendMessage`, {
                    text: "Blocked by the parent archive",
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/unarchiveChannel`, {
                    join: true,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asOwner.get(`/v0/chats/${childChatId}`)).json().chat.archivedAt).toBe(
            undefined,
        );

        expect((await asOwner.post(`/v0/chats/${childChatId}/archiveChannel`)).statusCode).toBe(
            200,
        );
        expect((await asOwner.post(`/v0/chats/${parentChatId}/archiveChannel`)).statusCode).toBe(
            200,
        );
        expect((await asOwner.post(`/v0/chats/${parentChatId}/unarchiveChannel`)).statusCode).toBe(
            200,
        );
        expect((await asOwner.get(`/v0/chats/${childChatId}`)).json().chat.archivedAt).toEqual(
            expect.any(String),
        );
    });

    it("matches public parent visibility while requiring independent parent-scoped membership", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig, new MockAgentSandboxRuntime());
        const owner = await server.createUser({ username: "public_child_owner" });
        const joiner = await server.createUser({ username: "public_child_joiner" });
        const asOwner = server.as(owner);
        const parent = await asOwner.post("/v0/chats/createChannel", {
            kind: "public_channel",
            name: "Public parent",
            slug: "public-parent-with-child",
        });
        expect(parent.statusCode).toBe(201);
        const parentChatId = parent.json().chat.id as string;
        expect(parent.json().chat).toMatchObject({
            kind: "public_channel",
            createdByUserId: owner.id,
            membershipRole: "admin",
        });
        expect(parent.json().chat.ownerUserId).toBeUndefined();
        const child = await asOwner.post(`/v0/chats/${parentChatId}/createChildChannel`, {
            name: "Inherited public child",
            slug: "inherited-public-child",
        });
        expect(child.statusCode).toBe(201);
        const childChatId = child.json().chat.id as string;
        expect(child.json().chat).toMatchObject({
            kind: "public_channel",
            parentChatId,
            createdByUserId: owner.id,
            membershipRole: "admin",
        });
        expect(child.json().chat.ownerUserId).toBeUndefined();
        const asJoiner = server.as(joiner);
        expect((await asJoiner.get(`/v0/chats/${childChatId}`)).statusCode).toBe(200);
        expect((await asJoiner.get("/v0/directory/channels")).json().channels).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: childChatId })]),
        );
        expect((await asJoiner.post(`/v0/chats/${childChatId}/join`)).statusCode).toBe(404);
        expect((await asJoiner.post(`/v0/chats/${parentChatId}/join`)).statusCode).toBe(200);
        expect((await asJoiner.get(`/v0/chats/${childChatId}`)).statusCode).toBe(200);
        expect((await asJoiner.get("/v0/directory/channels")).json().channels).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: childChatId })]),
        );
        const parentOnlyBaseline = (await asJoiner.get("/v0/sync/state")).json().state;
        expect((await asJoiner.post(`/v0/chats/${parentChatId}/leave`)).statusCode).toBe(200);
        expect((await asJoiner.get("/v0/directory/channels")).json().channels).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: childChatId })]),
        );
        const parentOnlyDifference = await asJoiner.post("/v0/sync/getDifference", {
            state: parentOnlyBaseline,
        });
        expect(parentOnlyDifference.statusCode).toBe(200);
        expect([
            ...parentOnlyDifference.json().changedChats.map((chat: { id: string }) => chat.id),
            ...parentOnlyDifference.json().removedChatIds,
        ]).not.toContain(childChatId);
        expect((await asJoiner.post(`/v0/chats/${parentChatId}/join`)).statusCode).toBe(200);
        const childJoined = await asJoiner.post(`/v0/chats/${childChatId}/join`);
        expect(childJoined.statusCode).toBe(200);
        expect(childJoined.json().chat.membershipRole).toBe("member");
        expect((await asJoiner.post(`/v0/chats/${childChatId}/leave`)).statusCode).toBe(200);
        expect((await asJoiner.get(`/v0/chats/${childChatId}`)).json().chat.membershipRole).toBe(
            undefined,
        );
        expect((await asJoiner.post(`/v0/chats/${childChatId}/join`)).statusCode).toBe(200);
        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/removeMember`, {
                    userId: joiner.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asJoiner.get("/v0/directory/channels")).json().channels).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: childChatId })]),
        );
        expect((await asJoiner.post(`/v0/chats/${childChatId}/join`)).statusCode).toBe(404);
        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/addMember`, {
                    userId: joiner.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asJoiner.get("/v0/chats")).json().chats).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: parentChatId }),
                expect.objectContaining({ id: childChatId, parentChatId }),
            ]),
        );

        const madePrivate = await asOwner.post(`/v0/chats/${parentChatId}/updateChannel`, {
            kind: "private_channel",
        });
        expect(madePrivate.statusCode).toBe(200);
        expect(madePrivate.json().sync.chats).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ chatId: parentChatId }),
                expect.objectContaining({ chatId: childChatId }),
            ]),
        );
        expect(madePrivate.json().chat).toMatchObject({
            kind: "private_channel",
            ownerUserId: owner.id,
            membershipRole: "owner",
        });
        expect((await asOwner.get(`/v0/chats/${childChatId}`)).json().chat).toMatchObject({
            kind: "private_channel",
            ownerUserId: owner.id,
            membershipRole: "owner",
        });
        const childBeforeOwnerTransfer = (await asJoiner.get(`/v0/chats/${childChatId}`)).json()
            .chat;
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/setMemberRole`, {
                    userId: joiner.id,
                    role: "owner",
                })
            ).statusCode,
        ).toBe(200);
        expect((await asJoiner.get(`/v0/chats/${childChatId}`)).json().chat).toMatchObject({
            ownerUserId: owner.id,
            membershipRole: "member",
            membershipEpoch: childBeforeOwnerTransfer.membershipEpoch,
        });
        expect((await asOwner.post(`/v0/chats/${parentChatId}/leave`)).statusCode).toBe(200);
        expect((await asJoiner.get(`/v0/chats/${childChatId}`)).json().chat).toMatchObject({
            ownerUserId: owner.id,
            membershipRole: "member",
            membershipEpoch: childBeforeOwnerTransfer.membershipEpoch,
        });
        expect((await asOwner.get(`/v0/chats/${childChatId}`)).json().chat.membershipRole).toBe(
            undefined,
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${parentChatId}/createChildChannel`, {
                    name: "Departed manager child",
                    slug: "departed-manager-child",
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await asOwner.post(`/v0/chats/${childChatId}/updateChannel`, {
                    topic: "Departed parent managers cannot mutate children",
                })
            ).statusCode,
        ).toBe(404);
        const madePublic = await asJoiner.post(`/v0/chats/${parentChatId}/updateChannel`, {
            kind: "public_channel",
        });
        expect(madePublic.statusCode).toBe(200);
        expect(madePublic.json().chat).toMatchObject({
            kind: "public_channel",
            membershipRole: "admin",
        });
        expect(madePublic.json().chat.ownerUserId).toBeUndefined();
        const publicChild = (await asJoiner.get(`/v0/chats/${childChatId}`)).json().chat;
        expect(publicChild).toMatchObject({ kind: "public_channel", membershipRole: "member" });
        expect(publicChild.ownerUserId).toBeUndefined();
    });
});

function agentServer(rig: MockRigDaemon, agentSandbox: MockAgentSandboxRuntime) {
    return createGymServer({
        agentSandbox,
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

async function configureAgentImages(client: GymRequestClient): Promise<{
    full: { id: string };
    minimal: { id: string };
}> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    const minimal = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    const full = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-full");
    if (!minimal || !full) throw new Error("Both built-in agent images must be seeded");
    for (const image of [minimal, full]) {
        if (image.status !== "ready" && image.status !== "building") {
            const requested = await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {});
            expect(requested.statusCode).toBe(202);
        }
    }
    await waitFor(async () => {
        catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
        return [minimal.id, full.id].every(
            (imageId) => catalog.images.find(({ id }) => id === imageId)?.status === "ready",
        );
    }, "the built-in agent images to build");
    if (catalog.defaultImageId !== minimal.id) {
        const selected = await client.post(
            `/v0/admin/agentImages/${minimal.id}/setDefaultImage`,
            {},
        );
        expect(selected.statusCode).toBe(200);
    }
    return { full, minimal };
}

async function waitForMessages(client: GymRequestClient, chatId: string, count: number) {
    let messages: Array<Record<string, unknown>> = [];
    await waitFor(async () => {
        messages = (await client.get(`/v0/chats/${chatId}/messages`)).json().messages;
        return (
            messages.length >= count &&
            messages.every(
                (message) =>
                    message.kind !== "automated" || message.generationStatus !== "streaming",
            )
        );
    }, `${count} complete messages in ${chatId}`);
    return messages;
}

async function nonServiceTexts(client: GymRequestClient, chatId: string): Promise<string[]> {
    return (
        (await client.get(`/v0/chats/${chatId}/messages`)).json().messages as Array<{
            service?: unknown;
            text: string;
        }>
    )
        .filter(({ service }) => !service)
        .map(({ text }) => text);
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 4_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${description}`);
}
