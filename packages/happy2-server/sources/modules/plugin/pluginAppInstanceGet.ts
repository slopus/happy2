import type { DrizzleExecutor } from "../drizzle.js";
import { pluginSurfaceViewerRequire } from "./impl/surfaceAuthority.js";
import {
    pluginAppInstanceProjectionList,
    type PluginAppInstanceSummary,
} from "./impl/surfaceProjection.js";
import { PluginError } from "./types.js";

/**
 * Reads one pluginAppInstances projection only when its audience and optional chat membership still authorize the active viewer.
 * Centralizing this durable read prevents routes and app proxies from trusting a browser-supplied instance identity without current authorization.
 */
export async function pluginAppInstanceGet(
    executor: DrizzleExecutor,
    viewerUserId: string,
    instanceId: string,
): Promise<PluginAppInstanceSummary> {
    await pluginSurfaceViewerRequire(executor, viewerUserId);
    const [instance] = await pluginAppInstanceProjectionList(executor, viewerUserId, instanceId);
    if (!instance) throw new PluginError("not_found", "App instance was not found");
    return instance;
}
