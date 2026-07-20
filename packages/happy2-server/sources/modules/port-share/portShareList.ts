import { and, asc, eq, isNull } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings, portShares } from "../schema.js";
import { asPortShare } from "./impl/asPortShare.js";
import { portShareSelection } from "./impl/portShareSelection.js";
import { PortShareError, type PortShareSummary } from "./types.js";

/**
 * Lists active portShares whose exact agent container binding still belongs to one chat member's requested chat.
 * This read boundary keeps UI reconciliation from exposing another chat or presenting a replaced container as reachable.
 */
export async function portShareList(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<PortShareSummary[]> {
    if (!(await chatGetAccess(executor, actorUserId, chatId, true)))
        throw new PortShareError("not_found", "Chat was not found");
    const rows = await executor
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
        .where(and(eq(portShares.chatId, chatId), isNull(portShares.disabledAt)))
        .orderBy(asc(portShares.createdAt), asc(portShares.id));
    return rows.map(asPortShare);
}
