import { type AgentImageDetails, CollaborationError } from "../chat/types.js";

import { type DrizzleExecutor } from "../drizzle.js";
import { agentImageDetailsSelection } from "./impl/agentImageDetailsSelection.js";
import { agentImages } from "../schema.js";
import { eq } from "drizzle-orm";
import { asAgentImageDetails } from "./impl/asAgentImageDetails.js";

import { userRequireAnyPermission } from "../permission/userRequireAnyPermission.js";
/**
 * Returns full details for an agent image to a caller allowed to manage images or assign them to chats.
 * Hiding internal images and inaccessible identifiers as not-found keeps build configuration separate from runtime-owned definitions.
 */
export async function agentImageGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    imageId: string,
): Promise<AgentImageDetails> {
    await userRequireAnyPermission(executor, actorUserId, ["manageImages", "assignImagesToChats"]);
    const [image] = await executor
        .select(agentImageDetailsSelection)
        .from(agentImages)
        .where(eq(agentImages.id, imageId))
        .limit(1);
    if (!image) throw new CollaborationError("not_found", "Agent image was not found");
    return asAgentImageDetails(image);
}
