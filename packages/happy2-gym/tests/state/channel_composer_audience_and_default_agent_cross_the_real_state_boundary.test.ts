import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("channel composer audience through happy2-state and the real server", () => {
    it("routes people and agents sends from the composer and applies a default-agent change", async () => {
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
        const owner = await server.createUser({ username: "audience_owner" });
        await configureAgentImage(server.as(owner));
        const transport = await createGymStateTransport(server, owner);
        const backgroundErrors: string[] = [];
        await using state = happyStateCreate({
            transport,
            backgroundError: (error) => backgroundErrors.push(error.message),
        });
        await state.syncStart();
        await transport.whenConnected();

        await state.agentCreate({ name: "Channel Agent", username: "channel_agent" });
        const directory = state.directory();
        await state.channelCreate({
            kind: "public_channel",
            name: "Launch room",
            slug: "launch-room",
        });
        await state.whenIdle();
        const channel = state
            .sidebar()
            .getState()
            .chats.find(({ chat }) => chat.slug === "launch-room")?.chat;
        expect(channel).toBeDefined();
        const agentUser = directory
            .getState()
            .users.find((user) => user.username === "channel_agent");
        expect(agentUser).toMatchObject({ kind: "agent" });

        const observerBackgroundErrors: string[] = [];
        await using observerState = happyStateCreate({
            transport,
            backgroundError: (error) => observerBackgroundErrors.push(error.message),
        });
        await observerState.syncStart();
        await transport.whenConnected();

        await state.channelDefaultAgentUpdate(channel!.id, agentUser!.id);
        expect(
            state
                .sidebar()
                .getState()
                .chats.find(({ id }) => id === channel!.id)?.chat.defaultAgentUserId,
        ).toBe(agentUser!.id);
        await expect
            .poll(
                () =>
                    observerState
                        .sidebar()
                        .getState()
                        .chats.find(({ id }) => id === channel!.id)?.chat.defaultAgentUserId,
                { timeout: 4_000 },
            )
            .toBe(agentUser!.id);
        expect(observerBackgroundErrors).toEqual([]);

        using chat = state.chatOpen(channel!.id);
        await state.whenIdle();
        expect(chat.getState().status).toMatchObject({
            type: "ready",
            value: { defaultAgentUserId: agentUser!.id },
        });

        const composer = state.composer(channel!.id, { audience: "people" });
        composer.getState().textUpdate("Status update for the humans");
        composer.getState().textSubmit();
        await state.whenIdle();
        expect(backgroundErrors).toEqual([]);
        expect(rig.submittedRuns.length).toBe(0);
        expect(
            chat.getState().messages.map(({ message }) => ({
                audience: message.audience,
                agentUserIds: message.agentUserIds,
                text: message.text,
            })),
        ).toEqual([
            {
                audience: "people",
                agentUserIds: [],
                text: "Status update for the humans",
            },
        ]);

        composer.getState().audienceToggle();
        composer.getState().textUpdate("Agent, prepare the launch checklist");
        composer.getState().textSubmit();
        await state.whenIdle();
        expect(backgroundErrors).toEqual([]);
        await expect.poll(() => rig.submittedRuns.length, { timeout: 4_000 }).toBe(1);
        rig.completeRun(rig.submittedRuns[0]!.runId, "Checklist is ready.");

        await expect
            .poll(
                () =>
                    chat.getState().messages.map(({ message }) => ({
                        audience: message.audience,
                        text: message.text,
                    })),
                { timeout: 10_000 },
            )
            .toEqual([
                { audience: "people", text: "Status update for the humans" },
                { audience: "agents", text: "Agent, prepare the launch checklist" },
                // The agent's reply addresses the humans in the channel.
                { audience: "people", text: "Checklist is ready." },
            ]);
        await state.whenIdle();
        expect(backgroundErrors).toEqual([]);
        const agentsMessage = chat
            .getState()
            .messages.find(
                ({ message }) => message.text === "Agent, prepare the launch checklist",
            )?.message;
        expect(agentsMessage?.agentUserIds).toEqual([agentUser!.id]);
        expect(composer.getState()).toMatchObject({
            text: "",
            audience: "agents",
        });
    }, 20_000);
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
