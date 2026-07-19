import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Badge } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { FormRow } from "./FormRow";
import { PermissionChecklist, type PermissionChecklistOption } from "./PermissionChecklist";
import { TextField } from "./TextField";
import type { RoleBuiltinKind } from "./RolesPanel";
export type RoleEditorProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Immutable built-in marking; null when editing or creating a custom role. */
    builtin?: RoleBuiltinKind | null;
    name: string;
    description: string;
    options: readonly PermissionChecklistOption[];
    /** Ids of the permissions the role currently allows. */
    selectedPermissions: readonly string[];
    /** Transient save error shown under the form. */
    error?: string;
    onNameChange?: (value: string) => void;
    onDescriptionChange?: (value: string) => void;
    onTogglePermission?: (id: string, checked: boolean) => void;
};
/**
 * C-069 RoleEditor — the form body for creating or editing one role: name and
 * description fields over the permission allow-list. A built-in role shows its
 * immutable Admin/Member marking and a note that it can be renamed and re-scoped
 * but never deleted. Fully controlled; the host modal owns the footer actions.
 */
export function RoleEditor(props: RoleEditorProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "builtin",
        "name",
        "description",
        "options",
        "selectedPermissions",
        "error",
        "onNameChange",
        "onDescriptionChange",
        "onTogglePermission",
    ]);
    return (
        <Box
            {...rest}
            className={["happy2-role-editor", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="role-editor"
            style={local.style}
        >
            {local.builtin
                ? ((kind) => (
                      <Box
                          className="happy2-role-editor__builtin"
                          data-happy2-ui="role-editor-builtin"
                      >
                          <Badge
                              label={kind === "admin" ? "Built-in · Admin" : "Built-in · Member"}
                              variant={kind === "admin" ? "accent" : "info"}
                          />
                          <span className="happy2-role-editor__builtin-note">
                              {kind === "admin"
                                  ? "The built-in administrator role. It can be renamed and its access edited, but it cannot be deleted."
                                  : "The built-in role every member holds. It can be renamed and its access edited, but it cannot be deleted or unassigned."}
                          </span>
                      </Box>
                  ))(local.builtin)
                : null}
            <FormRow
                control={
                    <TextField
                        fullWidth
                        onValueChange={(value) => local.onNameChange?.(value)}
                        placeholder="e.g. Support"
                        value={local.name}
                    />
                }
                description="Shown wherever the role appears."
                label="Name"
                layout="stacked"
            />
            <FormRow
                control={
                    <TextField
                        fullWidth
                        onValueChange={(value) => local.onDescriptionChange?.(value)}
                        placeholder="e.g. Can see the member directory"
                        value={local.description}
                    />
                }
                description="Optional. Explains who should hold the role."
                label="Description"
                layout="stacked"
            />
            <Box className="happy2-role-editor__permissions">
                <Box className="happy2-role-editor__permissions-head">
                    <span className="happy2-role-editor__permissions-label">Permissions</span>
                    <span className="happy2-role-editor__permissions-note">
                        Members holding the role are allowed everything checked here.
                    </span>
                </Box>
                <PermissionChecklist
                    onToggle={local.onTogglePermission}
                    options={local.options}
                    selected={local.selectedPermissions}
                />
            </Box>
            {local.error
                ? ((reason) => (
                      <Banner tone="danger" title="Could not save role">
                          {reason}
                      </Banner>
                  ))(local.error)
                : null}
        </Box>
    );
}
