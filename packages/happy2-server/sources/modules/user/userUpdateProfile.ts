import { type CreateProfile, type User } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { syncEvents, users } from "../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";
import { asUser } from "./impl/asUser.js";

import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Updates the actor-controlled users name, optional last name, username, bio, and related profile fields after normalization and uniqueness checks.
 * The profile write and syncEvents hint share a sequence so every chat resolves the identity from one coherent durable version.
 */
export async function userUpdateProfile(
    executor: DrizzleExecutor,
    userId: string,
    profile: CreateProfile,
): Promise<User | undefined> {
    return withTransaction(executor, async (tx) => {
        const [active] = await tx
            .select({
                id: users.id,
            })
            .from(users)
            .where(
                and(
                    eq(users.id, userId),
                    eq(users.kind, "human"),
                    isNull(users.deletedAt),
                    eq(users.active, 1),
                ),
            );
        if (!active) return undefined;
        const sequence = await syncSequenceNext(tx);
        const [user] = await tx
            .update(users)
            .set({
                firstName: profile.firstName,
                lastName: profile.lastName ?? null,
                username: profile.username,
                email: profile.email ?? null,
                phone: profile.phone ?? null,
                syncSequence: sequence,
            })
            .where(eq(users.id, userId))
            .returning();
        if (!user) return undefined;
        await tx.insert(syncEvents).values({
            sequence,
            kind: "user.updated",
            entityId: userId,
            actorUserId: userId,
        });
        return asUser(user);
    });
}
