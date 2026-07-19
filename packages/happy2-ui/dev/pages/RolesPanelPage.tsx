import { RolesPanel, type RoleListItem } from "../../src/RolesPanel";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const roles: RoleListItem[] = [
    {
        id: "admins",
        name: "Admins",
        description: "Full server administration",
        builtin: "admin",
        permissions: [
            "Manage secrets",
            "Assign secrets",
            "Manage images",
            "Assign images to chats",
            "Manage plugins",
            "View all members",
        ],
        memberCount: 2,
    },
    {
        id: "members",
        name: "Members",
        description: "Every human profile",
        builtin: "member",
        permissions: [],
        memberCount: 14,
    },
    {
        id: "support",
        name: "Support",
        description: "Can see the member directory",
        builtin: null,
        permissions: ["View all members"],
        memberCount: 3,
    },
    {
        id: "operators",
        name: "Plugin operators",
        builtin: null,
        permissions: ["Manage plugins", "Manage images", "Assign images to chats"],
        memberCount: 1,
    },
];

export function RolesPanelPage() {
    return (
        <ComponentPage
            number="C-068"
            summary="Administrator surface for server roles: name/description rows, permission-badge previews collapsing into +N, member counts, and immutable built-in markings."
            title="Roles panel"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="built-in accent/info badges · custom neutral · Delete on custom rows only"
                    label="Catalog"
                    number="C-068·A"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            width: "880px",
                            padding: "24px",
                        }}
                    >
                        <DimensionRule label="width 880" />
                        <RolesPanel
                            onDeleteRole={() => {}}
                            onOpenCreate={() => {}}
                            onSelectRole={() => {}}
                            roles={roles}
                            subtitle="Named permission sets assigned to members. Built-in roles can be renamed but never deleted."
                        />
                    </div>
                </Specimen>
            </div>
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="dismissible danger banner above the table"
                    label="Action error"
                    number="C-068·B"
                    stage="surface"
                >
                    <div style={{ width: "720px", padding: "24px" }}>
                        <RolesPanel
                            actionError="A built-in role cannot be deleted"
                            onDeleteRole={() => {}}
                            onDismissActionError={() => {}}
                            onOpenCreate={() => {}}
                            onSelectRole={() => {}}
                            roles={roles.slice(0, 2)}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="empty state with create action"
                    label="Empty"
                    number="C-068·C"
                    stage="surface"
                >
                    <div style={{ width: "720px", padding: "24px" }}>
                        <RolesPanel onOpenCreate={() => {}} roles={[]} />
                    </div>
                </Specimen>
                <Specimen detail="first load" label="Loading" number="C-068·D" stage="surface">
                    <div style={{ width: "720px", padding: "24px" }}>
                        <RolesPanel loading roles={[]} />
                    </div>
                </Specimen>
                <Specimen
                    detail="fatal load failure"
                    label="Error"
                    number="C-068·E"
                    stage="surface"
                >
                    <div style={{ width: "720px", padding: "24px" }}>
                        <RolesPanel error="You are not allowed to administer roles." roles={[]} />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
