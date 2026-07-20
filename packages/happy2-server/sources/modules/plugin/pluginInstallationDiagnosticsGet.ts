import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import { pluginInstallations, plugins } from "../schema.js";
import {
    PluginError,
    type PluginInstallationDiagnostics,
    type PluginInstallationStatus,
} from "./types.js";

const statuses = new Set<PluginInstallationStatus>([
    "preparing",
    "starting",
    "ready",
    "broken_configuration",
    "failed",
]);

/**
 * Returns the latest durable lifecycle failure and bounded runtime output for one installation to an authorized administrator.
 * This read-only boundary keeps diagnostic output scoped to its installation and never exposes variables, secrets, or unrelated server logs.
 */
export async function pluginInstallationDiagnosticsGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    installationId: string,
): Promise<PluginInstallationDiagnostics> {
    await userRequirePermission(executor, actorUserId, "managePlugins");
    const [row] = await executor
        .select({
            installationId: pluginInstallations.id,
            pluginId: pluginInstallations.pluginId,
            displayName: plugins.displayName,
            status: pluginInstallations.status,
            detail: pluginInstallations.statusDetail,
            error: pluginInstallations.lastError,
            output: pluginInstallations.diagnosticOutput,
            updatedAt: pluginInstallations.updatedAt,
        })
        .from(pluginInstallations)
        .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "Plugin installation was not found");
    if (!statuses.has(row.status as PluginInstallationStatus))
        throw new Error(`Unknown plugin installation status ${row.status}`);
    return {
        installationId: row.installationId,
        pluginId: row.pluginId,
        displayName: row.displayName,
        status: row.status as PluginInstallationStatus,
        ...(row.detail ? { detail: row.detail } : {}),
        ...(row.error ? { error: row.error } : {}),
        ...(row.output ? { output: row.output } : {}),
        updatedAt: row.updatedAt,
    };
}
