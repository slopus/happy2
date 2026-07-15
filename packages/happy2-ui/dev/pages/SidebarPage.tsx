import type { JSX } from "solid-js";
import { Avatar } from "../../src/Avatar";
import { Button } from "../../src/Button";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const workspaceSections: SidebarSection[] = [
    {
        id: "views",
        items: [
            { badge: 12, icon: "inbox", id: "inbox", kind: "view", label: "Inbox" },
            { icon: "tasks", id: "my-issues", kind: "view", label: "My issues", meta: "7" },
            { icon: "spark", id: "agent-runs", kind: "view", label: "Agent runs", meta: "3" },
            { icon: "eye", id: "watching", kind: "view", label: "Watching" },
        ],
    },
    {
        action: { icon: "plus", label: "Add channel" },
        id: "channels",
        items: [
            { id: "launch-week", kind: "channel", label: "launch-week" },
            { badge: 4, id: "eng-core", kind: "channel", label: "eng-core" },
            { id: "design", kind: "channel", label: "design" },
            { id: "support-fires", kind: "channel", label: "support-fires", meta: "muted" },
        ],
        label: "Channels",
    },
    {
        action: { icon: "plus", label: "Add agent" },
        id: "agents",
        items: [
            {
                id: "claude",
                initials: "CL",
                kind: "agent",
                label: "Claude",
                status: "ready",
                tone: "ember",
            },
            {
                id: "codex",
                initials: "CX",
                kind: "agent",
                label: "Codex",
                status: "working",
                tone: "mint",
            },
            {
                id: "triage-bot",
                initials: "TB",
                kind: "agent",
                label: "Triage bot",
                status: "ready",
                tone: "violet",
            },
        ],
        label: "Agents",
    },
    {
        id: "direct",
        items: [
            {
                id: "maya",
                initials: "MJ",
                kind: "person",
                label: "Maya Johnson",
                online: true,
                tone: "rose",
            },
            {
                id: "arun",
                initials: "AP",
                kind: "person",
                label: "Arun Patel",
                meta: "12m",
                tone: "ocean",
            },
            {
                badge: 2,
                id: "sofia",
                initials: "SR",
                kind: "person",
                label: "Sofía Reyes",
                online: true,
                tone: "amber",
            },
            { id: "invite", kind: "action", label: "Invite teammates" },
        ],
        label: "Direct",
    },
];

const treatmentSections: SidebarSection[] = [
    {
        id: "states",
        items: [
            { icon: "inbox", id: "active", kind: "view", label: "Active row" },
            { icon: "home", id: "resting", kind: "view", label: "Resting row" },
            { badge: 9, id: "unread", kind: "channel", label: "unread-channel" },
            { icon: "clock", id: "meta", kind: "view", label: "Meta trailing", meta: "4h" },
        ],
        label: "Row states",
    },
    {
        id: "kinds",
        items: [
            { icon: "files", id: "kind-view", kind: "view", label: "View — 16px icon" },
            { id: "kind-channel", kind: "channel", label: "channel — hash" },
            {
                id: "kind-person",
                initials: "MJ",
                kind: "person",
                label: "Person — xs avatar",
                online: true,
                tone: "rose",
            },
            {
                id: "kind-agent",
                initials: "CX",
                kind: "agent",
                label: "Agent — working",
                status: "working",
                tone: "mint",
            },
            { id: "kind-action", kind: "action", label: "Action — muted plus" },
        ],
        label: "Row kinds",
    },
];

function FooterUser() {
    return (
        <div
            style={{
                "align-items": "center",
                display: "flex",
                gap: "10px",
                width: "100%",
            }}
        >
            <Avatar initials="SK" online size="sm" tone="ocean" />
            <div style={{ display: "flex", "flex-direction": "column", "min-width": "0" }}>
                <span
                    style={{
                        color: "var(--happy2-text)",
                        "font-size": "13px",
                        "font-weight": "600",
                        "line-height": "16px",
                    }}
                >
                    Sasha K.
                </span>
                <span
                    style={{
                        color: "var(--happy2-text-muted)",
                        "font-size": "11px",
                        "line-height": "14px",
                    }}
                >
                    Online
                </span>
            </div>
            <Button
                aria-label="Preferences"
                icon="settings"
                iconOnly
                size="small"
                style={{ "margin-left": "auto", "margin-right": "-6px" }}
                variant="ghost"
            />
        </div>
    );
}

function Frame(props: { children: JSX.Element; height: number }) {
    return (
        <div
            style={{
                border: "1px solid var(--happy2-border)",
                display: "flex",
                height: `${props.height}px`,
                overflow: "hidden",
                width: "max-content",
            }}
        >
            {props.children}
        </div>
    );
}

export function SidebarPage() {
    return (
        <ComponentPage
            number="C-009"
            summary="288px workspace navigation column — header with workspace switcher, sectioned rows for views, channels, people, agents, and actions, actionable empty states, and an optional footer."
            title="Sidebar"
        >
            <Specimen
                detail="288 wide · header 52 · rows 32 on a 2px rhythm · footer 52 with top hairline"
                label="Full workspace sidebar"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                    <Frame height={620}>
                        <Sidebar
                            activeItemId="inbox"
                            footer={<FooterUser />}
                            onItemSelect={() => {}}
                            onSectionAction={() => {}}
                            sections={workspaceSections}
                            subtitle="12 members · 3 agents"
                            title="Acme Studio"
                        />
                    </Frame>
                    <DimensionRule label="288 px wide · 620 px viewport" />
                </div>
            </Specimen>

            <Specimen
                detail="Active = raised + 600 · unread = 700 + accent CountBadge · meta 11px muted · agent status dots"
                label="Row treatments and kinds"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                    <Frame height={392}>
                        <Sidebar
                            activeItemId="active"
                            onItemSelect={() => {}}
                            sections={treatmentSections}
                            title="Row anatomy"
                        />
                    </Frame>
                    <DimensionRule label="row 32 px · radius 6 · pad 0 10 · gap 8" />
                </div>
            </Specimen>

            <Specimen
                detail="No subtitle, no footer, unlabelled section — body starts on the 8px pad"
                label="Minimal"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                    <Frame height={220}>
                        <Sidebar
                            activeItemId="second"
                            onItemSelect={() => {}}
                            sections={[
                                {
                                    id: "only",
                                    items: [
                                        {
                                            icon: "home",
                                            id: "first",
                                            kind: "view",
                                            label: "Overview",
                                        },
                                        {
                                            icon: "inbox",
                                            id: "second",
                                            kind: "view",
                                            label: "Inbox",
                                            badge: 3,
                                        },
                                        {
                                            icon: "settings",
                                            id: "third",
                                            kind: "view",
                                            label: "Settings",
                                        },
                                    ],
                                },
                            ]}
                            title="Minimal"
                        />
                    </Frame>
                    <DimensionRule label="header 52 px · body x-pad 8 px" />
                </div>
            </Specimen>

            <Specimen
                detail="Empty sections keep their heading, explain what is missing, and expose a full text action"
                label="Empty channels and direct messages"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                    <Frame height={320}>
                        <Sidebar
                            activeItemId=""
                            onCompose={() => {}}
                            onItemSelect={() => {}}
                            onSectionAction={() => {}}
                            sections={[
                                {
                                    action: { icon: "plus", label: "Add channel" },
                                    empty: {
                                        actionLabel: "Create a channel",
                                        description: "Channels keep your team's work in one place.",
                                        icon: "hash",
                                        title: "No channels yet",
                                    },
                                    id: "channels",
                                    items: [],
                                    label: "Channels",
                                },
                                {
                                    action: { icon: "edit", label: "New message" },
                                    empty: {
                                        actionLabel: "Start a conversation",
                                        description: "Message a teammate to start a direct chat.",
                                        icon: "chat",
                                        title: "No direct messages",
                                    },
                                    id: "dms",
                                    items: [],
                                    label: "Direct messages",
                                },
                            ]}
                            title="Empty workspace"
                        />
                    </Frame>
                    <DimensionRule label="empty copy 11/16 · action 28 px" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
