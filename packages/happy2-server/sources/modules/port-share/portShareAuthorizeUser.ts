import { and, eq, isNull } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings, portShares } from "../schema.js";
import { asPortShare } from "./impl/asPortShare.js";
import { portShareSelection } from "./impl/portShareSelection.js";
import type { PortShareSummary } from "./types.js";

/**
 * Authorizes issuance of one scoped access token against an active share, current chat membership, and the exact current agent container binding.
 * Keeping this check at issuance lets an already-issued one-hour capability remain valid if chat membership later changes.
 */
export async function portShareAuthorizeUser(
    executor: DrizzleExecutor,
    userId: string,
    portShareId: string,
): Promise<PortShareSummary | undefined> {
    const [row] = await executor
        .select(portShareSelection)
        .from(portShares)
        .innerJoin(
            agentRigBindings,
            and(
                eq(agentRigBindings.userId, portShares.agentUserId),
                eq(agentRigBindings.chatId, portShares.chatId),
                eq(agentRigBindings.containerName, portShares.containerName),
            ),
        )
        .where(and(eq(portShares.id, portShareId), isNull(portShares.disabledAt)))
        .limit(1);
    if (!row || !(await chatGetAccess(executor, userId, row.chatId, true))) return undefined;
    return asPortShare(row);
}
