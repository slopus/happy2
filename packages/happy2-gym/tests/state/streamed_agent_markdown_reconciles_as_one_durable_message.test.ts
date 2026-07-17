import { createClientState } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentDockerRuntime } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("streamed agent Markdown through happy2-state", () => {
    it("reconciles an incomplete durable reply before both clients converge on its completion", async () => {
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
        const owner = await server.createUser({ username: "streamed_markdown_owner" });
        await configureAgentImage(server.as(owner));

        const transport = await createGymStateTransport(server, owner);
        await using firstState = createClientState(transport);
        const firstBackgroundErrors: string[] = [];
        firstState.subscribe("background-error", ({ error }) =>
            firstBackgroundErrors.push(error.message),
        );
        await firstState.start();
        await transport.whenConnected();

        const chat = await firstState.createAgent({
            name: "Markdown Agent",
            username: "markdown_agent",
        });
        await firstState.loadMessages(chat.id);
        firstState.sendMessage(chat.id, {
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
                    firstState.get().messagesByChat[chat.id]?.map(({ delivery, message }) => ({
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
            .poll(() => streamedReply(firstState.get().messagesByChat[chat.id]), {
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
        const streamedMessage = streamedReply(firstState.get().messagesByChat[chat.id]);
        expect(streamedMessage).toBeDefined();
        const streamedMessageId = streamedMessage!.message.id;

        const secondChunk = "tial**\n\n```ts\nconst answer = ";
        const incompleteMarkdown = firstChunk + secondChunk;
        rig.emitTextDelta(run.runId, secondChunk);
        await expect
            .poll(() => streamedReply(firstState.get().messagesByChat[chat.id]), {
                timeout: 4_000,
            })
            .toMatchObject({
                message: {
                    generationStatus: "streaming",
                    id: streamedMessageId,
                    text: incompleteMarkdown,
                },
            });

        await using secondState = createClientState(transport);
        const secondBackgroundErrors: string[] = [];
        secondState.subscribe("background-error", ({ error }) =>
            secondBackgroundErrors.push(error.message),
        );
        await secondState.start();
        await transport.whenConnected();
        await secondState.loadMessages(chat.id);
        expect(streamedReply(secondState.get().messagesByChat[chat.id])).toMatchObject({
            delivery: "sent",
            message: {
                generationStatus: "streaming",
                id: streamedMessageId,
                text: incompleteMarkdown,
            },
        });

        const finalMarkdown = `${incompleteMarkdown}42;\n\`\`\`\n`;
        rig.completeRun(run.runId, finalMarkdown);

        for (const state of [firstState, secondState]) {
            await expect
                .poll(() => streamedReply(state.get().messagesByChat[chat.id]), {
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
                state
                    .get()
                    .messagesByChat[chat.id]?.filter(({ message }) => message.kind === "automated"),
            ).toHaveLength(1);
        }
        expect(firstBackgroundErrors).toEqual([]);
        expect(secondBackgroundErrors).toEqual([]);
    }, 20_000);
});

function streamedReply(
    messages: ReturnType<ReturnType<typeof createClientState>["get"]>["messagesByChat"][string],
) {
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
