import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type {
    AdminUserSummary,
    AutomationSummary,
    IntegrationSummary,
    ModerationReport,
} from "../../resources.js";
import type { Loadable } from "../chat/chatTypes.js";

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

export interface AdminStore extends ReadonlyStore<AdminSnapshot> {}
