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

const generations = new WeakMap<AdminStore, number>();

/** Loads every admin resource independently so one forbidden or failed area does not blank the screen. */
export async function adminLoad(context: AdminActionContext): Promise<void> {
    const generation = (generations.get(context.admin) ?? 0) + 1;
    generations.set(context.admin, generation);
    const current = (): boolean => generations.get(context.admin) === generation;
    context.admin.getState().adminInput({ type: "adminLoading" });
    await Promise.all([
        settle(
            context.runtime.operation("getAdminUsers"),
            (value) => {
                if (current())
                    context.admin
                        .getState()
                        .adminInput({ type: "usersLoaded", users: value.users });
            },
            (error) => {
                if (current()) context.admin.getState().adminInput({ type: "usersFailed", error });
            },
        ),
        settle(
            context.runtime.operation("getReports", { limit: 100 }),
            (value) => {
                if (current())
                    context.admin
                        .getState()
                        .adminInput({ type: "reportsLoaded", reports: value.reports });
            },
            (error) => {
                if (current())
                    context.admin.getState().adminInput({ type: "reportsFailed", error });
            },
        ),
        settle(
            context.runtime.operation("getAutomations"),
            (value) =>
                current() &&
                context.admin.getState().adminInput({
                    type: "automationsLoaded",
                    automations: value.automations,
                }),
            (error) => {
                if (current())
                    context.admin.getState().adminInput({ type: "automationsFailed", error });
            },
        ),
        settle(
            context.runtime.operation("getIntegrations"),
            (value) =>
                current() &&
                context.admin.getState().adminInput({
                    type: "integrationsLoaded",
                    integrations: value.integrations,
                }),
            (error) => {
                if (current())
                    context.admin.getState().adminInput({ type: "integrationsFailed", error });
            },
        ),
    ]);
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
                    case "adminLoading":
                        return {
                            users: { type: "loading" },
                            reports: { type: "loading" },
                            automations: { type: "loading" },
                            integrations: { type: "loading" },
                        };
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
    | { readonly type: "adminLoading" }
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
