import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { pluginInstallations, pluginMcpTools } from "../schema.js";
import { PluginError, type PluginMcpToolSummary } from "./types.js";

/**
 * Lists the last successfully discovered MCP tools for one installation from durable storage for a server administrator.
 * This boundary never contacts the plugin runtime, so ordinary tool discovery remains available while the runtime is busy or restarting.
 */
export async function pluginMcpToolsList(
    executor: DrizzleExecutor,
    actorUserId: string,
    installationId: string,
): Promise<{ syncedAt?: string; tools: PluginMcpToolSummary[] }> {
    await userRequireServerAdmin(executor, actorUserId);
    const [installation] = await executor
        .select({ id: pluginInstallations.id, syncedAt: pluginInstallations.mcpToolsSyncedAt })
        .from(pluginInstallations)
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!installation) throw new PluginError("not_found", "Plugin installation was not found");
    const rows = await executor
        .select()
        .from(pluginMcpTools)
        .where(eq(pluginMcpTools.installationId, installationId))
        .orderBy(pluginMcpTools.name);
    return {
        ...(installation.syncedAt ? { syncedAt: installation.syncedAt } : {}),
        tools: rows.map((row) => ({
            installationId: row.installationId,
            name: row.name,
            ...(row.title ? { title: row.title } : {}),
            ...(row.description ? { description: row.description } : {}),
            inputSchema: jsonObject(row.inputSchemaJson),
            ...(row.outputSchemaJson ? { outputSchema: jsonObject(row.outputSchemaJson) } : {}),
            ...(row.annotationsJson ? { annotations: jsonObject(row.annotationsJson) } : {}),
            syncedAt: row.syncedAt,
        })),
    };
}

function jsonObject(source: string): Record<string, unknown> {
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Persisted plugin MCP tool schema is invalid");
    return value as Record<string, unknown>;
}
