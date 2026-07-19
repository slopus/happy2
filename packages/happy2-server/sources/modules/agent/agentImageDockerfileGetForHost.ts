import { eq } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentImages } from "../schema.js";

/**
 * Reads one immutable agent environment Dockerfile after plugin-host capability authorization.
 * This focused projection avoids exposing build logs, provider identifiers, or administrator-only image metadata.
 */
export async function agentImageDockerfileGetForHost(
    executor: DrizzleExecutor,
    imageId: string,
): Promise<{ id: string; name: string; dockerfile: string; active: boolean }> {
    const [image] = await executor
        .select({
            id: agentImages.id,
            name: agentImages.name,
            dockerfile: agentImages.dockerfile,
            deletedAt: agentImages.deletedAt,
        })
        .from(agentImages)
        .where(eq(agentImages.id, imageId))
        .limit(1);
    if (!image) throw new CollaborationError("not_found", "Agent environment was not found");
    return {
        id: image.id,
        name: image.name,
        dockerfile: image.dockerfile,
        active: image.deletedAt === null,
    };
}
