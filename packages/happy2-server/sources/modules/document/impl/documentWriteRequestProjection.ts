import { documentWriteRequests } from "../../schema.js";
import type { DocumentWriteRequestStatus, DocumentWriteRequestSummary } from "../types.js";

export const documentWriteRequestSelection = {
    id: documentWriteRequests.id,
    status: documentWriteRequests.status,
    chatId: documentWriteRequests.chatId,
    actorUserId: documentWriteRequests.actorUserId,
    agentUserId: documentWriteRequests.agentUserId,
    requesterInstallationId: documentWriteRequests.requesterInstallationId,
    documentId: documentWriteRequests.documentId,
    documentTitle: documentWriteRequests.documentTitle,
    clientUpdateId: documentWriteRequests.clientUpdateId,
    acceptedSequence: documentWriteRequests.acceptedSequence,
    resolvedByUserId: documentWriteRequests.resolvedByUserId,
    resolvedAt: documentWriteRequests.resolvedAt,
    expiresAt: documentWriteRequests.expiresAt,
    lastError: documentWriteRequests.lastError,
    createdAt: documentWriteRequests.createdAt,
    updatedAt: documentWriteRequests.updatedAt,
};

const statuses: readonly DocumentWriteRequestStatus[] = ["pending", "approved", "denied", "failed"];

export function asDocumentWriteRequest(row: Record<string, unknown>): DocumentWriteRequestSummary {
    const status = requiredString(row.status, "document write request status");
    if (!statuses.includes(status as DocumentWriteRequestStatus))
        throw new Error(`Unknown document write request status ${status}`);
    return {
        id: requiredString(row.id, "document write request id"),
        status: status as DocumentWriteRequestStatus,
        chatId: requiredString(row.chatId, "document write request chat id"),
        ...(optionalString(row.actorUserId)
            ? { actorUserId: optionalString(row.actorUserId) }
            : {}),
        ...(optionalString(row.agentUserId)
            ? { agentUserId: optionalString(row.agentUserId) }
            : {}),
        ...(optionalString(row.requesterInstallationId)
            ? { requesterInstallationId: optionalString(row.requesterInstallationId) }
            : {}),
        documentId: requiredString(row.documentId, "document write request document id"),
        documentTitle: requiredString(
            row.documentTitle,
            "document write request document title",
            true,
        ),
        clientUpdateId: requiredString(row.clientUpdateId, "document write request update id"),
        ...(optionalString(row.acceptedSequence)
            ? { acceptedSequence: optionalString(row.acceptedSequence) }
            : {}),
        ...(optionalString(row.resolvedByUserId)
            ? { resolvedByUserId: optionalString(row.resolvedByUserId) }
            : {}),
        ...(optionalString(row.resolvedAt) ? { resolvedAt: optionalString(row.resolvedAt) } : {}),
        expiresAt: requiredString(row.expiresAt, "document write request expiry"),
        ...(optionalString(row.lastError) ? { lastError: optionalString(row.lastError) } : {}),
        createdAt: requiredString(row.createdAt, "document write request creation timestamp"),
        updatedAt: requiredString(row.updatedAt, "document write request update timestamp"),
    };
}

function requiredString(value: unknown, name: string, allowEmpty = false): string {
    if (typeof value !== "string" || (!allowEmpty && !value)) throw new Error(`Invalid ${name}`);
    return value;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}
