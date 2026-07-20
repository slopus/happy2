import { and, eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, pluginMcpTools, plugins } from "../schema.js";

export interface ReadyPluginMcpTool {
    installationId: string;
    shortName: string;
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

/**
 * Lists pluginMcpTools cached for ready MCP-backed pluginInstallations so Rig discovery and execution resolve function identities without contacting MCP servers.
 * The stable installation and plugin ordering makes the durable cache the single function-catalog source for each agent submission.
 */
export async function pluginMcpToolsListReady(
    executor: DrizzleExecutor,
): Promise<ReadyPluginMcpTool[]> {
    const rows = await executor
        .select({
            installationId: pluginMcpTools.installationId,
            shortName: plugins.shortName,
            name: pluginMcpTools.name,
            title: pluginMcpTools.title,
            description: pluginMcpTools.description,
            inputSchemaJson: pluginMcpTools.inputSchemaJson,
            metaJson: pluginMcpTools.metaJson,
        })
        .from(pluginMcpTools)
        .innerJoin(pluginInstallations, eq(pluginInstallations.id, pluginMcpTools.installationId))
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .where(
            and(
                eq(pluginInstallations.status, "ready"),
                sql`json_type(${plugins.manifestJson}, '$.mcp') IS NOT NULL`,
            ),
        )
        .orderBy(pluginInstallations.installedAt, pluginInstallations.id, pluginMcpTools.name);
    return rows.map((row) => ({
        installationId: row.installationId,
        shortName: row.shortName,
        name: row.name,
        ...(row.title ? { title: row.title } : {}),
        ...(row.description ? { description: row.description } : {}),
        inputSchema: jsonObject(row.inputSchemaJson),
        ...(row.metaJson ? { meta: jsonObject(row.metaJson) } : {}),
    }));
}

function jsonObject(source: string): Record<string, unknown> {
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Persisted plugin MCP tool input schema is invalid");
    return value as Record<string, unknown>;
}
