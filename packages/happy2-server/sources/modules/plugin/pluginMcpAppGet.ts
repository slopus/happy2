import { and, eq } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentTurns, messages, pluginMcpAppCalls, users } from "../schema.js";
import { messageIsPast } from "../message/messageIsPast.js";
import { PluginError, type PluginMcpAppContext } from "./types.js";

/**
 * Reads one persisted MCP App only after rechecking the viewer's current chat access and the owning assistant message's deletion and expiry state, without changing durable state.
 * This boundary centralizes app authorization and turn identity so routes and runtime services cannot expose a call by installation or client-supplied chat alone.
 */
export async function pluginMcpAppGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    assistantMessageId: string,
    callId: string,
): Promise<PluginMcpAppContext> {
    const actor = users;
    const [row] = await executor
        .select({
            sessionId: pluginMcpAppCalls.sessionId,
            callId: pluginMcpAppCalls.callId,
            installationId: pluginMcpAppCalls.installationId,
            toolName: pluginMcpAppCalls.toolName,
            resourceUri: pluginMcpAppCalls.resourceUri,
            argumentsJson: pluginMcpAppCalls.argumentsJson,
            status: pluginMcpAppCalls.status,
            resultJson: pluginMcpAppCalls.resultJson,
            chatId: agentTurns.chatId,
            agentUserId: agentTurns.agentUserId,
            deletedAt: messages.deletedAt,
            expiresAt: messages.expiresAt,
            actorUsername: actor.username,
            actorFirstName: actor.firstName,
            actorLastName: actor.lastName,
            actorKind: actor.kind,
        })
        .from(pluginMcpAppCalls)
        .innerJoin(
            agentTurns,
            and(
                eq(agentTurns.userMessageId, pluginMcpAppCalls.userMessageId),
                eq(agentTurns.agentUserId, pluginMcpAppCalls.agentUserId),
                eq(agentTurns.sessionId, pluginMcpAppCalls.sessionId),
            ),
        )
        .innerJoin(messages, eq(messages.id, agentTurns.assistantMessageId))
        .innerJoin(actor, eq(actor.id, actorUserId))
        .where(
            and(
                eq(agentTurns.assistantMessageId, assistantMessageId),
                eq(pluginMcpAppCalls.callId, callId),
            ),
        )
        .limit(1);
    if (
        !row ||
        row.deletedAt !== null ||
        messageIsPast(row.expiresAt ?? undefined) ||
        !(await chatGetAccess(executor, actorUserId, row.chatId, false))
    )
        throw new PluginError("not_found", "MCP App was not found");
    if (row.status !== "in_progress" && row.status !== "completed" && row.status !== "failed")
        throw new Error("Persisted MCP App status is invalid");
    return {
        sessionId: row.sessionId,
        callId: row.callId,
        installationId: row.installationId,
        toolName: row.toolName,
        resourceUri: row.resourceUri,
        arguments: jsonObject(row.argumentsJson, "arguments"),
        status: row.status,
        ...(row.resultJson ? { result: jsonObject(row.resultJson, "result") } : {}),
        chatId: row.chatId,
        agentUserId: row.agentUserId,
        actor: {
            id: actorUserId,
            username: row.actorUsername,
            firstName: row.actorFirstName,
            ...(row.actorLastName ? { lastName: row.actorLastName } : {}),
            kind: row.actorKind === "agent" ? "agent" : "human",
        },
    };
}

function jsonObject(source: string, name: string): Record<string, unknown> {
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`Persisted MCP App ${name} are invalid`);
    return value as Record<string, unknown>;
}
