import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations } from "../schema.js";

/**
 * Resolves a signed plugin capability only while its exact durable container incarnation remains the ready installation authority.
 * This database check makes replacement or invalidation revoke every token issued for an older incarnation without persisting token material.
 */
export async function pluginContainerInstanceAuthorize(
    executor: DrizzleExecutor,
    installationId: string,
    containerInstanceId: string,
): Promise<{ installationId: string; containerName: string } | undefined> {
    const [row] = await executor
        .select({
            installationId: pluginInstallations.id,
            containerName: pluginInstallations.containerName,
        })
        .from(pluginInstallations)
        .where(
            and(
                eq(pluginInstallations.id, installationId),
                eq(pluginInstallations.containerInstanceId, containerInstanceId),
                eq(pluginInstallations.status, "ready"),
            ),
        )
        .limit(1);
    return row?.containerName
        ? { installationId: row.installationId, containerName: row.containerName }
        : undefined;
}
