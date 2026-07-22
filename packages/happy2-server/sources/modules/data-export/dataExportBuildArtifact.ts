import { type ClaimedDataExport } from "./impl/claimedDataExport.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, auditLogEntries, chats, files, messages, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { asAudit } from "../operations/asAudit.js";

import { auditSelection } from "../operations/auditSelection.js";

import { objectValue } from "./impl/objectValue.js";

import { dataExportCanAccessChat } from "./dataExportCanAccessChat.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
/**
 * Builds the claimed export payload for user data, accessible chat history, administrator audit history, or server user/chat inventory.
 * Rechecking requester existence, chat visibility, and administrator-only kinds at generation time prevents a stale claim from exporting newly inaccessible data.
 */
export async function dataExportBuildArtifact(
    executor: DrizzleExecutor,
    claim: ClaimedDataExport,
): Promise<Record<string, unknown>> {
    if (!claim.requestedByUserId) throw new Error("Data export requester no longer exists");
    const base = {
        schemaVersion: 1,
        exportId: claim.id,
        kind: claim.kind,
        requestedByUserId: claim.requestedByUserId,
        targetId: claim.targetId,
        createdAt: claim.createdAt,
        generatedAt: new Date().toISOString(),
        options: claim.options,
    };
    if (claim.kind === "user_data") {
        const targetId = claim.targetId ?? claim.requestedByUserId;
        const [profile] = await executor
            .select({
                id: users.id,
                username: users.username,
                firstName: users.firstName,
                lastName: users.lastName,
                title: users.title,
                email: accounts.email,
                phone: users.phone,
                photoFileId: users.photoFileId,
                createdAt: users.createdAt,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(eq(users.id, targetId));
        if (!profile) throw new Error("Data export target no longer exists");
        const options = objectValue(claim.options);
        const exportedFiles = options.includeFiles
            ? await executor
                  .select({
                      id: files.id,
                      kind: files.kind,
                      originalName: files.originalName,
                      contentType: files.contentType,
                      size: files.size,
                      createdAt: files.createdAt,
                  })
                  .from(files)
                  .where(and(eq(files.uploadedByUserId, targetId), isNull(files.deletedAt)))
                  .orderBy(files.createdAt, files.id)
            : [];
        return {
            ...base,
            data: {
                profile,
                files: exportedFiles,
            },
        };
    }
    if (claim.kind === "chat_history") {
        if (
            !claim.targetId ||
            !(await dataExportCanAccessChat(executor, claim.requestedByUserId, claim.targetId))
        )
            throw new Error("Data export chat is no longer accessible");
        const [chat] = await executor
            .select({
                id: chats.id,
                kind: chats.kind,
                name: chats.name,
                topic: chats.topic,
            })
            .from(chats)
            .where(eq(chats.id, claim.targetId));
        const exportedMessages = await executor
            .select({
                id: messages.id,
                sequence: messages.sequence,
                senderUserId: messages.senderUserId,
                senderBotId: messages.senderBotId,
                kind: messages.kind,
                automated: messages.automated,
                text: messages.text,
                createdAt: messages.createdAt,
                editedAt: messages.editedAt,
                deletedAt: messages.deletedAt,
            })
            .from(messages)
            .where(eq(messages.chatId, claim.targetId))
            .orderBy(messages.sequence);
        return {
            ...base,
            data: {
                chat,
                messages: exportedMessages,
            },
        };
    }
    await userRequireOperationsAdmin(executor, claim.requestedByUserId);
    if (claim.kind === "audit_log") {
        const entries = await executor
            .select(auditSelection)
            .from(auditLogEntries)
            .orderBy(auditLogEntries.createdAt, auditLogEntries.id);
        return {
            ...base,
            data: {
                auditLog: entries.map(asAudit),
            },
        };
    }
    const [exportedUsers, exportedChats] = await Promise.all([
        executor
            .select({
                id: users.id,
                username: users.username,
                role: users.role,
                createdAt: users.createdAt,
                deletedAt: users.deletedAt,
            })
            .from(users)
            .orderBy(users.createdAt, users.id),
        executor
            .select({
                id: chats.id,
                kind: chats.kind,
                name: chats.name,
                createdAt: chats.createdAt,
                deletedAt: chats.deletedAt,
            })
            .from(chats)
            .orderBy(chats.createdAt, chats.id),
    ]);
    return {
        ...base,
        data: {
            users: exportedUsers,
            chats: exportedChats,
        },
    };
}
