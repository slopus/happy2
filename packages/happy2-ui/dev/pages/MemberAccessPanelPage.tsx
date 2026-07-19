import { MemberAccessPanel } from "../../src/MemberAccessPanel";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const grantOptions = [
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
];

export function MemberAccessPanelPage() {
    return (
        <ComponentPage
            number="C-070"
            summary="One member's access detail: effective-permission badges (owner allow-all marking), removable role rows with an assign picker, and the editable direct-grant allow-list."
            title="Member access panel"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="roles with built-in markings · assign picker · direct grants"
                    label="Member"
                    number="C-070·A"
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
                        <MemberAccessPanel
                            assignedRoles={[
                                {
                                    id: "members",
                                    name: "Members",
                                    builtin: "member",
                                    removable: false,
                                },
                                { id: "support", name: "Support", builtin: null },
                            ]}
                            availableRoles={[
                                { value: "admins", label: "Admins" },
                                { value: "operators", label: "Plugin operators" },
                            ]}
                            directGrants={["manageSecrets"]}
                            effective={["Manage secrets", "View all members"]}
                            grantOptions={grantOptions}
                            onAssignRole={() => {}}
                            onToggleGrant={() => {}}
                            onUnassignRole={() => {}}
                        />
                    </div>
                </Specimen>
            </div>
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="accent owner card · implicit allow-all"
                    label="Owner"
                    number="C-070·B"
                    stage="surface"
                >
                    <div style={{ width: "432px", padding: "24px" }}>
                        <MemberAccessPanel
                            assignedRoles={[
                                {
                                    id: "members",
                                    name: "Members",
                                    builtin: "member",
                                    removable: false,
                                },
                                { id: "admins", name: "Admins", builtin: "admin" },
                            ]}
                            availableRoles={[{ value: "support", label: "Support" }]}
                            directGrants={[]}
                            effective={["Manage secrets", "Manage plugins", "View all members"]}
                            grantOptions={grantOptions}
                            onAssignRole={() => {}}
                            onToggleGrant={() => {}}
                            onUnassignRole={() => {}}
                            owner
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="no roles beyond Members · no access"
                    label="No access"
                    number="C-070·C"
                    stage="surface"
                >
                    <div style={{ width: "432px", padding: "24px" }}>
                        <MemberAccessPanel
                            assignedRoles={[
                                {
                                    id: "members",
                                    name: "Members",
                                    builtin: "member",
                                    removable: false,
                                },
                            ]}
                            availableRoles={[{ value: "support", label: "Support" }]}
                            directGrants={[]}
                            effective={[]}
                            grantOptions={grantOptions}
                            onAssignRole={() => {}}
                            onToggleGrant={() => {}}
                            onUnassignRole={() => {}}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="dismissible action failure"
                    label="Action error"
                    number="C-070·D"
                    stage="surface"
                >
                    <div style={{ width: "432px", padding: "24px" }}>
                        <MemberAccessPanel
                            actionError="The owner must remain an administrator"
                            assignedRoles={[
                                {
                                    id: "members",
                                    name: "Members",
                                    builtin: "member",
                                    removable: false,
                                },
                                { id: "admins", name: "Admins", builtin: "admin" },
                            ]}
                            directGrants={[]}
                            effective={["Manage secrets"]}
                            grantOptions={grantOptions}
                            onAssignRole={() => {}}
                            onDismissActionError={() => {}}
                            onToggleGrant={() => {}}
                            onUnassignRole={() => {}}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="detail request in flight"
                    label="Loading"
                    number="C-070·E"
                    stage="surface"
                >
                    <div style={{ width: "432px", padding: "24px" }}>
                        <MemberAccessPanel
                            assignedRoles={[]}
                            directGrants={[]}
                            effective={[]}
                            grantOptions={grantOptions}
                            loading
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="fatal detail failure"
                    label="Error"
                    number="C-070·F"
                    stage="surface"
                >
                    <div style={{ width: "432px", padding: "24px" }}>
                        <MemberAccessPanel
                            assignedRoles={[]}
                            directGrants={[]}
                            effective={[]}
                            error="You are not allowed to administer roles."
                            grantOptions={grantOptions}
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
