import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { areaHint } from "../scheduled-message/areaHint.js";
import { automations } from "../schema.js";

import { appendAudit } from "./impl/appendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { requireAdmin } from "./impl/requireAdmin.js";

/**
 * Soft-deletes an automations definition after administrator authorization so no future trigger may claim it.
 * The same commit emits sync and audit records, making execution shutdown visible and attributable before workers observe the change.
 */
export async function automationDelete(
    executor: DrizzleExecutor,
    actorUserId: string,
    automationId: string,
): Promise<MutationHint> {
    return withTransaction(executor, async (tx) => {
        await requireAdmin(tx, actorUserId);
        const changed = await tx
            .update(automations)
            .set({
                active: 0,
                deletedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(automations.id, automationId), isNull(automations.deletedAt)))
            .returning({
                id: automations.id,
            });
        if (changed.length === 0)
            throw new CollaborationError("not_found", "Automation was not found");
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "automation.deleted",
            entityId: automationId,
            actorUserId,
        });
        await appendAudit(tx, actorUserId, "automation.deleted", automationId);
        return areaHint(sequence, "automations");
    });
}
