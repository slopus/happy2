import { CommandPalette } from "../../src/CommandPalette";
import { EmptyState } from "../../src/EmptyState";
import { SearchResults, type SearchResultGroup } from "../../src/SearchResults";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const groups: SearchResultGroup[] = [
    {
        type: "channel",
        results: [
            { id: "launch", title: "launch-week", meta: "Coordinating the winter release" },
            { id: "design", title: "design-system", meta: "Relay tokens and blueprint" },
        ],
    },
    {
        type: "user",
        results: [
            {
                id: "ada",
                title: "Ada Lovelace",
                meta: "@ada",
                avatar: { initials: "AL", tone: "brand" },
            },
        ],
    },
    {
        type: "message",
        results: [
            {
                id: "m1",
                title: "Shipping the palette behind the ⌘K shortcut today",
                meta: "launch-week · Ada Lovelace",
                icon: "chat",
            },
        ],
    },
];

export function CommandPalettePage() {
    return (
        <ComponentPage
            number="C-060"
            summary="Slack-style ⌘K palette — a 640px card with its own focused search input over a scrollable result body, split by a hairline. Renders the card only; a host composes it inside ModalOverlay for its dim and centering."
            title="Command palette"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="640 wide · 60px input row · flush results body"
                    label="With results"
                    number="CP-01"
                    stage="app"
                >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                        <DimensionRule label="width 640" />
                        <CommandPalette
                            autoFocus={false}
                            onClose={() => {}}
                            onQueryChange={() => {}}
                            placeholder="Search Happy (2)…"
                            query="launch"
                        >
                            <SearchResults groups={groups} query="launch" variant="flush" />
                        </CommandPalette>
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="empty query prompt before any input"
                    label="Empty"
                    number="CP-02"
                    stage="app"
                >
                    <CommandPalette
                        autoFocus={false}
                        onClose={() => {}}
                        onQueryChange={() => {}}
                        placeholder="Search Happy (2)…"
                        query=""
                    >
                        <EmptyState
                            description="Find channels, people, messages, and files across your workspace."
                            icon="search"
                            title="Search Happy (2)"
                        />
                    </CommandPalette>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
