import { type AuditContext } from "../operations/auditContext.js";
import { type DataExportJob, type DataExportKind, OperationsError } from "../operations/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { createId } from "@paralleldrive/cuid2";
import { dataExportJobs } from "../schema.js";
import { futureTimestamp } from "../operations/futureTimestamp.js";
import { json } from "../operations/json.js";
import { auditAppend } from "../operations/auditAppend.js";
import { dataExportCanAccessChat } from "./dataExportCanAccessChat.js";
import { exportJobDb } from "./impl/exportJobDb.js";
import { userRequireOperationsActive } from "../operations/userRequireOperationsActive.js";
import { dataExportRequireExistingUser } from "./dataExportRequireExistingUser.js";

/**
 * Queues a dataExportJobs request only after validating the actor, target user, and access to every requested chat scope.
 * Capturing authorization and audit context when the job is created prevents an asynchronous worker from exporting data the requester could not inspect.
 */
export async function dataExportRequest(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        kind: DataExportKind;
        targetId?: string;
        options?: Record<string, unknown>;
        expiresAt?: string;
        context?: AuditContext;
    },
): Promise<DataExportJob> {
    const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
    return withTransaction(executor, async (tx) => {
        const actor = await userRequireOperationsActive(tx, input.actorUserId);
        let targetId = input.targetId;
        if (input.kind === "user_data") {
            targetId ??= input.actorUserId;
            if (targetId !== input.actorUserId && actor.role !== "admin")
                throw new OperationsError(
                    "forbidden",
                    "Only administrators can export another user",
                );
            await dataExportRequireExistingUser(tx, targetId);
        } else if (input.kind === "chat_history") {
            if (!targetId) throw new OperationsError("invalid", "chat_history requires targetId");
            if (!(await dataExportCanAccessChat(tx, input.actorUserId, targetId)))
                throw new OperationsError("not_found", "Chat was not found");
        } else {
            if (actor.role !== "admin")
                throw new OperationsError("forbidden", "This export requires an administrator");
            targetId = undefined;
        }
        const id = createId();
        await tx.insert(dataExportJobs).values({
            id,
            requestedByUserId: input.actorUserId,
            kind: input.kind,
            targetId,
            optionsJson: json(input.options),
            expiresAt,
        });
        const job = await exportJobDb(tx, id);
        await auditAppend(tx, {
            actorUserId: input.actorUserId,
            action: "data_export.requested",
            targetType: "data_export",
            targetId: id,
            chatId: input.kind === "chat_history" ? targetId : undefined,
            after: job,
            context: input.context,
        });
        return job;
    });
}
