import { type CreateProfile, type User } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { RegistrationClosedError } from "../auth/errors.js";

import {
    accounts,
    serverSetupState,
    serverSetupSteps,
    syncEvents,
    userOnboardingSteps,
    users,
} from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { asUser } from "./impl/asUser.js";
import { createId } from "@paralleldrive/cuid2";

import { syncSequenceNext } from "../sync/syncSequenceNext.js";

import { userAnnounceJoinedServer } from "./userAnnounceJoinedServer.js";
import { userJoinAutoChannels } from "./userJoinAutoChannels.js";
import { agentDefaultConversationEnsure } from "../agent/agentDefaultConversationEnsure.js";

/**
 * Activates an accounts credential by creating its users profile, initializing userOnboardingSteps, and claiming bootstrap administrator state when applicable.
 * The transaction also joins default chats and emits creation history so product access begins only after the complete identity substrate exists.
 */
export async function userCreateProfile(
    executor: DrizzleExecutor,
    accountId: string,
    profile: CreateProfile /** Trusted test/provisioning bypass; request handlers must use the default. */,
    options: {
        provisioned?: boolean;
    } = {},
): Promise<User> {
    return withTransaction(executor, async (tx) => {
        const [account] = await tx
            .select({
                id: accounts.id,
            })
            .from(accounts)
            .where(
                and(
                    eq(accounts.id, accountId),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        if (!account) throw new Error("Could not create user profile");
        const [existingProvisionedUser] = options.provisioned
            ? await tx
                  .select({
                      id: users.id,
                  })
                  .from(users)
                  .innerJoin(accounts, eq(accounts.id, users.accountId))
                  .where(
                      and(
                          eq(users.kind, "human"),
                          isNull(users.deletedAt),
                          eq(accounts.active, 1),
                          isNull(accounts.bannedAt),
                          isNull(accounts.deletedAt),
                      ),
                  )
                  .limit(1)
            : [];
        const [setup] = await tx
            .select({
                bootstrapAccountId: serverSetupState.bootstrapAccountId,
                bootstrapAdminUserId: serverSetupState.bootstrapAdminUserId,
            })
            .from(serverSetupState)
            .where(eq(serverSetupState.id, 1));
        const [completion] = await tx
            .select({
                state: serverSetupSteps.state,
            })
            .from(serverSetupSteps)
            .where(eq(serverSetupSteps.step, "server_setup_complete"));
        if (!setup || !completion) throw new Error("Server setup state is not initialized");
        const setupComplete = completion.state === "complete";
        if (
            !options.provisioned &&
            !setupComplete &&
            setup.bootstrapAccountId &&
            setup.bootstrapAccountId !== accountId
        )
            throw new RegistrationClosedError();
        if (!options.provisioned && !setupComplete && !setup.bootstrapAccountId) {
            const [reserved] = await tx
                .update(serverSetupState)
                .set({
                    bootstrapAccountId: accountId,
                    updatedAt: new Date().toISOString(),
                })
                .where(and(eq(serverSetupState.id, 1), isNull(serverSetupState.bootstrapAccountId)))
                .returning({
                    id: serverSetupState.id,
                });
            if (!reserved) throw new RegistrationClosedError();
        }
        const id = createId();
        const [user] = await tx
            .insert(users)
            .values({
                id,
                accountId,
                firstName: profile.firstName,
                lastName: profile.lastName ?? null,
                username: profile.username,
                email: profile.email ?? null,
                phone: profile.phone ?? null,
                role: options.provisioned && !existingProvisionedUser ? "admin" : "member",
            })
            .returning();
        if (!user) throw new Error("Could not create user profile");
        let bootstrapClaimed = false;
        if (!options.provisioned && !setupComplete && !setup.bootstrapAdminUserId) {
            const [claim] = await tx
                .update(serverSetupState)
                .set({
                    bootstrapAdminUserId: id,
                    updatedAt: new Date().toISOString(),
                })
                .where(
                    and(
                        eq(serverSetupState.id, 1),
                        eq(serverSetupState.bootstrapAccountId, accountId),
                        isNull(serverSetupState.bootstrapAdminUserId),
                    ),
                )
                .returning({
                    id: serverSetupState.id,
                });
            bootstrapClaimed = Boolean(claim);
            if (!bootstrapClaimed) throw new RegistrationClosedError();
            await tx
                .update(users)
                .set({
                    role: "admin",
                })
                .where(eq(users.id, id));
            const now = new Date().toISOString();
            await tx
                .update(serverSetupSteps)
                .set({
                    state: "complete",
                    metadataJson: JSON.stringify({
                        source: "profile_claim",
                    }),
                    startedAt: now,
                    completedAt: now,
                    updatedAt: now,
                })
                .where(eq(serverSetupSteps.step, "bootstrap_administrator"));
        }
        const [activation] = await tx
            .update(accounts)
            .set({
                active: 1,
            })
            .where(
                and(
                    eq(accounts.id, accountId),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            )
            .returning({
                id: accounts.id,
            });
        if (!activation) throw new Error("Account no longer exists");
        await tx.insert(userOnboardingSteps).values([
            {
                userId: id,
                step: "avatar",
                state: "pending",
            },
            {
                userId: id,
                step: "desktop_notifications",
                state: "pending",
            },
        ]);
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(users)
            .set({
                syncSequence: sequence,
            })
            .where(eq(users.id, id));
        await tx.insert(syncEvents).values([
            {
                sequence,
                kind: "user.created",
                entityId: id,
                actorUserId: id,
            },
            ...(bootstrapClaimed
                ? [
                      {
                          sequence,
                          kind: "setup.bootstrap_administrator.complete",
                          entityId: "bootstrap_administrator",
                          actorUserId: id,
                      },
                  ]
                : []),
        ]);
        const [defaultAgent] = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.agentRole, "default"), isNull(users.deletedAt)))
            .limit(1);
        if (defaultAgent) {
            const defaultAgentUserId = await userJoinAutoChannels(
                tx,
                {
                    id,
                    username: profile.username,
                },
                sequence,
            );
            await agentDefaultConversationEnsure(tx, { userId: id, sequence });
            await userAnnounceJoinedServer(
                tx,
                {
                    id,
                    username: profile.username,
                },
                defaultAgentUserId,
                sequence,
            );
        }
        return asUser({
            ...user,
            role:
                bootstrapClaimed || (options.provisioned && !existingProvisionedUser)
                    ? "admin"
                    : "member",
            syncSequence: sequence,
        });
    });
}
