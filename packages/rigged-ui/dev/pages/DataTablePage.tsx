import { Avatar } from "../../src/Avatar";
import { Badge, type BadgeVariant } from "../../src/Badge";
import { Button } from "../../src/Button";
import { DataTable, type DataTableColumn, type DataTableRow } from "../../src/DataTable";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const roleVariant: Record<string, BadgeVariant> = {
    Owner: "accent",
    Admin: "info",
    Member: "neutral",
};

function nameCell(initials: string, tone: Parameters<typeof Avatar>[0]["tone"], name: string) {
    return (
        <span style={{ display: "inline-flex", "align-items": "center", gap: "8px" }}>
            <Avatar initials={initials} size="xs" tone={tone} />
            <span>{name}</span>
        </span>
    );
}

function roleCell(role: string) {
    return <Badge label={role.toUpperCase()} variant={roleVariant[role] ?? "neutral"} />;
}

const columns: DataTableColumn[] = [
    { id: "name", header: "Name", width: 240 },
    { id: "email", header: "Email", width: 220 },
    { id: "role", header: "Role", width: 120 },
    { id: "seats", header: "Seats", align: "end", width: 96 },
    { id: "active", header: "Last active", align: "end", width: 140 },
];

const people: {
    id: string;
    initials: string;
    tone: Parameters<typeof Avatar>[0]["tone"];
    name: string;
    email: string;
    role: string;
    seats: string;
    active: string;
    selected?: boolean;
}[] = [
    {
        id: "ada",
        initials: "AL",
        tone: "violet",
        name: "Ada Lovelace",
        email: "ada@relay.dev",
        role: "Owner",
        seats: "12",
        active: "2m ago",
        selected: true,
    },
    {
        id: "grace",
        initials: "GH",
        tone: "mint",
        name: "Grace Hopper",
        email: "grace@relay.dev",
        role: "Admin",
        seats: "8",
        active: "1h ago",
    },
    {
        id: "alan",
        initials: "AT",
        tone: "ocean",
        name: "Alan Turing",
        email: "alan@relay.dev",
        role: "Member",
        seats: "3",
        active: "yesterday",
    },
];

function rows(options?: { selectable?: boolean }): DataTableRow[] {
    return people.map((person) => ({
        id: person.id,
        selected: options?.selectable ? person.selected : undefined,
        cells: {
            name: nameCell(person.initials, person.tone, person.name),
            email: person.email,
            role: roleCell(person.role),
            seats: person.seats,
            active: person.active,
        },
    }));
}

export function DataTablePage() {
    return (
        <ComponentPage
            number="C-030"
            summary="Columns + rows admin table — alignment, selection, row actions, dense mode, and an empty slot."
            title="Data table"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="header 40 · rows 48 · numeric column right-aligned"
                    label="Basic"
                    number="DT-01"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "8px", width: "760px", padding: "24px" }}>
                        <DimensionRule label="header 40 · row 48" />
                        <DataTable columns={columns} rows={rows()} />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="checkbox column · select-all shows indeterminate"
                    label="Selectable"
                    number="DT-02"
                    stage="surface"
                >
                    <div style={{ width: "804px", padding: "24px" }}>
                        <DataTable columns={columns} rows={rows({ selectable: true })} selectable />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="trailing row-actions slot · right-aligned"
                    label="Row actions"
                    number="DT-03"
                    stage="surface"
                >
                    <div style={{ width: "856px", padding: "24px" }}>
                        <DataTable
                            columns={columns}
                            rowActions={() => (
                                <>
                                    <Button
                                        aria-label="Edit"
                                        icon="edit"
                                        iconOnly
                                        size="small"
                                        variant="ghost"
                                    />
                                    <Button
                                        aria-label="More"
                                        icon="more"
                                        iconOnly
                                        size="small"
                                        variant="ghost"
                                    />
                                </>
                            )}
                            rows={rows({ selectable: true })}
                            selectable
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen detail="dense — 36px rows" label="Dense" number="DT-04" stage="surface">
                    <div style={{ display: "grid", gap: "8px", width: "760px", padding: "24px" }}>
                        <DimensionRule label="header 36 · row 36" />
                        <DataTable columns={columns} dense rows={rows()} />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="long text truncates with an ellipsis inside its column"
                    label="Truncation"
                    number="DT-05"
                    stage="surface"
                >
                    <div style={{ width: "360px", padding: "24px" }}>
                        <DataTable
                            columns={[
                                { id: "path", header: "Repository", width: 200 },
                                { id: "branch", header: "Branch", width: 120 },
                            ]}
                            rows={[
                                {
                                    id: "1",
                                    cells: {
                                        path: "relay-workspace/services/collaboration-server",
                                        branch: "feature/expanded-server-api",
                                    },
                                },
                            ]}
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="empty slot when there are no rows"
                    label="Empty"
                    number="DT-06"
                    stage="surface"
                >
                    <div style={{ width: "520px", padding: "24px" }}>
                        <DataTable
                            columns={[
                                { id: "name", header: "Name", width: 260 },
                                { id: "role", header: "Role", width: 120 },
                            ]}
                            empty={
                                <span
                                    style={{ color: "var(--rg-text-muted)", "font-size": "13px" }}
                                >
                                    No members match this filter.
                                </span>
                            }
                            rows={[]}
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
