import type { DrizzleExecutor } from "../drizzle.js";
import { pluginSurfaceChatVisible, pluginSurfaceViewerRequire } from "./impl/surfaceAuthority.js";
import {
    pluginContributionProjectionList,
    type PluginContributionSummary,
} from "./impl/surfaceProjection.js";
import { PluginError } from "./types.js";

/**
 * Lists pluginContributions visible to an active viewer by intersecting user audience with the requested current chat and excluding every other chat's controls.
 * This durable read boundary gives each native insertion point one current authorization projection rather than trusting cached browser scope.
 */
export async function pluginContributionList(
    executor: DrizzleExecutor,
    input: { viewerUserId: string; chatId?: string },
): Promise<PluginContributionSummary[]> {
    await pluginSurfaceViewerRequire(executor, input.viewerUserId);
    if (
        input.chatId &&
        !(await pluginSurfaceChatVisible(executor, input.viewerUserId, input.chatId))
    )
        throw new PluginError("not_found", "Chat contributions were not found");
    return pluginContributionProjectionList(executor, input);
}
