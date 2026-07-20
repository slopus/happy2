import { happyStateCreate, type ChatStore } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("agent effort across happy2-state and Rig", () => {
    it("reconciles a chat effort service message into another retained state surface", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "state_effort_owner" });
        const asOwner = server.as(owner);
        await configureAgentImage(asOwner);
        const createdAgent = await asOwner.post("/v0/chats/createAgent", {
            name: "State Effort Agent",
            username: "state_effort_agent",
        });
        expect(createdAgent.statusCode).toBe(201);
        const agentChatId = (createdAgent.json().chat as { id: string }).id;
        const agentUserId = await findAgentUserId(asOwner, "state_effort_agent");
        expect(rig.sessionEffort("session-1")).toBe("high");

        const actorTransport = await createGymStateTransport(server, owner);
        await using actorState = happyStateCreate({
            transport: actorTransport,
            sleep: async () => undefined,
        });
        await actorState.syncStart();
        await actorTransport.whenConnected();
        using actorChat = actorState.chatOpen(agentChatId);
        actorChat.getState().agentEffortRetain(agentUserId);
        await actorState.whenIdle();

        const observerTransport = await createGymStateTransport(server, owner);
        await using observerState = happyStateCreate({
            transport: observerTransport,
            sleep: async () => undefined,
        });
        await observerState.syncStart();
        await observerTransport.whenConnected();
        using observerChat = observerState.chatOpen(agentChatId);
        observerChat.getState().agentEffortRetain(agentUserId);
        await observerState.whenIdle();

        expect(actorChat.getState().agentEffort[agentUserId]).toEqual({
            type: "ready",
            value: {
                agentUserId,
                effort: "high",
                options: ["low", "medium", "high", "xhigh"],
            },
        });

        actorChat.getState().agentEffortChange(agentUserId, "ultra");
        await actorState.whenIdle();
        expect(rig.sessionEffort("session-1")).toBe("high");
        await expect.poll(() => actorChat.getState().agentEffort[agentUserId]?.type).toBe("error");

        actorChat.getState().agentEffortChange(agentUserId, "low");
        await actorState.whenIdle();
        await expect.poll(() => rig.sessionEffort("session-1")).toBe("low");

        await expect
            .poll(() => effortValue(observerChat, agentUserId), { timeout: 3_000 })
            .toBe("low");
        expect(
            observerChat
                .getState()
                .messages.find(({ message }) => message.service?.type === "agent_effort_changed")
                ?.message,
        ).toMatchObject({
            kind: "automated",
            sender: { id: owner.id, username: "state_effort_owner" },
            service: {
                type: "agent_effort_changed",
                agentUserId,
                effort: "low",
            },
            text: "@state_effort_agent's reasoning effort changed to low",
        });
    });
});

function effortValue(chat: ChatStore, agentUserId: string): string | undefined {
    const value = chat.getState().agentEffort[agentUserId];
    return value?.type === "ready" ? value.value.effort : undefined;
}

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
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
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
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
}

async function findAgentUserId(client: GymRequestClient, username: string): Promise<string> {
    const contacts = (await client.get("/v0/contacts")).json().users as Array<
        Record<string, unknown>
    >;
    const agent = contacts.find((user) => user.username === username && user.kind === "agent");
    if (!agent) throw new Error(`Agent ${username} was not found`);
    return agent.id as string;
}

async function waitFor(
    condition: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${description}`);
}
