import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    OPERATIONAL_SERVER_SETUP_STEPS,
    type OperationalServerSetupStep,
    type SafeSetupMetadata,
    type ServerSetupStepState,
    SetupError,
    type SetupSyncHint,
} from "./types.js";

import { allowedServerTransition } from "./impl/allowedServerTransition.js";
import { encodedMetadata } from "./impl/encodedMetadata.js";
import { eq } from "drizzle-orm";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { requirePrerequisitesDb } from "./impl/requirePrerequisitesDb.js";
import { serverSetupSteps, syncEvents } from "../schema.js";
import { serverStepDb } from "./impl/serverStepDb.js";
import { setupHint } from "./impl/setupHint.js";

import { validatedLastError } from "./impl/validatedLastError.js";

/**
 * Applies a valid lifecycle transition to serverSetupSteps after checking prerequisites and normalizing metadata or failure details.
 * Inserting syncEvents with the transition lets setup clients resume from the exact durable progress recorded by background work.
 */
export async function setupRecordOperationalStep(
    executor: DrizzleExecutor,
    input: {
        step: OperationalServerSetupStep;
        state: ServerSetupStepState;
        actorUserId?: string;
        metadata?: SafeSetupMetadata;
        lastError?: string;
    },
): Promise<SetupSyncHint | undefined> {
    if (!OPERATIONAL_SERVER_SETUP_STEPS.includes(input.step))
        throw new SetupError("invalid", "Unsupported operational setup step");
    const metadataJson = encodedMetadata(input.metadata);
    const lastError = validatedLastError(input.state, input.lastError);
    return withTransaction(executor, async (tx) => {
        await requirePrerequisitesDb(tx, input.step);
        const current = await serverStepDb(tx, input.step);
        const sameState = current.state === input.state;
        if (
            sameState &&
            current.metadataJson === metadataJson &&
            current.lastError === (lastError ?? null)
        )
            return undefined;
        if (sameState && input.state === "complete")
            throw new SetupError("conflict", `Completed setup step ${input.step} is immutable`);
        if (!sameState && !allowedServerTransition(current.state, input.state))
            throw new SetupError(
                "conflict",
                `Cannot transition ${input.step} from ${current.state} to ${input.state}`,
            );
        const now = new Date().toISOString();
        await tx
            .update(serverSetupSteps)
            .set({
                state: input.state,
                metadataJson,
                lastError: lastError ?? null,
                startedAt:
                    input.state === "in_progress" && !current.startedAt ? now : current.startedAt,
                completedAt: input.state === "complete" ? now : null,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, input.step));
        const sequence = await syncSequenceNext(tx);
        await tx.insert(syncEvents).values({
            sequence,
            kind: `setup.${input.step}.${input.state}`,
            entityId: input.step,
            actorUserId: input.actorUserId ?? null,
        });
        return setupHint(sequence);
    });
}
