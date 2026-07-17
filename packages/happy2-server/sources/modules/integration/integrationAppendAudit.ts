import { type DrizzleTransaction } from "../drizzle.js";
import { auditLogEntries } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";
/**
 * Writes the integration actor, action, target, and structured request context into auditLogEntries within the caller's transaction.
 * This helper makes authorization-sensitive integration changes inseparable from the evidence used to investigate them.
 */
export async function integrationAppendAudit(
    tx: DrizzleTransaction,
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    await tx.insert(auditLogEntries).values({
        id: createId(),
        actorUserId,
        action,
        targetType,
        targetId,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
    });
}
