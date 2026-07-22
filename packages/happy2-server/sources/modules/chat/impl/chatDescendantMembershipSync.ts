import { type DrizzleTransaction } from "../../drizzle.js";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { chatMembers, documentChannelAttachments } from "../../schema.js";
import { chatDescendantIds } from "./chatDescendantIds.js";
import { syncEventInsert } from "../../sync/syncEventInsert.js";

/**
 * Revokes descendant memberships when parent access ends and records a targeted documents-area event when an affected joined chat has an attachment.
 * Parent joins deliberately do not enroll the user into child channels; each child membership is explicit.
 */
export async function chatDescendantMembershipSync(
    tx: DrizzleTransaction,
    input: {
        ancestorChatId: string;
        userId: string;
        actorUserId: string;
        sequence: number;
        kind: "joined" | "removed" | "left";
    },
): Promise<boolean> {
    const descendantIds = await chatDescendantIds(tx, input.ancestorChatId);
    const attachmentChatIds =
        input.kind === "joined" ? [input.ancestorChatId] : [input.ancestorChatId, ...descendantIds];
    const [attachment] = await tx
        .select({ chatId: documentChannelAttachments.chatId })
        .from(documentChannelAttachments)
        .where(inArray(documentChannelAttachments.chatId, attachmentChatIds))
        .limit(1);
    if (attachment)
        await syncEventInsert(tx, {
            sequence: input.sequence,
            kind: "document.membershipChanged",
            entityId: input.userId,
            actorUserId: input.actorUserId,
            targetUserId: input.userId,
        });
    if (descendantIds.length === 0 || input.kind === "joined") return attachment !== undefined;
    const revokedMemberships = await tx
        .update(chatMembers)
        .set({
            leftAt: sql`CURRENT_TIMESTAMP`,
            removedByUserId: input.kind === "removed" ? input.actorUserId : null,
            syncSequence: input.sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
            and(
                inArray(chatMembers.chatId, descendantIds),
                eq(chatMembers.userId, input.userId),
                isNull(chatMembers.leftAt),
            ),
        )
        .returning({ chatId: chatMembers.chatId });
    for (const { chatId } of revokedMemberships)
        await syncEventInsert(tx, {
            sequence: input.sequence,
            kind: `member.${input.kind}`,
            chatId,
            entityId: input.userId,
            actorUserId: input.actorUserId,
            targetUserId: input.userId,
        });
    return attachment !== undefined;
}
