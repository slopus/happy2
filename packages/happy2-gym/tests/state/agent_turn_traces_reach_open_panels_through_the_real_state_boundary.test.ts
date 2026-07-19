import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("agent turn traces through happy2-state and the real server", () => {
    it("streams a live trace into an open surface and keeps it after completion", async () => {
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
        const owner = await server.createUser({ username: "trace_state_owner" });
        await configureAgentImage(server.as(owner));
        const transport = await createGymStateTransport(server, owner);
        const backgroundErrors: string[] = [];
        await using state = happyStateCreate({
            transport,
            backgroundError: (error) => backgroundErrors.push(error.message),
        });
        await state.syncStart();
        await transport.whenConnected();

        await state.agentCreate({ name: "Trace Agent", username: "trace_state_agent" });
        const agentChat = state
            .sidebar()
            .getState()
            .chats.find(({ displayName }) => displayName === "Trace Agent")?.chat;
        expect(agentChat).toBeDefined();
        using chat = state.chatOpen(agentChat!.id);
        await state.whenIdle();
        state.messageSend(agentChat!.id, {
            text: "Trace this turn end to end",
            clientMutationId: "trace-state-turn",
        });

        await expect.poll(() => rig.submittedRuns.length, { timeout: 4_000 }).toBe(1);
        const placeholder = () =>
            chat
                .getState()
                .messages.find(
                    ({ message }) =>
                        message.kind === "automated" && message.agentTrace !== undefined,
                )?.message;
        await expect
            .poll(() => placeholder()?.agentTrace?.status, { timeout: 10_000 })
            .toBe("running");
        const assistantMessageId = placeholder()!.id;
        expect(placeholder()).toMatchObject({ text: "", generationStatus: "streaming" });

        using trace = state.agentTraceOpen(assistantMessageId);
        await expect.poll(() => trace.getState().trace.type, { timeout: 4_000 }).toBe("ready");

        const run = rig.submittedRuns[0]!;
        rig.emitThinkingStart(run.runId, 20);
        rig.emitThinkingDelta(run.runId, "Checking the workspace", 40);
        await expect
            .poll(
                () => {
                    const current = trace.getState().trace;
                    return current.type === "ready"
                        ? current.value.entries.some(({ kind }) => kind === "reasoning")
                        : false;
                },
                { timeout: 10_000 },
            )
            .toBe(true);

        rig.emitSubagentChanged(run.runId, {
            id: "subagent-1",
            activeSince: Date.now(),
            description: "Review server tests",
            latestText: "Reading the gym harness",
            status: "running",
            totalTokens: 64,
        });
        rig.emitBackgroundProcesses(run.runId, [
            { sessionId: 7, command: "pnpm test --watch", cwd: "/workspace" },
        ]);
        await expect
            .poll(() => chat.getState().agentActivity[0]?.subagents[0]?.id, { timeout: 10_000 })
            .toBe("subagent-1");
        expect(chat.getState().agentActivity[0]).toMatchObject({
            subagents: [
                {
                    description: "Review server tests",
                    latestText: "Reading the gym harness",
                    status: "running",
                },
            ],
            backgroundTerminals: [{ id: "7", command: "pnpm test --watch", cwd: "/workspace" }],
        });

        rig.completeRun(run.runId, "Trace persisted end to end.");
        await expect
            .poll(() => placeholder()?.generationStatus, { timeout: 10_000 })
            .toBe("complete");
        expect(placeholder()?.text).toBe("Trace persisted end to end.");
        await expect
            .poll(
                () => {
                    const current = trace.getState().trace;
                    return current.type === "ready" ? current.value.status : current.type;
                },
                { timeout: 10_000 },
            )
            .toBe("complete");
        const completed = trace.getState().trace;
        expect(completed.type).toBe("ready");
        if (completed.type === "ready") {
            expect(completed.value.latest).toMatchObject({ title: "Turn completed" });
            expect(completed.value.subagents).toEqual([]);
            expect(completed.value.backgroundTerminals).toEqual([]);
            expect(completed.value.entries.some(({ kind }) => kind === "reasoning")).toBe(true);
        }
        await expect.poll(() => chat.getState().agentActivity.length, { timeout: 10_000 }).toBe(0);
        expect(backgroundErrors).toEqual([]);
    }, 30_000);
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
