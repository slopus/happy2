import { PermissionChecklist } from "../../src/PermissionChecklist";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const options = [
    {
        id: "manageSecrets",
        label: "Manage secrets",
        description: "Create and delete agent secrets and their values.",
    },
    {
        id: "assignSecrets",
        label: "Assign secrets",
        description: "Attach and detach existing secrets on agents and channels.",
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

export function PermissionChecklistPage() {
    return (
        <ComponentPage
            number="C-067"
            summary="Closed allow-list editor: an 18px checkbox per capability with a 13px name over a muted 12px description, rows on a 12px gap."
            title="Permission checklist"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="18px checkbox · 10px gap to text · 12px row gap"
                    label="Mixed selection"
                    number="C-067·A"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            width: "360px",
                            padding: "24px",
                        }}
                    >
                        <DimensionRule label="width 360" />
                        <PermissionChecklist
                            onToggle={() => {}}
                            options={options}
                            selected={["manageSecrets", "viewAllMembers"]}
                        />
                    </div>
                </Specimen>
            </div>
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="nothing allowed"
                    label="Empty selection"
                    number="C-067·B"
                    stage="surface"
                >
                    <div style={{ width: "320px", padding: "24px" }}>
                        <PermissionChecklist onToggle={() => {}} options={options} selected={[]} />
                    </div>
                </Specimen>
                <Specimen
                    detail="everything allowed"
                    label="Full selection"
                    number="C-067·C"
                    stage="surface"
                >
                    <div style={{ width: "320px", padding: "24px" }}>
                        <PermissionChecklist
                            onToggle={() => {}}
                            options={options}
                            selected={options.map((option) => option.id)}
                        />
                    </div>
                </Specimen>
                <Specimen detail="read-only rows" label="Disabled" number="C-067·D" stage="surface">
                    <div style={{ width: "320px", padding: "24px" }}>
                        <PermissionChecklist
                            disabled
                            options={options}
                            selected={["assignSecrets"]}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="label only, no description"
                    label="Compact options"
                    number="C-067·E"
                    stage="surface"
                >
                    <div style={{ width: "320px", padding: "24px" }}>
                        <PermissionChecklist
                            onToggle={() => {}}
                            options={options.map(({ id, label }) => ({ id, label }))}
                            selected={["manageSecrets"]}
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
