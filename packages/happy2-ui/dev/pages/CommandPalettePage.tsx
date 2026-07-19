import { type ReactNode } from "react";
import { Banner } from "../../src/Banner";
import { CommandPalette } from "../../src/CommandPalette";
import { EmptyState } from "../../src/EmptyState";
import { SearchResults, type SearchResultGroup } from "../../src/SearchResults";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const overflowGroups: SearchResultGroup[] = (["channel", "user", "message", "file"] as const).map(
    (type) => ({
        type,
        results: Array.from({ length: 5 }, (_, index) => ({
            id: `${type}-${index + 1}`,
            title: `${type} result ${index + 1} for calm`,
            meta: `Workspace match ${index + 1}`,
        })),
    }),
);

function PaletteFrame(props: { children: ReactNode; query: string }) {
    return (
        <CommandPalette
            autoFocus={false}
            onClose={() => {}}
            onQueryChange={() => {}}
            placeholder="Search Happy (2)…"
            query={props.query}
        >
            {props.children}
        </CommandPalette>
    );
}

function PaletteSpecimen(props: {
    children: ReactNode;
    detail: string;
    label: string;
    number: string;
    query: string;
}) {
    return (
        <Specimen detail={props.detail} label={props.label} number={props.number} stage="app">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <DimensionRule label="640 × 461 fixed frame · 60px header" />
                <PaletteFrame query={props.query}>{props.children}</PaletteFrame>
            </div>
        </Specimen>
    );
}

export function CommandPalettePage() {
    return (
        <ComponentPage
            number="C-060"
            summary="Top-anchored Slack-style ⌘K palette — a fixed 640 × 461 card with its own focused search input over a stable-gutter scrollport. Renders the card only; ModalOverlay owns its dim, stacking, and placement."
            title="Command palette"
        >
            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="genuinely overflowing grouped results · stable thin scrollbar · 5px nested last corner"
                    label="Overflowing results"
                    number="CP-01"
                    query="calm"
                >
                    <SearchResults groups={overflowGroups} query="calm" variant="flush" />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="empty query · inline state stays near the top of the result body"
                    label="Idle"
                    number="CP-02"
                    query=""
                >
                    <EmptyState
                        description="Find channels, people, messages, and files across your workspace."
                        icon="search"
                        size="inline"
                        title="Search Happy (2)"
                    />
                </PaletteSpecimen>
                <PaletteSpecimen
                    detail="in-flight query · inline state preserves the top visual target"
                    label="Searching"
                    number="CP-03"
                    query="relay"
                >
                    <EmptyState
                        description="Searching the workspace for “relay”."
                        icon="search"
                        size="inline"
                        title="Searching…"
                    />
                </PaletteSpecimen>
            </div>

            <div className="specimen-grid">
                <PaletteSpecimen
                    detail="completed query without matches · compact inline state"
                    label="No results"
                    number="CP-04"
                    query="cobalt"
                >
                    <EmptyState
                        description="No channels, people, messages, or files match “cobalt”."
                        icon="search"
                        size="inline"
                        title="No results"
                    />
                </PaletteSpecimen>
                <PaletteSpecimen
                    detail="terminal search failure · error remains at the top of the body"
                    label="Error"
                    number="CP-05"
                    query="relay"
                >
                    <Banner tone="danger" title="Search unavailable">
                        The workspace search index could not be reached.
                    </Banner>
                </PaletteSpecimen>
            </div>
        </ComponentPage>
    );
}
