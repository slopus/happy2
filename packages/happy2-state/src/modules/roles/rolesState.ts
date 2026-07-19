import { createStore, type StoreApi } from "zustand/vanilla";
import { type MemberPermissionDetail, type Permission, type RoleSummary } from "../../resources.js";
import { type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type IdentityCatalog, type IdentityProjection } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface RolesActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly roles: RolesStore;
}

const generations = new WeakMap<RolesStore, number>();

/** Loads the role catalog and human member directory independently, then refreshes any selected member's grant detail. */
export async function rolesLoad(context: RolesActionContext): Promise<void> {
    const generation = (generations.get(context.roles) ?? 0) + 1;
    generations.set(context.roles, generation);
    const current = (): boolean => generations.get(context.roles) === generation;
    context.roles.getState().rolesInput({ type: "rolesLoading" });
    await Promise.all([
        settle(
            context.runtime.operation("getRoles"),
            (value) => {
                if (current())
                    context.roles.getState().rolesInput({
                        type: "catalogLoaded",
                        catalog: { permissions: value.permissions, roles: value.roles },
                    });
            },
            (error) => {
                if (current())
                    context.roles.getState().rolesInput({ type: "catalogFailed", error });
            },
        ),
        settle(
            context.runtime.operation("getContacts"),
            (value) => {
                if (current())
                    context.roles.getState().rolesInput({
                        type: "membersLoaded",
                        members: value.users
                            .filter((user) => user.kind === "human")
                            .map((user) => context.identities.project(user)),
                    });
            },
            () => undefined,
        ),
    ]);
    const selectedUserId = context.roles.getState().selectedUserId;
    if (current() && selectedUserId) await rolesMemberDetailLoad(context, selectedUserId);
}

/** Loads one member's direct grants, role assignments, and effective projection for the access editor. */
export async function rolesMemberDetailLoad(
    context: RolesActionContext,
    userId: string,
): Promise<void> {
    try {
        const result = await context.runtime.operation("getUserPermissions", { userId });
        context.roles
            .getState()
            .rolesInput({ type: "memberDetailLoaded", userId, detail: result.permissions });
    } catch (error) {
        context.roles
            .getState()
            .rolesInput({ type: "memberDetailFailed", userId, error: userError(error) });
    }
}

/** Executes one closed role or grant mutation, then re-reads the authoritative catalog and selected member detail. */
export async function rolesOutputRoute(
    context: RolesActionContext,
    event: RolesOutput,
): Promise<void> {
    if (event.type === "memberSelected") {
        await rolesMemberDetailLoad(context, event.userId);
        return;
    }
    try {
        if (event.type === "roleCreateSubmitted")
            await context.runtime.operation("createRole", {
                name: event.name,
                ...(event.description !== undefined ? { description: event.description } : {}),
                permissions: event.permissions,
            });
        else if (event.type === "roleUpdateSubmitted")
            await context.runtime.operation("updateRole", {
                roleId: event.roleId,
                name: event.name,
                description: event.description,
                permissions: event.permissions,
            });
        else if (event.type === "roleDeleteSubmitted")
            await context.runtime.operation("deleteRole", { roleId: event.roleId });
        else if (event.type === "memberPermissionsSubmitted")
            await context.runtime.operation("updateUserPermissions", {
                userId: event.userId,
                permissions: event.permissions,
            });
        else if (event.type === "memberRoleAssignSubmitted")
            await context.runtime.operation("assignUserRole", {
                userId: event.userId,
                roleId: event.roleId,
            });
        else
            await context.runtime.operation("unassignUserRole", {
                userId: event.userId,
                roleId: event.roleId,
            });
    } catch (error) {
        context.roles.getState().rolesInput({ type: "roleActionFailed", error: userError(error) });
        return;
    }
    await rolesLoad(context);
}

async function settle<Value>(
    promise: Promise<Value>,
    success: (value: Value) => void,
    failure: (error: UserError) => void,
): Promise<void> {
    try {
        success(await promise);
    } catch (error) {
        failure(userError(error));
    }
}

/** Creates the roles-administration surface; authoritative catalog and grant detail enter only through the private reducer. */
export function rolesStoreCreate(
    output: (event: RolesOutput) => void = () => undefined,
): RolesStore {
    return createStore<RolesState>()((set) => {
        const submit = (event: RolesOutput): void => {
            set((snapshot) =>
                snapshot.actionError ? { ...snapshot, actionError: undefined } : snapshot,
            );
            output(event);
        };
        return {
            catalog: { type: "unloaded" },
            members: [],
            memberDetail: { type: "unloaded" },
            memberSelect(userId): void {
                set((snapshot) =>
                    snapshot.selectedUserId === userId
                        ? snapshot
                        : {
                              ...snapshot,
                              selectedUserId: userId,
                              memberDetail: { type: "loading" },
                              actionError: undefined,
                          },
                );
                output({ type: "memberSelected", userId });
            },
            roleCreate(name, description, permissions): void {
                submit({ type: "roleCreateSubmitted", name, description, permissions });
            },
            roleUpdate(roleId, name, description, permissions): void {
                submit({ type: "roleUpdateSubmitted", roleId, name, description, permissions });
            },
            roleDelete(roleId): void {
                submit({ type: "roleDeleteSubmitted", roleId });
            },
            memberPermissionsUpdate(userId, permissions): void {
                submit({ type: "memberPermissionsSubmitted", userId, permissions });
            },
            memberRoleAssign(userId, roleId): void {
                submit({ type: "memberRoleAssignSubmitted", userId, roleId });
            },
            memberRoleUnassign(userId, roleId): void {
                submit({ type: "memberRoleUnassignSubmitted", userId, roleId });
            },
            rolesInput(event): void {
                set((snapshot) => {
                    switch (event.type) {
                        case "rolesLoading":
                            // A refresh keeps the last catalog visible so the surface
                            // does not blank while reconciling a permissions hint.
                            return snapshot.catalog.type === "ready"
                                ? snapshot
                                : { ...snapshot, catalog: { type: "loading" } };
                        case "catalogLoaded":
                            return {
                                ...snapshot,
                                catalog: { type: "ready", value: event.catalog },
                            };
                        case "catalogFailed":
                            return { ...snapshot, catalog: { type: "error", error: event.error } };
                        case "membersLoaded":
                            return { ...snapshot, members: event.members };
                        case "memberDetailLoaded":
                            if (snapshot.selectedUserId !== event.userId) return snapshot;
                            return {
                                ...snapshot,
                                memberDetail: { type: "ready", value: event.detail },
                            };
                        case "memberDetailFailed":
                            if (snapshot.selectedUserId !== event.userId) return snapshot;
                            return {
                                ...snapshot,
                                memberDetail: { type: "error", error: event.error },
                            };
                        case "roleActionFailed":
                            return { ...snapshot, actionError: event.error };
                    }
                });
            },
        };
    });
}

export interface RolesCatalog {
    readonly permissions: readonly Permission[];
    readonly roles: readonly RoleSummary[];
}

export interface RolesSnapshot {
    readonly catalog: Loadable<RolesCatalog>;
    readonly members: readonly IdentityProjection[];
    readonly selectedUserId?: string;
    readonly memberDetail: Loadable<MemberPermissionDetail>;
    readonly actionError?: UserError;
}

export type RolesOutput =
    | {
          readonly type: "roleCreateSubmitted";
          readonly name: string;
          readonly description?: string;
          readonly permissions: readonly Permission[];
      }
    | {
          readonly type: "roleUpdateSubmitted";
          readonly roleId: string;
          readonly name: string;
          readonly description: string | null;
          readonly permissions: readonly Permission[];
      }
    | { readonly type: "roleDeleteSubmitted"; readonly roleId: string }
    | { readonly type: "memberSelected"; readonly userId: string }
    | {
          readonly type: "memberPermissionsSubmitted";
          readonly userId: string;
          readonly permissions: readonly Permission[];
      }
    | {
          readonly type: "memberRoleAssignSubmitted";
          readonly userId: string;
          readonly roleId: string;
      }
    | {
          readonly type: "memberRoleUnassignSubmitted";
          readonly userId: string;
          readonly roleId: string;
      };

export type RolesInput =
    | { readonly type: "rolesLoading" }
    | { readonly type: "catalogLoaded"; readonly catalog: RolesCatalog }
    | { readonly type: "catalogFailed"; readonly error: UserError }
    | { readonly type: "membersLoaded"; readonly members: readonly IdentityProjection[] }
    | {
          readonly type: "memberDetailLoaded";
          readonly userId: string;
          readonly detail: MemberPermissionDetail;
      }
    | { readonly type: "memberDetailFailed"; readonly userId: string; readonly error: UserError }
    | { readonly type: "roleActionFailed"; readonly error: UserError };

export interface RolesState extends RolesSnapshot {
    memberSelect(userId: string): void;
    roleCreate(
        name: string,
        description: string | undefined,
        permissions: readonly Permission[],
    ): void;
    roleUpdate(
        roleId: string,
        name: string,
        description: string | null,
        permissions: readonly Permission[],
    ): void;
    roleDelete(roleId: string): void;
    memberPermissionsUpdate(userId: string, permissions: readonly Permission[]): void;
    memberRoleAssign(userId: string, roleId: string): void;
    memberRoleUnassign(userId: string, roleId: string): void;
    rolesInput(event: RolesInput): void;
}

export type RolesStore = StoreApi<RolesState>;
