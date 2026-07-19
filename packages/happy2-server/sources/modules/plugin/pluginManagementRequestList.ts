import { desc, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { pluginManagementRequests } from "../schema.js";
import { asPluginManagementRequest } from "./impl/asManagementRequest.js";
import { pluginManagementRequestSelection } from "./impl/managementRequestSelection.js";
import { PluginError, type PluginManagementRequestSummary } from "./types.js";

/** Lists durable plugin approval cards for one accessible chat and does not mutate durable state. This projection boundary requires active membership while excluding staged filesystem paths and other private package internals. */
export async function pluginManagementRequestList(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<PluginManagementRequestSummary[]> {
    if (!(await chatGetAccess(executor, actorUserId, chatId, true)))
        throw new PluginError("forbidden", "Chat membership is required");
    const rows = await executor
        .select(pluginManagementRequestSelection)
        .from(pluginManagementRequests)
        .where(eq(pluginManagementRequests.chatId, chatId))
        .orderBy(desc(pluginManagementRequests.createdAt), desc(pluginManagementRequests.id));
    return rows.map(asPluginManagementRequest);
}
