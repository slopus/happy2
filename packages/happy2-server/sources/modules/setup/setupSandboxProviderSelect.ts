import { eq } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { serverSetupSteps, syncEvents } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { encodedMetadata } from "./impl/encodedMetadata.js";
import { requireActiveAdministratorDb } from "./impl/requireActiveAdministratorDb.js";
import { requirePrerequisitesDb } from "./impl/requirePrerequisitesDb.js";
import { safeMetadata } from "./impl/safeMetadata.js";
import { serverStepDb } from "./impl/serverStepDb.js";
import { setupHint } from "./impl/setupHint.js";
import { SetupError, type SetupSyncHint } from "./types.js";

/**
 * Atomically commits the healthy provider to sandbox_provider_selected and sandbox_provider_validated in serverSetupSteps and appends one syncEvents hint.
 * This administrator-only boundary makes the durable choice restart-safe and prevents agent execution from observing a selected but unvalidated provider.
 */
export async function setupSandboxProviderSelect(
    executor: DrizzleExecutor,
    actorUserId: string,
    provider: { id: string; version?: string },
): Promise<SetupSyncHint | undefined> {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(provider.id))
        throw new SetupError("invalid", "Invalid sandbox provider id");
    if (provider.version !== undefined && Buffer.byteLength(provider.version) > 512)
        throw new SetupError("invalid", "Sandbox provider version exceeds 512 bytes");
    return withTransaction(executor, async (tx) => {
        await requireActiveAdministratorDb(tx, actorUserId);
        await requirePrerequisitesDb(tx, "sandbox_provider_selected");
        const selected = await serverStepDb(tx, "sandbox_provider_selected");
        const validated = await serverStepDb(tx, "sandbox_provider_validated");
        const selectedMetadata = safeMetadata(selected.metadataJson);
        const validatedMetadata = safeMetadata(validated.metadataJson);
        if (selected.state === "complete" || validated.state === "complete") {
            if (
                selected.state === "complete" &&
                validated.state === "complete" &&
                selectedMetadata?.providerId === provider.id &&
                validatedMetadata?.providerId === provider.id
            )
                return undefined;
            throw new SetupError("conflict", "A sandbox provider was already selected");
        }
        const now = new Date().toISOString();
        await tx
            .update(serverSetupSteps)
            .set({
                state: "complete",
                metadataJson: encodedMetadata({ providerId: provider.id }),
                lastError: null,
                startedAt: selected.startedAt ?? now,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "sandbox_provider_selected"));
        await tx
            .update(serverSetupSteps)
            .set({
                state: "complete",
                metadataJson: encodedMetadata({
                    providerId: provider.id,
                    ...(provider.version ? { version: provider.version } : {}),
                }),
                lastError: null,
                startedAt: validated.startedAt ?? now,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "sandbox_provider_validated"));
        const sequence = await syncSequenceNext(tx);
        await tx.insert(syncEvents).values({
            sequence,
            kind: "setup.sandboxProvider.selected",
            entityId: provider.id,
            actorUserId,
        });
        return setupHint(sequence);
    });
}
