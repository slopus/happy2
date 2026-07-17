import {
    type CombinedOnboardingStatus,
    SERVER_SETUP_STEPS,
    USER_ONBOARDING_STEPS,
} from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { accounts, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { emptyUserSteps } from "./impl/emptyUserSteps.js";

import { publicStatus } from "./impl/publicStatus.js";
import { redactServerSteps } from "./impl/redactServerSteps.js";

import { readServerSnapshot } from "./impl/readServerSnapshot.js";
import { readUserSteps } from "./impl/readUserSteps.js";
/**
 * Derives the authenticated account's next onboarding route from server and user step state.
 * It also centralizes setup-management eligibility and redaction so incomplete accounts cannot infer protected server details.
 */
export async function setupGetCombinedStatus(
    executor: DrizzleExecutor,
    accountId: string,
): Promise<CombinedOnboardingStatus> {
    const snapshot = await readServerSnapshot(executor);
    const [user] = await executor
        .select({
            id: users.id,
            role: users.role,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.accountId, accountId),
                eq(users.kind, "human"),
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        )
        .limit(1);
    const canManage = user
        ? user.role === "admin"
        : !snapshot.bootstrapAdminUserId && snapshot.bootstrapAccountId === accountId;
    const userSteps = user ? await readUserSteps(executor, user.id) : emptyUserSteps();
    const serverComplete = snapshot.steps.server_setup_complete.state === "complete";
    const userComplete =
        Boolean(user) &&
        USER_ONBOARDING_STEPS.every(
            (step) => userSteps[step].state === "complete" || userSteps[step].state === "skipped",
        );
    const route = !user
        ? ({
              scope: "profile",
              step: "profile",
          } as const)
        : !serverComplete
          ? canManage
              ? ({
                    scope: "server",
                    step: SERVER_SETUP_STEPS.find(
                        (step) => snapshot.steps[step].state !== "complete",
                    )!,
                } as const)
              : ({
                    scope: "waiting",
                    step: "server_setup",
                } as const)
          : !userComplete
            ? ({
                  scope: "user",
                  step: USER_ONBOARDING_STEPS.find(
                      (step) =>
                          userSteps[step].state !== "complete" &&
                          userSteps[step].state !== "skipped",
                  )!,
              } as const)
            : ({
                  scope: "complete",
              } as const);
    return {
        server: {
            schemaVersion: snapshot.schemaVersion,
            complete: serverComplete,
            canManage,
            registration: publicStatus(snapshot).registration,
            steps: redactServerSteps(snapshot.steps, canManage),
        },
        user: {
            profile: user ? "complete" : "pending",
            complete: userComplete,
            steps: userSteps,
        },
        route,
        complete: serverComplete && userComplete,
    };
}
