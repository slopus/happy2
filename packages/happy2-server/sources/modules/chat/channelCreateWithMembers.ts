import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { channelCreate } from "./channelCreate.js";
import { channelDefaultAgentUpdate } from "./channelDefaultAgentUpdate.js";
import { channelMemberAdd } from "./channelMemberAdd.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { clientMutations, serverSettings } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";

const MUTATION_SCOPE = "channel.createWithMembers";
import type { ChatSummary, MutationHint } from "./types.js";

/**
 * Creates one public or private channel, grants its selected initial memberships, optionally assigns its working default agent, and records a clientMutations replay result in one transaction.
 * Composing the established channel actions prevents a partially populated or retry-duplicated channel from becoming visible when an initial grant or agent assignment fails.
 */
export async function channelCreateWithMembers(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        kind: "public_channel" | "private_channel";
        name: string;
        slug: string;
        topic?: string;
        memberUserIds: readonly string[];
        defaultAgentUserId?: string;
        clientMutationId?: string;
    },
): Promise<{ chat: ChatSummary; hints: MutationHint[] }> {
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
                const result = JSON.parse(previous.resultJson) as { chatId?: unknown };
                if (typeof result.chatId !== "string")
                    throw new Error("Stored channel creation result is malformed");
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
                const chat = await chatGetAccess(tx, input.actorUserId, result.chatId, false);
                if (!chat) throw new Error("Created channel replay is no longer readable");
                return { chat, hints: [] };
            }
        }
        const created = await channelCreate(tx, {
            actorUserId: input.actorUserId,
            kind: input.kind,
            name: input.name,
            slug: input.slug,
            topic: input.topic,
        });
        const hints = [created.hint];
        const initialMembers = new Set(input.memberUserIds);
        initialMembers.delete(input.actorUserId);
        if (created.chat.defaultAgentUserId) initialMembers.delete(created.chat.defaultAgentUserId);
        if (input.defaultAgentUserId) initialMembers.delete(input.defaultAgentUserId);
        for (const userId of initialMembers) {
            const added = await channelMemberAdd(tx, {
                actorUserId: input.actorUserId,
                chatId: created.chat.id,
                userId,
            });
            hints.push(added.hint);
        }
        if (
            input.defaultAgentUserId &&
            input.defaultAgentUserId !== created.chat.defaultAgentUserId
        ) {
            const updated = await channelDefaultAgentUpdate(tx, {
                actorUserId: input.actorUserId,
                chatId: created.chat.id,
                agentUserId: input.defaultAgentUserId,
            });
            hints.push(updated.hint);
        }
        const chat = await chatGetAccess(tx, input.actorUserId, created.chat.id, false);
        if (!chat) throw new Error("Created channel is not readable after initial membership");
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
                resultJson: JSON.stringify({ chatId: chat.id }),
                expiresAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ${retention} || ' seconds')`,
                lastAccessedAt: sql`CURRENT_TIMESTAMP`,
            });
        }
        return { chat, hints };
    });
}
