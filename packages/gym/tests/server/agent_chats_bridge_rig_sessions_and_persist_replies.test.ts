import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentDockerRuntime, type MockRigDaemon } from "gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("AI agent chats", () => {
    it("creates Rig sessions on the server and persists one reply for an idempotent turn", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "agent_owner", firstName: "Owner" });
        const outsider = await server.createUser({
            username: "agent_outsider",
            firstName: "Other",
        });
        const asOwner = server.as(owner);
        await configureAgentImage(asOwner);

        const created = await asOwner.post("/v0/chats/createAgent", {
            name: "Fixer",
            username: "fixer",
        });
        expect(created.statusCode).toBe(201);
        expect(rig.durableGlobalEventQueueEnabled).toBe(true);
        expect(rig.configReadCount).toBe(1);
        expect(rig.configPatchCount).toBe(1);
        expect(created.json().chat).toMatchObject({
            kind: "dm",
            dmType: "direct",
            membershipRole: "owner",
        });
        expect(created.json().chat.name).toBeUndefined();
        const contacts = (await asOwner.get("/v0/contacts")).json().users as Array<
            Record<string, unknown>
        >;
        const createdAgent = contacts.find((user) => user.username === "fixer");
        expect(createdAgent).toMatchObject({
            firstName: "Fixer",
            username: "fixer",
            kind: "agent",
            createdByUserId: owner.id,
        });
        const agentUserId = createdAgent!.id as string;
        expect((await asOwner.get("/v0/contacts")).json().users).toContainEqual(
            expect.objectContaining({
                id: agentUserId,
                firstName: "Fixer",
                username: "fixer",
                kind: "agent",
            }),
        );
        expect(rig.createdCwds).toEqual([
            `${rig.workspaceRoot}/agents/${agentUserId}/users/${owner.id}/workspace`,
        ]);
        const chatId = created.json().chat.id as string;
        expect((await server.as(outsider).get(`/v0/chats/${chatId}`)).statusCode).toBe(404);
        const duplicate = await asOwner.post("/v0/chats/createAgent", {
            name: "Other Fixer",
            username: "fixer",
        });
        expect(duplicate.statusCode).toBe(409);
        expect(rig.createdCwds).toEqual([
            `${rig.workspaceRoot}/agents/${agentUserId}/users/${owner.id}/workspace`,
        ]);

        const payload = { text: "Fix the failing tests", clientMutationId: "agent-turn-one" };
        const first = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, payload);
        const retry = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, payload);
        expect(first.statusCode).toBe(201);
        expect(retry.json().message.id).toBe(first.json().message.id);

        const messages = await waitForMessages(asOwner, chatId, 2);
        expect(messages).toHaveLength(2);
        expect(messages[0]).toMatchObject({ kind: "user", text: "Fix the failing tests" });
        expect(messages[1]).toMatchObject({
            kind: "automated",
            text: "All tests are passing.",
            sender: { firstName: "Fixer", username: "fixer", kind: "agent" },
        });
        expect((await asOwner.get(`/v0/chats/${chatId}`)).json().chat.unreadCount).toBe(1);
        expect(rig.submittedTexts).toEqual(["Fix the failing tests"]);
        expect(rig.globalEventReadCount).toBe(0);
        expect(rig.sessionEventRequestCount).toBe(0);
        expect(rig.sessionStreamRequestCount).toBe(0);
        expect(rig.globalStreamRequestCount).toBeGreaterThan(0);
        expect(rig.trimRequests).toEqual([]);
    });

    it("recovers a completed reply when the submit response disappears after acceptance", async () => {
        await using rig = await createMockRigDaemon();
        rig.dropNextSubmissionResponseAfterAccept();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "lost_submit", firstName: "Owner" });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);

        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Keep this turn",
                    clientMutationId: "lost-submit",
                })
            ).statusCode,
        ).toBe(201);

        const messages = await waitForMessages(asOwner, chatId, 2);
        expect(messages.map((message) => message.text)).toEqual([
            "Keep this turn",
            "All tests are passing.",
        ]);
        expect(rig.submittedTexts).toEqual(["Keep this turn"]);
    });

    it("resumes an atomically queued DM turn after restart before Rig accepts it", async () => {
        await using rig = await createMockRigDaemon();
        rig.pauseSubmissions();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "pending_restart", firstName: "Owner" });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "This committed message must remain queued",
            clientMutationId: "pending-restart",
        });
        expect(sent.statusCode).toBe(201);
        await waitFor(
            () => rig.submissionAttemptCount > 0,
            "Rigged to attempt the atomically queued turn",
        );

        await server.restart();
        rig.resumeSubmissions();

        const messages = await waitForMessages(asOwner, chatId, 2, 10_000);
        expect(messages.map(({ text }) => text)).toEqual([
            "This committed message must remain queued",
            "All tests are passing.",
        ]);
        expect(rig.submittedTexts).toEqual(["This committed message must remain queued"]);
    });

    it("isolates private DMs while allowing multiple dormant agent members in channels", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "sandbox_owner", firstName: "Owner" });
        const teammate = await server.createUser({
            username: "sandbox_teammate",
            firstName: "Teammate",
        });
        await configureAgentImage(server.as(owner));
        const created = await server.as(owner).post("/v0/chats/createAgent", {
            name: "Sandboxer",
            username: "sandboxer",
        });
        expect(created.statusCode).toBe(201);
        const agentUserId = await findAgentUserId(server.as(owner), "sandboxer");
        expect(rig.createdCwds).toEqual([
            `${rig.workspaceRoot}/agents/${agentUserId}/users/${owner.id}/workspace`,
        ]);

        const direct = await server.as(teammate).post("/v0/chats/createDirectMessage", {
            userId: agentUserId,
        });
        expect(direct.statusCode).toBe(201);
        const directChatId = direct.json().chat.id as string;
        expect(
            (
                await server.as(teammate).post(`/v0/chats/${directChatId}/sendMessage`, {
                    text: "Keep my private work separate",
                    clientMutationId: "private-sandbox-turn",
                })
            ).statusCode,
        ).toBe(201);
        await waitForMessages(server.as(teammate), directChatId, 2);
        expect(rig.createdCwds).toContain(
            `${rig.workspaceRoot}/agents/${agentUserId}/users/${teammate.id}/workspace`,
        );

        const secondCreated = await server.as(owner).post("/v0/chats/createAgent", {
            name: "Second Sandboxer",
            username: "sandboxer_two",
        });
        expect(secondCreated.statusCode).toBe(201);
        const secondAgentUserId = await findAgentUserId(server.as(owner), "sandboxer_two");

        const channel = await server.as(owner).post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Sandbox channel",
            slug: "sandbox-channel",
        });
        expect(channel.statusCode).toBe(201);
        const channelId = channel.json().chat.id as string;
        expect(
            (
                await server.as(owner).post(`/v0/chats/${channelId}/addMember`, {
                    userId: agentUserId,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await server.as(owner).post(`/v0/chats/${channelId}/addMember`, {
                    userId: secondAgentUserId,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await server.as(owner).post(`/v0/chats/${channelId}/sendMessage`, {
                    text: "Channel collaboration is mention-driven later",
                    clientMutationId: "channel-sandbox-turn",
                })
            ).statusCode,
        ).toBe(201);
        const channelMessages = await waitForMessages(server.as(owner), channelId, 1);
        expect(channelMessages.map(({ text }) => text)).toEqual([
            "Channel collaboration is mention-driven later",
        ]);
        expect(rig.submittedTexts).toEqual(["Keep my private work separate"]);
        expect(rig.createdCwds).not.toContain(
            `${rig.workspaceRoot}/agents/${agentUserId}/chats/${channelId}`,
        );
    });

    it("extracts only the current reply from a reused Rig session", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply("First response only.");
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "reply_boundary", firstName: "Owner" });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);

        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "First turn",
            clientMutationId: "reply-boundary-one",
        });
        await waitForMessages(asOwner, chatId, 2);
        rig.setAutomaticReply("Second response only.");
        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Second turn",
            clientMutationId: "reply-boundary-two",
        });

        const messages = await waitForMessages(asOwner, chatId, 4);
        expect(messages.map(({ text }) => text)).toEqual([
            "First turn",
            "First response only.",
            "Second turn",
            "Second response only.",
        ]);
    });

    it("resumes an active turn after the Rig daemon restarts", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "rig_restart", firstName: "Owner" });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);

        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Survive the daemon restart",
            clientMutationId: "rig-restart",
        });
        const run = await waitForRun(rig, 1);

        rig.pauseGlobalEventDelivery();
        rig.completeRun(run.runId, "Recovered after the Rig restart.");
        await rig.restart();
        rig.resumeGlobalEventDelivery();

        const messages = await waitForMessages(asOwner, chatId, 2);
        expect(messages.at(-1)?.text).toBe("Recovered after the Rig restart.");
        expect(rig.submittedTexts).toEqual(["Survive the daemon restart"]);
    });

    it("tracks concurrent sessions through one durable global queue", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "global_queue", firstName: "Owner" });
        const asOwner = server.as(owner);
        const firstChatId = await createAgent(asOwner);
        const secondChatId = await createAgent(asOwner, "fixer_two");

        await asOwner.post(`/v0/chats/${firstChatId}/sendMessage`, {
            text: "Track the first session",
            clientMutationId: "global-first",
        });
        await asOwner.post(`/v0/chats/${secondChatId}/sendMessage`, {
            text: "Track the second session",
            clientMutationId: "global-second",
        });
        const first = await waitForRun(rig, 1);
        const second = await waitForRun(rig, 2);
        rig.completeRun(second.runId, "Second global reply.");
        rig.completeRun(first.runId, "First global reply.");

        expect((await waitForMessages(asOwner, firstChatId, 2)).at(-1)?.text).toBe(
            "First global reply.",
        );
        expect((await waitForMessages(asOwner, secondChatId, 2)).at(-1)?.text).toBe(
            "Second global reply.",
        );
        expect(rig.submittedTexts).toEqual(["Track the first session", "Track the second session"]);
        expect(rig.globalEventReadCount).toBe(0);
        expect(rig.globalStreamRequestCount).toBeGreaterThan(0);
        expect(rig.sessionEventRequestCount).toBe(0);
        expect(rig.sessionStreamRequestCount).toBe(0);
        expect(rig.cursorRejections).toBe(0);
    });

    it("rebuilds the server and resumes durable running turns exactly once", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "server_restart", firstName: "Owner" });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);

        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Survive the Rigged restart",
            clientMutationId: "server-restart",
        });
        const run = await waitForRun(rig, 1);

        rig.pauseGlobalEventDelivery();
        rig.completeRun(run.runId, "Recovered by the rebuilt server.");
        await server.restart();
        expect(rig.configReadCount).toBeGreaterThanOrEqual(2);
        expect(rig.configPatchCount).toBe(1);
        rig.resumeGlobalEventDelivery();

        const messages = await waitForMessages(asOwner, chatId, 2);
        expect(messages.at(-1)?.text).toBe("Recovered by the rebuilt server.");
        await server.restart();
        expect(await waitForMessages(asOwner, chatId, 2)).toHaveLength(2);
        expect(rig.submittedTexts).toEqual(["Survive the Rigged restart"]);
    });

    it("fails one run without blocking the next durable queued turn", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "run_failure", firstName: "Owner" });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);

        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "This run will fail",
            clientMutationId: "failed-run",
        });
        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "This run must follow",
            clientMutationId: "following-run",
        });
        const first = await waitForRun(rig, 1);
        rig.failRun(first.runId, "Provider failed");
        const second = await waitForRun(rig, 2);
        rig.completeRun(second.runId, "The queue continued safely.");

        const messages = await waitForMessages(asOwner, chatId, 4);
        expect(messages.map((message) => message.text)).toEqual([
            "This run will fail",
            "This run must follow",
            "I couldn't complete this request.",
            "The queue continued safely.",
        ]);
        expect(rig.submittedTexts).toEqual(["This run will fail", "This run must follow"]);
    });

    it("finishes a turn while ignoring a burst of inference updates", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "noisy_inference", firstName: "Owner" });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);

        await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Keep working through noisy updates",
            clientMutationId: "noisy-inference",
        });
        const run = await waitForRun(rig, 1);

        rig.emitGlobalUpdates(2_000);
        rig.completeRun(run.runId, "Noise did not interrupt this reply.");

        const messages = await waitForMessages(asOwner, chatId, 2, 10_000);
        expect(messages.at(-1)?.text).toBe("Noise did not interrupt this reply.");
        expect(rig.cursorRejections).toBe(0);
    });

    it("trims the durable global queue after one thousand applied updates", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "queue_trim", firstName: "Owner" });
        const asOwner = server.as(owner);
        await createAgent(asOwner);

        await waitFor(
            () => rig.globalStreamRequestCount > 0,
            "Rigged to open the durable global event stream",
        );
        expect(rig.globalEventReadCount).toBe(0);
        expect(rig.trimRequests).toEqual([]);
        rig.emitGlobalUpdates(1_000);

        await waitFor(
            () => rig.trimRequests.length > 0,
            "Rigged to trim applied global events",
            10_000,
        );
        expect(rig.trimRequests).toHaveLength(1);
        expect(rig.cursorRejections).toBe(0);
        expect(rig.sessionEventRequestCount).toBe(0);
        expect(rig.sessionStreamRequestCount).toBe(0);
    });
});

function agentServer(rig: MockRigDaemon) {
    return createGymServer({
        agentDocker: new MockAgentDockerRuntime(),
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

async function createAgent(client: GymRequestClient, username = "fixer"): Promise<string> {
    await configureAgentImage(client);
    const response = await client.post("/v0/chats/createAgent", { name: "Fixer", username });
    expect(response.statusCode).toBe(201);
    return response.json().chat.id as string;
}

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    if (catalog.defaultImageId) return;
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready" && image.status !== "building") {
        const requested = await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {});
        expect(requested.statusCode).toBe(202);
    }
    await waitFor(async () => {
        catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
        return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
    }, "the default agent image to build");
    const selected = await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {});
    expect(selected.statusCode).toBe(200);
}

async function findAgentUserId(client: GymRequestClient, username: string): Promise<string> {
    const contacts = (await client.get("/v0/contacts")).json().users as Array<
        Record<string, unknown>
    >;
    const agent = contacts.find((user) => user.username === username && user.kind === "agent");
    if (!agent) throw new Error(`Agent ${username} was not found`);
    return agent.id as string;
}

async function waitForMessages(
    client: GymRequestClient,
    chatId: string,
    count: number,
    timeoutMs = 2_000,
): Promise<Array<Record<string, unknown>>> {
    const deadline = Date.now() + timeoutMs;
    do {
        const response = await client.get(`/v0/chats/${chatId}/messages`);
        const messages = response.json().messages as Array<Record<string, unknown>>;
        if (messages.length >= count) return messages;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${count} messages`);
}

async function waitForRun(rig: MockRigDaemon, count: number) {
    await waitFor(() => rig.submittedRuns.length >= count, `${count} submitted Rig run(s)`);
    return rig.submittedRuns[count - 1]!;
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
