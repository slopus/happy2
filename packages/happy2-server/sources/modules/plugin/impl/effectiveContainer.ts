import type { PluginContainer, PluginManifest } from "../types.js";

export function effectiveContainer(manifest: PluginManifest): PluginContainer | undefined {
    if (manifest.container) return manifest.container;
    if (manifest.mcp?.type !== "stdio") return undefined;
    return {
        ...(manifest.mcp.container ? { dockerfile: manifest.mcp.container.dockerfile } : {}),
        args: [],
        permissions: [],
    };
}
