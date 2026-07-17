import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { areaHint } from "../chat/areaHint.js";
import { eq, sql } from "drizzle-orm";
import { serverSettings } from "../schema.js";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { fileCanAccessWith } from "../chat/fileCanAccessWith.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { serverProfileGet } from "./serverProfileGet.js";

/**
 * Updates administrator-controlled serverSettings identity fields after validating any replacement icon or branding file.
 * The settings, file authorization, sync hint, and audit entry commit together so clients never display unapproved or unexplained server branding.
 */
export async function serverProfileUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        name?: string;
        title?: string | null;
        photoFileId?: string | null;
        defaultRetentionMode?: "forever" | "duration";
        defaultRetentionSeconds?: number | null;
    },
): Promise<{
    server: Awaited<ReturnType<typeof serverProfileGet>>;
    hint: MutationHint;
}> {
    const result = await withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        if (
            input.photoFileId &&
            !(await fileCanAccessWith(tx, input.actorUserId, input.photoFileId))
        )
            throw new CollaborationError("not_found", "Server photo file was not found");
        const [current] = await tx
            .select({
                defaultRetentionMode: serverSettings.defaultRetentionMode,
                defaultRetentionSeconds: serverSettings.defaultRetentionSeconds,
            })
            .from(serverSettings)
            .where(eq(serverSettings.id, 1));
        if (!current) throw new Error("Server settings are missing");
        const retentionMode = input.defaultRetentionMode ?? current.defaultRetentionMode;
        const retentionSeconds =
            input.defaultRetentionSeconds === undefined
                ? current.defaultRetentionSeconds === null
                    ? undefined
                    : current.defaultRetentionSeconds
                : (input.defaultRetentionSeconds ?? undefined);
        if (retentionMode === "duration" && !retentionSeconds)
            throw new CollaborationError(
                "invalid",
                "Duration retention requires defaultRetentionSeconds",
            );
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(serverSettings)
            .set({
                ...(input.name === undefined
                    ? {}
                    : {
                          name: input.name,
                      }),
                ...(input.title === undefined
                    ? {}
                    : {
                          title: input.title,
                      }),
                ...(input.photoFileId === undefined
                    ? {}
                    : {
                          photoFileId: input.photoFileId,
                      }),
                ...(input.defaultRetentionMode === undefined
                    ? {}
                    : {
                          defaultRetentionMode: input.defaultRetentionMode,
                      }),
                ...(input.defaultRetentionSeconds === undefined
                    ? {}
                    : {
                          defaultRetentionSeconds: input.defaultRetentionSeconds,
                      }),
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(serverSettings.id, 1));
        await syncEventInsert(tx, {
            sequence,
            kind: "server.updated",
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "server.updated",
            targetType: "server",
            targetId: "1",
            after: {
                name: input.name,
                title: input.title,
                photoFileId: input.photoFileId,
                defaultRetentionMode: input.defaultRetentionMode,
                defaultRetentionSeconds: input.defaultRetentionSeconds,
            },
        });
        return {
            sequence,
        };
    });
    return {
        server: await serverProfileGet(executor),
        hint: areaHint(result.sequence, "server"),
    };
}
