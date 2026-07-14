import { createClientState } from "rigged-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentDockerRuntime } from "gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("agent turns through rigged-state and the real server", () => {
    it("persists and reconciles one reply while Rig emits noisy inference updates", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await createGymServer({
            agentDocker: new MockAgentDockerRuntime(),
            databaseMode: "file",
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const owner = await server.createUser({ username: "state_agent_owner" });
        await configureAgentImage(server.as(owner));
        const transport = await createGymStateTransport(server, owner);
        await using state = createClientState(transport);
        const backgroundErrors: string[] = [];
        state.subscribe("background-error", ({ error }) => backgroundErrors.push(error.message));
        await state.start();
        await transport.whenConnected();

        const agentChat = await state.createAgent({ name: "State Agent", username: "state_agent" });
        expect(agentChat).toMatchObject({ kind: "dm", dmType: "direct" });
        const contacts = await state.execute("getContacts");
        const agentUser = contacts.users.find((user) => user.username === "state_agent");
        expect(agentUser).toMatchObject({
            firstName: "State Agent",
            username: "state_agent",
            kind: "agent",
            createdByUserId: owner.id,
        });
        await state.loadMessages(agentChat.id);
        state.sendMessage(agentChat.id, {
            text: "Finish despite inference noise",
            clientMutationId: "state-agent-noise",
        });

        await state.whenIdle();
        expect(backgroundErrors).toEqual([]);
        await expect.poll(() => rig.submittedRuns.length, { timeout: 4_000 }).toBe(1);
        await expect
            .poll(() => state.get().typing.find(({ chatId }) => chatId === agentChat.id)?.userId, {
                timeout: 4_000,
            })
            .toBe(agentUser!.id);

        rig.emitGlobalUpdates(2_000);
        rig.completeRun(rig.submittedRuns[0]!.runId, "The durable reply arrived once.");

        await expect
            .poll(
                () =>
                    state.get().messagesByChat[agentChat.id]?.map(({ delivery, message }) => ({
                        delivery,
                        text: message.text,
                    })),
                { timeout: 10_000 },
            )
            .toEqual([
                { delivery: "sent", text: "Finish despite inference noise" },
                { delivery: "sent", text: "The durable reply arrived once." },
            ]);
        await expect
            .poll(() => state.get().typing.some(({ chatId }) => chatId === agentChat.id), {
                timeout: 4_000,
            })
            .toBe(false);
        const reply = state.get().messagesByChat[agentChat.id]?.at(-1)?.message;
        expect(reply?.sender).toMatchObject({
            firstName: "State Agent",
            username: "state_agent",
            kind: "agent",
        });
        expect(state.get().chats.find(({ id }) => id === agentChat.id)?.unreadCount).toBe(1);
        expect(rig.globalEventReadCount).toBe(0);
        expect(rig.globalStreamRequestCount).toBeGreaterThan(0);
        expect(rig.submittedTexts).toEqual(["Finish despite inference noise"]);
        expect(rig.cursorRejections).toBe(0);
    }, 15_000);
});

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    const images = (await client.get("/v0/admin/agentImages")).json().images as Array<{
        builtinKey?: string;
        id: string;
    }>;
    const image = images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    expect((await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {})).statusCode).toBe(
        202,
    );
    await expect
        .poll(
            async () => {
                const current = (await client.get("/v0/admin/agentImages")).json().images as Array<{
                    id: string;
                    status: string;
                }>;
                return current.find(({ id }) => id === image.id)?.status;
            },
            { timeout: 4_000 },
        )
        .toBe("ready");
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
}
