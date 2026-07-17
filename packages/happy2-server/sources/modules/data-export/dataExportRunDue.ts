import { Readable } from "node:stream";
import type { DrizzleExecutor } from "../drizzle.js";
import type { StoredFile } from "../file/types.js";
import type { FileStorage } from "../files/storage.js";
import { userFindActive } from "../user/userFindActive.js";
import { dataExportBuildArtifact } from "./dataExportBuildArtifact.js";
import { dataExportClaimPending } from "./dataExportClaimPending.js";
import { dataExportCompleteClaim } from "./dataExportCompleteClaim.js";
import { dataExportFailClaim } from "./dataExportFailClaim.js";
import { dataExportRemoveUnclaimedArtifact } from "./impl/dataExportRemoveUnclaimedArtifact.js";

/**
 * Claims pending export jobs, builds JSON for active requesters, stores each artifact, and records completion or failure under the claim lease.
 * Removing artifacts after a lost or failed claim prevents external storage from retaining files that no durable export job owns.
 */
export async function dataExportRunDue(
    executor: DrizzleExecutor,
    files: FileStorage,
    limit = 5,
): Promise<{
    completed: number;
    failed: number;
}> {
    const claims = await dataExportClaimPending(executor, limit);
    let completed = 0;
    let failed = 0;
    for (const claim of claims) {
        let artifact: StoredFile | undefined;
        try {
            const requesterId = claim.requestedByUserId;
            if (!requesterId) throw new Error("Data export requester no longer exists");
            const requester = await userFindActive(executor, requesterId);
            if (!requester) throw new Error("Data export requester is no longer active");
            const payload = await dataExportBuildArtifact(executor, claim);
            const contents = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
            artifact = await files.saveAttachmentUpload(requester, Readable.from([contents]), {
                filename: `happy2-${claim.kind}-${claim.id}.json`,
                contentType: "application/json",
            });
            if (!(await dataExportCompleteClaim(executor, claim, artifact.id))) {
                await dataExportRemoveUnclaimedArtifact(executor, files, claim, artifact).catch(
                    () => undefined,
                );
                continue;
            }
            completed += 1;
        } catch (error) {
            if (artifact)
                await dataExportRemoveUnclaimedArtifact(executor, files, claim, artifact).catch(
                    () => undefined,
                );
            if (await dataExportFailClaim(executor, claim, error)) failed += 1;
        }
    }
    return { completed, failed };
}
