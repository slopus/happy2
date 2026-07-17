import { type AuditContext } from "./auditContext.js";
import { type DrizzleTransaction } from "../drizzle.js";
import { auditLogEntries } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";
import { json } from "./json.js";
/**
 * Appends normalized actor, action, target, reason, and request context fields to auditLogEntries for an operations mutation.
 * The caller's transaction ensures sensitive administrative state cannot commit without the evidence required to review it.
 */
export async function auditAppend(
    tx: DrizzleTransaction,
    input: {
        actorUserId?: string;
        action: string;
        targetType: string;
        targetId?: string;
        chatId?: string;
        before?: unknown;
        after?: unknown;
        context?: AuditContext;
    },
): Promise<void> {
    const request = input.context?.request;
    const metadata = {
        ...input.context?.metadata,
        ...(request?.forwardedFor
            ? {
                  forwardedFor: request.forwardedFor,
              }
            : {}),
        ...(request?.location
            ? {
                  location: request.location,
              }
            : {}),
    };
    await tx.insert(auditLogEntries).values({
        id: createId(),
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        chatId: input.chatId,
        beforeJson: json(input.before),
        afterJson: json(input.after),
        metadataJson: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
        clientIp: request?.ip,
        device: request?.device,
        appVersion: request?.appVersion,
        userAgent: request?.userAgent,
    });
}
