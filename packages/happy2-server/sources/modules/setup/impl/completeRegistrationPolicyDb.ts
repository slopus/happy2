import { type DrizzleTransaction } from "../../drizzle.js";
import { encodedMetadata } from "./encodedMetadata.js";
import { eq, sql } from "drizzle-orm";
import { syncSequenceNext } from "../../sync/syncSequenceNext.js";
import { requirePrerequisitesDb } from "./requirePrerequisitesDb.js";
import { type SafeSetupMetadata, type SetupSyncHint } from "../types.js";
import { serverSetupState, serverSetupSteps, syncEvents } from "../../schema.js";

import { setupHint } from "./setupHint.js";

export async function completeRegistrationPolicyDb(
    tx: DrizzleTransaction,
    actorUserId: string,
    registrationEnabled: boolean,
    metadata: SafeSetupMetadata,
): Promise<SetupSyncHint> {
    await requirePrerequisitesDb(tx, "registration_policy_selected");
    const now = new Date().toISOString();
    await tx
        .update(serverSetupState)
        .set({
            registrationEnabled: registrationEnabled ? 1 : 0,
            updatedAt: now,
        })
        .where(eq(serverSetupState.id, 1));
    await tx
        .update(serverSetupSteps)
        .set({
            state: "complete",
            metadataJson: encodedMetadata(metadata),
            lastError: null,
            startedAt: sql`coalesce(${serverSetupSteps.startedAt}, ${now})`,
            completedAt: now,
            updatedAt: now,
        })
        .where(eq(serverSetupSteps.step, "registration_policy_selected"));
    await tx
        .update(serverSetupSteps)
        .set({
            state: "complete",
            metadataJson: encodedMetadata({
                source: "registration_policy",
            }),
            lastError: null,
            startedAt: sql`coalesce(${serverSetupSteps.startedAt}, ${now})`,
            completedAt: now,
            updatedAt: now,
        })
        .where(eq(serverSetupSteps.step, "server_setup_complete"));
    const sequence = await syncSequenceNext(tx);
    await tx.insert(syncEvents).values([
        {
            sequence,
            kind: "setup.registration_policy_selected.complete",
            entityId: "registration_policy_selected",
            actorUserId,
        },
        {
            sequence,
            kind: "setup.server_setup_complete.complete",
            entityId: "server_setup_complete",
            actorUserId,
        },
    ]);
    return setupHint(sequence);
}
