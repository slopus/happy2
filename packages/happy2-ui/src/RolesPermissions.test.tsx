import { expect, it, vi } from "vitest";
import "./styles.css";
import { MemberAccessPanel } from "./MemberAccessPanel";
import { PermissionChecklist, type PermissionChecklistOption } from "./PermissionChecklist";
import { RoleEditor } from "./RoleEditor";
import { RolesPanel } from "./RolesPanel";
import { createRenderer } from "./testing";

const options: readonly PermissionChecklistOption[] = [
    {
        id: "manageSecrets",
        label: "Manage secrets",
        description: "Create and delete agent secrets and their values.",
    },
    {
        id: "viewAllMembers",
        label: "View all members",
        description: "See every server member.",
    },
];

it("holds role and permission administration geometry, markings, and action boundaries", async () => {
    const toggled = vi.fn();
    const selected = vi.fn();
    const deleted = vi.fn();
    const unassigned = vi.fn();
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ display: "flex", width: "520px", height: "100%", background: "#17161c" }}>
                <PermissionChecklist
                    data-testid="permissions"
                    onToggle={toggled}
                    options={options}
                    selected={["manageSecrets"]}
                />
            </div>
        ),
        { width: 520, height: 150 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", width: "920px", height: "100%", background: "#17161c" }}>
                <RolesPanel
                    data-testid="roles"
                    onDeleteRole={deleted}
                    onOpenCreate={() => undefined}
                    onSelectRole={selected}
                    roles={[
                        {
                            id: "admins",
                            name: "Admins",
                            builtin: "admin",
                            permissions: ["Manage secrets", "View all members"],
                            memberCount: 1,
                        },
                        {
                            id: "support",
                            name: "Support",
                            description: "Handles member requests",
                            builtin: null,
                            permissions: ["View all members"],
                            memberCount: 3,
                        },
                    ]}
                />
            </div>
        ),
        { width: 920, height: 270 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", width: "560px", height: "100%", background: "#17161c" }}>
                <RoleEditor
                    builtin="member"
                    description="All server members"
                    name="Members"
                    onDescriptionChange={() => undefined}
                    onNameChange={() => undefined}
                    onTogglePermission={() => undefined}
                    options={options}
                    selectedPermissions={[]}
                />
            </div>
        ),
        { width: 560, height: 620 },
    );
    view.render(
        () => (
            <div style={{ display: "flex", width: "560px", height: "100%", background: "#17161c" }}>
                <MemberAccessPanel
                    assignedRoles={[
                        {
                            id: "members",
                            name: "Members",
                            builtin: "member",
                            removable: false,
                        },
                        { id: "support", name: "Support", builtin: null, removable: true },
                    ]}
                    availableRoles={[]}
                    directGrants={["manageSecrets"]}
                    effective={["Manage secrets"]}
                    grantOptions={options}
                    onAssignRole={() => undefined}
                    onToggleGrant={() => undefined}
                    onUnassignRole={unassigned}
                />
            </div>
        ),
        { width: 560, height: 650 },
    );
    await view.ready();

    const checklist = view.$('[data-testid="permissions"]');
    expect(checklist.computedStyles(["display", "flex-direction", "gap"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "12px",
    });
    const permissionInput = checklist.element.querySelector(
        '[data-permission-id="viewAllMembers"] input',
    ) as HTMLInputElement;
    permissionInput.click();
    expect(toggled).toHaveBeenCalledWith("viewAllMembers", true);

    const roles = view.$('[data-testid="roles"]');
    expect(roles.computedStyle("display")).toBe("flex");
    const adminRow = roles.element.querySelector('[data-row-id="admins"]') as HTMLElement;
    const supportRow = roles.element.querySelector('[data-row-id="support"]') as HTMLElement;
    expect(adminRow.querySelector('[data-happy2-ui="data-table-actions"] button')).toBeNull();
    const deleteButton = supportRow.querySelector(
        '[data-happy2-ui="data-table-actions"] button',
    ) as HTMLButtonElement;
    deleteButton.click();
    expect(deleted).toHaveBeenCalledWith("support");
    supportRow.click();
    expect(selected).toHaveBeenCalledWith("support");

    expect(view.container.textContent).toContain("Built-in · Member");
    expect(view.container.textContent).toContain("it cannot be deleted or unassigned");
    expect(
        view.container.querySelector('[data-role-id="members"] button'),
        "built-in Members cannot be unassigned",
    ).toBeNull();
    const supportUnassign = view.container.querySelector(
        '[data-role-id="support"] button',
    ) as HTMLButtonElement;
    supportUnassign.click();
    expect(unassigned).toHaveBeenCalledWith("support");

    await view.screenshot("RolesPermissions.test");
}, 120_000);
