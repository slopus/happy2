import { type AgentImageSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentImageSelection } from "./impl/agentImageSelection.js";
import { agentImages, agentImageSettings } from "../schema.js";

import { asAgentImage } from "./impl/asAgentImage.js";
import { eq } from "drizzle-orm";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
/**
 * Lists agent images in creation order and the optional configured default after requiring server-administrator access.
 * Reading settings and definitions as one response gives management clients the exact selection context without exposing internal images.
 */
export async function agentImageList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<{
    defaultImageId?: string;
    images: AgentImageSummary[];
}> {
    await userRequireServerAdmin(executor, actorUserId);
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
