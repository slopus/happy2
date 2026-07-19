import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import { pluginInstallations, pluginMcpTools } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { MAX_PLUGIN_MCP_TOOLS, PluginError } from "./types.js";

export interface PluginMcpToolInput {
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
}

const MAX_TOOL_JSON_BYTES = 1024 * 1024;

/**
 * Atomically replaces one installation's pluginMcpTools rows and pluginInstallations sync timestamp after a successful runtime discovery.
 * The complete replacement and matching plugin sync event share one transaction so readers never observe a partial tool set.
 */
export async function pluginMcpToolsReplace(
    executor: DrizzleExecutor,
    installationId: string,
    tools: readonly PluginMcpToolInput[],
): Promise<MutationHint> {
    if (tools.length > MAX_PLUGIN_MCP_TOOLS)
        throw new PluginError("broken_configuration", "Plugin MCP exposes too many tools");
    const names = new Set<string>();
    const rows = tools.map((tool) => {
        if (!tool.name || tool.name.length > 256 || names.has(tool.name))
            throw new PluginError(
                "broken_configuration",
                `Plugin MCP tool name is invalid or duplicated: ${tool.name}`,
            );
        names.add(tool.name);
        return {
            installationId,
            name: tool.name,
            title: boundedOptional(tool.title, "title", 512),
            description: boundedOptional(tool.description, "description", 16_384),
            inputSchemaJson: boundedJson(tool.inputSchema, "input schema"),
            outputSchemaJson: tool.outputSchema
                ? boundedJson(tool.outputSchema, "output schema")
                : null,
            annotationsJson: tool.annotations ? boundedJson(tool.annotations, "annotations") : null,
        };
    });
    return withTransaction(executor, async (tx) => {
        const [installation] = await tx
            .select({ id: pluginInstallations.id })
            .from(pluginInstallations)
            .where(eq(pluginInstallations.id, installationId))
            .limit(1);
        if (!installation) throw new PluginError("not_found", "Plugin installation was not found");
        const syncedAt = new Date().toISOString();
        await tx.delete(pluginMcpTools).where(eq(pluginMcpTools.installationId, installationId));
        if (rows.length)
            await tx.insert(pluginMcpTools).values(rows.map((row) => ({ ...row, syncedAt })));
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(pluginInstallations)
            .set({ mcpToolsSyncedAt: syncedAt, syncSequence: sequence, updatedAt: syncedAt })
            .where(eq(pluginInstallations.id, installationId));
        await syncEventInsert(tx, {
            sequence,
            kind: "plugin.mcp_tools_synced",
            entityId: installationId,
        });
        return areaHint(sequence, "plugins");
    });
}

function boundedOptional(value: string | undefined, name: string, maximum: number): string | null {
    if (value === undefined) return null;
    if (value.length > maximum || value.includes("\u0000"))
        throw new PluginError("broken_configuration", `Plugin MCP tool ${name} is too large`);
    return value;
}

function boundedJson(value: Record<string, unknown>, name: string): string {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json, "utf8") > MAX_TOOL_JSON_BYTES)
        throw new PluginError("broken_configuration", `Plugin MCP tool ${name} is too large`);
    return json;
}
