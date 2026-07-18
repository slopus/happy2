import { happyStateCreate, type ChatStore } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("agent effort across happy2-state and Rig", () => {
    it("reads options and changes effort through typed state actions, reconciling contacts", async () => {
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

        const transport = await createGymStateTransport(server, owner);
        await using state = happyStateCreate({ transport, sleep: async () => undefined });
        await state.syncStart();
        await transport.whenConnected();
        using chat = state.chatOpen(agentChatId);
        chat.getState().agentEffortRetain(agentUserId);
        await state.whenIdle();

        expect(chat.getState().agentEffort[agentUserId]).toEqual({
            type: "ready",
            value: {
                agentUserId,
                effort: "high",
                options: ["low", "medium", "high", "xhigh"],
            },
        });

        chat.getState().agentEffortChange(agentUserId, "ultra");
        await state.whenIdle();
        expect(rig.sessionEffort("session-1")).toBe("high");
        expect(chat.getState().agentEffort[agentUserId]?.type).toBe("error");

        chat.getState().agentEffortChange(agentUserId, "low");
        await state.whenIdle();
        expect(rig.sessionEffort("session-1")).toBe("low");

        /* The change publishes a `users` sync hint; the durable contacts snapshot
           reconciles to the new value without an explicit refetch. */
        await expect.poll(() => effortValue(chat, agentUserId), { timeout: 3_000 }).toBe("low");
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
