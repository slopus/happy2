import type { DrizzleExecutor } from "../drizzle.js";
import { pluginSurfaceViewerRequire } from "./impl/surfaceAuthority.js";
import {
    pluginAppInstanceProjectionList,
    type PluginAppInstanceSummary,
} from "./impl/surfaceProjection.js";

/**
 * Lists pluginAppInstances visible to the active viewer after audience and current chat-membership intersection, merging appPresentationPreferences.
 * This durable read boundary keeps navigation discovery and per-user presentation state from becoming an authorization grant.
 */
export async function pluginAppInstanceList(
    executor: DrizzleExecutor,
    viewerUserId: string,
): Promise<PluginAppInstanceSummary[]> {
    await pluginSurfaceViewerRequire(executor, viewerUserId);
    return pluginAppInstanceProjectionList(executor, viewerUserId);
}
