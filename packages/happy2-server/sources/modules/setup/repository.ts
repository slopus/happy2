import type { Client } from "@libsql/client";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDatabase, retrySqliteBusy, type DrizzleExecutor } from "../drizzle.js";
import {
    accounts,
    serverSetupState,
    serverSetupSteps,
    serverSyncState,
    syncEvents,
    userOnboardingSteps,
    users,
} from "../schema.js";
import {
    OPERATIONAL_SERVER_SETUP_STEPS,
    SERVER_SETUP_SCHEMA_VERSION,
    SERVER_SETUP_STEPS,
    USER_ONBOARDING_STEPS,
    type CombinedOnboardingStatus,
    type OperationalServerSetupStep,
    type PublicServerSetupStatus,
    type RegistrationAvailability,
    type SafeSetupMetadata,
    type SafeSetupMetadataValue,
    SetupError,
    type SetupStepStatus,
    type SetupSyncHint,
    type ServerSetupStep,
    type ServerSetupStepState,
    type UserOnboardingStep,
    type UserOnboardingStepState,
} from "./types.js";

const STEP_PREREQUISITES: Readonly<Record<ServerSetupStep, readonly ServerSetupStep[]>> = {
    bootstrap_administrator: [],
    sandbox_provider_selected: ["bootstrap_administrator"],
    sandbox_provider_validated: ["sandbox_provider_selected"],
    base_image_selected: ["sandbox_provider_validated"],
    base_image_build_requested: ["base_image_selected"],
    base_image_ready: ["base_image_build_requested"],
    registration_policy_selected: ["base_image_ready"],
    server_setup_complete: ["registration_policy_selected"],
};

type ServerStepRecord = Record<ServerSetupStep, SetupStepStatus<ServerSetupStepState>>;
type UserStepRecord = Record<UserOnboardingStep, SetupStepStatus<UserOnboardingStepState>>;

export class SetupRepository {
    private readonly db;

    constructor(client: Client) {
        this.db = createDatabase(client);
    }

    async getPublicStatus(): Promise<PublicServerSetupStatus> {
        const snapshot = await this.readServerSnapshot();
        return publicStatus(snapshot);
    }

    async registrationAvailability(): Promise<RegistrationAvailability> {
        return (await this.getPublicStatus()).registration;
    }

    async currentSyncHint(areas: readonly string[]): Promise<{
        sequence: string;
        chats: [];
        areas: string[];
    }> {
        const [state] = await this.db
            .select({ sequence: serverSyncState.sequence })
            .from(serverSyncState)
            .where(eq(serverSyncState.id, 1));
        if (!state) throw new Error("Sync state is not initialized");
        return { sequence: String(state.sequence), chats: [], areas: [...areas] };
    }

    async getCombinedStatus(accountId: string): Promise<CombinedOnboardingStatus> {
        const snapshot = await this.readServerSnapshot();
        const [user] = await this.db
            .select({ id: users.id, role: users.role })
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
        const userSteps = user ? await this.readUserSteps(user.id) : emptyUserSteps();
        const serverComplete = snapshot.steps.server_setup_complete.state === "complete";
        const userComplete =
            Boolean(user) &&
            USER_ONBOARDING_STEPS.every(
                (step) =>
                    userSteps[step].state === "complete" || userSteps[step].state === "skipped",
            );
        const route = !user
            ? ({ scope: "profile", step: "profile" } as const)
            : !serverComplete
              ? canManage
                  ? ({
                        scope: "server",
                        step: SERVER_SETUP_STEPS.find(
                            (step) => snapshot.steps[step].state !== "complete",
                        )!,
                    } as const)
                  : ({ scope: "waiting", step: "server_setup" } as const)
              : !userComplete
                ? ({
                      scope: "user",
                      step: USER_ONBOARDING_STEPS.find(
                          (step) =>
                              userSteps[step].state !== "complete" &&
                              userSteps[step].state !== "skipped",
                      )!,
                  } as const)
                : ({ scope: "complete" } as const);
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

    async recordOperationalStep(input: {
        step: OperationalServerSetupStep;
        state: ServerSetupStepState;
        actorUserId?: string;
        metadata?: SafeSetupMetadata;
        lastError?: string;
    }): Promise<SetupSyncHint | undefined> {
        if (!OPERATIONAL_SERVER_SETUP_STEPS.includes(input.step))
            throw new SetupError("invalid", "Unsupported operational setup step");
        const metadataJson = encodedMetadata(input.metadata);
        const lastError = validatedLastError(input.state, input.lastError);
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                await requirePrerequisitesDb(tx, input.step);
                const current = await serverStepDb(tx, input.step);
                const sameState = current.state === input.state;
                if (
                    sameState &&
                    current.metadataJson === metadataJson &&
                    current.lastError === (lastError ?? null)
                )
                    return undefined;
                if (sameState && input.state === "complete")
                    throw new SetupError(
                        "conflict",
                        `Completed setup step ${input.step} is immutable`,
                    );
                if (!sameState && !allowedServerTransition(current.state, input.state))
                    throw new SetupError(
                        "conflict",
                        `Cannot transition ${input.step} from ${current.state} to ${input.state}`,
                    );
                const now = new Date().toISOString();
                await tx
                    .update(serverSetupSteps)
                    .set({
                        state: input.state,
                        metadataJson,
                        lastError: lastError ?? null,
                        startedAt:
                            input.state === "in_progress" && !current.startedAt
                                ? now
                                : current.startedAt,
                        completedAt: input.state === "complete" ? now : null,
                        updatedAt: now,
                    })
                    .where(eq(serverSetupSteps.step, input.step));
                const sequence = await nextSequence(tx);
                await tx.insert(syncEvents).values({
                    sequence,
                    kind: `setup.${input.step}.${input.state}`,
                    entityId: input.step,
                    actorUserId: input.actorUserId ?? null,
                });
                return setupHint(sequence);
            }),
        );
    }

    async chooseRegistrationPolicy(
        actorUserId: string,
        registrationEnabled: boolean,
    ): Promise<SetupSyncHint | undefined> {
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                await requireActiveAdministratorDb(tx, actorUserId);
                await requirePrerequisitesDb(tx, "registration_policy_selected");
                const [setup] = await tx
                    .select({ registrationEnabled: serverSetupState.registrationEnabled })
                    .from(serverSetupState)
                    .where(eq(serverSetupState.id, 1));
                const registration = await serverStepDb(tx, "registration_policy_selected");
                const completed = await serverStepDb(tx, "server_setup_complete");
                if (
                    registration.state === "complete" &&
                    completed.state === "complete" &&
                    setup?.registrationEnabled === (registrationEnabled ? 1 : 0)
                )
                    return undefined;
                if (registration.state === "complete" || completed.state === "complete")
                    throw new SetupError(
                        "conflict",
                        "Registration policy was already selected during onboarding",
                    );
                return completeRegistrationPolicyDb(tx, actorUserId, registrationEnabled, {
                    registrationEnabled,
                });
            }),
        );
    }

    async updateUserStep(input: {
        userId: string;
        step: UserOnboardingStep;
        state: Exclude<UserOnboardingStepState, "pending">;
    }): Promise<SetupSyncHint | undefined> {
        if (!USER_ONBOARDING_STEPS.includes(input.step))
            throw new SetupError("invalid", "Unsupported user onboarding step");
        return retrySqliteBusy(() =>
            this.db.transaction(async (tx) => {
                const [user] = await tx
                    .select({ id: users.id, photoFileId: users.photoFileId })
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
                    .select({ state: userOnboardingSteps.state })
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
                        set: { state: input.state, completedAt: now, updatedAt: now },
                    });
                const sequence = await nextSequence(tx);
                await tx.insert(syncEvents).values({
                    sequence,
                    kind: `userOnboarding.${input.step}.${input.state}`,
                    entityId: input.step,
                    actorUserId: input.userId,
                    targetUserId: input.userId,
                });
                return userHint(sequence);
            }),
        );
    }

    private async readServerSnapshot(): Promise<{
        schemaVersion: number;
        bootstrapAccountId: string | null;
        bootstrapAdminUserId: string | null;
        registrationEnabled: number | null;
        steps: ServerStepRecord;
    }> {
        const [setup] = await this.db
            .select({
                schemaVersion: serverSetupState.schemaVersion,
                bootstrapAccountId: serverSetupState.bootstrapAccountId,
                bootstrapAdminUserId: serverSetupState.bootstrapAdminUserId,
                registrationEnabled: serverSetupState.registrationEnabled,
            })
            .from(serverSetupState)
            .where(eq(serverSetupState.id, 1));
        if (!setup) throw new Error("Server setup state is not initialized");
        if (setup.schemaVersion !== SERVER_SETUP_SCHEMA_VERSION)
            throw new Error(
                `Unsupported server setup schema version ${setup.schemaVersion}; expected ${SERVER_SETUP_SCHEMA_VERSION}`,
            );
        const rows = await this.db
            .select()
            .from(serverSetupSteps)
            .where(inArray(serverSetupSteps.step, [...SERVER_SETUP_STEPS]));
        const byStep = new Map(rows.map((row) => [row.step, row]));
        const steps = {} as ServerStepRecord;
        for (const step of SERVER_SETUP_STEPS) {
            const row = byStep.get(step);
            if (!row) throw new Error(`Server setup step ${step} is not initialized`);
            steps[step] = stepStatus(row) as SetupStepStatus<ServerSetupStepState>;
        }
        return { ...setup, steps };
    }

    private async readUserSteps(userId: string): Promise<UserStepRecord> {
        const rows = await this.db
            .select()
            .from(userOnboardingSteps)
            .where(eq(userOnboardingSteps.userId, userId));
        const byStep = new Map(rows.map((row) => [row.step, row]));
        const steps = emptyUserSteps();
        for (const step of USER_ONBOARDING_STEPS) {
            const row = byStep.get(step);
            if (row) steps[step] = stepStatus(row) as SetupStepStatus<UserOnboardingStepState>;
        }
        return steps;
    }
}

async function completeRegistrationPolicyDb(
    tx: DrizzleExecutor,
    actorUserId: string,
    registrationEnabled: boolean,
    metadata: SafeSetupMetadata,
): Promise<SetupSyncHint> {
    await requirePrerequisitesDb(tx, "registration_policy_selected");
    const now = new Date().toISOString();
    await tx
        .update(serverSetupState)
        .set({ registrationEnabled: registrationEnabled ? 1 : 0, updatedAt: now })
        .where(eq(serverSetupState.id, 1));
    await tx
        .update(serverSetupSteps)
        .set({
            state: "complete",
            metadataJson: encodedMetadata(metadata),
            lastError: null,
            startedAt: sql`coalesce(${serverSetupSteps.startedAt}, ${now})`,
            completedAt: now,
            updatedAt: now,
        })
        .where(eq(serverSetupSteps.step, "registration_policy_selected"));
    await tx
        .update(serverSetupSteps)
        .set({
            state: "complete",
            metadataJson: encodedMetadata({ source: "registration_policy" }),
            lastError: null,
            startedAt: sql`coalesce(${serverSetupSteps.startedAt}, ${now})`,
            completedAt: now,
            updatedAt: now,
        })
        .where(eq(serverSetupSteps.step, "server_setup_complete"));
    const sequence = await nextSequence(tx);
    await tx.insert(syncEvents).values([
        {
            sequence,
            kind: "setup.registration_policy_selected.complete",
            entityId: "registration_policy_selected",
            actorUserId,
        },
        {
            sequence,
            kind: "setup.server_setup_complete.complete",
            entityId: "server_setup_complete",
            actorUserId,
        },
    ]);
    return setupHint(sequence);
}

async function requirePrerequisitesDb(
    executor: DrizzleExecutor,
    step: ServerSetupStep,
): Promise<void> {
    const prerequisites = STEP_PREREQUISITES[step];
    if (prerequisites.length === 0) return;
    const rows = await executor
        .select({ step: serverSetupSteps.step, state: serverSetupSteps.state })
        .from(serverSetupSteps)
        .where(inArray(serverSetupSteps.step, [...prerequisites]));
    const incomplete = prerequisites.find(
        (prerequisite) => rows.find((row) => row.step === prerequisite)?.state !== "complete",
    );
    if (incomplete)
        throw new SetupError(
            "conflict",
            `Setup step ${step} requires ${incomplete} to be complete`,
        );
}

async function requireActiveAdministratorDb(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    const [admin] = await executor
        .select({ id: users.id })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.id, userId),
                eq(users.kind, "human"),
                eq(users.role, "admin"),
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
    if (!admin) throw new SetupError("forbidden", "Server administrator permission is required");
}

async function serverStepDb(
    executor: DrizzleExecutor,
    step: ServerSetupStep,
): Promise<{
    state: ServerSetupStepState;
    startedAt: string | null;
    metadataJson: string | null;
    lastError: string | null;
}> {
    const [row] = await executor
        .select({
            state: serverSetupSteps.state,
            startedAt: serverSetupSteps.startedAt,
            metadataJson: serverSetupSteps.metadataJson,
            lastError: serverSetupSteps.lastError,
        })
        .from(serverSetupSteps)
        .where(eq(serverSetupSteps.step, step));
    if (!row) throw new Error(`Server setup step ${step} is not initialized`);
    return {
        state: row.state as ServerSetupStepState,
        startedAt: row.startedAt,
        metadataJson: row.metadataJson,
        lastError: row.lastError,
    };
}

function publicStatus(snapshot: {
    schemaVersion: number;
    bootstrapAccountId: string | null;
    registrationEnabled: number | null;
    steps: ServerStepRecord;
}): PublicServerSetupStatus {
    const bootstrapComplete = snapshot.steps.bootstrap_administrator.state === "complete";
    const complete = snapshot.steps.server_setup_complete.state === "complete";
    const registration: RegistrationAvailability = complete
        ? snapshot.registrationEnabled === 1
            ? "open"
            : "closed"
        : snapshot.bootstrapAccountId
          ? "closed"
          : "bootstrap";
    return {
        schemaVersion: snapshot.schemaVersion,
        phase: complete
            ? "complete"
            : bootstrapComplete
              ? "configuration_required"
              : "bootstrap_required",
        registration,
    };
}

function redactServerSteps(steps: ServerStepRecord, includeDetails: boolean): ServerStepRecord {
    const result = {} as ServerStepRecord;
    for (const step of SERVER_SETUP_STEPS) {
        const status = steps[step];
        result[step] = includeDetails
            ? status
            : {
                  state: status.state,
                  updatedAt: status.updatedAt,
                  ...(status.completedAt ? { completedAt: status.completedAt } : {}),
              };
    }
    return result;
}

function emptyUserSteps(): UserStepRecord {
    const updatedAt = new Date(0).toISOString();
    return {
        avatar: { state: "pending", updatedAt },
        desktop_notifications: { state: "pending", updatedAt },
    };
}

function stepStatus(row: {
    state: string;
    metadataJson: string | null;
    lastError?: string | null;
    startedAt?: string | null;
    completedAt: string | null;
    updatedAt: string;
}): SetupStepStatus<string> {
    const metadata = safeMetadata(row.metadataJson);
    return {
        state: row.state,
        ...(metadata ? { metadata } : {}),
        ...(row.lastError ? { lastError: row.lastError } : {}),
        ...(row.startedAt ? { startedAt: row.startedAt } : {}),
        ...(row.completedAt ? { completedAt: row.completedAt } : {}),
        updatedAt: row.updatedAt,
    };
}

function safeMetadata(encoded: string | null | undefined): SafeSetupMetadata | undefined {
    if (!encoded) return undefined;
    try {
        const parsed = JSON.parse(encoded) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
        const result: Record<string, SafeSetupMetadataValue> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key)) continue;
            if (
                value === null ||
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
            )
                result[key] = value;
        }
        return Object.keys(result).length > 0 ? result : undefined;
    } catch {
        return undefined;
    }
}

function encodedMetadata(metadata: SafeSetupMetadata | undefined): string | null {
    if (!metadata) return null;
    const entries = Object.entries(metadata);
    if (entries.length > 32) throw new SetupError("invalid", "Setup metadata has too many fields");
    for (const [key, value] of entries) {
        if (!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key))
            throw new SetupError("invalid", "Setup metadata contains an invalid field name");
        if (
            value !== null &&
            typeof value !== "string" &&
            typeof value !== "number" &&
            typeof value !== "boolean"
        )
            throw new SetupError("invalid", "Setup metadata contains an invalid value");
    }
    const encoded = JSON.stringify(metadata);
    if (Buffer.byteLength(encoded) > 4_096)
        throw new SetupError("invalid", "Setup metadata exceeds 4096 bytes");
    return encoded;
}

function validatedLastError(
    state: ServerSetupStepState,
    value: string | undefined,
): string | undefined {
    const normalized = value?.trim();
    if (state === "failed" && !normalized)
        throw new SetupError("invalid", "A failed setup step requires lastError");
    if (state !== "failed" && normalized)
        throw new SetupError("invalid", "Only a failed setup step may include lastError");
    if (normalized && normalized.length > 2_000)
        throw new SetupError("invalid", "Setup lastError exceeds 2000 characters");
    return normalized;
}

function allowedServerTransition(from: ServerSetupStepState, to: ServerSetupStepState): boolean {
    if (from === "pending") return to === "in_progress" || to === "complete" || to === "failed";
    if (from === "in_progress") return to === "complete" || to === "failed";
    if (from === "failed") return to === "in_progress";
    return false;
}

async function nextSequence(executor: DrizzleExecutor): Promise<number> {
    const [state] = await executor
        .update(serverSyncState)
        .set({ sequence: sql`${serverSyncState.sequence} + 1` })
        .where(eq(serverSyncState.id, 1))
        .returning({ sequence: serverSyncState.sequence });
    if (!state) throw new Error("Sync state is not initialized");
    return state.sequence;
}

function setupHint(sequence: number): SetupSyncHint {
    return { sequence: String(sequence), chats: [], areas: ["setup"] };
}

function userHint(sequence: number): SetupSyncHint {
    return { sequence: String(sequence), chats: [], areas: ["user-onboarding"] };
}
