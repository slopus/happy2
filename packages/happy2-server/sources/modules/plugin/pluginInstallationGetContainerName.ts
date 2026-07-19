import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations } from "../schema.js";
import { PluginError } from "./types.js";

/**
 * Reads one pluginInstallations container name so lifecycle orchestration can stop durable runtime resources before committing uninstall.
 * This boundary exposes no variables or package configuration and does not mutate durable state.
 */
export async function pluginInstallationGetContainerName(
    executor: DrizzleExecutor,
    installationId: string,
): Promise<string | undefined> {
    const [installation] = await executor
        .select({ containerName: pluginInstallations.containerName })
        .from(pluginInstallations)
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!installation) throw new PluginError("not_found", "Plugin installation was not found");
    return installation.containerName ?? undefined;
}
