import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Badge } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { PermissionChecklist, type PermissionChecklistOption } from "./PermissionChecklist";
import { Select, type SelectOption } from "./Select";
import type { RoleBuiltinKind } from "./RolesPanel";
/** One role a member currently holds. */
export type MemberAccessRoleItem = {
    id: string;
    name: string;
    /** Immutable built-in marking; null for a custom role. */
    builtin: RoleBuiltinKind | null;
    /** False hides the unassign action, e.g. the built-in Members role. */
    removable?: boolean;
};
export type MemberAccessPanelProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The member is the server owner and implicitly allowed everything. */
    owner?: boolean;
    /** The member's grant detail has not resolved yet. */
    loading?: boolean;
    /** Fatal detail load error; replaces the sections with a banner. */
    error?: string;
    /** Transient action error, shown as a dismissible banner above the sections. */
    actionError?: string;
    onDismissActionError?: () => void;
    /** Display labels of the member's effective permissions. */
    effective: readonly string[];
    assignedRoles: readonly MemberAccessRoleItem[];
    /** Roles the member does not hold yet, offered by the assign picker. */
    availableRoles?: readonly SelectOption[];
    /** An assign request is in flight; the picker disables. */
    assigning?: boolean;
    /** Role ids with an in-flight unassign; their remove button disables. */
    busyRoleIds?: readonly string[];
    grantOptions: readonly PermissionChecklistOption[];
    /** Ids of the member's explicit direct grants. */
    directGrants: readonly string[];
    onAssignRole?: (roleId: string) => void;
    onUnassignRole?: (roleId: string) => void;
    onToggleGrant?: (id: string, checked: boolean) => void;
};
/**
 * C-070 MemberAccessPanel — the body of one member's access detail: their
 * effective permissions (with an explicit owner allow-all marking), the roles
 * they hold with assign/unassign controls, and their explicit direct grants as
 * an editable allow-list. Presentational and fully controlled; a consuming app
 * supplies the grant detail and keeps it live from the realtime stream.
 * Designed to sit inside a Modal that carries the member's name as its title.
 */
export function MemberAccessPanel(props: MemberAccessPanelProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "owner",
        "loading",
        "error",
        "actionError",
        "onDismissActionError",
        "effective",
        "assignedRoles",
        "availableRoles",
        "assigning",
        "busyRoleIds",
        "grantOptions",
        "directGrants",
        "onAssignRole",
        "onUnassignRole",
        "onToggleGrant",
    ]);
    const options = () => local.availableRoles ?? [];
    const canAssign = () => Boolean(local.onAssignRole) && options().length > 0 && !local.assigning;
    const busy = (id: string) => local.busyRoleIds?.includes(id) ?? false;
    return (
        <Box
            {...rest}
            className={["happy2-member-access-panel", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="member-access-panel"
            style={local.style}
        >
            {local.error ? (
                <Banner tone="danger" title="Access unavailable">
                    {local.error}
                </Banner>
            ) : local.loading ? (
                <p className="happy2-member-access-panel__loading">Loading access…</p>
            ) : (
                <>
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

                    <Section label="Effective access" part="effective">
                        {local.owner ? (
                            <Box
                                className="happy2-member-access-panel__owner"
                                data-happy2-ui="member-access-owner"
                            >
                                <Badge icon="star" label="Owner" variant="accent" />
                                <span className="happy2-member-access-panel__owner-note">
                                    The owner is always allowed everything.
                                </span>
                            </Box>
                        ) : null}
                        {local.effective.length > 0 ? (
                            <Box className="happy2-member-access-panel__effective">
                                {local.effective.map((label) => (
                                    <Badge key={label} label={label} variant="outline" />
                                ))}
                            </Box>
                        ) : !local.owner ? (
                            <p className="happy2-member-access-panel__empty">
                                No management access.
                            </p>
                        ) : null}
                    </Section>

                    <Section count={local.assignedRoles.length} label="Roles" part="roles">
                        {local.assignedRoles.length > 0 ? (
                            <Box className="happy2-member-access-panel__roles">
                                {local.assignedRoles.map((role) => (
                                    <Box
                                        className="happy2-member-access-panel__role"
                                        data-role-id={role.id}
                                        key={role.id}
                                    >
                                        <span className="happy2-member-access-panel__role-icon">
                                            <Icon name="users" size={16} />
                                        </span>
                                        <span
                                            className="happy2-member-access-panel__role-name"
                                            data-happy2-ui="member-access-role-name"
                                        >
                                            {role.name}
                                        </span>
                                        {role.builtin ? (
                                            <Badge
                                                label={
                                                    role.builtin === "admin"
                                                        ? "Built-in · Admin"
                                                        : "Built-in · Member"
                                                }
                                                variant={
                                                    role.builtin === "admin" ? "accent" : "info"
                                                }
                                            />
                                        ) : null}
                                        {local.onUnassignRole && role.removable !== false ? (
                                            <Button
                                                aria-label={`Unassign ${role.name}`}
                                                className="happy2-member-access-panel__role-remove"
                                                disabled={busy(role.id)}
                                                icon="close"
                                                iconOnly
                                                onClick={() => local.onUnassignRole?.(role.id)}
                                                size="small"
                                                variant="ghost"
                                            />
                                        ) : null}
                                    </Box>
                                ))}
                            </Box>
                        ) : (
                            <p className="happy2-member-access-panel__empty">No roles assigned.</p>
                        )}
                        {local.onAssignRole ? (
                            <Select
                                aria-label="Assign a role"
                                className="happy2-member-access-panel__picker"
                                disabled={!canAssign()}
                                fullWidth
                                onValueChange={(value) => {
                                    if (value) local.onAssignRole?.(value);
                                }}
                                options={[...options()]}
                                placeholder={
                                    options().length > 0
                                        ? "Assign a role…"
                                        : "Every role is assigned"
                                }
                                size="small"
                                value=""
                            />
                        ) : null}
                    </Section>

                    <Section label="Direct grants" part="grants">
                        <p className="happy2-member-access-panel__note">
                            Explicit permissions granted to this member on top of their roles.
                        </p>
                        <PermissionChecklist
                            onToggle={local.onToggleGrant}
                            options={local.grantOptions}
                            selected={local.directGrants}
                        />
                    </Section>
                </>
            )}
        </Box>
    );
}
function Section(props: { label: string; part: string; count?: number; children: ReactNode }) {
    return (
        <section
            className="happy2-member-access-panel__section"
            data-happy2-ui={`member-access-${props.part}`}
        >
            <header className="happy2-member-access-panel__section-head">
                <span className="happy2-member-access-panel__section-label">{props.label}</span>
                {props.count !== undefined ? (
                    <span className="happy2-member-access-panel__section-count">{props.count}</span>
                ) : null}
            </header>
            {props.children}
        </section>
    );
}
