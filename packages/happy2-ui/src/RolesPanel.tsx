import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Badge } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { DataTable, type DataTableColumn, type DataTableRow } from "./DataTable";
import { EmptyState } from "./EmptyState";
export type RoleBuiltinKind = "admin" | "member";
export type RoleListItem = {
    id: string;
    name: string;
    /** Optional human description shown under the name. */
    description?: string;
    /** Immutable built-in marking; null for a custom role. */
    builtin: RoleBuiltinKind | null;
    /** Display labels of the role's allowed permissions. */
    permissions: readonly string[];
    /** Number of members currently assigned the role. */
    memberCount: number;
};
export type RolesPanelProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    title?: string;
    subtitle?: string;
    roles: readonly RoleListItem[];
    /** First load has not resolved yet. */
    loading?: boolean;
    /** Fatal load error; replaces the table with a banner. */
    error?: string;
    /** Transient action error, shown as a dismissible banner above the table. */
    actionError?: string;
    onDismissActionError?: () => void;
    /** Opens the role's editor — the row click. */
    onSelectRole?: (id: string) => void;
    /** Deletes a custom role; built-in roles never offer the action. */
    onDeleteRole?: (id: string) => void;
    onOpenCreate?: () => void;
    /** Ids with an in-flight mutation; their row action disables. */
    busyRoleIds?: readonly string[];
};
const columns: DataTableColumn[] = [
    { id: "role", header: "Role" },
    { id: "access", header: "Access" },
    { id: "members", header: "Members", align: "end", width: 110 },
    { id: "kind", header: "Type", width: 150 },
];
/** How many permission badges to show before collapsing the rest into "+N". */
const PERMISSION_PREVIEW = 3;
/**
 * C-068 RolesPanel — the administrator surface for server roles: each row shows
 * a role's name and description, a preview of its allowed permissions, how many
 * members hold it, and an immutable built-in marking for the Admins and Members
 * roles. A row click opens the role for editing; only custom roles offer Delete.
 * Presentational and fully controlled — data and every mutation flow through
 * props, and there is deliberately no refresh control; the consumer keeps
 * `roles` live from the realtime stream.
 */
export function RolesPanel(props: RolesPanelProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "title",
        "subtitle",
        "roles",
        "loading",
        "error",
        "actionError",
        "onDismissActionError",
        "onSelectRole",
        "onDeleteRole",
        "onOpenCreate",
        "busyRoleIds",
    ]);
    const title = () => local.title ?? "Roles";
    const busy = (id: string) => local.busyRoleIds?.includes(id) ?? false;
    const builtinById = new Map(local.roles.map((role) => [role.id, role.builtin]));
    const rows: DataTableRow[] = local.roles.map((role) => {
        const preview = role.permissions.slice(0, PERMISSION_PREVIEW);
        const overflow = role.permissions.length - preview.length;
        return {
            id: role.id,
            onClick: local.onSelectRole ? () => local.onSelectRole?.(role.id) : undefined,
            cells: {
                role: (
                    <Box className="happy2-roles-panel__role">
                        <span className="happy2-roles-panel__name" data-happy2-ui="role-name">
                            {role.name}
                        </span>
                        {role.description ? (
                            <span
                                className="happy2-roles-panel__description"
                                data-happy2-ui="role-description"
                            >
                                {role.description}
                            </span>
                        ) : null}
                    </Box>
                ),
                access: (
                    <Box className="happy2-roles-panel__access">
                        {preview.length > 0 ? (
                            <>
                                {preview.map((permission) => (
                                    <Badge key={permission} label={permission} variant="outline" />
                                ))}
                                {overflow > 0 ? (
                                    <span
                                        className="happy2-roles-panel__overflow"
                                        title={role.permissions.join(", ")}
                                    >
                                        +{overflow}
                                    </span>
                                ) : null}
                            </>
                        ) : (
                            <span className="happy2-roles-panel__none">No permissions</span>
                        )}
                    </Box>
                ),
                members: (
                    <span
                        className="happy2-roles-panel__members"
                        data-happy2-ui="role-member-count"
                    >
                        {role.memberCount}
                    </span>
                ),
                kind: (
                    <Badge
                        label={
                            role.builtin === "admin"
                                ? "Built-in · Admin"
                                : role.builtin === "member"
                                  ? "Built-in · Member"
                                  : "Custom"
                        }
                        variant={
                            role.builtin === "admin"
                                ? "accent"
                                : role.builtin === "member"
                                  ? "info"
                                  : "neutral"
                        }
                    />
                ),
            },
        };
    });
    const rowActions = (row: DataTableRow): ReactNode => {
        if (!local.onDeleteRole || builtinById.get(row.id)) return null;
        return (
            <Box
                className="happy2-roles-panel__row-actions"
                onClick={(event) => event.stopPropagation()}
            >
                <Button
                    disabled={busy(row.id)}
                    icon="close"
                    onClick={() => local.onDeleteRole?.(row.id)}
                    size="small"
                    variant="ghost"
                >
                    Delete
                </Button>
            </Box>
        );
    };
    return (
        <Box
            {...rest}
            className={["happy2-roles-panel", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="roles-panel"
            style={local.style}
        >
            <Box className="happy2-roles-panel__header">
                <Box className="happy2-roles-panel__heading">
                    <span className="happy2-roles-panel__title">{title()}</span>
                    {local.subtitle ? (
                        <span className="happy2-roles-panel__subtitle">{local.subtitle}</span>
                    ) : null}
                </Box>
                <Box className="happy2-roles-panel__actions">
                    {local.onOpenCreate ? (
                        <Button icon="plus" onClick={() => local.onOpenCreate?.()} size="small">
                            New role
                        </Button>
                    ) : null}
                </Box>
            </Box>

            {local.actionError
                ? ((reason) => (
                      <Banner
                          onDismiss={local.onDismissActionError}
                          tone="danger"
                          title="Action failed"
                      >
                          {reason}
                      </Banner>
                  ))(local.actionError)
                : null}

            {!local.error ? (
                !local.loading ? (
                    <DataTable
                        actionsWidth={120}
                        columns={columns}
                        empty={
                            <EmptyState
                                action={
                                    local.onOpenCreate
                                        ? {
                                              icon: "plus",
                                              label: "New role",
                                              onClick: () => local.onOpenCreate?.(),
                                          }
                                        : undefined
                                }
                                description="Create a role to grant a group of members the same access."
                                icon="shield"
                                size="inline"
                                title="No roles yet"
                            />
                        }
                        rowActions={local.onDeleteRole ? rowActions : undefined}
                        rows={rows}
                    />
                ) : (
                    <EmptyState
                        description="Loading roles and their assignments."
                        icon="shield"
                        title="Loading roles…"
                    />
                )
            ) : (
                <Banner tone="danger" title="Roles unavailable">
                    {local.error!}
                </Banner>
            )}
        </Box>
    );
}
