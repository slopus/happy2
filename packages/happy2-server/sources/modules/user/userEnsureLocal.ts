import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    accounts,
    roles,
    serverSetupState,
    serverSetupSteps,
    syncEvents,
    userOnboardingSteps,
    userRoles,
    users,
} from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { asUser } from "./impl/asUser.js";
import type { User } from "./types.js";

/**
 * Ensures an account-free loopback database has exactly one durably claimed local human users identity.
 * The transaction refuses account-backed or unclaimed identity state, binds the exact local owner into setup, assigns built-in authority, skips account-oriented onboarding, and emits one coherent creation sequence.
 */
export async function userEnsureLocal(executor: DrizzleExecutor): Promise<User> {
    return withTransaction(executor, async (tx) => {
        const [{ count: accountCount }] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(accounts);
        if (Number(accountCount) !== 0)
            throw new Error("Account-free local access cannot use an account-backed database.");

        const [setup] = await tx
            .select({
                bootstrapAccountId: serverSetupState.bootstrapAccountId,
                bootstrapAdminUserId: serverSetupState.bootstrapAdminUserId,
            })
            .from(serverSetupState)
            .where(eq(serverSetupState.id, 1));
        if (!setup) throw new Error("Server setup state is not initialized.");
        if (setup.bootstrapAccountId)
            throw new Error("Account-free local access cannot claim an initialized database.");
        if (setup.bootstrapAdminUserId) {
            const [existing] = await tx
                .select({ user: users })
                .from(users)
                .where(
                    and(
                        eq(users.id, setup.bootstrapAdminUserId),
                        eq(users.kind, "human"),
                        eq(users.role, "admin"),
                        eq(users.active, 1),
                        isNull(users.deletedAt),
                    ),
                )
                .limit(1);
            if (!existing) throw new Error("Account-free local owner state is invalid.");
            return asUser(existing.user);
        }

        const [unclaimed] = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.kind, "human"), isNull(users.deletedAt)))
            .limit(1);
        if (unclaimed)
            throw new Error("Account-free local access found an unclaimed human identity.");

        const id = createId();
        const now = new Date().toISOString();
        const username = `happy2_local_${id.slice(-8)}`;
        const [user] = await tx
            .insert(users)
            .values({
                id,
                accountId: null,
                firstName: "Local User",
                username,
                role: "admin",
            })
            .returning();
        if (!user) throw new Error("Could not create the local Happy user.");

        const builtinRoles = await tx
            .select({ id: roles.id })
            .from(roles)
            .where(isNotNull(roles.builtinKind));
        if (builtinRoles.length)
            await tx.insert(userRoles).values(
                builtinRoles.map(({ id: roleId }) => ({
                    userId: id,
                    roleId,
                    assignedByUserId: id,
                })),
            );
        await tx.insert(userOnboardingSteps).values([
            {
                userId: id,
                step: "avatar",
                state: "skipped",
                completedAt: now,
            },
            {
                userId: id,
                step: "desktop_notifications",
                state: "skipped",
                completedAt: now,
            },
        ]);
        await tx
            .update(serverSetupSteps)
            .set({
                state: "complete",
                metadataJson: JSON.stringify({ source: "account_free_local" }),
                lastError: null,
                startedAt: now,
                completedAt: now,
                updatedAt: now,
            })
            .where(eq(serverSetupSteps.step, "bootstrap_administrator"));
        await tx
            .update(serverSetupState)
            .set({ bootstrapAdminUserId: id, registrationEnabled: 0, updatedAt: now })
            .where(eq(serverSetupState.id, 1));
        const sequence = await syncSequenceNext(tx);
        await tx.update(users).set({ syncSequence: sequence }).where(eq(users.id, id));
        await tx.insert(syncEvents).values([
            {
                sequence,
                kind: "user.created",
                entityId: id,
                actorUserId: id,
            },
            {
                sequence,
                kind: "setup.bootstrap_administrator.complete",
                entityId: "bootstrap_administrator",
                actorUserId: id,
            },
        ]);
        return asUser({ ...user, syncSequence: sequence });
    });
}
