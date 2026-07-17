import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

interface AgentActivity {
    type: "agent.activity";
    active: boolean;
    agentUserId: string;
    chatId: string;
    expiresAt?: number;
    occurredAt: number;
    phase: "thinking" | "typing";
    startedAt: number;
    tokenCount: number;
    turnId: string;
}

describe("Ephemeral agent turn activity", () => {
    it("streams agent-specific thinking, typing, timing, and token updates every few seconds", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "activity_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const { chatId, agentUserId } = await createAgent(asOwner);

        let stream = await openSse(await server.listen(), owner.token);

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Explain what you are doing",
            clientMutationId: "agent-activity-turn",
        });
        expect(sent.statusCode).toBe(201);
        const turnId = sent.json().message.id as string;

        const initial = activity(
            await stream.frames.until(
                (frame) =>
                    frame.name === "agent.activity" &&
                    (frame.data as { turnId?: string }).turnId === turnId,
            ),
        );
        expect(initial).toMatchObject({
            type: "agent.activity",
            active: true,
            agentUserId,
            chatId,
            phase: "thinking",
            tokenCount: 0,
            turnId,
        });
        expect(initial.startedAt).toBeLessThanOrEqual(initial.occurredAt);
        expect(initial.expiresAt).toBeGreaterThan(initial.occurredAt);
        expect(initial.expiresAt! - initial.occurredAt).toBe(10_000);

        const run = await waitForRun(rig);
        rig.emitThinkingStart(run.runId, 40);
        rig.emitThinkingDelta(run.runId, "Considering the request", 64);

        const renewed = activity(
            await stream.frames.until(
                (frame) =>
                    frame.name === "agent.activity" &&
                    (frame.data as { turnId?: string; occurredAt?: number }).turnId === turnId &&
                    (frame.data as { occurredAt?: number }).occurredAt! > initial.occurredAt &&
                    (frame.data as { tokenCount?: number }).tokenCount === 64,
            ),
        );
        expect(renewed).toMatchObject({
            active: true,
            agentUserId,
            chatId,
            phase: "thinking",
            startedAt: initial.startedAt,
            tokenCount: 64,
            turnId,
        });
        expect(renewed.occurredAt - initial.occurredAt).toBeGreaterThanOrEqual(2_500);

        stream.controller.abort();
        await stream.frames.cancel();
        await server.restart();
        stream = await openSse(await server.listen(), owner.token);

        rig.emitTextDelta(run.runId, "Here is the answer", 96);
        const typing = activity(
            await stream.frames.until(
                (frame) =>
                    frame.name === "agent.activity" &&
                    (frame.data as { turnId?: string; phase?: string }).turnId === turnId &&
                    (frame.data as { phase?: string }).phase === "typing",
            ),
        );
        expect(typing).toMatchObject({
            active: true,
            agentUserId,
            chatId,
            phase: "typing",
            startedAt: initial.startedAt,
            tokenCount: 96,
            turnId,
        });

        rig.completeRun(run.runId, "Here is the answer");
        const stopped = activity(
            await stream.frames.until(
                (frame) =>
                    frame.name === "agent.activity" &&
                    (frame.data as { turnId?: string; active?: boolean }).turnId === turnId &&
                    (frame.data as { active?: boolean }).active === false,
            ),
        );
        expect(stopped).toMatchObject({
            active: false,
            agentUserId,
            chatId,
            phase: "typing",
            startedAt: initial.startedAt,
            tokenCount: 96,
            turnId,
        });
        expect(stopped).not.toHaveProperty("expiresAt");

        stream.controller.abort();
        await stream.frames.cancel();
    }, 15_000);
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

async function createAgent(
    client: GymRequestClient,
): Promise<{ agentUserId: string; chatId: string }> {
    await configureAgentImage(client);
    const response = await client.post("/v0/chats/createAgent", {
        name: "Activity Agent",
        username: "activity_agent",
    });
    expect(response.statusCode).toBe(201);
    const contacts = (await client.get("/v0/contacts")).json().users as Array<{
        id: string;
        username: string;
    }>;
    const agent = contacts.find(({ username }) => username === "activity_agent");
    if (!agent) throw new Error("The activity agent contact was not created");
    return { agentUserId: agent.id, chatId: response.json().chat.id as string };
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

async function waitForRun(rig: MockRigDaemon) {
    await waitFor(() => rig.submittedRuns.length === 1, "the submitted Rig run");
    return rig.submittedRuns[0]!;
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

function activity(frame: { data: unknown }): AgentActivity {
    return frame.data as AgentActivity;
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
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("Timed out waiting for an SSE frame")),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
