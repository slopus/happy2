import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import { pluginInstallations, pluginMcpAppResources, pluginMcpTools } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import type { McpAppResourceInput } from "./impl/mcpApp.js";
import { mcpAppToolUi } from "./impl/mcpApp.js";
import { MAX_PLUGIN_MCP_TOOLS, PluginError } from "./types.js";

export interface PluginMcpToolInput {
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    meta?: Record<string, unknown>;
}

const MAX_TOOL_JSON_BYTES = 1024 * 1024;

/**
 * Atomically replaces one installation's pluginMcpTools and pluginMcpAppResources rows after a successful runtime probe.
 * The reviewed executable HTML snapshot, tool catalog, installation timestamp, and sync event share one transaction so an app URI can never resolve against a different catalog generation.
 */
export async function pluginMcpCatalogReplace(
    executor: DrizzleExecutor,
    installationId: string,
    tools: readonly PluginMcpToolInput[],
    resources: readonly McpAppResourceInput[],
): Promise<MutationHint> {
    if (tools.length > MAX_PLUGIN_MCP_TOOLS)
        throw new PluginError("broken_configuration", "Plugin MCP exposes too many tools");
    const names = new Set<string>();
    const toolRows = tools.map((tool) => {
        if (!tool.name || tool.name.length > 256 || names.has(tool.name))
            throw new PluginError(
                "broken_configuration",
                `Plugin MCP tool name is invalid or duplicated: ${tool.name}`,
            );
        names.add(tool.name);
        mcpAppToolUi(tool.meta);
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
            metaJson: tool.meta ? boundedJson(tool.meta, "metadata") : null,
        };
    });
    const uris = new Set<string>();
    const resourceRows = resources.map((resource) => {
        if (uris.has(resource.uri))
            throw new PluginError(
                "broken_configuration",
                `Plugin MCP App resource URI is duplicated: ${resource.uri}`,
            );
        uris.add(resource.uri);
        return {
            installationId,
            uri: resource.uri,
            html: resource.html,
            contentHashSha256: resource.contentHashSha256,
            cspJson: resource.csp ? JSON.stringify(resource.csp) : null,
            permissionsJson: resource.permissions ? JSON.stringify(resource.permissions) : null,
            domain: resource.domain ?? null,
            prefersBorder: resource.prefersBorder ?? null,
        };
    });
    for (const tool of tools) {
        const uri = mcpAppToolUi(tool.meta).resourceUri;
        if (uri && !uris.has(uri))
            throw new PluginError(
                "broken_configuration",
                `Plugin MCP App tool ${tool.name} references a missing resource`,
            );
    }
    return withTransaction(executor, async (tx) => {
        const [installation] = await tx
            .select({ id: pluginInstallations.id })
            .from(pluginInstallations)
            .where(eq(pluginInstallations.id, installationId))
            .limit(1);
        if (!installation) throw new PluginError("not_found", "Plugin installation was not found");
        const syncedAt = new Date().toISOString();
        await tx.delete(pluginMcpTools).where(eq(pluginMcpTools.installationId, installationId));
        await tx
            .delete(pluginMcpAppResources)
            .where(eq(pluginMcpAppResources.installationId, installationId));
        if (toolRows.length)
            await tx.insert(pluginMcpTools).values(toolRows.map((row) => ({ ...row, syncedAt })));
        if (resourceRows.length)
            await tx
                .insert(pluginMcpAppResources)
                .values(resourceRows.map((row) => ({ ...row, syncedAt })));
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
        return { ...areaHint(sequence, "plugins"), areas: ["plugins", "apps", "contributions"] };
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
