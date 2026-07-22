import { createClient, type Client } from "@libsql/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDatabase, type DrizzleExecutor } from "../drizzle.js";
import { messageSend } from "../message/messageSend.js";
import {
    agentImages,
    agentRigBindings,
    agentTurns,
    chatMembers,
    chats,
    messages,
    users,
} from "../schema.js";
import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { syncInitialize } from "../sync/syncInitialize.js";
import { agentChatBind } from "./agentChatBind.js";
import { agentChatGetContext } from "./agentChatGetContext.js";
import { agentChatListUnfinishedIds } from "./agentChatListUnfinishedIds.js";
import { agentContainerGetConfigurationContext } from "./agentContainerGetConfigurationContext.js";
import { agentContainerListBoundNames } from "./agentContainerListBoundNames.js";
import { agentEffortBindingList } from "./agentEffortBindingList.js";
import { agentEffortGetContext } from "./agentEffortGetContext.js";
import { agentRunAttach } from "./agentRunAttach.js";
import { agentSecretBindingList } from "./agentSecretBindingList.js";
import { agentTurnAttachmentGetContext } from "./agentTurnAttachmentGetContext.js";
import { agentTurnCheckpoint } from "./agentTurnCheckpoint.js";
import { agentTurnComplete } from "./agentTurnComplete.js";
import { agentTurnGetPluginContext } from "./agentTurnGetPluginContext.js";
import { agentTurnGetRunning } from "./agentTurnGetRunning.js";
import { agentTurnHasRunnable } from "./agentTurnHasRunnable.js";
import { agentTurnRenewLease } from "./agentTurnRenewLease.js";
import { agentTurnStreamReply } from "./agentTurnStreamReply.js";
import { agentTurnTakeNext } from "./agentTurnTakeNext.js";
import { agentTurnTraceStart } from "./agentTurnTraceStart.js";

const actorUserId = "active-agent-test-human";
const agentUserId = "active-agent-test-agent";
const imageId = "active-agent-test-image";
const boundChatId = "active-agent-test-bound-chat";
const unboundChatId = "active-agent-test-unbound-chat";
const sessionId = "active-agent-test-session";
const containerName = "active-agent-test-container";

describe("users.active agent execution authority", () => {
    let client: Client;
    let directory: string;
    let executor: DrizzleExecutor;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "happy2-active-agent-execution-"));
        client = createClient({ url: `file:${join(directory, "happy2.db")}` });
        executor = createDatabase(client);
        await serverSchemaMigrate(client);
        await syncInitialize(executor);
        await executor.insert(agentImages).values({
            id: imageId,
            name: "Active agent test image",
            dockerfile: "FROM scratch",
            definitionHash: "active-agent-test-image-hash",
            dockerTag: "happy2:active-agent-test",
            status: "ready",
            buildProgress: 100,
            dockerImageId: "sha256:active-agent-test",
            readyAt: new Date().toISOString(),
        });
        await executor.insert(users).values([
            {
                id: actorUserId,
                kind: "human",
                firstName: "Ada",
                username: "active_agent_test_human",
            },
            {
                id: agentUserId,
                kind: "agent",
                agentImageId: imageId,
                agentEffort: "medium",
                createdByUserId: actorUserId,
                firstName: "Agent",
                username: "active_agent_test_agent",
            },
        ]);
        await executor.insert(chats).values([directChat(boundChatId), directChat(unboundChatId)]);
        await executor.insert(chatMembers).values(
            [boundChatId, unboundChatId].flatMap((chatId) => [
                {
                    chatId,
                    userId: actorUserId,
                    role: "owner",
                    membershipEpoch: `${chatId}:human`,
                },
                {
                    chatId,
                    userId: agentUserId,
                    role: "member",
                    membershipEpoch: `${chatId}:agent`,
                },
            ]),
        );
        await executor.insert(agentRigBindings).values({
            userId: agentUserId,
            chatId: boundChatId,
            imageId,
            sessionId,
            containerName,
            cwd: "/workspace",
            effort: "medium",
        });
    });

    afterEach(async () => {
        client.close();
        await rm(directory, { force: true, recursive: true });
    });

    it("excludes inactive agents from selection, new binding, effort, and startup reconciliation", async () => {
        await expect(
            agentChatGetContext(executor, actorUserId, boundChatId, agentUserId),
        ).resolves.toMatchObject({ agentUserId, binding: { sessionId } });

        await deactivateAgent(executor);

        await expect(
            agentChatGetContext(executor, actorUserId, boundChatId, agentUserId),
        ).resolves.toBeUndefined();
        await expect(
            agentChatBind(executor, {
                actorUserId,
                agentUserId,
                chatId: unboundChatId,
                containerName: "forbidden-container",
                cwd: "/forbidden",
                effort: "medium",
                imageId,
                sessionId: "forbidden-session",
            }),
        ).rejects.toMatchObject({ code: "not_found" });
        await expect(
            agentEffortGetContext(executor, actorUserId, boundChatId, agentUserId),
        ).rejects.toMatchObject({ code: "conflict" });
        await expect(agentEffortBindingList(executor)).resolves.toEqual([]);
        await expect(agentContainerListBoundNames(executor)).resolves.toEqual([]);
        await expect(
            agentContainerGetConfigurationContext(executor, containerName),
        ).resolves.toBeUndefined();
        await expect(agentSecretBindingList(executor)).resolves.toEqual([]);
        await expect(
            executor
                .select({ sessionId: agentRigBindings.sessionId })
                .from(agentRigBindings)
                .where(eq(agentRigBindings.userId, agentUserId)),
        ).resolves.toEqual([{ sessionId }]);
    });

    it("keeps already queued work pending and rejects another turn for an inactive agent", async () => {
        const queued = await queueTurn(executor, "Queued before deactivation");
        await deactivateAgent(executor);

        await expect(
            messageSend(executor, {
                actorUserId,
                chatId: boundChatId,
                text: "Must not queue",
                audience: "agents",
                agentTurns: [{ agentUserId, sessionId }],
            }),
        ).rejects.toMatchObject({ code: "conflict" });
        await expect(agentTurnHasRunnable(executor, boundChatId)).resolves.toBe(false);
        await expect(agentChatListUnfinishedIds(executor)).resolves.toEqual([]);
        await expect(
            agentTurnTakeNext(executor, boundChatId, "inactive-agent-worker"),
        ).resolves.toBeUndefined();
        await expect(turnRows(executor)).resolves.toEqual([
            expect.objectContaining({
                agentUserId,
                status: "pending",
                userMessageId: queued.message.id,
                workerId: null,
            }),
        ]);
        await expect(messageRows(executor)).resolves.toHaveLength(1);
    });

    it("cannot resume leased work or persist agent-authored output after deactivation", async () => {
        const queued = await queueTurn(executor, "Claimed before deactivation");
        const claimed = await agentTurnTakeNext(executor, boundChatId, "original-worker");
        expect(claimed).toMatchObject({
            agentUserId,
            sessionId,
            userMessageId: queued.message.id,
            workerId: "original-worker",
        });
        await deactivateAgent(executor);
        await executor
            .update(agentTurns)
            .set({ leaseExpiresAt: "2000-01-01T00:00:00.000Z" })
            .where(eq(agentTurns.userMessageId, queued.message.id));

        await expect(
            agentTurnTakeNext(executor, boundChatId, "replacement-worker"),
        ).resolves.toBeUndefined();
        await expect(agentTurnGetRunning(executor, sessionId, "late-run")).resolves.toBeUndefined();
        await agentRunAttach(executor, {
            runId: "late-run",
            sessionId,
            text: "Claimed before deactivation",
        });
        await expect(
            agentTurnCheckpoint(executor, {
                agentUserId,
                baselineMessageCount: 1,
                runId: "late-run",
                userMessageId: queued.message.id,
                workerId: "original-worker",
            }),
        ).resolves.toBe(false);
        await expect(
            agentTurnRenewLease(executor, {
                agentUserId,
                userMessageId: queued.message.id,
                workerId: "original-worker",
            }),
        ).resolves.toBe(false);
        await expect(agentTurnTraceStart(executor, claimed!)).resolves.toBeUndefined();
        await expect(
            agentTurnStreamReply(executor, {
                agentUserId,
                actorUserId,
                eventId: "late-event",
                sessionId,
                streamCommittedText: "Late output",
                userMessageId: queued.message.id,
                text: "Late output",
                traceUpdates: [],
                workerId: "original-worker",
            }),
        ).resolves.toEqual({ applied: false });
        await expect(
            agentTurnComplete(executor, {
                agentUserId,
                actorUserId,
                sessionId,
                userMessageId: queued.message.id,
                text: "Late final output",
                workerId: "original-worker",
            }),
        ).resolves.toBeUndefined();
        await expect(
            messageSend(executor, {
                actorUserId,
                agentSessionId: sessionId,
                chatId: boundChatId,
                kind: "automated",
                text: "Forged late output",
            }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
            agentTurnAttachmentGetContext(executor, {
                agentUserId,
                chatId: boundChatId,
                sessionId,
                userMessageId: queued.message.id,
            }),
        ).resolves.toBeUndefined();
        await expect(
            agentTurnGetPluginContext(executor, { runId: "late-run", sessionId }),
        ).resolves.toBeUndefined();
        await expect(turnRows(executor)).resolves.toEqual([
            expect.objectContaining({
                runId: null,
                status: "running",
                workerId: "original-worker",
            }),
        ]);
        await expect(messageRows(executor)).resolves.toHaveLength(1);
    });
});

function directChat(id: string) {
    return {
        id,
        kind: "dm",
        dmType: "direct",
        dmKey: `active-agent-test:${id}`,
        createdByUserId: actorUserId,
        ownerUserId: actorUserId,
        visibility: "direct",
        isListed: 0,
    };
}

async function deactivateAgent(executor: DrizzleExecutor): Promise<void> {
    await executor.update(users).set({ active: 0 }).where(eq(users.id, agentUserId));
}

function queueTurn(executor: DrizzleExecutor, text: string) {
    return messageSend(executor, {
        actorUserId,
        chatId: boundChatId,
        text,
        audience: "agents",
        agentTurns: [{ agentUserId, sessionId }],
    });
}

function turnRows(executor: DrizzleExecutor) {
    return executor
        .select({
            agentUserId: agentTurns.agentUserId,
            runId: agentTurns.runId,
            status: agentTurns.status,
            userMessageId: agentTurns.userMessageId,
            workerId: agentTurns.workerId,
        })
        .from(agentTurns);
}

function messageRows(executor: DrizzleExecutor) {
    return executor.select({ id: messages.id }).from(messages);
}
