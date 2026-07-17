import { storeCreate } from "../../kernel/store.js";
import type { AdminInput, AdminSnapshot, AdminStore } from "./adminTypes.js";

export interface AdminStoreBinding {
    readonly store: AdminStore;
    adminInput(event: AdminInput): void;
    dispose(): void;
}

/** Creates an admin-screen store whose resources fail independently instead of one Promise.all gate. */
export function adminStoreCreateBinding(): AdminStoreBinding {
    const { store, writer } = storeCreate<AdminSnapshot>({
        users: { type: "unloaded" },
        reports: { type: "unloaded" },
        automations: { type: "unloaded" },
        integrations: { type: "unloaded" },
    });
    return {
        store,
        adminInput(event): void {
            writer.update((snapshot) => {
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
        dispose: writer.dispose,
    };
}
