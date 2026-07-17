import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { accounts, files, syncEvents, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Assigns a public file uploaded by the active user to that user's photoFileId and advances the profile sync sequence.
 * Updating users and syncEvents together lets clients replace the rendered identity only after the durable profile references the accepted file.
 */
export async function userSetPhoto(
    executor: DrizzleExecutor,
    userId: string,
    fileId: string,
): Promise<boolean> {
    return withTransaction(executor, async (tx) => {
        const [active] = await tx
            .select({
                id: users.id,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, userId),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        const [file] = await tx
            .select({
                id: files.id,
            })
            .from(files)
            .where(
                and(
                    eq(files.id, fileId),
                    eq(files.uploadedByUserId, userId),
                    eq(files.isPublic, 1),
                ),
            );
        if (!active || !file) return false;
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(users)
            .set({
                photoFileId: fileId,
                syncSequence: sequence,
            })
            .where(eq(users.id, userId));
        await tx.insert(syncEvents).values({
            sequence,
            kind: "user.updated",
            entityId: userId,
            actorUserId: userId,
        });
        return true;
    });
}
