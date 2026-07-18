import { happyStateCreate, type ChatMessageItem } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("streamed agent Markdown through happy2-state", () => {
    it("reconciles an incomplete durable reply before both clients converge on its completion", async () => {
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
        const owner = await server.createUser({ username: "streamed_markdown_owner" });
        await configureAgentImage(server.as(owner));

        const transport = await createGymStateTransport(server, owner);
        const firstBackgroundErrors: string[] = [];
        await using firstState = happyStateCreate({
            transport,
            backgroundError: (error) => firstBackgroundErrors.push(error.message),
        });
        await firstState.syncStart();
        await transport.whenConnected();

        await firstState.agentCreate({
            name: "Markdown Agent",
            username: "markdown_agent",
        });
        const chatId = firstState
            .sidebar()
            .getState()
            .chats.find(({ displayName }) => displayName === "Markdown Agent")?.id;
        if (!chatId) throw new Error("Markdown Agent chat was not materialized");
        using firstChat = firstState.chatOpen(chatId);
        await firstState.whenIdle();
        firstState.messageSend(chatId, {
            text: "Stream a Markdown answer",
            clientMutationId: "stream-markdown-answer",
        });
        await firstState.whenIdle();

        await expect.poll(() => rig.submittedRuns.length, { timeout: 4_000 }).toBe(1);
        await expect
            .poll(() => rig.sessionStreamRequestCount, { timeout: 4_000 })
            .toBeGreaterThan(0);
        await expect
            .poll(
                () =>
                    firstChat.getState().messages.map(({ delivery, message }) => ({
                        delivery,
                        text: message.text,
                    })),
                { timeout: 4_000 },
            )
            .toEqual([{ delivery: "sent", text: "Stream a Markdown answer" }]);
        const run = rig.submittedRuns[0]!;
        const firstChunk = "## Result\n\n- **par";
        rig.emitTextDelta(run.runId, firstChunk);

        await expect
            .poll(() => streamedReply(firstChat.getState().messages), {
                timeout: 4_000,
            })
            .toMatchObject({
                delivery: "sent",
                message: {
                    generationStatus: "streaming",
                    kind: "automated",
                    text: firstChunk,
                },
            });
        const streamedMessage = streamedReply(firstChat.getState().messages);
        expect(streamedMessage).toBeDefined();
        const streamedMessageId = streamedMessage!.message.id;

        const secondChunk = "tial**\n\n```ts\nconst answer = ";
        const incompleteMarkdown = firstChunk + secondChunk;
        rig.emitTextDelta(run.runId, secondChunk);
        await expect
            .poll(() => streamedReply(firstChat.getState().messages), {
                timeout: 4_000,
            })
            .toMatchObject({
                message: {
                    generationStatus: "streaming",
                    id: streamedMessageId,
                    text: incompleteMarkdown,
                },
            });

        const secondBackgroundErrors: string[] = [];
        await using secondState = happyStateCreate({
            transport,
            backgroundError: (error) => secondBackgroundErrors.push(error.message),
        });
        await secondState.syncStart();
        await transport.whenConnected();
        using secondChat = secondState.chatOpen(chatId);
        await secondState.whenIdle();
        expect(streamedReply(secondChat.getState().messages)).toMatchObject({
            delivery: "sent",
            message: {
                generationStatus: "streaming",
                id: streamedMessageId,
                text: incompleteMarkdown,
            },
        });

        const finalMarkdown = `${incompleteMarkdown}42;\n\`\`\`\n`;
        rig.completeRun(run.runId, finalMarkdown);

        for (const chat of [firstChat, secondChat]) {
            await expect
                .poll(() => streamedReply(chat.getState().messages), {
                    timeout: 8_000,
                })
                .toMatchObject({
                    delivery: "sent",
                    message: {
                        generationStatus: "complete",
                        id: streamedMessageId,
                        text: finalMarkdown,
                    },
                });
            expect(
                chat.getState().messages.filter(({ message }) => message.kind === "automated"),
            ).toHaveLength(1);
        }
        expect(firstBackgroundErrors).toEqual([]);
        expect(secondBackgroundErrors).toEqual([]);
    }, 20_000);
});

function streamedReply(messages: readonly ChatMessageItem[]) {
    return messages?.find(({ message }) => message.kind === "automated");
}

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
