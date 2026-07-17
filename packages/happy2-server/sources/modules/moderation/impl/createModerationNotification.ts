import { type DrizzleTransaction } from "../../drizzle.js";
import { type OperationsSyncHint } from "../../operations/types.js";
import { createId } from "@paralleldrive/cuid2";
import { notifications } from "../../schema.js";
import { syncEventInsert } from "../../sync/syncEventInsert.js";
import { syncSequenceNextWithTimestamp } from "../../sync/syncSequenceNextWithTimestamp.js";
import { dataExportRequireExistingUser } from "../../data-export/dataExportRequireExistingUser.js";
/**
 * Inserts a targeted notifications payload describing the warning or restriction after confirming the recipient still exists.
 * Allocating its sync event in the moderation transaction prevents users from being notified about an action that later rolls back.
 */
export async function createModerationNotification(
    tx: DrizzleTransaction,
    input: {
        actorUserId: string;
        targetUserId: string;
        chatId?: string;
        actionId: string;
        reportId?: string;
        action: "warn" | "restrict" | "restrict_revoked";
        reason?: string;
        expiresAt?: string;
    },
): Promise<OperationsSyncHint> {
    await dataExportRequireExistingUser(tx, input.targetUserId);
    const sequence = await syncSequenceNextWithTimestamp(tx);
    const notificationId = createId();
    await tx.insert(notifications).values({
        id: notificationId,
        userId: input.targetUserId,
        kind: "moderation",
        chatId: input.chatId,
        actorUserId: input.actorUserId,
        payloadJson: JSON.stringify({
            actionId: input.actionId,
            reportId: input.reportId,
            action: input.action,
            reason: input.reason,
            expiresAt: input.expiresAt,
        }),
        syncSequence: sequence,
    });
    await syncEventInsert(tx, {
        sequence,
        kind: "notification.created",
        entityId: notificationId,
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
    });
    return {
        sequence: String(sequence),
        chats: [],
        areas: ["notifications"],
    };
}
