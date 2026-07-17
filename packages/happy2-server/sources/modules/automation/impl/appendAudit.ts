import { type DrizzleTransaction } from "../../drizzle.js";
import { auditLogEntries } from "../../schema.js";
import { createId } from "@paralleldrive/cuid2";
/**
 * Appends the automation actor, operation, target, and structured context to auditLogEntries inside the caller's transaction.
 * Requiring that transaction prevents an automation definition or run mutation from committing without its corresponding evidence.
 */
export async function appendAudit(
    tx: DrizzleTransaction,
    actorUserId: string,
    action: string,
    targetId: string,
): Promise<void> {
    await tx.insert(auditLogEntries).values({
        id: createId(),
        actorUserId,
        action,
        targetType: "automation",
        targetId,
    });
}
