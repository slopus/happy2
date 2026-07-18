import type { DrizzleExecutor } from "../drizzle.js";
import type { PluginCatalog } from "./catalog.js";
import { pluginInstallationList } from "./pluginInstallationList.js";
import { pluginList } from "./pluginList.js";
import type { PluginCatalogItem } from "./types.js";

/**
 * Projects the validated built-in catalog together with administrator-visible installation health and update availability.
 * This read-only boundary does not mutate durable state; it joins package metadata to authorized installation summaries without exposing configured values.
 */
export async function pluginCatalogList(
    executor: DrizzleExecutor,
    catalog: PluginCatalog,
    actorUserId: string,
): Promise<PluginCatalogItem[]> {
    const [installations, systemPlugins] = await Promise.all([
        pluginInstallationList(executor, actorUserId),
        pluginList(executor, actorUserId),
    ]);
    const systemByShortName = new Map(systemPlugins.map((plugin) => [plugin.shortName, plugin]));
    return catalog.list().map((plugin) => {
        const systemPlugin = systemByShortName.get(plugin.manifest.shortName);
        const catalogMcp = plugin.manifest.mcp;
        const mcp = systemPlugin
            ? systemPlugin.mcp
            : catalogMcp
              ? {
                    type: catalogMcp.type,
                    container:
                        catalogMcp.type === "remote"
                            ? ("none" as const)
                            : catalogMcp.container
                              ? ("bundled" as const)
                              : ("selection_required" as const),
                }
              : undefined;
        return {
            displayName: plugin.manifest.displayName,
            shortName: plugin.manifest.shortName,
            description: plugin.manifest.description,
            version: plugin.manifest.version,
            packageDigest: plugin.packageDigest,
            iconUrl: `/v0/admin/plugins/${plugin.manifest.shortName}/icon`,
            skills: plugin.skills,
            variables: systemPlugin?.variables ?? plugin.manifest.variables,
            ...(mcp ? { mcp } : {}),
            ...(systemPlugin
                ? {
                      systemPlugin: {
                          ...systemPlugin,
                          updateAvailable: systemPlugin.packageDigest !== plugin.packageDigest,
                          installations: installations.filter(
                              ({ pluginId }) => pluginId === systemPlugin.id,
                          ),
                      },
                  }
                : {}),
        };
    });
}
