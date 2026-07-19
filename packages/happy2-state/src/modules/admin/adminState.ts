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
export function adminStoreCreate(): AdminStore {
    return createStore<AdminState>()((set) => ({
        users: { type: "unloaded" },
        reports: { type: "unloaded" },
        automations: { type: "unloaded" },
        integrations: { type: "unloaded" },
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
}

export type AdminInput =
    | { readonly type: "adminLoading"; readonly sections?: readonly AdminSection[] }
    | { readonly type: "usersLoaded"; readonly users: readonly AdminUserSummary[] }
    | { readonly type: "usersFailed"; readonly error: import("../../types.js").UserError }
    | { readonly type: "reportsLoaded"; readonly reports: readonly ModerationReport[] }
    | { readonly type: "reportsFailed"; readonly error: import("../../types.js").UserError }
    | { readonly type: "automationsLoaded"; readonly automations: readonly AutomationSummary[] }
    | { readonly type: "automationsFailed"; readonly error: import("../../types.js").UserError }
    | { readonly type: "integrationsLoaded"; readonly integrations: readonly IntegrationSummary[] }
    | { readonly type: "integrationsFailed"; readonly error: import("../../types.js").UserError };

export interface AdminState extends AdminSnapshot {
    adminInput(event: AdminInput): void;
}

export type AdminStore = StoreApi<AdminState>;

export type AdminSection = "users" | "reports" | "automations" | "integrations";
