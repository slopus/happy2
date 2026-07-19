import { type AgentImageSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentImageSelection } from "./impl/agentImageSelection.js";
import { agentImages, agentImageSettings } from "../schema.js";

import { asAgentImage } from "./impl/asAgentImage.js";
import { eq } from "drizzle-orm";
import { userRequireAnyPermission } from "../permission/userRequireAnyPermission.js";
/**
 * Lists agent images and the configured default to a caller allowed to manage images, assign them to chats, or select a runtime for plugin installation.
 * Reading summaries as one response gives each authorized selection surface exact context without granting image mutation authority.
 */
export async function agentImageList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<{
    defaultImageId?: string;
    images: AgentImageSummary[];
}> {
    await userRequireAnyPermission(executor, actorUserId, [
        "manageImages",
        "assignImagesToChats",
        "managePlugins",
    ]);
    const [settings, images] = await Promise.all([
        executor
            .select({
                defaultImageId: agentImageSettings.defaultImageId,
            })
            .from(agentImageSettings)
            .where(eq(agentImageSettings.id, 1))
            .then((rows) => rows[0]),
        executor
            .select(agentImageSelection)
            .from(agentImages)
            .orderBy(agentImages.createdAt, agentImages.id),
    ]);
    return {
        ...(settings?.defaultImageId
            ? {
                  defaultImageId: settings.defaultImageId,
              }
            : {}),
        images: images.map(asAgentImage),
    };
}
