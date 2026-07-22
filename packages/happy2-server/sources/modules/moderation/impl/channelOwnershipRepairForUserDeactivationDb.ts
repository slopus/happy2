import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { type DrizzleTransaction } from "../../drizzle.js";
import { chatMembers, chats, users } from "../../schema.js";
import { channelAdvance } from "../../chat/channelAdvance.js";

export interface DeactivationOwnershipRepair {
    chatId: string;
    deleted: boolean;
    ownerUserId?: string;
    pts: number;
}

export async function channelOwnershipRepairForUserDeactivationDb(
    tx: DrizzleTransaction,
    input: {
        actorUserId: string;
        orphanPolicy: "clear" | "delete";
        sequence: number;
        userId: string;
    },
): Promise<DeactivationOwnershipRepair[]> {
    const owned = await tx
        .selectDistinct({
            currentOwnerUserId: chats.ownerUserId,
            id: chats.id,
            isMain: chats.isMain,
            kind: chats.kind,
        })
        .from(chats)
        .leftJoin(
            chatMembers,
            and(eq(chatMembers.chatId, chats.id), eq(chatMembers.userId, input.userId)),
        )
        .where(
            and(
                inArray(chats.kind, ["private_channel", "public_channel"]),
                isNull(chats.deletedAt),
                or(eq(chats.ownerUserId, input.userId), eq(chatMembers.role, "owner")),
            ),
        )
        .orderBy(chats.id);
    const repaired: DeactivationOwnershipRepair[] = [];
    for (const channel of owned) {
        if (channel.kind === "public_channel") {
            await tx
                .update(chatMembers)
                .set({
                    role: "admin",
                    syncSequence: input.sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(chatMembers.chatId, channel.id), eq(chatMembers.role, "owner")));
            await tx
                .update(chats)
                .set({ ownerUserId: null, updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(chats.id, channel.id));
            const mutation = await channelAdvance(tx, {
                sequence: input.sequence,
                chatId: channel.id,
                kind: "chat.ownerClearedForDeactivation",
                entityId: input.userId,
                actorUserId: input.actorUserId,
                targetUserId: input.userId,
            });
            repaired.push({
                chatId: channel.id,
                deleted: false,
                pts: mutation.pts,
            });
            continue;
        }
        const preservedOwner =
            channel.currentOwnerUserId && channel.currentOwnerUserId !== input.userId
                ? await eligibleMembership(tx, channel.id, channel.currentOwnerUserId)
                : undefined;
        const successor =
            preservedOwner ?? (await successorMembership(tx, channel.id, input.userId));
        const invalidOwners = await tx
            .select({ userId: chatMembers.userId })
            .from(chatMembers)
            .leftJoin(users, eq(users.id, chatMembers.userId))
            .where(
                and(
                    eq(chatMembers.chatId, channel.id),
                    eq(chatMembers.role, "owner"),
                    or(
                        eq(chatMembers.userId, input.userId),
                        isNotNull(chatMembers.leftAt),
                        isNull(users.id),
                        ne(users.kind, "human"),
                        ne(users.active, 1),
                        isNotNull(users.deletedAt),
                    ),
                ),
            );
        for (const { userId } of invalidOwners)
            await tx
                .update(chatMembers)
                .set({
                    role: "member",
                    syncSequence: input.sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(chatMembers.chatId, channel.id),
                        eq(chatMembers.userId, userId),
                        eq(chatMembers.role, "owner"),
                    ),
                );
        if (successor) {
            const supersededOwners = await tx
                .select({ userId: chatMembers.userId })
                .from(chatMembers)
                .innerJoin(users, eq(users.id, chatMembers.userId))
                .where(
                    and(
                        eq(chatMembers.chatId, channel.id),
                        eq(chatMembers.role, "owner"),
                        ne(chatMembers.userId, input.userId),
                        ne(chatMembers.userId, successor.userId),
                        isNull(chatMembers.leftAt),
                        eq(users.kind, "human"),
                        eq(users.active, 1),
                        isNull(users.deletedAt),
                    ),
                );
            if (supersededOwners.length)
                await tx
                    .update(chatMembers)
                    .set({
                        role: "admin",
                        syncSequence: input.sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(
                        and(
                            eq(chatMembers.chatId, channel.id),
                            inArray(
                                chatMembers.userId,
                                supersededOwners.map(({ userId }) => userId),
                            ),
                            eq(chatMembers.role, "owner"),
                        ),
                    );
        }
        if (successor && successor.role !== "owner")
            await tx
                .update(chatMembers)
                .set({
                    role: "owner",
                    syncSequence: input.sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(chatMembers.chatId, channel.id),
                        eq(chatMembers.userId, successor.userId),
                        isNull(chatMembers.leftAt),
                    ),
                );
        const deleted = !successor && channel.isMain !== 1 && input.orphanPolicy === "delete";
        const ownerChanged = channel.currentOwnerUserId !== (successor?.userId ?? null);
        await tx
            .update(chats)
            .set({
                ownerUserId: successor?.userId ?? null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(chats.id, channel.id));
        const mutation = await channelAdvance(tx, {
            sequence: input.sequence,
            chatId: channel.id,
            kind: deleted
                ? "chat.deletedWithoutEligibleOwner"
                : successor
                  ? ownerChanged
                      ? "chat.ownerTransferredForDeactivation"
                      : "chat.ownerRolesRepairedForDeactivation"
                  : "chat.ownerClearedForDeactivation",
            entityId: input.userId,
            actorUserId: input.actorUserId,
            targetUserId: input.userId,
        });
        if (deleted)
            await tx
                .update(chats)
                .set({
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    deletedByUserId: input.actorUserId,
                    deleteReason: "last eligible owner deleted",
                    ownerUserId: null,
                })
                .where(eq(chats.id, channel.id));
        repaired.push({
            chatId: channel.id,
            deleted,
            ownerUserId: successor?.userId,
            pts: mutation.pts,
        });
    }
    return repaired;
}

async function eligibleMembership(
    tx: DrizzleTransaction,
    chatId: string,
    userId: string,
): Promise<{ role: string; userId: string } | undefined> {
    const [membership] = await tx
        .select({ role: chatMembers.role, userId: chatMembers.userId })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .where(
            and(
                eq(chatMembers.chatId, chatId),
                eq(chatMembers.userId, userId),
                isNull(chatMembers.leftAt),
                eq(users.kind, "human"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        )
        .limit(1);
    return membership;
}

async function successorMembership(
    tx: DrizzleTransaction,
    chatId: string,
    excludedUserId: string,
): Promise<{ role: string; userId: string } | undefined> {
    const [membership] = await tx
        .select({ role: chatMembers.role, userId: chatMembers.userId })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .where(
            and(
                eq(chatMembers.chatId, chatId),
                ne(chatMembers.userId, excludedUserId),
                isNull(chatMembers.leftAt),
                eq(users.kind, "human"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        )
        .orderBy(
            sql`case ${chatMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
            chatMembers.joinedAt,
            chatMembers.userId,
        )
        .limit(1);
    return membership;
}
