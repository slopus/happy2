import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import { channelCreateWithMembers } from "../chat/channelCreateWithMembers.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import type { ChatSummary, MutationHint } from "../chat/types.js";
import { userRequireActive } from "../chat/userRequireActive.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { clientMutations, projects, serverSettings } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { projectRequire } from "./projectRequire.js";
import type { ProjectSummary } from "./types.js";

const MUTATION_SCOPE = "project.createWithChannels";

/**
 * Creates one projects row plus its chats and chatMembers rows as one transaction, crediting a selected steward while retaining the initiating actor's administrative access and recording clientMutations replay state when requested.
 * Project visibility continues to derive exclusively from channel visibility and membership; the steward is the public-channel creator or private-channel owner, and every selected person joins every initial channel before any result becomes observable.
 */
export async function projectCreateWithChannels(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        stewardUserId: string;
        name: string;
        description?: string;
        memberUserIds: readonly string[];
        channels: readonly {
            kind: "public_channel" | "private_channel";
            name: string;
            slug: string;
            topic?: string;
        }[];
        clientMutationId?: string;
    },
): Promise<{
    project: ProjectSummary;
    chats: ChatSummary[];
    hints: MutationHint[];
}> {
    return withTransaction(executor, async (tx) => {
        if (input.clientMutationId) {
            const [previous] = await tx
                .select({ resultJson: clientMutations.resultJson })
                .from(clientMutations)
                .where(
                    and(
                        eq(clientMutations.actorUserId, input.actorUserId),
                        eq(clientMutations.scope, MUTATION_SCOPE),
                        eq(clientMutations.clientMutationId, input.clientMutationId),
                    ),
                )
                .limit(1);
            if (previous) {
                const result = JSON.parse(previous.resultJson) as {
                    projectId?: unknown;
                    chatIds?: unknown;
                };
                if (
                    typeof result.projectId !== "string" ||
                    !Array.isArray(result.chatIds) ||
                    result.chatIds.some((id) => typeof id !== "string")
                )
                    throw new Error("Stored project creation result is malformed");
                await tx
                    .update(clientMutations)
                    .set({ lastAccessedAt: sql`CURRENT_TIMESTAMP` })
                    .where(
                        and(
                            eq(clientMutations.actorUserId, input.actorUserId),
                            eq(clientMutations.scope, MUTATION_SCOPE),
                            eq(clientMutations.clientMutationId, input.clientMutationId),
                        ),
                    );
                const chats: ChatSummary[] = [];
                for (const chatId of result.chatIds as string[]) {
                    const chat = await chatGetAccess(tx, input.actorUserId, chatId, false);
                    if (!chat) throw new Error("Created project replay is no longer readable");
                    chats.push(chat);
                }
                return {
                    project: await projectRequire(tx, result.projectId),
                    chats,
                    hints: [],
                };
            }
        }

        await userRequireActive(tx, input.actorUserId);
        if (input.stewardUserId !== input.actorUserId)
            await userRequireActive(tx, input.stewardUserId);
        if (input.channels.length === 0) throw new Error("A project requires at least one channel");

        const projectId = createId();
        await tx.insert(projects).values({
            id: projectId,
            name: input.name,
            description: input.description,
            // The initiating actor temporarily satisfies channelCreate's project-access guard.
            // This transaction is not observable until the steward attribution below is durable.
            createdByUserId: input.actorUserId,
        });

        const chats: ChatSummary[] = [];
        const hints: MutationHint[] = [];
        for (const channel of input.channels) {
            const created = await channelCreateWithMembers(tx, {
                actorUserId: input.actorUserId,
                stewardUserId: input.stewardUserId,
                projectId,
                kind: channel.kind,
                name: channel.name,
                slug: channel.slug,
                topic: channel.topic,
                memberUserIds: input.memberUserIds,
            });
            chats.push(created.chat);
            hints.push(...created.hints);
        }

        const lastHint = hints.at(-1);
        if (!lastHint) throw new Error("Project channel creation did not produce a sync hint");
        const sequence = Number(lastHint.sequence);
        if (!Number.isSafeInteger(sequence)) throw new Error("Channel sync sequence is invalid");
        await tx
            .update(projects)
            .set({
                createdByUserId: input.stewardUserId,
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(projects.id, projectId));
        await syncEventInsert(tx, {
            sequence,
            kind: "project.created",
            entityId: projectId,
            actorUserId: input.actorUserId,
            targetUserId: input.channels.some(({ kind }) => kind === "public_channel")
                ? undefined
                : input.stewardUserId,
        });
        hints[0] = {
            ...hints[0]!,
            areas: [...new Set([...hints[0]!.areas, "projects"])],
        };

        if (input.clientMutationId) {
            const [settings] = await tx
                .select({ retentionSeconds: serverSettings.idempotencyRetentionSeconds })
                .from(serverSettings)
                .where(eq(serverSettings.id, 1));
            const retention = settings?.retentionSeconds ?? 604800;
            await tx.insert(clientMutations).values({
                actorUserId: input.actorUserId,
                scope: MUTATION_SCOPE,
                clientMutationId: input.clientMutationId,
                resultJson: JSON.stringify({
                    projectId,
                    chatIds: chats.map(({ id }) => id),
                }),
                expiresAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ${retention} || ' seconds')`,
                lastAccessedAt: sql`CURRENT_TIMESTAMP`,
            });
        }

        return {
            project: await projectRequire(tx, projectId),
            chats,
            hints,
        };
    });
}
