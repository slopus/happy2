import { RoleEditor } from "../../src/RoleEditor";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const options = [
    {
        id: "manageSecrets",
        label: "Manage secrets",
        description: "Create and delete agent secrets and their values.",
    },
    {
        id: "managePlugins",
        label: "Manage plugins",
        description: "Browse the plugin catalog and install plugins.",
    },
    {
        id: "viewAllMembers",
        label: "View all members",
        description: "See every member, including banned and deactivated accounts.",
    },
    {
        id: "manageAdminRoles",
        label: "Manage roles & grants",
        description: "Create roles and change member roles and permissions.",
    },
];

export function RoleEditorPage() {
    return (
        <ComponentPage
            number="C-069"
            summary="Role form body: stacked name/description fields over the permission allow-list; built-in roles show their immutable marking and an explanatory note."
            title="Role editor"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="custom role draft · 432px form column"
                    label="Custom role"
                    number="C-069·A"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            width: "432px",
                            padding: "24px",
                        }}
                    >
                        <DimensionRule label="width 432" />
                        <RoleEditor
                            description="Can see the member directory"
                            name="Support"
                            onDescriptionChange={() => {}}
                            onNameChange={() => {}}
                            onTogglePermission={() => {}}
                            options={options}
                            selectedPermissions={["viewAllMembers"]}
                        />
                    </div>
                </Specimen>
            </div>
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="immutable admin marking with note"
                    label="Built-in admin"
                    number="C-069·B"
                    stage="surface"
                >
                    <div style={{ width: "432px", padding: "24px" }}>
                        <RoleEditor
                            builtin="admin"
                            description="Full server administration"
                            name="Admins"
                            onDescriptionChange={() => {}}
                            onNameChange={() => {}}
                            onTogglePermission={() => {}}
                            options={options}
                            selectedPermissions={[
                                "manageSecrets",
                                "managePlugins",
                                "viewAllMembers",
                            ]}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="immutable member marking"
                    label="Built-in member"
                    number="C-069·C"
                    stage="surface"
                >
                    <div style={{ width: "432px", padding: "24px" }}>
                        <RoleEditor
                            builtin="member"
                            description="Every human profile"
                            name="Members"
                            onDescriptionChange={() => {}}
                            onNameChange={() => {}}
                            onTogglePermission={() => {}}
                            options={options}
                            selectedPermissions={[]}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="save failure banner under the form"
                    label="Error"
                    number="C-069·D"
                    stage="surface"
                >
                    <div style={{ width: "432px", padding: "24px" }}>
                        <RoleEditor
                            description=""
                            error="name must be between 1 and 100 safe characters"
                            name=""
                            onDescriptionChange={() => {}}
                            onNameChange={() => {}}
                            onTogglePermission={() => {}}
                            options={options}
                            selectedPermissions={[]}
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
