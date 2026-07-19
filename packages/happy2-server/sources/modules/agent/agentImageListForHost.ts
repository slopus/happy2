import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentImages, agentImageSettings } from "../schema.js";

export interface AgentEnvironmentHostSummary {
    id: string;
    name: string;
    status: "pending" | "building" | "ready" | "failed";
    builtin: boolean;
    active: boolean;
}

/**
 * Lists the non-sensitive agent environment projection exposed after plugin-host capability authorization.
 * Keeping Dockerfiles out of the catalog preserves their focused per-manifest read operation and keeps list responses bounded.
 */
export async function agentImageListForHost(executor: DrizzleExecutor): Promise<{
    defaultEnvironmentId?: string;
    environments: AgentEnvironmentHostSummary[];
}> {
    const [settings, images] = await Promise.all([
        executor
            .select({ defaultEnvironmentId: agentImageSettings.defaultImageId })
            .from(agentImageSettings)
            .where(eq(agentImageSettings.id, 1))
            .then((rows) => rows[0]),
        executor
            .select({
                id: agentImages.id,
                name: agentImages.name,
                status: agentImages.status,
                builtinKey: agentImages.builtinKey,
                deletedAt: agentImages.deletedAt,
            })
            .from(agentImages)
            .orderBy(agentImages.createdAt, agentImages.id),
    ]);
    return {
        ...(settings?.defaultEnvironmentId
            ? { defaultEnvironmentId: settings.defaultEnvironmentId }
            : {}),
        environments: images.map((image) => ({
            id: image.id,
            name: image.name,
            status: image.status as AgentEnvironmentHostSummary["status"],
            builtin: image.builtinKey !== null,
            active: image.deletedAt === null,
        })),
    };
}
