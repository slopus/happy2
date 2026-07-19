import { createStore, type StoreApi } from "zustand/vanilla";
import { type EffectivePermissions, type Permission } from "../../resources.js";
import { type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface PermissionsActionContext {
    readonly runtime: StateRuntime;
    readonly permissions: PermissionsStore;
}

const generations = new WeakMap<PermissionsStore, number>();

/** Loads the current user's effective permission projection so surfaces can gate management navigation authoritatively. */
export async function permissionsLoad(context: PermissionsActionContext): Promise<void> {
    const generation = (generations.get(context.permissions) ?? 0) + 1;
    generations.set(context.permissions, generation);
    context.permissions.getState().permissionsInput({ type: "permissionsLoading" });
    try {
        const me = await context.runtime.operation("getMe");
        if (generations.get(context.permissions) !== generation) return;
        context.permissions.getState().permissionsInput({
            type: "permissionsLoaded",
            permissions: me.permissions,
        });
    } catch (error) {
        if (generations.get(context.permissions) === generation)
            context.permissions
                .getState()
                .permissionsInput({ type: "permissionsFailed", error: userError(error) });
    }
}

/** True when a ready snapshot allows the permission, including the owner's implicit allow-all. */
export function permissionAllowed(snapshot: PermissionsSnapshot, permission: Permission): boolean {
    if (snapshot.permissions.type !== "ready") return false;
    const value = snapshot.permissions.value;
    return value.owner || value.allowed.includes(permission);
}

/** Creates the current-user permissions surface; effective grants only enter through the private reducer. */
export function permissionsStoreCreate(initial?: EffectivePermissions): PermissionsStore {
    return createStore<PermissionsState>()((set) => ({
        permissions: initial ? { type: "ready", value: initial } : { type: "unloaded" },
        permissionsInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "permissionsLoading":
                        // A refresh keeps the last authoritative grants visible so
                        // navigation does not flicker while reconciling a hint.
                        return snapshot.permissions.type === "ready"
                            ? snapshot
                            : { permissions: { type: "loading" } };
                    case "permissionsLoaded":
                        return { permissions: { type: "ready", value: event.permissions } };
                    case "permissionsFailed":
                        return snapshot.permissions.type === "ready"
                            ? snapshot
                            : { permissions: { type: "error", error: event.error } };
                }
            });
        },
    }));
}

export interface PermissionsSnapshot {
    readonly permissions: Loadable<EffectivePermissions>;
}

export type PermissionsInput =
    | { readonly type: "permissionsLoading" }
    | { readonly type: "permissionsLoaded"; readonly permissions: EffectivePermissions }
    | { readonly type: "permissionsFailed"; readonly error: UserError };

export interface PermissionsState extends PermissionsSnapshot {
    permissionsInput(event: PermissionsInput): void;
}

export type PermissionsStore = StoreApi<PermissionsState>;
