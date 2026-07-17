import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    SetupError,
    type SetupSyncHint,
    USER_ONBOARDING_STEPS,
    type UserOnboardingStep,
    type UserOnboardingStepState,
} from "../setup/types.js";

import { accounts, syncEvents, userOnboardingSteps, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

import { syncSequenceNext } from "../sync/syncSequenceNext.js";

import { userHint } from "./impl/userHint.js";

/**
 * Applies an allowed completion or skip transition to the actor's userOnboardingSteps row and stores its safe metadata.
 * Inserting syncEvents with the step update makes onboarding resumable from durable user progress on every device.
 */
export async function userOnboardingUpdateStep(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        step: UserOnboardingStep;
        state: Exclude<UserOnboardingStepState, "pending">;
    },
): Promise<SetupSyncHint | undefined> {
    if (!USER_ONBOARDING_STEPS.includes(input.step))
        throw new SetupError("invalid", "Unsupported user onboarding step");
    return withTransaction(executor, async (tx) => {
        const [user] = await tx
            .select({
                id: users.id,
                photoFileId: users.photoFileId,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, input.userId),
                    eq(users.kind, "human"),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        if (!user) throw new SetupError("not_found", "Active user was not found");
        if (input.step === "avatar" && input.state === "complete" && !user.photoFileId)
            throw new SetupError(
                "conflict",
                "Avatar onboarding cannot complete before an avatar is stored",
            );
        const [current] = await tx
            .select({
                state: userOnboardingSteps.state,
            })
            .from(userOnboardingSteps)
            .where(
                and(
                    eq(userOnboardingSteps.userId, input.userId),
                    eq(userOnboardingSteps.step, input.step),
                ),
            );
        const currentState = (current?.state ?? "pending") as UserOnboardingStepState;
        if (currentState === input.state) return undefined;
        if (
            currentState === "complete" ||
            (currentState === "skipped" && input.state !== "complete")
        )
            throw new SetupError(
                "conflict",
                `Cannot transition ${input.step} from ${currentState} to ${input.state}`,
            );
        const now = new Date().toISOString();
        await tx
            .insert(userOnboardingSteps)
            .values({
                userId: input.userId,
                step: input.step,
                state: input.state,
                completedAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: [userOnboardingSteps.userId, userOnboardingSteps.step],
                set: {
                    state: input.state,
                    completedAt: now,
                    updatedAt: now,
                },
            });
        const sequence = await syncSequenceNext(tx);
        await tx.insert(syncEvents).values({
            sequence,
            kind: `userOnboarding.${input.step}.${input.state}`,
            entityId: input.step,
            actorUserId: input.userId,
            targetUserId: input.userId,
        });
        return userHint(sequence);
    });
}
