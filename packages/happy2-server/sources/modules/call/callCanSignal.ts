import { type DrizzleExecutor } from "../drizzle.js";
import { alias } from "drizzle-orm/sqlite-core";
import { and, eq, inArray, sql } from "drizzle-orm";
import { callParticipants, calls } from "../schema.js";

/**
 * Reports whether a ringing or joined participant may signal within the matching ringing or active call and chat, optionally to an eligible recipient.
 * Checking both endpoints against current participation state prevents signaling across calls or toward users who already left.
 */
export async function callCanSignal(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        callId: string;
        chatId: string;
        recipientUserId?: string;
    },
): Promise<boolean> {
    const sender = alias(callParticipants, "sender");
    const recipient = alias(callParticipants, "recipient");
    const recipientExists = executor
        .select({
            userId: recipient.userId,
        })
        .from(recipient)
        .where(
            and(
                eq(recipient.callId, calls.id),
                eq(recipient.userId, input.recipientUserId!),
                inArray(recipient.status, ["ringing", "joined"]),
            ),
        );
    const [row] = await executor
        .select({
            id: calls.id,
        })
        .from(calls)
        .innerJoin(sender, and(eq(sender.callId, calls.id), eq(sender.userId, input.userId)))
        .where(
            and(
                eq(calls.id, input.callId),
                eq(calls.chatId, input.chatId),
                inArray(calls.status, ["ringing", "active"]),
                inArray(sender.status, ["ringing", "joined"]),
                ...(input.recipientUserId ? [sql`exists ${recipientExists}`] : []),
            ),
        )
        .limit(1);
    return Boolean(row);
}
