import { and, eq, isNull } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings, portShares } from "../schema.js";
import { userFindActive } from "../user/userFindActive.js";
import { asPortShare } from "./impl/asPortShare.js";
import { portShareSelection } from "./impl/portShareSelection.js";
import type { PortShareSummary } from "./types.js";

/**
 * Authorizes one live request against the share's durable audience, active container binding, and current user access when authentication is required.
 * Rechecking SQLite at this boundary makes user deletion and chat-membership removal take effect without waiting for an issued browser credential to expire.
 */
export async function portShareAuthorizeAccess(
    executor: DrizzleExecutor,
    userId: string | undefined,
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
    if (!row) return undefined;
    const share = asPortShare(row);
    if (share.audience === "internet") return share;
    if (!userId) return undefined;
    if (share.audience === "server")
        return (await userFindActive(executor, userId)) ? share : undefined;
    return (await chatGetAccess(executor, userId, share.chatId, true)) ? share : undefined;
}
