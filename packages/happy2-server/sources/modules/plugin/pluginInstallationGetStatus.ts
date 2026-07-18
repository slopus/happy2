import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations } from "../schema.js";
import { PluginError, type PluginInstallationStatus } from "./types.js";

/**
 * Returns the current status and identity needed to authorize one installed plugin MCP connection without exposing its configuration.
 * This read-only lookup does not mutate durable state and keeps MCP readiness enforcement at the installation boundary.
 */
export async function pluginInstallationGetStatus(
    executor: DrizzleExecutor,
    installationId: string,
): Promise<{ id: string; status: PluginInstallationStatus }> {
    const [row] = await executor
        .select({ id: pluginInstallations.id, status: pluginInstallations.status })
        .from(pluginInstallations)
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "Plugin installation was not found");
    return { id: row.id, status: row.status as PluginInstallationStatus };
}
