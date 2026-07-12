import { Readable } from "node:stream";
import { type Database, type StoredFile } from "../database.js";
import type { FileStorage } from "../files/storage.js";
import { type ClaimedDataExport, OperationsRepository } from "./repository.js";

/** Executes durable export claims. SQLite claim timestamps fence concurrent server instances. */
export class DataExportWorker {
    constructor(
        private readonly repository: OperationsRepository,
        private readonly database: Database,
        private readonly files: FileStorage,
    ) {}

    async runDue(limit = 5): Promise<{ completed: number; failed: number }> {
        const claims = await this.repository.claimPendingDataExports(limit);
        let completed = 0;
        let failed = 0;
        for (const claim of claims) {
            let artifact: StoredFile | undefined;
            try {
                const requesterId = claim.requestedByUserId;
                if (!requesterId) throw new Error("Data export requester no longer exists");
                const requester = await this.database.findActiveUser(requesterId);
                if (!requester) throw new Error("Data export requester is no longer active");
                const payload = await this.repository.buildDataExportArtifact(claim);
                const contents = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
                artifact = await this.files.saveAttachmentUpload(
                    requester,
                    Readable.from([contents]),
                    {
                        filename: `rigged-${claim.kind}-${claim.id}.json`,
                        contentType: "application/json",
                    },
                );
                if (!(await this.repository.completeClaimedDataExport(claim, artifact.id))) {
                    await this.removeUnclaimedArtifact(claim, artifact).catch(() => undefined);
                    continue;
                }
                completed += 1;
            } catch (error) {
                if (artifact)
                    await this.removeUnclaimedArtifact(claim, artifact).catch(() => undefined);
                if (await this.repository.failClaimedDataExport(claim, error)) failed += 1;
            }
        }
        return { completed, failed };
    }

    private async removeUnclaimedArtifact(
        claim: ClaimedDataExport,
        artifact: StoredFile,
    ): Promise<void> {
        if (!claim.requestedByUserId) return;
        const deleted = await this.database.deleteOwnedUnreferencedFile(
            artifact.id,
            claim.requestedByUserId,
            "data export claim was lost",
        );
        if (deleted === "deleted") await this.files.deleteStoredFile(artifact);
    }
}
