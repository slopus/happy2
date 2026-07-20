import { type ChatRole } from "../types.js";
import { type DrizzleTransaction } from "../../drizzle.js";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { chatMembers, chats, documentChannelAttachments } from "../../schema.js";
import { createId } from "@paralleldrive/cuid2";
import { chatDescendantIds } from "./chatDescendantIds.js";
import { syncEventInsert } from "../../sync/syncEventInsert.js";

/**
 * Mirrors one parent membership transition through every existing descendant chat and records a
 * targeted documents-area event when any affected chat has a document attachment.
 */
export async function chatDescendantMembershipSync(
    tx: DrizzleTransaction,
    input: {
        ancestorChatId: string;
        userId: string;
        actorUserId: string;
        sequence: number;
        kind: "joined" | "removed" | "left";
        role?: ChatRole;
        replacementOwnerUserId?: string;
    },
): Promise<boolean> {
    const descendantIds = await chatDescendantIds(tx, input.ancestorChatId);
    const [attachment] = await tx
        .select({ chatId: documentChannelAttachments.chatId })
        .from(documentChannelAttachments)
        .where(inArray(documentChannelAttachments.chatId, [input.ancestorChatId, ...descendantIds]))
        .limit(1);
    if (attachment)
        await syncEventInsert(tx, {
            sequence: input.sequence,
            kind: "document.membershipChanged",
            entityId: input.userId,
            actorUserId: input.actorUserId,
            targetUserId: input.userId,
        });
    if (descendantIds.length === 0) return attachment !== undefined;
    if (input.kind === "joined") {
        for (const chatId of descendantIds)
            await tx
                .insert(chatMembers)
                .values({
                    chatId,
                    userId: input.userId,
                    role: input.role ?? "member",
                    membershipEpoch: createId(),
                    syncSequence: input.sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
                        role: input.role ?? "member",
                        membershipEpoch: createId(),
                        syncSequence: input.sequence,
                        joinedAt: sql`CURRENT_TIMESTAMP`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                        leftAt: null,
                        removedByUserId: null,
                    },
                });
    } else {
        await tx
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
                    ...(input.kind === "left" ? [isNull(chatMembers.leftAt)] : []),
                ),
            );
        if (input.replacementOwnerUserId) {
            await tx
                .update(chats)
                .set({ ownerUserId: input.replacementOwnerUserId })
                .where(inArray(chats.id, descendantIds));
            await tx
                .update(chatMembers)
                .set({
                    role: "owner",
                    syncSequence: input.sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        inArray(chatMembers.chatId, descendantIds),
                        eq(chatMembers.userId, input.replacementOwnerUserId),
                        isNull(chatMembers.leftAt),
                    ),
                );
        }
    }
    for (const chatId of descendantIds)
        await syncEventInsert(tx, {
            sequence: input.sequence,
            kind: input.kind === "joined" ? "member.joined" : `member.${input.kind}`,
            chatId,
            entityId: input.userId,
            actorUserId: input.actorUserId,
            targetUserId: input.userId,
        });
    return attachment !== undefined;
}
