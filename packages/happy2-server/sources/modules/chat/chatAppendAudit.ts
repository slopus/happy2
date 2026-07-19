import { type DrizzleTransaction } from "../drizzle.js";
import { auditLogEntries } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";
/**
 * Appends the actor, chat operation, target, and optional context to auditLogEntries within an existing product transaction.
 * This boundary ensures an administrative chat mutation cannot commit without the evidence needed to explain it later.
 */
export async function chatAppendAudit(
    tx: DrizzleTransaction,
    input: {
        actorUserId?: string;
        action: string;
        targetType: string;
        targetId?: string;
        chatId?: string;
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
    },
): Promise<void> {
    await tx.insert(auditLogEntries).values({
        id: createId(),
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        chatId: input.chatId,
        beforeJson: input.before ? JSON.stringify(input.before) : null,
        afterJson: input.after ? JSON.stringify(input.after) : null,
    });
}
