import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("channel agent audiences", () => {
    it("assigns executable Happy and shares one marked-context session across channel members and restart", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "channel_owner", firstName: "Owner" });
        const teammate = await server.createUser({
            username: "channel_teammate",
            firstName: "Teammate",
        });
        const asOwner = server.as(owner);
        const asTeammate = server.as(teammate);
        await configureAgentImage(asOwner);
        const happy = await executableHappy(asOwner);

        const created = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Shared agent room",
            slug: "shared-agent-room",
        });
        expect(created.statusCode).toBe(201);
        expect(created.json().chat.defaultAgentUserId).toBe(happy.id);
        const chatId = created.json().chat.id as string;
        const members = (await asOwner.get(`/v0/chats/${chatId}/members`)).json().users as Array<
            Record<string, unknown>
        >;
        expect(members).toContainEqual(
            expect.objectContaining({ id: happy.id, username: "happy", kind: "agent" }),
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/removeMember`, {
                    userId: happy.id,
                })
            ).statusCode,
        ).toBe(400);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/addMember`, {
                    userId: teammate.id,
                })
            ).statusCode,
        ).toBe(200);

        const peopleOnly = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "people",
            text: "People discuss the deployment first",
            clientMutationId: "people-first",
        });
        expect(peopleOnly.statusCode).toBe(201);
        expect(peopleOnly.json().message).toMatchObject({
            audience: "people",
            agentUserIds: [],
        });
        expect(rig.submittedRuns).toHaveLength(0);

        const firstAddressed = await asTeammate.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "agents",
            text: "Happy, summarize our deployment plan",
            clientMutationId: "agent-first",
        });
        expect(firstAddressed.statusCode).toBe(201);
        expect(firstAddressed.json().message).toMatchObject({
            audience: "agents",
            agentUserIds: [happy.id],
        });
        const firstRun = await waitForRun(rig, 1);
        const firstRecords = promptRecords(firstRun.text);
        expect(firstRecords).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    text: "People discuss the deployment first",
                    addressedToYou: false,
                }),
                expect.objectContaining({
                    text: "Happy, summarize our deployment plan",
                    addressedToYou: true,
                    author: expect.objectContaining({ username: "channel_teammate" }),
                }),
            ]),
        );
        expect(rig.createdCwds).toContain(
            `${rig.workspaceRoot}/agents/${happy.id}/chats/${chatId}/workspace`,
        );
        rig.completeRun(firstRun.runId, "Shared deployment summary");
        await waitForMessageText(asOwner, chatId, "Shared deployment summary");

        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "people",
            text: "An intervening human correction",
        });
        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "agents",
            text: "Happy, revise the summary",
            clientMutationId: "agent-second",
        });
        const secondRun = await waitForRun(rig, 2);
        expect(secondRun.sessionId).toBe(firstRun.sessionId);
        const secondRecords = promptRecords(secondRun.text);
        expect(
            secondRecords.some(({ text }) => text === "Happy, summarize our deployment plan"),
        ).toBe(false);
        expect(secondRecords).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    text: "Shared deployment summary",
                    addressedToYou: false,
                }),
                expect.objectContaining({
                    text: "An intervening human correction",
                    addressedToYou: false,
                }),
                expect.objectContaining({
                    text: "Happy, revise the summary",
                    addressedToYou: true,
                }),
            ]),
        );
        rig.completeRun(secondRun.runId, "Revised shared summary");
        await waitForMessageText(asTeammate, chatId, "Revised shared summary");

        const attemptsBefore = rig.submissionAttemptCount;
        rig.pauseSubmissions();
        await asTeammate.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "agents",
            text: "Happy, survive the server restart",
            clientMutationId: "agent-restart",
        });
        await waitFor(
            () => rig.submissionAttemptCount > attemptsBefore,
            "the channel turn submission attempt",
        );
        await server.restart();
        rig.resumeSubmissions();
        const resumedRun = await waitForRun(rig, 3);
        expect(resumedRun.sessionId).toBe(firstRun.sessionId);
        expect(
            rig.submittedTexts.filter((text) => text.includes("survive the server restart")),
        ).toHaveLength(1);
    });

    it("authorizes default-agent changes and deterministically queues explicitly added agents", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "audience_owner", firstName: "Owner" });
        const member = await server.createUser({
            username: "audience_member",
            firstName: "Member",
        });
        const asOwner = server.as(owner);
        const asMember = server.as(member);
        await configureAgentImage(asOwner);
        const happy = await executableHappy(asOwner);
        const created = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Agent selection",
            slug: "agent-selection",
        });
        const chatId = created.json().chat.id as string;
        await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: member.id });
        const specialistCreated = await asOwner.post("/v0/chats/createAgent", {
            name: "Specialist",
            username: "channel_specialist",
        });
        expect(specialistCreated.statusCode).toBe(201);
        const specialist = await contact(asOwner, "channel_specialist");
        await asOwner.post(`/v0/chats/${chatId}/addMember`, { userId: specialist.id });

        expect(
            (
                await asMember.post(`/v0/chats/${chatId}/updateDefaultAgent`, {
                    agentUserId: specialist.id,
                })
            ).statusCode,
        ).toBe(403);
        const changed = await asOwner.post(`/v0/chats/${chatId}/updateDefaultAgent`, {
            agentUserId: specialist.id,
        });
        expect(changed.statusCode).toBe(200);
        expect(changed.json().chat.defaultAgentUserId).toBe(specialist.id);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
                    audience: "people",
                    agentUserIds: [happy.id],
                    text: "Invalid mixed audience",
                })
            ).statusCode,
        ).toBe(400);

        const sent = await asMember.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "agents",
            agentUserIds: [happy.id],
            text: "Both agents should inspect this",
            clientMutationId: "two-agent-turn",
        });
        expect(sent.statusCode).toBe(201);
        expect(sent.json().message.agentUserIds).toEqual([happy.id, specialist.id].sort());
        const first = await waitForRun(rig, 1);
        const orderedAgentIds = [happy.id, specialist.id].sort();
        expect(sessionCwd(rig, first.sessionId)).toBe(
            `${rig.workspaceRoot}/agents/${orderedAgentIds[0]}/chats/${chatId}/workspace`,
        );
        expect(promptRecords(first.text).at(-1)).toMatchObject({
            text: "Both agents should inspect this",
            addressedToYou: true,
        });
        rig.completeRun(first.runId, "First deterministic agent reply");
        const second = await waitForRun(rig, 2);
        expect(second.sessionId).not.toBe(first.sessionId);
        expect(sessionCwd(rig, second.sessionId)).toBe(
            `${rig.workspaceRoot}/agents/${orderedAgentIds[1]}/chats/${chatId}/workspace`,
        );
        expect(promptRecords(second.text).at(-1)).toMatchObject({
            text: "Both agents should inspect this",
            addressedToYou: true,
        });
        rig.completeRun(second.runId, "Second deterministic agent reply");
        await waitForMessageText(asOwner, chatId, "Second deterministic agent reply");

        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/removeMember`, {
                    userId: specialist.id,
                })
            ).statusCode,
        ).toBe(409);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/updateDefaultAgent`, {
                    agentUserId: happy.id,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/removeMember`, {
                    userId: specialist.id,
                })
            ).statusCode,
        ).toBe(200);
        expect((await asOwner.get(`/v0/chats/${chatId}`)).json().chat.defaultAgentUserId).toBe(
            happy.id,
        );
    });

    it("rejects an agent audience while the channel's default Happy is not executable", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "missing_agent_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const created = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "No executable agent",
            slug: "no-executable-agent",
        });
        const chatId = created.json().chat.id as string;
        expect(created.json().chat.defaultAgentUserId).toEqual(expect.any(String));

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "agents",
            text: "No agent can receive this",
        });
        expect(sent.statusCode).toBe(400);
        expect(sent.json()).toMatchObject({
            error: "invalid",
            message: "Every addressed agent must be a ready executable chat member",
        });
        expect(rig.submittedRuns).toHaveLength(0);
    });

    it("rejects agent turns in group direct messages", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "group_agent_owner" });
        const firstMember = await server.createUser({ username: "group_agent_first" });
        const secondMember = await server.createUser({ username: "group_agent_second" });
        const asOwner = server.as(owner);
        const created = await asOwner.post("/v0/chats/createGroupDirectMessage", {
            userIds: [firstMember.id, secondMember.id],
            name: "Human group DM",
        });
        const chatId = created.json().chat.id as string;

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "agents",
            text: "Agents are not supported here",
        });
        expect(sent.statusCode).toBe(400);
        expect(sent.json()).toMatchObject({
            error: "invalid",
            message: "This direct message has no executable agent",
        });
        expect(rig.submittedRuns).toHaveLength(0);
    });

    it("keeps addressed context and the agent reply inside the same nested thread chat", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "thread_agent_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        await configureAgentImage(asOwner);
        const created = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Thread context",
            slug: "thread-context",
        });
        const chatId = created.json().chat.id as string;
        const root = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "people",
            text: "Root decision record",
        });
        const rootId = root.json().message.id as string;
        const thread = await asOwner.post(`/v0/messages/${rootId}/createThread`, {});
        expect(thread.statusCode).toBe(201);
        const threadChatId = thread.json().chat.id as string;
        expect(thread.json().chat).toMatchObject({
            parentMessageId: rootId,
            defaultAgentUserId: expect.any(String),
        });
        await asOwner.post(`/v0/chats/${threadChatId}/sendMessage`, {
            audience: "people",
            text: "Thread-only human detail",
        });
        await asOwner.post(`/v0/chats/${threadChatId}/sendMessage`, {
            audience: "agents",
            text: "Happy, answer inside this thread",
        });
        const run = await waitForRun(rig, 1);
        expect(promptRecords(run.text)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ text: "Root decision record", addressedToYou: false }),
                expect.objectContaining({
                    text: "Thread-only human detail",
                    addressedToYou: false,
                }),
                expect.objectContaining({
                    text: "Happy, answer inside this thread",
                    addressedToYou: true,
                }),
            ]),
        );
        rig.completeRun(run.runId, "Thread-scoped agent answer");
        const replies = await waitForMessageText(
            asOwner,
            threadChatId,
            "Thread-scoped agent answer",
        );
        expect(replies.find(({ text }) => text === "Thread-scoped agent answer")).toMatchObject({
            chatId: threadChatId,
            audience: "people",
        });
    });
});

function agentServer(rig: MockRigDaemon) {
    return createGymServer({
        agentSandbox: new MockAgentSandboxRuntime(),
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    if (catalog.defaultImageId) return;
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready" && image.status !== "building")
        expect(
            (await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {})).statusCode,
        ).toBe(202);
    await waitFor(async () => {
        catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
        return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
    }, "the default agent image to build");
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
}

async function executableHappy(client: GymRequestClient): Promise<{ id: string }> {
    const users = (await client.get("/v0/contacts")).json().users as Array<Record<string, unknown>>;
    const happy = users.find(
        (user) => user.username === "happy" && user.kind === "agent" && !user.systemRole,
    );
    if (!happy) throw new Error("Executable Happy was not created");
    return { id: happy.id as string };
}

async function contact(client: GymRequestClient, username: string): Promise<{ id: string }> {
    const users = (await client.get("/v0/contacts")).json().users as Array<Record<string, unknown>>;
    const user = users.find((candidate) => candidate.username === username);
    if (!user) throw new Error(`Contact ${username} was not found`);
    return { id: user.id as string };
}

function promptRecords(text: string): Array<Record<string, any>> {
    return text
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as Record<string, any>);
}

function sessionCwd(rig: MockRigDaemon, sessionId: string): string | undefined {
    const sessionIndex = Number(sessionId.replace("session-", "")) - 1;
    return rig.createdCwds[sessionIndex];
}

async function waitForRun(rig: MockRigDaemon, count: number) {
    await waitFor(() => rig.submittedRuns.length >= count, `${count} submitted Rig runs`);
    return rig.submittedRuns[count - 1]!;
}

async function waitForMessageText(
    client: GymRequestClient,
    chatId: string,
    text: string,
): Promise<Array<Record<string, any>>> {
    let messages: Array<Record<string, any>> = [];
    await waitFor(async () => {
        messages = (await client.get(`/v0/chats/${chatId}/messages`)).json().messages;
        return messages.some((message) => message.text === text);
    }, `channel message ${text}`);
    return messages;
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${description}`);
}
