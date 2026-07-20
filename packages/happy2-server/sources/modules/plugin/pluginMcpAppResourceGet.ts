import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginMcpAppResources } from "../schema.js";
import { PluginError } from "./types.js";

export interface PluginMcpAppResourceSnapshot {
    html: string;
    contentHashSha256: string;
    csp?: {
        connectDomains?: string[];
        resourceDomains?: string[];
        frameDomains?: string[];
        baseUriDomains?: string[];
    };
    permissions?: Record<string, Record<string, never>>;
    domain?: string;
    prefersBorder?: boolean;
}

/**
 * Reads the validated executable-resource snapshot for one installation and exact ui:// URI without contacting plugin code or changing state.
 * This boundary keeps chat rendering stable across runtime outages and prevents a previously reviewed app call from executing newly served HTML before the next activation probe.
 */
export async function pluginMcpAppResourceGet(
    executor: DrizzleExecutor,
    installationId: string,
    uri: string,
): Promise<PluginMcpAppResourceSnapshot> {
    const [row] = await executor
        .select()
        .from(pluginMcpAppResources)
        .where(
            and(
                eq(pluginMcpAppResources.installationId, installationId),
                eq(pluginMcpAppResources.uri, uri),
            ),
        )
        .limit(1);
    if (!row) throw new PluginError("not_found", "MCP App resource was not found");
    return {
        html: row.html,
        contentHashSha256: row.contentHashSha256,
        ...(row.cspJson ? { csp: jsonObject(row.cspJson, "CSP") } : {}),
        ...(row.permissionsJson
            ? { permissions: jsonObject(row.permissionsJson, "permissions") }
            : {}),
        ...(row.domain ? { domain: row.domain } : {}),
        ...(row.prefersBorder === null ? {} : { prefersBorder: row.prefersBorder }),
    };
}

function jsonObject(source: string, name: string): Record<string, never> {
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`Persisted MCP App ${name} metadata is invalid`);
    return value as Record<string, never>;
}
