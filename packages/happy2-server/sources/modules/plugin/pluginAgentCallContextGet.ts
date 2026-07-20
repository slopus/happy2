import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentTurns, messages, pluginFunctionResults } from "../schema.js";
import type { PluginAgentCallContext } from "./types.js";

/** Resolves a Rig external-tool event to its one running Happy chat turn and does not mutate durable state. This boundary prevents a contextual plugin capability from choosing another chat, agent, or human actor. */
export async function pluginAgentCallContextGet(
    executor: DrizzleExecutor,
    sessionId: string,
    callId: string,
): Promise<PluginAgentCallContext & { userMessageId: string }> {
    const [row] = await executor
        .select({
            actorUserId: messages.senderUserId,
            agentUserId: agentTurns.agentUserId,
            chatId: agentTurns.chatId,
            userMessageId: agentTurns.userMessageId,
        })
        .from(agentTurns)
        .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
        .innerJoin(
            pluginFunctionResults,
            and(
                eq(pluginFunctionResults.sessionId, agentTurns.sessionId),
                eq(pluginFunctionResults.callId, callId),
            ),
        )
        .where(
            and(
                eq(agentTurns.sessionId, sessionId),
                eq(agentTurns.status, "running"),
                eq(pluginFunctionResults.status, "in_progress"),
            ),
        )
        .limit(1);
    if (!row?.actorUserId)
        throw new Error("Plugin function call is not attached to a running Happy chat turn");
    return {
        actorUserId: row.actorUserId,
        agentUserId: row.agentUserId,
        callId,
        chatId: row.chatId,
        sessionId,
        userMessageId: row.userMessageId,
    };
}
