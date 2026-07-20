import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginAppInstances } from "../schema.js";
import type { PluginMcpAppResourceSnapshot } from "./pluginMcpAppResourceGet.js";
import { pluginAppInstanceGet } from "./pluginAppInstanceGet.js";
import { PluginError } from "./types.js";

/**
 * Reads the executable MCP App resource captured by an explicit app-instance shape update after revalidating the viewer's current audience.
 * This boundary keeps mounted persistent apps byte-stable across runtime catalog refreshes while context-only invalidations retain the same reviewed HTML.
 */
export async function pluginAppInstanceResourceGet(
    executor: DrizzleExecutor,
    viewerUserId: string,
    instanceId: string,
): Promise<PluginMcpAppResourceSnapshot> {
    await pluginAppInstanceGet(executor, viewerUserId, instanceId);
    const [row] = await executor
        .select({
            html: pluginAppInstances.resourceHtml,
            contentHashSha256: pluginAppInstances.resourceContentHashSha256,
            cspJson: pluginAppInstances.resourceCspJson,
            permissionsJson: pluginAppInstances.resourcePermissionsJson,
            domain: pluginAppInstances.resourceDomain,
            prefersBorder: pluginAppInstances.resourcePrefersBorder,
        })
        .from(pluginAppInstances)
        .where(eq(pluginAppInstances.id, instanceId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "App instance was not found");
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
        throw new Error(`Persisted app instance ${name} metadata is invalid`);
    return value as Record<string, never>;
}
