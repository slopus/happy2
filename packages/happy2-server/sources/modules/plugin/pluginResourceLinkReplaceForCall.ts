import { and, asc, eq } from "drizzle-orm";
import type { MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { pluginResourceLinks } from "../schema.js";
import { pluginResultMessageChanged } from "./impl/pluginResultMessageChanged.js";
import { pluginResourceLinkInputs } from "./impl/pluginResourceLink.js";
import { PluginError } from "./types.js";

/**
 * Atomically replaces the bounded pluginResourceLinks rows for one MCP call and advances its already-linked assistant message only when the visible projection changed.
 * Returning the message mutation hint lets the runtime publish realtime reconciliation after commit while keeping untrusted result parsing and idempotent durable replacement in one action boundary.
 */
export async function pluginResourceLinkReplaceForCall(
    executor: DrizzleExecutor,
    input: {
        sessionId: string;
        callId: string;
        userMessageId: string;
        agentUserId: string;
        installationId: string;
        toolName: string;
        result: Readonly<Record<string, unknown>>;
    },
): Promise<MutationHint | undefined> {
    const links = pluginResourceLinkInputs(input.result);
    return withTransaction(executor, async (tx) => {
        const existing = await tx
            .select()
            .from(pluginResourceLinks)
            .where(
                and(
                    eq(pluginResourceLinks.sessionId, input.sessionId),
                    eq(pluginResourceLinks.callId, input.callId),
                ),
            )
            .orderBy(asc(pluginResourceLinks.position));
        if (
            existing.some(
                (row) =>
                    row.userMessageId !== input.userMessageId ||
                    row.agentUserId !== input.agentUserId ||
                    row.installationId !== input.installationId ||
                    row.toolName !== input.toolName,
            )
        )
            throw new PluginError(
                "conflict",
                "The MCP resource-link call identity is already bound to another turn",
            );
        if (sameLinks(existing, links)) return undefined;
        await tx
            .delete(pluginResourceLinks)
            .where(
                and(
                    eq(pluginResourceLinks.sessionId, input.sessionId),
                    eq(pluginResourceLinks.callId, input.callId),
                ),
            );
        if (links.length)
            await tx.insert(pluginResourceLinks).values(
                links.map((link) => ({
                    ...link,
                    sessionId: input.sessionId,
                    callId: input.callId,
                    userMessageId: input.userMessageId,
                    agentUserId: input.agentUserId,
                    installationId: input.installationId,
                    toolName: input.toolName,
                })),
            );
        return pluginResultMessageChanged(tx, input);
    });
}

function sameLinks(
    existing: readonly (typeof pluginResourceLinks.$inferSelect)[],
    links: ReturnType<typeof pluginResourceLinkInputs>,
): boolean {
    return (
        existing.length === links.length &&
        existing.every((row, index) => {
            const link = links[index];
            return (
                link !== undefined &&
                row.position === link.position &&
                row.kind === link.kind &&
                row.uri === link.uri &&
                row.name === link.name &&
                row.title === (link.title ?? null) &&
                row.description === (link.description ?? null) &&
                row.mimeType === (link.mimeType ?? null) &&
                row.size === (link.size ?? null)
            );
        })
    );
}
