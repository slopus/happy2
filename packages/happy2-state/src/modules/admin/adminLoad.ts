import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { AdminStoreBinding } from "./adminStore.js";

export interface AdminActionContext {
    readonly runtime: StateRuntime;
    readonly admin: AdminStoreBinding;
}

const generations = new WeakMap<AdminStoreBinding, number>();

/** Loads every admin resource independently so one forbidden or failed area does not blank the screen. */
export async function adminLoad(context: AdminActionContext): Promise<void> {
    const generation = (generations.get(context.admin) ?? 0) + 1;
    generations.set(context.admin, generation);
    const current = (): boolean => generations.get(context.admin) === generation;
    context.admin.adminInput({ type: "adminLoading" });
    await Promise.all([
        settle(
            context.runtime.operation("getAdminUsers"),
            (value) => {
                if (current())
                    context.admin.adminInput({ type: "usersLoaded", users: value.users });
            },
            (error) => {
                if (current()) context.admin.adminInput({ type: "usersFailed", error });
            },
        ),
        settle(
            context.runtime.operation("getReports", { limit: 100 }),
            (value) => {
                if (current())
                    context.admin.adminInput({ type: "reportsLoaded", reports: value.reports });
            },
            (error) => {
                if (current()) context.admin.adminInput({ type: "reportsFailed", error });
            },
        ),
        settle(
            context.runtime.operation("getAutomations"),
            (value) =>
                current() &&
                context.admin.adminInput({
                    type: "automationsLoaded",
                    automations: value.automations,
                }),
            (error) => {
                if (current()) context.admin.adminInput({ type: "automationsFailed", error });
            },
        ),
        settle(
            context.runtime.operation("getIntegrations"),
            (value) =>
                current() &&
                context.admin.adminInput({
                    type: "integrationsLoaded",
                    integrations: value.integrations,
                }),
            (error) => {
                if (current()) context.admin.adminInput({ type: "integrationsFailed", error });
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
