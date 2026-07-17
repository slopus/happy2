import { type ChatSummary, CollaborationError, type MessageSummary } from "../chat/types.js";

import { type DrizzleExecutor } from "../drizzle.js";

import { and, asc, eq, gt, lte } from "drizzle-orm";

import { chats, chatUpdates } from "../schema.js";

import { number } from "../chat/number.js";
import { optionalText } from "../chat/optionalText.js";
import { text } from "../chat/text.js";
import { chatGet } from "../chat/chatGet.js";
import { messageGetProjection } from "../message/messageGetProjection.js";
/**
 * Reconciles one accessible chat from a membership epoch and points cursor, including affected message projections.
 * Reset, retention, slicing, and future-cursor decisions live here so clients advance chat state without skipping durable updates.
 */
export async function chatSyncGetDifference(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        chatId: string;
        membershipEpoch: string;
        fromPts: number;
        untilPts?: number;
        limit: number;
    },
): Promise<{
    kind: "empty" | "difference" | "slice" | "reset" | "tooLong";
    updates: Array<{
        pts: string;
        ptsCount: 1;
        kind: string;
        entityId?: string;
    }>;
    messages: MessageSummary[];
    chat: ChatSummary;
    state: {
        membershipEpoch: string;
        pts: string;
    };
    targetState: {
        membershipEpoch: string;
        pts: string;
    };
}> {
    const chat = await chatGet(executor, input.userId, input.chatId);
    const currentPts = number(chat.pts);
    const currentEpoch = chat.membershipEpoch;
    if (input.untilPts !== undefined && input.untilPts > currentPts)
        throw new CollaborationError("future_state", "Chat target is ahead of the server");
    const target = Math.min(input.untilPts ?? currentPts, currentPts);
    const base = {
        updates: [],
        messages: [],
        chat,
        state: {
            membershipEpoch: currentEpoch,
            pts: String(currentPts),
        },
        targetState: {
            membershipEpoch: currentEpoch,
            pts: String(currentPts),
        },
    };
    if (currentEpoch !== input.membershipEpoch)
        return {
            kind: "reset",
            ...base,
        };
    if (input.fromPts > currentPts || target < input.fromPts)
        throw new CollaborationError("future_state", "Chat cursor is ahead of the server");
    const [recoverable] = await executor
        .select({
            minRecoverablePts: chats.minRecoverablePts,
        })
        .from(chats)
        .where(eq(chats.id, input.chatId));
    if (input.fromPts < (recoverable?.minRecoverablePts ?? 0))
        return {
            kind: "tooLong",
            ...base,
        };
    const result = await executor
        .select({
            pts: chatUpdates.pts,
            pts_count: chatUpdates.ptsCount,
            kind: chatUpdates.kind,
            entity_id: chatUpdates.entityId,
        })
        .from(chatUpdates)
        .where(
            and(
                eq(chatUpdates.chatId, input.chatId),
                gt(chatUpdates.pts, input.fromPts),
                lte(chatUpdates.pts, target),
            ),
        )
        .orderBy(asc(chatUpdates.pts))
        .limit(input.limit + 1);
    const hasMore = result.length > input.limit;
    const rows = result.slice(0, input.limit);
    const intermediate = hasMore ? number(rows.at(-1)?.pts) : target;
    const updates = rows.map((row) => ({
        pts: text(row.pts),
        ptsCount: 1 as const,
        kind: text(row.kind),
        entityId: optionalText(row.entity_id),
    }));
    const messageIds = new Set(
        updates
            .filter(
                (update) =>
                    update.entityId &&
                    (update.kind.startsWith("message.") ||
                        update.kind.startsWith("reaction.") ||
                        update.kind.startsWith("thread.") ||
                        update.kind.startsWith("receipt.")),
            )
            .map((update) => update.entityId!),
    );
    const messages: MessageSummary[] = [];
    const projectedMessageIds = new Set<string>();
    for (const messageId of messageIds) {
        const message = await messageGetProjection(executor, input.userId, messageId);
        if (!message) continue;
        messages.push(message);
        projectedMessageIds.add(message.id);
        if (message.threadRootMessageId && !projectedMessageIds.has(message.threadRootMessageId)) {
            const root = await messageGetProjection(
                executor,
                input.userId,
                message.threadRootMessageId,
            );
            if (root) {
                messages.push(root);
                projectedMessageIds.add(root.id);
            }
        }
    }
    const state = {
        membershipEpoch: currentEpoch,
        pts: String(intermediate),
    };
    const targetState = {
        membershipEpoch: currentEpoch,
        pts: String(target),
    };
    return {
        kind: rows.length === 0 ? "empty" : hasMore ? "slice" : "difference",
        updates,
        messages,
        chat: await chatGet(executor, input.userId, input.chatId),
        state,
        targetState,
    };
}
