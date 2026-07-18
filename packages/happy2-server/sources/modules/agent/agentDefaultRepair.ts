import { and, eq, isNull } from "drizzle-orm";
import type { MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { serverSyncState, users } from "../schema.js";
import { ensureDefaultAgentChannelsDb } from "./impl/ensureDefaultAgentChannelsDb.js";

/**
 * Repairs channels, memberships, and per-human default-agent conversations only when the explicit onboarding action has already created a live default agent.
 * It never creates or renames an agent identity; the complete repair and its syncEvents commit in one retryable transaction for startup recovery.
 */
export async function agentDefaultRepair(
    executor: DrizzleExecutor,
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        const [initialState] = await tx
            .select({ sequence: serverSyncState.sequence })
            .from(serverSyncState)
            .where(eq(serverSyncState.id, 1))
            .limit(1);
        if (!initialState) throw new Error("Server sync state is not initialized");

        const [defaultAgent] = await tx
            .select({ id: users.id })
            .from(users)
            .where(
                and(
                    eq(users.agentRole, "default"),
                    eq(users.kind, "agent"),
                    isNull(users.deletedAt),
                ),
            )
            .limit(1);
        if (!defaultAgent) return undefined;

        await ensureDefaultAgentChannelsDb(tx, defaultAgent.id);
        const [state] = await tx
            .select({ sequence: serverSyncState.sequence })
            .from(serverSyncState)
            .where(eq(serverSyncState.id, 1))
            .limit(1);
        if (!state) throw new Error("Server sync state is not initialized");
        if (state.sequence === initialState.sequence) return undefined;
        return {
            sequence: String(state.sequence),
            chats: [],
            areas: ["users"],
        };
    });
}
