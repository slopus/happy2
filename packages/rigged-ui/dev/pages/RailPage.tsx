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
            summary="The 76px feature rail: happy otter brand, icon+label destinations with unread badges, a replaceable brand slot, and a footer avatar with equal side/bottom clearance."
            title="Rail"
        >
            <Specimen
                detail="76px wide · transparent chrome · 10px top / 20px bottom padding"
                label="Rail — full geometry"
                number="01"
                stage="chrome"
            >
                <div style={row}>
                    <div style={{ height: "560px" }}>
                        <Rail
                            activeItemId={activeId()}
                            footer={<Avatar initials="SK" online size="sm" tone="mint" />}
                            footerLabel="Open profile"
                            items={items}
                            onFooterSelect={() => setActiveId("profile")}
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
                        <DimensionRule label="otter brand 34 × 34" />
                        <DimensionRule label="items 60 × 52 · radius 8" />
                        <DimensionRule label="icon 20 px + label 10/700" />
                        <DimensionRule label="footer avatar · 20 px left / right / bottom" />
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
                detail="custom brand content replaces the default otter · footer slot holds the profile avatar"
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
