import { type ReactNode } from "react";
import { type TabItem, Tabs, type TabsSize } from "../../src/Tabs";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const inboxTabs: TabItem[] = [
    { id: "all", label: "All", icon: "inbox" },
    { id: "unread", label: "Unread", badge: 3 },
    { id: "mentions", label: "Mentions", icon: "at", badge: 12 },
    { id: "threads", label: "Threads", icon: "thread" },
    { id: "reactions", label: "Reactions" },
];
const adminTabs: TabItem[] = [
    { id: "members", label: "Members", badge: 128 },
    { id: "bans", label: "Bans", badge: 4 },
    { id: "audit", label: "Audit log" },
    { id: "backups", label: "Backups" },
];
function Bar(props: { active: string; size?: TabsSize; tabs: TabItem[]; width?: number }) {
    return (
        <div style={{ width: `${props.width ?? 560}px` }}>
            <Tabs activeId={props.active} onSelect={() => {}} size={props.size} tabs={props.tabs} />
        </div>
    );
}
function Stack(props: { children: ReactNode; rule: string }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "24px" }}>
            {props.children}
            <DimensionRule label={props.rule} />
        </div>
    );
}
export function TabsPage() {
    return (
        <ComponentPage
            number="C-025"
            summary="Horizontal tab bar on a bottom hairline — leading icons, trailing count badges, and a 2px accent underline on the active tab. Three contract heights."
            title="Tabs"
        >
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen detail="32px high · 12px label" label="Small" number="T-01" stage="app">
                    <Stack rule="height 32 · pad 0 12 · gap 6">
                        <Bar active="unread" size="small" tabs={inboxTabs} width={520} />
                    </Stack>
                </Specimen>
                <Specimen detail="40px high · 13px label" label="Medium" number="T-02" stage="app">
                    <Stack rule="height 40 · pad 0 14 · gap 8">
                        <Bar active="unread" size="medium" tabs={inboxTabs} width={520} />
                    </Stack>
                </Specimen>
                <Specimen detail="48px high · 14px label" label="Large" number="T-03" stage="app">
                    <Stack rule="height 48 · pad 0 16 · gap 8">
                        <Bar active="unread" size="large" tabs={inboxTabs} width={520} />
                    </Stack>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="leading icon · trailing CountBadge · plain label"
                    label="Tab content"
                    number="T-04"
                    stage="surface"
                >
                    <Stack rule="icon 16 · label 13 · badge 18 · gap 8">
                        <Bar active="mentions" tabs={inboxTabs} />
                    </Stack>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="active underline sweeps · 2px accent overlapping the hairline"
                    label="Active states"
                    number="T-05"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
                            padding: "24px",
                        }}
                    >
                        <Bar active="all" tabs={inboxTabs} />
                        <Bar active="mentions" tabs={inboxTabs} />
                        <Bar active="reactions" tabs={inboxTabs} />
                        <DimensionRule label="underline 2px · accent #8b7cf7 · bottom -1" />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="2–5 tabs · count badges 4 / 12 / 128 · accent when active"
                    label="Counts and arity"
                    number="T-06"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "20px",
                            padding: "24px",
                        }}
                    >
                        <Bar
                            active="a"
                            tabs={[
                                { id: "a", label: "Overview" },
                                { id: "b", label: "Activity", badge: 9 },
                            ]}
                            width={360}
                        />
                        <Bar active="members" tabs={adminTabs} width={440} />
                        <DimensionRule label="badge tone: accent active · neutral idle" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
