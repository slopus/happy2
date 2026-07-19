import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

interface ChatState {
    mentionCount?: number;
    membershipEpoch: string;
    pts: string;
    unreadCount?: number;
}

interface MessageProjection {
    generationStatus?: "streaming" | "complete" | "failed";
    id: string;
    kind: "user" | "automated";
    revision: number;
    sequence: string;
    text: string;
}

interface ChatDifference {
    messages: MessageProjection[];
    state: ChatState;
    updates: Array<{ entityId?: string; kind: string }>;
}

describe("Streamed agent replies", () => {
    it("awaits Rig abort before archiving an active agent chat", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "archive_running_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner, "archive_running_agent");

        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "Keep working until archived",
                    clientMutationId: "archive-running-turn",
                })
            ).statusCode,
        ).toBe(201);
        const run = await waitForRun(rig, 1);

        const archived = await asOwner.post(`/v0/chats/${chatId}/archiveChannel`, {});
        expect(archived.statusCode).toBe(200);
        expect(rig.abortRequests).toEqual([{ sessionId: run.sessionId, expectedRunId: run.runId }]);
        expect(archived.json().chat.archivedAt).toEqual(expect.any(String));
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
                    text: "This must remain blocked",
                    clientMutationId: "archived-message",
                })
            ).statusCode,
        ).toBe(403);

        const repeated = await asOwner.post(`/v0/chats/${chatId}/archiveChannel`, {});
        expect(repeated.statusCode).toBe(200);
        expect(rig.abortRequests).toHaveLength(1);
        const restored = await asOwner.post(`/v0/chats/${chatId}/unarchiveChannel`, {});
        expect(restored.statusCode).toBe(200);
        expect(restored.json().chat.archivedAt).toBeUndefined();
    });

    it("publishes incomplete Markdown and completes the same reply with exact whitespace", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "streamed_reply_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner, "streaming_fixer");

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Show the implementation",
            clientMutationId: "streamed-markdown-turn",
        });
        expect(sent.statusCode).toBe(201);
        const run = await waitForRun(rig, 1);
        const beforeReply = await chatState(asOwner, chatId);

        const partialText = "  ## Résultat 🚀\n\n```ts\nconst answer = ";
        rig.emitTextStart(run.runId);
        rig.emitTextDelta(run.runId, partialText);

        const streamed = await waitForReplyDifference(
            asOwner,
            chatId,
            beforeReply,
            (message) =>
                message.kind === "automated" &&
                message.text === partialText &&
                message.generationStatus === "streaming",
            "the incomplete Markdown reply",
        );
        expect(streamed.difference.updates).toContainEqual(
            expect.objectContaining({
                entityId: streamed.reply.id,
                kind: "message.streaming",
            }),
        );
        expect(streamed.reply).toMatchObject({
            generationStatus: "streaming",
            kind: "automated",
            revision: 1,
            text: partialText,
        });

        const finalText = `${partialText}42;\n\`\`\`\n\n@streamed_reply_owner  \n`;
        rig.emitTextDelta(run.runId, finalText.slice(partialText.length));
        rig.emitTextEnd(run.runId);
        rig.completeRun(run.runId, finalText);

        const completed = await waitForReplyDifference(
            asOwner,
            chatId,
            streamed.difference.state,
            (message) =>
                message.id === streamed.reply.id && message.generationStatus === "complete",
            "the completed Markdown reply",
        );
        expect(completed.difference.updates).toContainEqual(
            expect.objectContaining({
                entityId: streamed.reply.id,
                kind: "message.completed",
            }),
        );
        expect(completed.difference.updates).toContainEqual(
            expect.objectContaining({
                entityId: streamed.reply.id,
                kind: "message.streaming",
            }),
        );
        expect(completed.reply).toMatchObject({
            generationStatus: "complete",
            id: streamed.reply.id,
            revision: 1,
            sequence: streamed.reply.sequence,
            text: finalText,
        });
        expect(completed.reply.text.startsWith("  ")).toBe(true);
        expect(completed.reply.text.endsWith("  \n")).toBe(true);
        expect(await chatState(asOwner, chatId)).toMatchObject({
            mentionCount: 1,
            unreadCount: 1,
        });
        expect(
            (await asOwner.get("/v0/notifications?unreadOnly=true")).json().notifications,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: "mention", messageId: streamed.reply.id }),
            ]),
        );
    });

    it("resumes a persisted partial reply after server restart without duplicating text", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "restart_stream_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner, "restart_fixer");

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Continue across a restart",
            clientMutationId: "restart-stream-turn",
        });
        expect(sent.statusCode).toBe(201);
        const run = await waitForRun(rig, 1);
        const beforeReply = await chatState(asOwner, chatId);

        const firstPartial = "Before restart: **";
        rig.emitTextStart(run.runId);
        rig.emitTextDelta(run.runId, firstPartial);
        const beforeRestart = await waitForReplyDifference(
            asOwner,
            chatId,
            beforeReply,
            (message) =>
                message.kind === "automated" &&
                message.text === firstPartial &&
                message.generationStatus === "streaming",
            "the partial reply before restart",
        );
        expect(
            (
                await asOwner.post(`/v0/chats/${chatId}/markRead`, {
                    messageId: beforeRestart.reply.id,
                })
            ).statusCode,
        ).toBe(200);

        await server.restart();

        const continuation = "after restart";
        const resumedText = firstPartial + continuation;
        rig.emitTextDelta(run.runId, continuation);
        const afterRestart = await waitForReplyDifference(
            asOwner,
            chatId,
            beforeRestart.difference.state,
            (message) =>
                message.id === beforeRestart.reply.id &&
                message.text === resumedText &&
                message.generationStatus === "streaming",
            "the resumed partial reply",
        );
        expect(afterRestart.reply).toMatchObject({
            generationStatus: "streaming",
            id: beforeRestart.reply.id,
            sequence: beforeRestart.reply.sequence,
            text: resumedText,
        });
        expect(afterRestart.reply.text).not.toBe(firstPartial + resumedText);

        const finalText = `${resumedText}**\n`;
        rig.emitTextEnd(run.runId, finalText);
        rig.completeRun(run.runId, finalText);
        const completed = await waitForReplyDifference(
            asOwner,
            chatId,
            afterRestart.difference.state,
            (message) =>
                message.id === beforeRestart.reply.id && message.generationStatus === "complete",
            "the completed reply after restart",
        );
        expect(completed.reply).toMatchObject({
            generationStatus: "complete",
            id: beforeRestart.reply.id,
            sequence: beforeRestart.reply.sequence,
            text: finalText,
        });
        expect(await automatedMessages(asOwner, chatId)).toEqual([
            expect.objectContaining({
                generationStatus: "complete",
                id: beforeRestart.reply.id,
                sequence: beforeRestart.reply.sequence,
                text: finalText,
            }),
        ]);
        expect((await chatState(asOwner, chatId)).unreadCount).toBe(0);
    });

    it("streams a run recovered after its accepted submit response is lost", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        rig.dropNextSubmissionResponseAfterAccept();
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "lost_stream_submit_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner, "lost_stream_submit_fixer");

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Recover this accepted stream",
            clientMutationId: "lost-stream-submit-turn",
        });
        expect(sent.statusCode).toBe(201);
        const run = await waitForRun(rig, 1);
        const beforeReply = await chatState(asOwner, chatId);

        const partialText = "Recovered **stream";
        rig.emitTextDelta(run.runId, partialText);
        const streamed = await waitForReplyDifference(
            asOwner,
            chatId,
            beforeReply,
            (message) =>
                message.kind === "automated" &&
                message.text === partialText &&
                message.generationStatus === "streaming",
            "the streamed reply after lost submission response recovery",
        );

        const finalText = `${partialText}**\n`;
        rig.completeRun(run.runId, finalText);
        const completed = await waitForReplyDifference(
            asOwner,
            chatId,
            streamed.difference.state,
            (message) =>
                message.id === streamed.reply.id && message.generationStatus === "complete",
            "the completed recovered stream",
        );
        expect(completed.reply).toMatchObject({
            id: streamed.reply.id,
            sequence: streamed.reply.sequence,
            text: finalText,
        });
        expect(rig.submittedTexts).toEqual(["Recover this accepted stream"]);
        expect(await automatedMessages(asOwner, chatId)).toHaveLength(1);
    });

    it("does not regress a terminal reply when delayed session frames resume", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "late_frames_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner, "late_frames_fixer");

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Finish while session delivery is paused",
            clientMutationId: "late-session-frames-turn",
        });
        expect(sent.statusCode).toBe(201);
        const run = await waitForRun(rig, 1);
        const beforeReply = await chatState(asOwner, chatId);
        await waitFor(
            () => rig.sessionStreamRequestCount > 0 && rig.globalStreamRequestCount > 0,
            "the live session and durable global streams",
        );
        expect(rig.durableGlobalEventQueueEnabled).toBe(true);
        rig.pauseSessionEventDelivery();

        const partialText = "Delayed **partial";
        const finalText = "Canonical **complete**\n";
        rig.emitTextStart(run.runId);
        rig.emitTextDelta(run.runId, partialText);
        rig.emitTextEnd(run.runId, finalText);
        rig.completeRun(run.runId, finalText);

        const terminal = await waitForReplyDifference(
            asOwner,
            chatId,
            beforeReply,
            (message) =>
                message.kind === "automated" &&
                message.text === finalText &&
                message.generationStatus === "complete",
            "the canonical terminal reply from the global queue",
        );
        expect(terminal.reply).toMatchObject({
            generationStatus: "complete",
            text: finalText,
        });

        rig.resumeSessionEventDelivery();
        await expectTerminalReplyToRemainStable(
            asOwner,
            chatId,
            terminal.difference.state,
            terminal.reply,
        );
    });

    it("accumulates multiple Rig agent messages into one streamed reply", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "multi_segment_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner, "multi_segment_fixer");

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Use a tool before answering",
            clientMutationId: "multi-segment-stream-turn",
        });
        expect(sent.statusCode).toBe(201);
        const run = await waitForRun(rig, 1);
        const beforeReply = await chatState(asOwner, chatId);

        const firstSegment = "I checked the workspace.";
        rig.emitTextDelta(run.runId, firstSegment);
        rig.emitTextEnd(run.runId);
        rig.emitAgentMessage(run.runId, firstSegment);
        const committed = await waitForReplyDifference(
            asOwner,
            chatId,
            beforeReply,
            (message) =>
                message.kind === "automated" &&
                message.text === firstSegment &&
                message.generationStatus === "streaming",
            "the first committed Rig agent message",
        );

        const secondPartial = "## Final **ans";
        const combinedPartial = `${firstSegment}\n\n${secondPartial}`;
        rig.emitTextDelta(run.runId, secondPartial);
        const continued = await waitForReplyDifference(
            asOwner,
            chatId,
            committed.difference.state,
            (message) =>
                message.id === committed.reply.id &&
                message.text === combinedPartial &&
                message.generationStatus === "streaming",
            "the next inference segment",
        );
        expect(continued.reply.sequence).toBe(committed.reply.sequence);

        const secondFinal = "## Final **answer**\n";
        const finalText = `${firstSegment}\n\n${secondFinal}`;
        rig.emitTextEnd(run.runId, secondFinal);
        rig.completeRun(run.runId, secondFinal);
        const completed = await waitForReplyDifference(
            asOwner,
            chatId,
            continued.difference.state,
            (message) =>
                message.id === committed.reply.id && message.generationStatus === "complete",
            "the completed multi-segment reply",
        );
        expect(completed.reply).toMatchObject({
            generationStatus: "complete",
            id: committed.reply.id,
            sequence: committed.reply.sequence,
            text: finalText,
        });
        expect(await automatedMessages(asOwner, chatId)).toHaveLength(1);
    });

    it("replaces a partial reply with failure on the same message row", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "failed_stream_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner, "failing_fixer");

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Attempt the implementation",
            clientMutationId: "failed-stream-turn",
        });
        expect(sent.statusCode).toBe(201);
        const run = await waitForRun(rig, 1);
        const beforeReply = await chatState(asOwner, chatId);

        const partialText = "Draft **still open";
        rig.emitTextStart(run.runId);
        rig.emitTextDelta(run.runId, partialText);
        const streamed = await waitForReplyDifference(
            asOwner,
            chatId,
            beforeReply,
            (message) =>
                message.kind === "automated" &&
                message.text === partialText &&
                message.generationStatus === "streaming",
            "the partial reply before failure",
        );

        rig.failRun(run.runId, "The provider disconnected");
        const failed = await waitForReplyDifference(
            asOwner,
            chatId,
            streamed.difference.state,
            (message) => message.id === streamed.reply.id && message.generationStatus === "failed",
            "the failed reply",
        );
        expect(failed.difference.updates).toContainEqual(
            expect.objectContaining({
                entityId: streamed.reply.id,
                kind: "message.failed",
            }),
        );
        expect(failed.reply).toMatchObject({
            generationStatus: "failed",
            id: streamed.reply.id,
            sequence: streamed.reply.sequence,
            text: "I couldn't complete this request.",
        });

        expect(await automatedMessages(asOwner, chatId)).toEqual([
            expect.objectContaining({
                generationStatus: "failed",
                id: streamed.reply.id,
                sequence: streamed.reply.sequence,
                text: "I couldn't complete this request.",
            }),
        ]);
    });

    it("fails the same partial reply when its session stream becomes unrecoverable", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        await using server = await agentServer(rig);
        const owner = await server.createUser({
            username: "broken_stream_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner, "broken_stream_fixer");

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Do not leave this turn running forever",
            clientMutationId: "broken-session-stream-turn",
        });
        expect(sent.statusCode).toBe(201);
        const run = await waitForRun(rig, 1);
        const beforeReply = await chatState(asOwner, chatId);

        const partialText = "This reply started";
        rig.emitTextDelta(run.runId, partialText);
        const streamed = await waitForReplyDifference(
            asOwner,
            chatId,
            beforeReply,
            (message) =>
                message.kind === "automated" &&
                message.text === partialText &&
                message.generationStatus === "streaming",
            "the partial reply before its session stream fails",
        );

        rig.rejectNextSessionStream();
        const failed = await waitForReplyDifference(
            asOwner,
            chatId,
            streamed.difference.state,
            (message) => message.id === streamed.reply.id && message.generationStatus === "failed",
            "the terminal failure after an unrecoverable session stream response",
        );
        expect(failed.reply).toMatchObject({
            id: streamed.reply.id,
            sequence: streamed.reply.sequence,
            text: "I couldn't complete this request.",
        });
        expect(await automatedMessages(asOwner, chatId)).toHaveLength(1);
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

async function createAgent(client: GymRequestClient, username: string): Promise<string> {
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

async function chatState(client: GymRequestClient, chatId: string): Promise<ChatState> {
    const response = await client.get(`/v0/chats/${chatId}`);
    expect(response.statusCode).toBe(200);
    const chat = response.json().chat as ChatState;
    return {
        membershipEpoch: chat.membershipEpoch,
        mentionCount: chat.mentionCount,
        pts: chat.pts,
        unreadCount: chat.unreadCount,
    };
}

async function automatedMessages(
    client: GymRequestClient,
    chatId: string,
): Promise<MessageProjection[]> {
    const response = await client.get(`/v0/chats/${chatId}/messages`);
    expect(response.statusCode).toBe(200);
    return (response.json().messages as MessageProjection[]).filter(
        (message) => message.kind === "automated",
    );
}

async function expectTerminalReplyToRemainStable(
    client: GymRequestClient,
    chatId: string,
    state: ChatState,
    expected: MessageProjection,
    observationMs = 250,
): Promise<void> {
    const deadline = Date.now() + observationMs;
    do {
        const response = await client.post(`/v0/chats/${chatId}/getDifference`, {
            state,
            limit: 100,
        });
        expect(response.statusCode).toBe(200);
        const difference = response.json() as ChatDifference;
        expect(difference.messages.find((message) => message.id === expected.id)).toBeUndefined();
        expect(await automatedMessages(client, chatId)).toEqual([
            expect.objectContaining({
                generationStatus: "complete",
                id: expected.id,
                sequence: expected.sequence,
                text: expected.text,
            }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
}

async function waitForReplyDifference(
    client: GymRequestClient,
    chatId: string,
    state: ChatState,
    matches: (message: MessageProjection) => boolean,
    description: string,
    timeoutMs = 4_000,
): Promise<{ difference: ChatDifference; reply: MessageProjection }> {
    const deadline = Date.now() + timeoutMs;
    do {
        const response = await client.post(`/v0/chats/${chatId}/getDifference`, {
            state,
            limit: 100,
        });
        expect(response.statusCode).toBe(200);
        const difference = response.json() as ChatDifference;
        const reply = difference.messages.find(matches);
        if (reply) return { difference, reply };
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${description}`);
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
