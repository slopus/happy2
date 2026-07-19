import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations } from "../schema.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { PluginError } from "./types.js";

/** Authorizes an administrator and returns the process-local resources for one installation without mutating durable state. This boundary lets orchestration stop the exact runtime before the later pluginInstallations deletion. */
export async function pluginInstallationGetUninstallContext(
    executor: DrizzleExecutor,
    actorUserId: string,
    installationId: string,
): Promise<{ containerName?: string }> {
    await userRequireServerAdmin(executor, actorUserId);
    const [row] = await executor
        .select({ containerName: pluginInstallations.containerName })
        .from(pluginInstallations)
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "Plugin installation was not found");
    return row.containerName ? { containerName: row.containerName } : {};
}
