import type { DrizzleExecutor } from "../../drizzle.js";
import { fileDeleteOwnedUnreferenced } from "../../file/fileDeleteOwnedUnreferenced.js";
import type { StoredFile } from "../../file/types.js";
import type { FileStorage } from "../../files/storage.js";
import type { ClaimedDataExport } from "../../operations/types.js";

export async function dataExportRemoveUnclaimedArtifact(
    executor: DrizzleExecutor,
    files: FileStorage,
    claim: ClaimedDataExport,
    artifact: StoredFile,
): Promise<void> {
    if (!claim.requestedByUserId) return;
    const deleted = await fileDeleteOwnedUnreferenced(
        executor,
        artifact.id,
        claim.requestedByUserId,
        "data export claim was lost",
    );
    if (deleted === "deleted") await files.deleteStoredFile(artifact);
}
