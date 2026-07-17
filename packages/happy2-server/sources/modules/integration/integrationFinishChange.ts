import { type DrizzleTransaction } from "../drizzle.js";
import { type IntegrationChange } from "../integrations/types.js";
import { eq } from "drizzle-orm";
import { integrations } from "../schema.js";
import { integrationAppendAudit } from "./integrationAppendAudit.js";
import { integrationRecordChange } from "./integrationRecordChange.js";
/**
 * Updates integrations modification metadata and appends the supplied audit description for a completed integration transition.
 * Reusing the caller's transaction prevents the durable integration version from advancing without an attributable change record.
 */
export async function integrationFinishChange(
    tx: DrizzleTransaction,
    actorUserId: string,
    kind: string,
    integrationId: string,
): Promise<IntegrationChange> {
    const change = await integrationRecordChange(tx, actorUserId, kind, integrationId);
    await integrationAppendAudit(tx, actorUserId, kind, "integration", integrationId);
    await tx
        .update(integrations)
        .set({
            syncSequence: Number(change.sequence),
        })
        .where(eq(integrations.id, integrationId));
    return change;
}
