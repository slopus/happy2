import { and, asc, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import {
    agentTurns,
    pluginFunctionResults,
    pluginInstallations,
    pluginResourceLinks,
    plugins,
} from "../schema.js";
import type { PluginResourceLinkSummary } from "./types.js";

/**
 * Lists the durable resource-link cards produced for one assistant message in original plugin-call and block order without mutating state.
 * Joining the owning installation supplies stable plugin identity while this boundary avoids exposing arbitrary stored MCP result JSON in the message projection.
 */
export async function pluginResourceLinkListForMessage(
    executor: DrizzleExecutor,
    messageId: string,
): Promise<PluginResourceLinkSummary[]> {
    const rows = await executor
        .select({
            callId: pluginResourceLinks.callId,
            position: pluginResourceLinks.position,
            installationId: pluginResourceLinks.installationId,
            pluginId: pluginInstallations.pluginId,
            pluginShortName: plugins.shortName,
            toolName: pluginResourceLinks.toolName,
            kind: pluginResourceLinks.kind,
            uri: pluginResourceLinks.uri,
            name: pluginResourceLinks.name,
            title: pluginResourceLinks.title,
            description: pluginResourceLinks.description,
            mimeType: pluginResourceLinks.mimeType,
            size: pluginResourceLinks.size,
        })
        .from(pluginResourceLinks)
        .innerJoin(
            agentTurns,
            and(
                eq(agentTurns.sessionId, pluginResourceLinks.sessionId),
                eq(agentTurns.userMessageId, pluginResourceLinks.userMessageId),
                eq(agentTurns.agentUserId, pluginResourceLinks.agentUserId),
                eq(agentTurns.assistantMessageId, messageId),
            ),
        )
        .innerJoin(
            pluginFunctionResults,
            and(
                eq(pluginFunctionResults.sessionId, pluginResourceLinks.sessionId),
                eq(pluginFunctionResults.callId, pluginResourceLinks.callId),
            ),
        )
        .innerJoin(
            pluginInstallations,
            eq(pluginInstallations.id, pluginResourceLinks.installationId),
        )
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .orderBy(
            asc(pluginFunctionResults.createdAt),
            asc(pluginResourceLinks.callId),
            asc(pluginResourceLinks.position),
        );
    return rows.map((row) => ({
        callId: row.callId,
        position: row.position,
        installationId: row.installationId,
        pluginId: row.pluginId,
        pluginShortName: row.pluginShortName,
        toolName: row.toolName,
        kind: row.kind as PluginResourceLinkSummary["kind"],
        uri: row.uri,
        name: row.name,
        ...(row.title ? { title: row.title } : {}),
        ...(row.description ? { description: row.description } : {}),
        ...(row.mimeType ? { mimeType: row.mimeType } : {}),
        ...(row.size === null ? {} : { size: row.size }),
    }));
}
