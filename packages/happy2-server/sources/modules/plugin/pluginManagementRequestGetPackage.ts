import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { pluginManagementRequests } from "../schema.js";
import { PluginError, type PluginSource } from "./types.js";

export interface PluginManagementRequestPackage {
    id: string;
    chatId: string;
    packageDigest: string;
    packageDirectory: string;
    source: PluginSource;
}

/** Returns the private staged-package coordinates for one visible approval and does not mutate durable state. This boundary lets the package store integrity-check an image or approved operation without exposing filesystem paths through routes. */
export async function pluginManagementRequestGetPackage(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
    requestId: string,
): Promise<PluginManagementRequestPackage> {
    if (!(await chatGetAccess(executor, actorUserId, chatId, true)))
        throw new PluginError("forbidden", "Chat membership is required");
    const [row] = await executor
        .select({
            id: pluginManagementRequests.id,
            chatId: pluginManagementRequests.chatId,
            action: pluginManagementRequests.action,
            status: pluginManagementRequests.status,
            sourceKind: pluginManagementRequests.sourceKind,
            sourceReference: pluginManagementRequests.sourceReference,
            packageDigest: pluginManagementRequests.packageDigest,
            packageDirectory: pluginManagementRequests.packageDirectory,
        })
        .from(pluginManagementRequests)
        .where(
            and(
                eq(pluginManagementRequests.id, requestId),
                eq(pluginManagementRequests.chatId, chatId),
            ),
        )
        .limit(1);
    if (!row) throw new PluginError("not_found", "Plugin management request was not found");
    if (row.status !== "pending" && row.status !== "processing")
        throw new PluginError("not_found", "Plugin management request image is no longer retained");
    if (
        (row.sourceKind !== "archive" &&
            row.sourceKind !== "builtin" &&
            row.sourceKind !== "link") ||
        !row.sourceReference ||
        !row.packageDigest ||
        !row.packageDirectory
    )
        throw new Error("Plugin management request has incomplete package metadata");
    return {
        id: row.id,
        chatId: row.chatId,
        packageDigest: row.packageDigest,
        packageDirectory: row.packageDirectory,
        source: { kind: row.sourceKind, reference: row.sourceReference },
    };
}
