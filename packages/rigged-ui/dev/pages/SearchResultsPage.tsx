import { SearchResults, type SearchResultGroup } from "../../src/SearchResults";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const groups: SearchResultGroup[] = [
    {
        type: "channel",
        results: [
            { id: "launch-week", title: "launch-week", meta: "128 members · Product" },
            { id: "launch-planning", title: "launch-planning", meta: "12 members · Private" },
        ],
    },
    {
        type: "user",
        results: [
            {
                id: "maya",
                title: "Maya Johnson",
                meta: "@maya · Design lead",
                avatar: { initials: "MJ", tone: "rose" },
            },
            {
                id: "jun",
                title: "Jun Park",
                meta: "@jun · Launch engineering",
                avatar: { initials: "JP", tone: "ocean" },
            },
        ],
    },
    {
        type: "message",
        results: [
            {
                id: "m1",
                title: "Kicking off launch week planning",
                meta: "#launch-week · Maya · 2h",
                avatar: { initials: "MJ", tone: "rose" },
            },
            {
                id: "m2",
                title: [
                    { kind: "text", text: "See the " },
                    { kind: "mention", text: "launch" },
                    { kind: "text", text: " checklist before the sync" },
                ],
                meta: "#general · Jun · 5h",
                icon: "chat",
            },
        ],
    },
];

export function SearchResultsPage() {
    return (
        <ComponentPage
            number="C-036"
            summary="Grouped unified search: message / channel / user rows with query highlight."
            title="Search results"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="400px card · 28px group heads · 44px rows · accent highlight"
                    label="Grouped results"
                    number="C-036-A"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "8px", padding: "28px" }}>
                        <div style={{ width: "400px" }}>
                            <DimensionRule label="width 400" />
                        </div>
                        <SearchResults groups={groups} onSelect={() => {}} query="launch" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="channel = hash tile · user = avatar · message = author + snippet"
                    label="Row types"
                    number="C-036-B"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "24px", padding: "28px" }}>
                        <SearchResults groups={[groups[0]!]} onSelect={() => {}} query="launch" />
                        <SearchResults groups={[groups[1]!]} onSelect={() => {}} query="jun" />
                        <SearchResults groups={[groups[2]!]} onSelect={() => {}} query="launch" />
                    </div>
                </Specimen>

                <Specimen
                    detail="no matches · centered muted notice"
                    label="Empty"
                    number="C-036-C"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <SearchResults
                            emptyLabel="No results for “launch”"
                            groups={[]}
                            query="launch"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
