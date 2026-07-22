import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings, agentTurns, files, messageAttachments, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { agentTurnAttachmentPath } from "./impl/agentTurnAttachmentPath.js";

/**
 * Resolves the safe stored files attached to one exact active agent's leased turn and isolated container.
 * Matching the durable turn to its Rig binding and active identity prevents stale sessions from materializing arbitrary file records, while excluding deleted, incomplete, and infected uploads preserves the normal file-serving safety boundary.
 */
export async function agentTurnAttachmentGetContext(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        chatId: string;
        sessionId: string;
        userMessageId: string;
    },
): Promise<
    | {
          containerName: string;
          attachments: Array<{
              containerPath: string;
              fileId: string;
              storageName: string;
          }>;
      }
    | undefined
> {
    const [turn] = await executor
        .select({ containerName: agentRigBindings.containerName })
        .from(agentTurns)
        .innerJoin(
            agentRigBindings,
            and(
                eq(agentRigBindings.chatId, agentTurns.chatId),
                eq(agentRigBindings.userId, agentTurns.agentUserId),
                eq(agentRigBindings.sessionId, agentTurns.sessionId),
            ),
        )
        .innerJoin(users, eq(users.id, agentTurns.agentUserId))
        .where(
            and(
                eq(agentTurns.userMessageId, input.userMessageId),
                eq(agentTurns.agentUserId, input.agentUserId),
                eq(agentTurns.chatId, input.chatId),
                eq(agentTurns.sessionId, input.sessionId),
                eq(users.kind, "agent"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        )
        .limit(1);
    if (!turn) return undefined;
    const attachmentRows = await executor
        .select({
            deletedAt: files.deletedAt,
            fileId: files.id,
            originalName: files.originalName,
            scanStatus: files.scanStatus,
            storageName: files.storageName,
            uploadStatus: files.uploadStatus,
        })
        .from(messageAttachments)
        .innerJoin(files, eq(files.id, messageAttachments.fileId))
        .where(eq(messageAttachments.messageId, input.userMessageId))
        .orderBy(messageAttachments.position);
    const containerPath = (attachment: (typeof attachmentRows)[number]) =>
        agentTurnAttachmentPath(input.userMessageId, attachment.fileId, attachment.originalName);
    return {
        containerName: turn.containerName,
        attachments: attachmentRows
            .filter(
                ({ deletedAt, scanStatus, uploadStatus }) =>
                    deletedAt === null && uploadStatus === "complete" && scanStatus !== "infected",
            )
            .map((attachment) => ({
                containerPath: containerPath(attachment),
                fileId: attachment.fileId,
                storageName: attachment.storageName,
            })),
    };
}
