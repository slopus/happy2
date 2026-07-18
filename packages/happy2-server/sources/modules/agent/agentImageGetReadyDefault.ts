import { type AgentExecutionImage } from "./impl/agentExecutionImage.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentImages, agentImageSettings } from "../schema.js";

import { and, eq, sql } from "drizzle-orm";

/**
 * Returns the configured default image only when it is ready and has a resolved Docker image identifier.
 * Treating every incomplete setting as absent prevents agent creation from selecting a build that cannot yet execute.
 */
export async function agentImageGetReadyDefault(
    executor: DrizzleExecutor,
): Promise<AgentExecutionImage | undefined> {
    const [image] = await executor
        .select({
            id: agentImages.id,
            dockerTag: agentImages.dockerTag,
            dockerImageId: agentImages.dockerImageId,
        })
        .from(agentImageSettings)
        .innerJoin(agentImages, eq(agentImages.id, agentImageSettings.defaultImageId))
        .where(
            and(
                eq(agentImageSettings.id, 1),
                eq(agentImages.status, "ready"),
                sql`${agentImages.dockerImageId} IS NOT NULL`,
            ),
        )
        .limit(1);
    return image?.dockerImageId
        ? {
              id: image.id,
              dockerTag: image.dockerTag,
              dockerImageId: image.dockerImageId,
          }
        : undefined;
}
