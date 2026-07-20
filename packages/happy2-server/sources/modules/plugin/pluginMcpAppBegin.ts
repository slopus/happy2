import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import type { MutationHint } from "../chat/types.js";
import { pluginMcpAppCalls } from "../schema.js";
import { PluginError } from "./types.js";
import { pluginMcpAppMessageChanged } from "./impl/pluginMcpAppMessageChanged.js";

const MAX_APP_CALL_JSON_BYTES = 1024 * 1024;

/**
 * Durably associates one UI-bearing MCP tool invocation with its owning agent turn before execution and rejects a replay that changes its immutable identity or input.
 * This action inserts pluginMcpAppCalls and advances an already-linked assistant messages row in one transaction so the app can be restored after a crash and appear reactively.
 */
export async function pluginMcpAppBegin(
    executor: DrizzleExecutor,
    input: {
        sessionId: string;
        callId: string;
        userMessageId: string;
        agentUserId: string;
        installationId: string;
        toolName: string;
        resourceUri: string;
        arguments: Readonly<Record<string, unknown>>;
    },
): Promise<MutationHint | undefined> {
    const argumentsJson = boundedJson(input.arguments, "tool arguments");
    return withTransaction(executor, async (tx) => {
        const inserted = await tx
            .insert(pluginMcpAppCalls)
            .values({
                sessionId: input.sessionId,
                callId: input.callId,
                userMessageId: input.userMessageId,
                agentUserId: input.agentUserId,
                installationId: input.installationId,
                toolName: input.toolName,
                resourceUri: input.resourceUri,
                argumentsJson,
            })
            .onConflictDoNothing()
            .returning({ callId: pluginMcpAppCalls.callId });
        const [persisted] = await tx
            .select({
                userMessageId: pluginMcpAppCalls.userMessageId,
                agentUserId: pluginMcpAppCalls.agentUserId,
                installationId: pluginMcpAppCalls.installationId,
                toolName: pluginMcpAppCalls.toolName,
                resourceUri: pluginMcpAppCalls.resourceUri,
                argumentsJson: pluginMcpAppCalls.argumentsJson,
            })
            .from(pluginMcpAppCalls)
            .where(
                and(
                    eq(pluginMcpAppCalls.sessionId, input.sessionId),
                    eq(pluginMcpAppCalls.callId, input.callId),
                ),
            )
            .limit(1);
        if (
            !persisted ||
            persisted.userMessageId !== input.userMessageId ||
            persisted.agentUserId !== input.agentUserId ||
            persisted.installationId !== input.installationId ||
            persisted.toolName !== input.toolName ||
            persisted.resourceUri !== input.resourceUri ||
            persisted.argumentsJson !== argumentsJson
        )
            throw new PluginError(
                "conflict",
                "The MCP App call identity is already bound to different input",
            );
        if (inserted.length === 0) return undefined;
        return pluginMcpAppMessageChanged(tx, input);
    });
}

function boundedJson(value: Readonly<Record<string, unknown>>, name: string): string {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json, "utf8") > MAX_APP_CALL_JSON_BYTES)
        throw new PluginError("broken_configuration", `Plugin MCP App ${name} are too large`);
    return json;
}
