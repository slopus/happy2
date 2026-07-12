import { createSignal } from "solid-js";
import { Avatar } from "../../src/Avatar";
import { Rail, type RailItem } from "../../src/Rail";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const items: RailItem[] = [
    { badge: 12, icon: "inbox", id: "inbox", label: "Inbox" },
    { icon: "chat", id: "chat", label: "Chat" },
    { icon: "spark", id: "agents", label: "Agents" },
    { icon: "tasks", id: "tasks", label: "Tasks" },
    { icon: "files", id: "files", label: "Files" },
];

const row: Record<string, string> = {
    display: "flex",
    gap: "32px",
    "align-items": "flex-start",
};

export function RailPage() {
    const [activeId, setActiveId] = createSignal("inbox");

    return (
        <ComponentPage
            number="C-008"
            summary="The 76px feature rail: brand mark, icon+label destinations with unread badges, and a footer slot pinned to the bottom. The app shell composes it left of the sidebar."
            title="Rail"
        >
            <Specimen
                detail="76px wide · full height · chrome bg · right hairline · padding 10px 0"
                label="Rail — full geometry"
                number="01"
                stage="chrome"
            >
                <div style={row}>
                    <div style={{ height: "560px" }}>
                        <Rail
                            activeItemId={activeId()}
                            footer={<Avatar initials="SK" online size="sm" tone="mint" />}
                            items={items}
                            onItemSelect={setActiveId}
                        />
                    </div>
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            gap: "12px",
                            "padding-top": "8px",
                        }}
                    >
                        <DimensionRule label="76 px wide" />
                        <DimensionRule label="brand 34 px · radius 10" />
                        <DimensionRule label="items 60 × 52 · radius 8" />
                        <DimensionRule label="icon 20 px + label 10/700" />
                        <DimensionRule label="footer pinned · 10 px inset" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                detail="Inactive muted · active accent-soft bg + accent-strong icon + solid label · unread CountBadge overlaps icon top-right"
                label="Item states"
                number="02"
                stage="chrome"
            >
                <div style={row}>
                    <div style={{ height: "252px" }}>
                        <Rail
                            activeItemId="chat"
                            items={items.slice(0, 4)}
                            onItemSelect={() => {}}
                        />
                    </div>
                    <div style={{ height: "252px" }}>
                        <Rail
                            activeItemId="inbox"
                            items={items.slice(0, 4)}
                            onItemSelect={() => {}}
                        />
                    </div>
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            gap: "12px",
                            "padding-top": "8px",
                        }}
                    >
                        <DimensionRule label="active = accent-soft · aria-current" />
                        <DimensionRule label="badge 18 px pill · +13/-7 overlap" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                detail="brand slot replaces the default R mark · footer slot holds the profile avatar"
                label="Slots"
                number="03"
                stage="chrome"
            >
                <div style={row}>
                    <div style={{ height: "320px" }}>
                        <Rail
                            activeItemId="agents"
                            brand={<Avatar initials="AC" size="md" tone="ocean" type="agent" />}
                            footer={<Avatar initials="MJ" online size="sm" tone="rose" />}
                            items={items.slice(0, 3)}
                            onItemSelect={() => {}}
                        />
                    </div>
                    <div style={{ height: "320px" }}>
                        <Rail
                            activeItemId="tasks"
                            items={items.slice(2, 5)}
                            onItemSelect={() => {}}
                        />
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
