import { useState } from "react";
import type { IdentityProjection, Permission, RolesStore, RoleSummary } from "happy2-state";
import { Badge } from "../../Badge";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { DataTable, type DataTableColumn, type DataTableRow } from "../../DataTable";
import { EmptyState } from "../../EmptyState";
import { MemberAccessPanel } from "../../MemberAccessPanel";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { type PermissionChecklistOption } from "../../PermissionChecklist";
import { RoleEditor } from "../../RoleEditor";
import { RolesPanel, type RoleListItem } from "../../RolesPanel";
import { StoreSurface } from "../../StoreSurface";
export interface RolesPageProps {
    store: RolesStore;
    query?: string;
    /** Whether the member directory and grant editor may be shown. */
    showMembers?: boolean;
}
/** Product copy for each server permission, keyed by its closed wire id. */
const permissionPresentation: Record<Permission, { label: string; description: string }> = {
    manageSecrets: {
        label: "Manage secrets",
        description: "Create and delete agent secrets and their values.",
    },
    assignSecrets: {
        label: "Assign secrets",
        description: "Attach and detach existing secrets on agents and channels.",
    },
    manageImages: {
        label: "Manage images",
        description: "Create, build, and set the default agent image.",
    },
    assignImagesToChats: {
        label: "Assign images to chats",
        description: "Apply an agent image to a chat's workspace.",
    },
    managePlugins: {
        label: "Manage plugins",
        description: "Browse the plugin catalog and install plugins.",
    },
    viewAllMembers: {
        label: "View all members",
        description: "See every member, including banned and deactivated accounts.",
    },
    manageAdminRoles: {
        label: "Manage roles & grants",
        description: "Create roles and change member roles and permissions.",
    },
};
const permissionLabel = (permission: Permission): string =>
    permissionPresentation[permission]?.label ?? permission;
const memberColumns: DataTableColumn[] = [
    { id: "name", header: "Member" },
    { id: "roles", header: "Roles" },
];
type EditorState = { mode: "create" } | { mode: "edit"; roleId: string };
/** Complete roles-and-grants administration page backed by one RolesStore. */
export function RolesPage(props: RolesPageProps) {
    const [dismissedError, setDismissedError] = useState<unknown>();
    const [editor, setEditor] = useState<EditorState>();
    const [draftName, setDraftName] = useState("");
    const [draftDescription, setDraftDescription] = useState("");
    const [draftPermissions, setDraftPermissions] = useState<readonly Permission[]>([]);
    const [memberOpen, setMemberOpen] = useState(false);
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const catalog =
                    snapshot.catalog.type === "ready" ? snapshot.catalog.value : undefined;
                const catalogPermissions = catalog?.permissions ?? [];
                const options: PermissionChecklistOption[] = catalogPermissions.map(
                    (permission) => ({
                        id: permission,
                        label: permissionLabel(permission),
                        description: permissionPresentation[permission]?.description,
                    }),
                );
                const needle = props.query?.trim().toLowerCase() ?? "";
                const roles = catalog?.roles ?? [];
                const roleItems: RoleListItem[] = roles
                    .filter(
                        (role) =>
                            !needle ||
                            role.name.toLowerCase().includes(needle) ||
                            (role.description ?? "").toLowerCase().includes(needle),
                    )
                    .map((role) => ({
                        id: role.id,
                        name: role.name,
                        description: role.description,
                        builtin: role.builtin,
                        permissions: role.permissions.map(permissionLabel),
                        memberCount: role.userIds.length,
                    }));
                const actionError =
                    snapshot.actionError === dismissedError
                        ? undefined
                        : snapshot.actionError?.message;
                const catalogError =
                    snapshot.catalog.type === "error" ? snapshot.catalog.error.message : undefined;
                const loading =
                    snapshot.catalog.type === "loading" || snapshot.catalog.type === "unloaded";
                const editingRole: RoleSummary | undefined =
                    editor?.mode === "edit"
                        ? roles.find((role) => role.id === editor.roleId)
                        : undefined;
                const rolesByMember = new Map<string, RoleSummary[]>();
                for (const role of roles)
                    for (const userId of role.userIds)
                        rolesByMember.set(userId, [...(rolesByMember.get(userId) ?? []), role]);
                const memberRows: DataTableRow[] = snapshot.members
                    .filter(
                        (member) =>
                            !needle ||
                            member.displayName.toLowerCase().includes(needle) ||
                            member.username.toLowerCase().includes(needle),
                    )
                    .map((member) => ({
                        id: member.id,
                        onClick: () => {
                            store.memberSelect(member.id);
                            setMemberOpen(true);
                        },
                        cells: {
                            name: (
                                <Box className="happy2-roles-page__member">
                                    <span className="happy2-roles-page__member-name">
                                        {member.displayName || `@${member.username}`}
                                    </span>
                                    <span className="happy2-roles-page__member-username">
                                        @{member.username}
                                    </span>
                                </Box>
                            ),
                            roles: (
                                <Box className="happy2-roles-page__member-roles">
                                    {(rolesByMember.get(member.id) ?? []).map((role) => (
                                        <Badge
                                            key={role.id}
                                            label={role.name}
                                            variant={
                                                role.builtin === "admin"
                                                    ? "accent"
                                                    : role.builtin === "member"
                                                      ? "info"
                                                      : "outline"
                                            }
                                        />
                                    ))}
                                </Box>
                            ),
                        },
                    }));
                const selectedMember: IdentityProjection | undefined = snapshot.members.find(
                    (member) => member.id === snapshot.selectedUserId,
                );
                const detail =
                    snapshot.memberDetail.type === "ready"
                        ? snapshot.memberDetail.value
                        : undefined;
                const assignedRoles = (detail?.roleIds ?? [])
                    .map((roleId) => roles.find((role) => role.id === roleId))
                    .filter((role): role is RoleSummary => role !== undefined);
                const assignedIds = new Set(detail?.roleIds ?? []);
                const closeEditor = () => setEditor(undefined);
                const submitEditor = () => {
                    const name = draftName.trim();
                    if (!name || !editor) return;
                    const description = draftDescription.trim();
                    const ordered = catalogPermissions.filter((permission) =>
                        draftPermissions.includes(permission),
                    );
                    if (editor.mode === "create")
                        store.roleCreate(name, description || undefined, ordered);
                    else store.roleUpdate(editor.roleId, name, description || null, ordered);
                    closeEditor();
                };
                return (
                    <Box
                        className="happy2-roles-page"
                        data-happy2-ui="roles-page"
                        style={{ display: "flex", flexDirection: "column", gap: "24px" }}
                    >
                        <RolesPanel
                            actionError={actionError}
                            error={catalogError}
                            loading={loading}
                            onDeleteRole={(id) => store.roleDelete(id)}
                            onDismissActionError={() => setDismissedError(snapshot.actionError)}
                            onOpenCreate={() => {
                                setDraftName("");
                                setDraftDescription("");
                                setDraftPermissions([]);
                                setEditor({ mode: "create" });
                            }}
                            onSelectRole={(id) => {
                                const role = roles.find((value) => value.id === id);
                                if (!role) return;
                                setDraftName(role.name);
                                setDraftDescription(role.description ?? "");
                                setDraftPermissions(role.permissions);
                                setEditor({ mode: "edit", roleId: id });
                            }}
                            roles={roleItems}
                            subtitle="Named permission sets assigned to members. Built-in roles can be renamed but never deleted."
                        />
                        {!catalogError && props.showMembers !== false ? (
                            <Box
                                data-happy2-ui="roles-page-members"
                                style={{ display: "flex", flexDirection: "column", gap: "16px" }}
                            >
                                <Box
                                    style={{ display: "flex", flexDirection: "column", gap: "2px" }}
                                >
                                    <span className="happy2-roles-page__members-title">
                                        Member access
                                    </span>
                                    <span className="happy2-roles-page__members-subtitle">
                                        Open a member to review their roles, direct grants, and
                                        effective access.
                                    </span>
                                </Box>
                                <DataTable
                                    columns={memberColumns}
                                    empty={
                                        <EmptyState
                                            description={
                                                needle
                                                    ? "Try a different search term."
                                                    : "The directory returned no members."
                                            }
                                            icon="users"
                                            size="inline"
                                            title={needle ? "No matches" : "No members"}
                                        />
                                    }
                                    rows={memberRows}
                                />
                            </Box>
                        ) : null}
                        {editor ? (
                            <ModalOverlay onDismiss={closeEditor}>
                                <Modal
                                    footer={
                                        <Box
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                            }}
                                        >
                                            <Button onClick={closeEditor} variant="ghost">
                                                Cancel
                                            </Button>
                                            <Button
                                                disabled={!draftName.trim()}
                                                onClick={submitEditor}
                                            >
                                                {editor.mode === "create"
                                                    ? "Create role"
                                                    : "Save role"}
                                            </Button>
                                        </Box>
                                    }
                                    icon="shield"
                                    onClose={closeEditor}
                                    size="medium"
                                    title={editor.mode === "create" ? "New role" : "Edit role"}
                                >
                                    <RoleEditor
                                        builtin={editingRole?.builtin ?? null}
                                        description={draftDescription}
                                        name={draftName}
                                        onDescriptionChange={setDraftDescription}
                                        onNameChange={setDraftName}
                                        onTogglePermission={(id, checked) =>
                                            setDraftPermissions((current) =>
                                                checked
                                                    ? [...current, id as Permission]
                                                    : current.filter((value) => value !== id),
                                            )
                                        }
                                        options={options}
                                        selectedPermissions={draftPermissions}
                                    />
                                </Modal>
                            </ModalOverlay>
                        ) : null}
                        {memberOpen && selectedMember
                            ? ((member) => (
                                  <ModalOverlay onDismiss={() => setMemberOpen(false)}>
                                      <Modal
                                          icon="users"
                                          onClose={() => setMemberOpen(false)}
                                          size="medium"
                                          title={member.displayName || `@${member.username}`}
                                      >
                                          <MemberAccessPanel
                                              actionError={actionError}
                                              assignedRoles={assignedRoles.map((role) => ({
                                                  id: role.id,
                                                  name: role.name,
                                                  builtin: role.builtin,
                                                  removable:
                                                      role.builtin !== "member" &&
                                                      !(
                                                          detail?.effective.owner &&
                                                          role.builtin === "admin"
                                                      ),
                                              }))}
                                              availableRoles={roles
                                                  .filter(
                                                      (role) =>
                                                          !assignedIds.has(role.id) &&
                                                          role.builtin !== "member",
                                                  )
                                                  .map((role) => ({
                                                      value: role.id,
                                                      label: role.name,
                                                  }))}
                                              directGrants={detail?.direct ?? []}
                                              effective={
                                                  detail?.effective.allowed.map(permissionLabel) ??
                                                  []
                                              }
                                              error={
                                                  snapshot.memberDetail.type === "error"
                                                      ? snapshot.memberDetail.error.message
                                                      : undefined
                                              }
                                              grantOptions={options}
                                              loading={
                                                  snapshot.memberDetail.type === "loading" ||
                                                  snapshot.memberDetail.type === "unloaded"
                                              }
                                              onAssignRole={(roleId) =>
                                                  store.memberRoleAssign(member.id, roleId)
                                              }
                                              onDismissActionError={() =>
                                                  setDismissedError(snapshot.actionError)
                                              }
                                              onToggleGrant={(id, checked) => {
                                                  if (!detail) return;
                                                  const next = catalogPermissions.filter(
                                                      (permission) =>
                                                          permission === id
                                                              ? checked
                                                              : detail.direct.includes(permission),
                                                  );
                                                  store.memberPermissionsUpdate(member.id, next);
                                              }}
                                              onUnassignRole={(roleId) =>
                                                  store.memberRoleUnassign(member.id, roleId)
                                              }
                                              owner={detail?.effective.owner}
                                          />
                                      </Modal>
                                  </ModalOverlay>
                              ))(selectedMember)
                            : null}
                    </Box>
                );
            }}
        </StoreSurface>
    );
}
