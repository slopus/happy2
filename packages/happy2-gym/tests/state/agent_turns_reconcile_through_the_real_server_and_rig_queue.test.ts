import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("agent turns through happy2-state and the real server", () => {
    it("persists and reconciles one reply while Rig emits noisy inference updates", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
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
        const backgroundErrors: string[] = [];
        await using state = happyStateCreate({
            transport,
            backgroundError: (error) => backgroundErrors.push(error.message),
        });
        await state.syncStart();
        await transport.whenConnected();

        await state.agentCreate({ name: "State Agent", username: "state_agent" });
        const agentChat = state
            .sidebar()
            .getState()
            .chats.find(({ displayName }) => displayName === "State Agent")?.chat;
        expect(agentChat).toMatchObject({ kind: "dm", dmType: "direct" });
        const directory = state.directory();
        await state.whenIdle();
        const agentUser = directory
            .getState()
            .users.find((user) => user.username === "state_agent");
        expect(agentUser).toMatchObject({
            displayName: "State Agent",
            username: "state_agent",
            kind: "agent",
        });
        using chat = state.chatOpen(agentChat!.id);
        await state.whenIdle();
        state.messageSend(agentChat!.id, {
            text: "Finish despite inference noise",
            clientMutationId: "state-agent-noise",
        });

        await state.whenIdle();
        expect(backgroundErrors).toEqual([]);
        await expect.poll(() => rig.submittedRuns.length, { timeout: 4_000 }).toBe(1);
        await expect
            .poll(() => chat.getState().typing[0]?.userId, {
                timeout: 4_000,
            })
            .toBe(agentUser!.id);
        await expect
            .poll(() => chat.getState().agentActivity[0]?.agentUserId, { timeout: 4_000 })
            .toBe(agentUser!.id);
        const liveActivity = chat.getState().agentActivity[0]!;
        expect(["thinking", "typing"]).toContain(liveActivity.phase);
        expect(liveActivity.startedAt).toBeGreaterThan(0);
        expect(liveActivity.expiresAt).toBeGreaterThan(liveActivity.startedAt);

        rig.emitGlobalUpdates(2_000);
        rig.completeRun(rig.submittedRuns[0]!.runId, "The durable reply arrived once.");

        await expect
            .poll(
                () =>
                    chat.getState().messages.map(({ delivery, message }) => ({
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
            .poll(() => chat.getState().typing.length > 0, {
                timeout: 4_000,
            })
            .toBe(false);
        await expect
            .poll(() => chat.getState().agentActivity.length > 0, {
                timeout: 4_000,
            })
            .toBe(false);
        const reply = chat.getState().messages.at(-1)?.message;
        expect(reply?.sender).toMatchObject({
            displayName: "State Agent",
            kind: "agent",
        });
        expect(
            state
                .sidebar()
                .getState()
                .chats.find(({ id }) => id === agentChat!.id)?.chat.unreadCount,
        ).toBe(1);
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
