import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type AdminUserSummary,
    type AutomationSummary,
    type IntegrationSummary,
    type ModerationReport,
} from "../../resources.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface AdminActionContext {
    readonly runtime: StateRuntime;
    readonly admin: AdminStore;
}

const passwordUppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const passwordLowercase = "abcdefghijkmnopqrstuvwxyz";
const passwordDigits = "23456789";
const passwordSymbols = "!@#$%*-_+";
const passwordAlphabet = passwordUppercase + passwordLowercase + passwordDigits + passwordSymbols;

function randomIndex(length: number): number {
    const crypto = globalThis.crypto;
    if (!crypto) throw new Error("Secure password generation is unavailable.");
    const values = new Uint32Array(1);
    const range = 0x1_0000_0000;
    const limit = range - (range % length);
    do crypto.getRandomValues(values);
    while (values[0]! >= limit);
    return values[0]! % length;
}

function randomCharacter(alphabet: string): string {
    return alphabet[randomIndex(alphabet.length)]!;
}

function userPasswordGenerate(): string {
    const characters = [
        randomCharacter(passwordUppercase),
        randomCharacter(passwordLowercase),
        randomCharacter(passwordDigits),
        randomCharacter(passwordSymbols),
        ...Array.from({ length: 16 }, () => randomCharacter(passwordAlphabet)),
    ];
    for (let index = characters.length - 1; index > 0; index -= 1) {
        const swapIndex = randomIndex(index + 1);
        [characters[index], characters[swapIndex]] = [characters[swapIndex]!, characters[index]!];
    }
    return characters.join("");
}

const generations = new WeakMap<AdminStore, Map<AdminSection, number>>();
const allSections: readonly AdminSection[] = ["users", "reports", "automations", "integrations"];

/** Loads only the requested legacy admin resources so narrow grants never probe unrelated privileged endpoints. */
export async function adminLoad(
    context: AdminActionContext,
    sections: readonly AdminSection[] = allSections,
): Promise<void> {
    const storeGenerations = generations.get(context.admin) ?? new Map<AdminSection, number>();
    generations.set(context.admin, storeGenerations);
    const requestGenerations = new Map(
        sections.map((section) => {
            const generation = (storeGenerations.get(section) ?? 0) + 1;
            storeGenerations.set(section, generation);
            return [section, generation] as const;
        }),
    );
    const current = (section: AdminSection): boolean =>
        storeGenerations.get(section) === requestGenerations.get(section);
    context.admin.getState().adminInput({ type: "adminLoading", sections });
    const tasks: Promise<void>[] = [];
    if (sections.includes("users"))
        tasks.push(
            settle(
                context.runtime.operation("getAdminUsers"),
                (value) => {
                    if (current("users"))
                        context.admin
                            .getState()
                            .adminInput({ type: "usersLoaded", users: value.users });
                },
                (error) => {
                    if (current("users"))
                        context.admin.getState().adminInput({ type: "usersFailed", error });
                },
            ),
        );
    if (sections.includes("reports"))
        tasks.push(
            settle(
                context.runtime.operation("getReports", { limit: 100 }),
                (value) => {
                    if (current("reports"))
                        context.admin
                            .getState()
                            .adminInput({ type: "reportsLoaded", reports: value.reports });
                },
                (error) => {
                    if (current("reports"))
                        context.admin.getState().adminInput({ type: "reportsFailed", error });
                },
            ),
        );
    if (sections.includes("automations"))
        tasks.push(
            settle(
                context.runtime.operation("getAutomations"),
                (value) =>
                    current("automations") &&
                    context.admin.getState().adminInput({
                        type: "automationsLoaded",
                        automations: value.automations,
                    }),
                (error) => {
                    if (current("automations"))
                        context.admin.getState().adminInput({ type: "automationsFailed", error });
                },
            ),
        );
    if (sections.includes("integrations"))
        tasks.push(
            settle(
                context.runtime.operation("getIntegrations"),
                (value) =>
                    current("integrations") &&
                    context.admin.getState().adminInput({
                        type: "integrationsLoaded",
                        integrations: value.integrations,
                    }),
                (error) => {
                    if (current("integrations"))
                        context.admin.getState().adminInput({ type: "integrationsFailed", error });
                },
            ),
        );
    await Promise.all(tasks);
}

/** Sends one client-generated password to the reset endpoint and projects the result into the open reset handoff. */
export async function adminOutputRoute(
    context: AdminActionContext,
    event: AdminOutput,
): Promise<void> {
    try {
        const result = await context.runtime.operation("resetAdminUserPassword", {
            userId: event.userId,
            password: event.password,
        });
        context.admin.getState().adminInput({
            type: "userPasswordResetSucceeded",
            userId: event.userId,
            submissionId: event.submissionId,
            revokedSessionCount: result.revokedSessionCount,
        });
    } catch (error) {
        context.admin.getState().adminInput({
            type: "userPasswordResetFailed",
            userId: event.userId,
            submissionId: event.submissionId,
            error: userError(error),
        });
    }
}

async function settle<Value>(
    promise: Promise<Value>,
    success: (value: Value) => void,
    failure: (error: import("../../types.js").UserError) => void,
): Promise<void> {
    try {
        success(await promise);
    } catch (error) {
        failure(userError(error));
    }
}

/** Creates an admin-screen store whose resources fail independently instead of one Promise.all gate. */
export function adminStoreCreate(
    output: (event: AdminOutput) => void = () => undefined,
): AdminStore {
    let nextPasswordResetSubmissionId = 0;
    return createStore<AdminState>()((set) => ({
        users: { type: "unloaded" },
        reports: { type: "unloaded" },
        automations: { type: "unloaded" },
        integrations: { type: "unloaded" },
        userPasswordReset: { type: "closed" },
        userPasswordResetOpen(userId): void {
            set((snapshot) => {
                const user =
                    snapshot.users.type === "ready"
                        ? snapshot.users.value.find((value) => value.id === userId)
                        : undefined;
                return {
                    ...snapshot,
                    userPasswordReset: {
                        type: "open",
                        status: "ready",
                        userId,
                        displayName: user
                            ? [user.firstName, user.lastName].filter(Boolean).join(" ")
                            : "",
                        username: user?.username ?? userId,
                        password: userPasswordGenerate(),
                    },
                };
            });
        },
        userPasswordResetRegenerate(): void {
            set((snapshot) => {
                const reset = snapshot.userPasswordReset;
                if (
                    reset.type !== "open" ||
                    reset.status === "submitting" ||
                    reset.status === "succeeded"
                )
                    return snapshot;
                return {
                    ...snapshot,
                    userPasswordReset: {
                        type: "open",
                        status: "ready",
                        userId: reset.userId,
                        displayName: reset.displayName,
                        username: reset.username,
                        password: userPasswordGenerate(),
                    },
                };
            });
        },
        userPasswordResetSubmit(): void {
            let submitted: AdminOutput | undefined;
            set((snapshot) => {
                const reset = snapshot.userPasswordReset;
                if (
                    reset.type !== "open" ||
                    (reset.status !== "ready" && reset.status !== "failed")
                )
                    return snapshot;
                const submissionId = (nextPasswordResetSubmissionId += 1);
                submitted = {
                    type: "userPasswordResetSubmitted",
                    userId: reset.userId,
                    submissionId,
                    password: reset.password,
                };
                return {
                    ...snapshot,
                    userPasswordReset: {
                        ...reset,
                        status: "submitting",
                        submissionId,
                        error: undefined,
                    },
                };
            });
            if (submitted) output(submitted);
        },
        userPasswordResetClose(): void {
            set((snapshot) =>
                snapshot.userPasswordReset.type === "closed"
                    ? snapshot
                    : { ...snapshot, userPasswordReset: { type: "closed" } },
            );
        },
        adminInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "adminLoading": {
                        const sections = event.sections ?? allSections;
                        return {
                            ...snapshot,
                            ...(sections.includes("users")
                                ? { users: { type: "loading" } as const }
                                : {}),
                            ...(sections.includes("reports")
                                ? { reports: { type: "loading" } as const }
                                : {}),
                            ...(sections.includes("automations")
                                ? { automations: { type: "loading" } as const }
                                : {}),
                            ...(sections.includes("integrations")
                                ? { integrations: { type: "loading" } as const }
                                : {}),
                        };
                    }
                    case "usersLoaded":
                        return { ...snapshot, users: { type: "ready", value: event.users } };
                    case "usersFailed":
                        return { ...snapshot, users: { type: "error", error: event.error } };
                    case "reportsLoaded":
                        return { ...snapshot, reports: { type: "ready", value: event.reports } };
                    case "reportsFailed":
                        return { ...snapshot, reports: { type: "error", error: event.error } };
                    case "automationsLoaded":
                        return {
                            ...snapshot,
                            automations: { type: "ready", value: event.automations },
                        };
                    case "automationsFailed":
                        return { ...snapshot, automations: { type: "error", error: event.error } };
                    case "integrationsLoaded":
                        return {
                            ...snapshot,
                            integrations: { type: "ready", value: event.integrations },
                        };
                    case "integrationsFailed":
                        return { ...snapshot, integrations: { type: "error", error: event.error } };
                    case "userPasswordResetSucceeded": {
                        const reset = snapshot.userPasswordReset;
                        if (
                            reset.type !== "open" ||
                            reset.userId !== event.userId ||
                            reset.submissionId !== event.submissionId
                        )
                            return snapshot;
                        return {
                            ...snapshot,
                            userPasswordReset: {
                                ...reset,
                                status: "succeeded",
                                revokedSessionCount: event.revokedSessionCount,
                                error: undefined,
                            },
                        };
                    }
                    case "userPasswordResetFailed": {
                        const reset = snapshot.userPasswordReset;
                        if (
                            reset.type !== "open" ||
                            reset.userId !== event.userId ||
                            reset.submissionId !== event.submissionId
                        )
                            return snapshot;
                        return {
                            ...snapshot,
                            userPasswordReset: {
                                ...reset,
                                status: "failed",
                                error: event.error,
                            },
                        };
                    }
                }
            });
        },
    }));
}

export interface AdminSnapshot {
    readonly users: Loadable<readonly AdminUserSummary[]>;
    readonly reports: Loadable<readonly ModerationReport[]>;
    readonly automations: Loadable<readonly AutomationSummary[]>;
    readonly integrations: Loadable<readonly IntegrationSummary[]>;
    readonly userPasswordReset: UserPasswordResetSnapshot;
}

export type UserPasswordResetSnapshot =
    | { readonly type: "closed" }
    | {
          readonly type: "open";
          readonly status: "ready" | "submitting" | "succeeded" | "failed";
          readonly userId: string;
          readonly displayName: string;
          readonly username: string;
          readonly password: string;
          readonly submissionId?: number;
          readonly revokedSessionCount?: number;
          readonly error?: import("../../types.js").UserError;
      };

export type AdminOutput = {
    readonly type: "userPasswordResetSubmitted";
    readonly userId: string;
    readonly submissionId: number;
    readonly password: string;
};

export type AdminInput =
    | { readonly type: "adminLoading"; readonly sections?: readonly AdminSection[] }
    | { readonly type: "usersLoaded"; readonly users: readonly AdminUserSummary[] }
    | { readonly type: "usersFailed"; readonly error: import("../../types.js").UserError }
    | { readonly type: "reportsLoaded"; readonly reports: readonly ModerationReport[] }
    | { readonly type: "reportsFailed"; readonly error: import("../../types.js").UserError }
    | { readonly type: "automationsLoaded"; readonly automations: readonly AutomationSummary[] }
    | { readonly type: "automationsFailed"; readonly error: import("../../types.js").UserError }
    | { readonly type: "integrationsLoaded"; readonly integrations: readonly IntegrationSummary[] }
    | { readonly type: "integrationsFailed"; readonly error: import("../../types.js").UserError }
    | {
          readonly type: "userPasswordResetSucceeded";
          readonly userId: string;
          readonly submissionId: number;
          readonly revokedSessionCount: number;
      }
    | {
          readonly type: "userPasswordResetFailed";
          readonly userId: string;
          readonly submissionId: number;
          readonly error: import("../../types.js").UserError;
      };

export interface AdminState extends AdminSnapshot {
    userPasswordResetOpen(userId: string): void;
    userPasswordResetRegenerate(): void;
    userPasswordResetSubmit(): void;
    userPasswordResetClose(): void;
    adminInput(event: AdminInput): void;
}

export type AdminStore = StoreApi<AdminState>;

export type AdminSection = "users" | "reports" | "automations" | "integrations";
