import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

interface TraceSummary {
    turnId: string;
    status: "pending" | "running" | "complete" | "failed";
    entryCount: number;
    latest?: { kind: string; title: string; detail?: string };
    subagents: Array<{ id: string; description: string; latestText?: string; status: string }>;
    backgroundTerminals: Array<{ id: string; command: string; cwd: string }>;
}

interface TraceDetails extends TraceSummary {
    entries: Array<{
        id: string;
        kind: string;
        title: string;
        detail?: string;
        status: string;
    }>;
}

describe("Durable live agent turn traces", () => {
    it("streams active subagents and terminals while preserving reasoning and tool history", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "trace_owner", firstName: "Owner" });
        const outsider = await server.createUser({
            username: "trace_outsider",
            firstName: "Outsider",
        });
        const asOwner = server.as(owner);
        const { chatId } = await createAgent(asOwner);
        const stream = await openSse(await server.listen(), owner.token);

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Inspect the workspace and keep me posted",
            clientMutationId: "durable-agent-trace",
        });
        expect(sent.statusCode).toBe(201);
        const turnId = sent.json().message.id as string;
        expect((await asOwner.get(`/v0/messages/${turnId}/agentTrace`)).statusCode).toBe(404);

        const placeholder = await pollAgentMessage(asOwner, chatId, (message) => {
            const trace = message.agentTrace as TraceSummary | undefined;
            return trace?.turnId === turnId && trace.status === "running";
        });
        expect(placeholder).toMatchObject({
            kind: "automated",
            text: "",
            generationStatus: "streaming",
        });
        const assistantMessageId = placeholder.id as string;
        expect(placeholder.agentTrace).toMatchObject({
            turnId,
            status: "running",
            entryCount: 1,
        });

        const run = await waitForRun(rig);
        rig.emitThinkingStart(run.runId, 20);
        await waitFor(async () => {
            const trace = await getTrace(asOwner, assistantMessageId);
            return trace.entries.some(({ kind }) => kind === "reasoning");
        }, "the first reasoning span to persist");
        rig.emitThinkingDelta(run.runId, "Checking package boundaries", 40);
        rig.emitToolExecutionStart(run.runId, {
            id: "tool-1",
            name: "exec_command",
            arguments: { cmd: "pnpm test" },
        });
        await waitFor(async () => {
            const trace = await getTrace(asOwner, assistantMessageId);
            return trace.entries.some(({ kind }) => kind === "tool");
        }, "the first tool span to persist");
        rig.emitToolExecutionProgress(run.runId, "tool-1", "Running package tests");
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

        const active = activity(
            await stream.frames.until((frame) => {
                if (frame.name !== "agent.activity") return false;
                const value = activity(frame);
                return (
                    value.turnId === turnId &&
                    value.subagents.some(({ id }) => id === "subagent-1") &&
                    value.backgroundTerminals.some(({ id }) => id === "7")
                );
            }),
        );
        expect(active.subagents).toEqual([
            expect.objectContaining({
                id: "subagent-1",
                description: "Review server tests",
                latestText: "Reading the gym harness",
                status: "running",
                totalTokens: 64,
            }),
        ]);
        expect(active.backgroundTerminals).toEqual([
            expect.objectContaining({
                id: "7",
                command: "pnpm test --watch",
                cwd: "/workspace",
            }),
        ]);

        const liveMessage = await pollAgentMessage(asOwner, chatId, (message) => {
            const trace = message.agentTrace as TraceSummary | undefined;
            return Boolean(
                trace?.subagents.some(({ id }) => id === "subagent-1") &&
                trace.backgroundTerminals.some(({ id }) => id === "7") &&
                trace.entryCount >= 5,
            );
        });
        expect(liveMessage.agentTrace).toMatchObject({
            status: "running",
            subagents: [expect.objectContaining({ id: "subagent-1" })],
            backgroundTerminals: [expect.objectContaining({ id: "7" })],
        });

        const liveTrace = await getTrace(asOwner, assistantMessageId);
        expect(liveTrace.entries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: "reasoning",
                    title: "Reasoning",
                    detail: "Checking package boundaries",
                }),
                expect.objectContaining({
                    kind: "tool",
                    title: "Running Exec command",
                    detail: "Running package tests",
                }),
                expect.objectContaining({
                    kind: "subagent",
                    title: "Review server tests",
                    detail: "Reading the gym harness",
                }),
                expect.objectContaining({
                    kind: "terminal",
                    title: "Background terminal running",
                    detail: "pnpm test --watch",
                }),
            ]),
        );
        expect(liveTrace.entries.filter(({ kind }) => kind === "reasoning")).toHaveLength(1);
        expect(liveTrace.entries.filter(({ kind }) => kind === "tool")).toHaveLength(1);

        const streamRequestsBeforeRestart = rig.sessionStreamRequestCount;
        await server.restart();
        const restartedMidTurn = await getTrace(asOwner, assistantMessageId);
        expect(restartedMidTurn).toMatchObject({
            status: "running",
            subagents: [expect.objectContaining({ id: "subagent-1" })],
            backgroundTerminals: [expect.objectContaining({ id: "7" })],
        });
        expect(restartedMidTurn.entries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: "reasoning" }),
                expect.objectContaining({ kind: "tool" }),
                expect.objectContaining({ kind: "subagent" }),
                expect.objectContaining({ kind: "terminal" }),
            ]),
        );
        await waitFor(
            () => rig.sessionStreamRequestCount > streamRequestsBeforeRestart,
            "the server to resume the Rig event stream",
        );

        rig.emitToolExecutionEnd(run.runId, {
            toolCallId: "tool-1",
            toolName: "exec_command",
            display: "Tests passed",
        });
        rig.emitSubagentChanged(run.runId, {
            id: "subagent-1",
            latestText: "No issues found",
            status: "completed",
            totalTokens: 80,
        });
        rig.emitBackgroundProcesses(run.runId, []);
        await waitFor(async () => {
            const trace = await getTrace(asOwner, assistantMessageId);
            return (
                trace.entries.some(
                    ({ kind, detail }) => kind === "tool" && detail === "Tests passed",
                ) &&
                trace.entries.some(
                    ({ kind, detail }) => kind === "subagent" && detail === "No issues found",
                ) &&
                trace.entries.some(
                    ({ kind, title }) =>
                        kind === "terminal" && title === "Background terminal completed",
                )
            );
        }, "the resumed stream to persist completed work");
        rig.completeRun(run.runId, "Everything is in good shape.");

        const completed = await pollAgentMessage(asOwner, chatId, (message) => {
            const trace = message.agentTrace as TraceSummary | undefined;
            return trace?.status === "complete" && message.text === "Everything is in good shape.";
        });
        expect(completed).toMatchObject({
            id: assistantMessageId,
            generationStatus: "complete",
            text: "Everything is in good shape.",
            agentTrace: {
                turnId,
                status: "complete",
                latest: expect.objectContaining({ title: "Turn completed" }),
                subagents: [],
                backgroundTerminals: [],
            },
        });

        const completedTrace = await getTrace(asOwner, assistantMessageId);
        expect(completedTrace.status).toBe("complete");
        expect(completedTrace.entries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: "tool",
                    title: "Exec command completed",
                    detail: "Tests passed",
                    status: "complete",
                }),
                expect.objectContaining({
                    kind: "subagent",
                    detail: "No issues found",
                    status: "complete",
                }),
                expect.objectContaining({
                    kind: "terminal",
                    title: "Background terminal completed",
                    status: "complete",
                }),
                expect.objectContaining({ title: "Turn completed", status: "complete" }),
            ]),
        );

        await server.restart();
        const persisted = await getTrace(asOwner, assistantMessageId);
        expect(persisted).toEqual(completedTrace);
        const forbidden = await server
            .as(outsider)
            .get(`/v0/messages/${assistantMessageId}/agentTrace`);
        expect(forbidden.statusCode).toBe(404);
        expect(
            (await asOwner.post(`/v0/messages/${assistantMessageId}/deleteMessage`, {})).statusCode,
        ).toBe(200);
        expect(
            (await asOwner.get(`/v0/messages/${assistantMessageId}/agentTrace`)).statusCode,
        ).toBe(404);

        stream.controller.abort();
        await stream.frames.cancel();
    }, 20_000);

    it("bounds hostile Rig trace payloads without losing the live channel", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({ username: "trace_bounds", firstName: "Owner" });
        const asOwner = server.as(owner);
        const { chatId } = await createAgent(asOwner);
        const stream = await openSse(await server.listen(), owner.token);
        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Exercise trace bounds",
            clientMutationId: "bounded-agent-trace",
        });
        const turnId = sent.json().message.id as string;
        const placeholder = await pollAgentMessage(asOwner, chatId, (message) =>
            Boolean((message.agentTrace as TraceSummary | undefined)?.status === "running"),
        );
        const assistantMessageId = placeholder.id as string;
        const run = await waitForRun(rig);

        for (let index = 0; index < 40; index += 1)
            rig.emitSubagentChanged(run.runId, {
                id: `${"subagent".repeat(24)}-${index}`,
                activeSince: Number.POSITIVE_INFINITY,
                description: index === 0 ? "   " : "d".repeat(2_000),
                latestText: "l".repeat(2_000),
                status: "running",
                totalTokens: Number.POSITIVE_INFINITY,
            });
        rig.emitBackgroundProcesses(
            run.runId,
            Array.from({ length: 40 }, (_, index) => ({
                sessionId: index,
                command: index === 0 ? "   " : "c".repeat(2_000),
                cwd: index === 0 ? "   " : "w".repeat(2_000),
            })),
        );

        const bounded = activity(
            await stream.frames.until((frame) => {
                if (frame.name !== "agent.activity") return false;
                const value = activity(frame);
                return value.turnId === turnId && value.backgroundTerminals.length === 32;
            }),
        );
        expect(bounded.subagents).toHaveLength(32);
        expect(bounded.backgroundTerminals).toHaveLength(32);
        expect(bounded.subagents.every(({ id }) => id.length <= 128)).toBe(true);
        expect(
            bounded.subagents.every(
                ({ description, latestText }) =>
                    description.length > 0 &&
                    description.length <= 240 &&
                    (latestText?.length ?? 0) <= 240,
            ),
        ).toBe(true);
        expect(
            bounded.backgroundTerminals.every(
                ({ command, cwd }) =>
                    command.length > 0 &&
                    command.length <= 240 &&
                    cwd.length > 0 &&
                    cwd.length <= 240,
            ),
        ).toBe(true);

        for (let index = 0; index < 520; index += 1)
            rig.emitToolExecutionStart(run.runId, {
                id: `tool-${index}`,
                name: `tool_${index}_${"n".repeat(2_000)}`,
            });
        await waitFor(
            async () => {
                const trace = await getTrace(asOwner, assistantMessageId);
                return trace.entryCount === 511;
            },
            "the bounded trace collection",
            15_000,
        );
        rig.completeRun(run.runId, "Trace input stayed bounded.");
        await pollAgentMessage(asOwner, chatId, (message) =>
            Boolean((message.agentTrace as TraceSummary | undefined)?.status === "complete"),
        );
        const completed = await getTrace(asOwner, assistantMessageId);
        expect(completed.entryCount).toBe(512);
        expect(completed.entries).toHaveLength(512);
        expect(
            completed.entries.every(({ title }) => title.length > 0 && title.length <= 500),
        ).toBe(true);

        stream.controller.abort();
        await stream.frames.cancel();
    }, 30_000);
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

async function createAgent(client: GymRequestClient): Promise<{ chatId: string }> {
    await configureAgentImage(client);
    const response = await client.post("/v0/chats/createAgent", {
        name: "Trace Agent",
        username: "trace_agent",
    });
    expect(response.statusCode).toBe(201);
    return { chatId: response.json().chat.id as string };
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

async function getTrace(client: GymRequestClient, messageId: string): Promise<TraceDetails> {
    const response = await client.get(`/v0/messages/${messageId}/agentTrace`);
    expect(response.statusCode).toBe(200);
    return response.json().trace as TraceDetails;
}

async function pollAgentMessage(
    client: GymRequestClient,
    chatId: string,
    predicate: (message: Record<string, unknown>) => boolean,
): Promise<Record<string, any>> {
    let result: Record<string, any> | undefined;
    await waitFor(async () => {
        const response = await client.get(`/v0/chats/${chatId}/messages?limit=100`);
        result = (response.json().messages as Array<Record<string, any>>).find(
            (message) => message.kind === "automated" && predicate(message),
        );
        return result !== undefined;
    }, "the agent message projection");
    return result!;
}

async function waitForRun(rig: MockRigDaemon) {
    await waitFor(() => rig.submittedRuns.length === 1, "the submitted Rig run");
    return rig.submittedRuns[0]!;
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

interface Activity {
    turnId: string;
    subagents: Array<{
        id: string;
        description: string;
        latestText?: string;
        status: string;
        totalTokens: number;
    }>;
    backgroundTerminals: Array<{ id: string; command: string; cwd: string }>;
}

function activity(frame: { data: unknown }): Activity {
    return frame.data as Activity;
}

async function openSse(
    baseUrl: string,
    token: string,
): Promise<{ controller: AbortController; frames: SseFrames }> {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/v0/sync/events`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const frames = new SseFrames(response.body!.getReader());
    expect((await frames.next()).name).toBe("ready");
    return { controller, frames };
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
            const result = await withTimeout(this.reader.read(), 5_000);
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for SSE data")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
