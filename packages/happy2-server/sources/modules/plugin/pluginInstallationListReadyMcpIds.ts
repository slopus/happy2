import { and, eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins } from "../schema.js";

/**
 * Lists ready MCP-backed plugin installation identities for agent function discovery and execution.
 * This worker-facing read excludes skills-only and unhealthy installations so Rig receives only callable durable functions.
 */
export async function pluginInstallationListReadyMcpIds(
    executor: DrizzleExecutor,
): Promise<string[]> {
    const rows = await executor
        .select({ id: pluginInstallations.id })
        .from(pluginInstallations)
        .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
        .where(
            and(
                eq(pluginInstallations.status, "ready"),
                sql`json_type(${pluginInstallations.manifestJson}, '$.mcp') IS NOT NULL`,
            ),
        )
        .orderBy(pluginInstallations.installedAt, pluginInstallations.id);
    return rows.map(({ id }) => id);
}
