import { type ReactNode } from "react";
import { Avatar } from "../../src/Avatar";
import { Button } from "../../src/Button";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const workspaceSections: SidebarSection[] = [
    {
        id: "views",
        items: [
            { badge: 12, icon: "inbox", id: "inbox", kind: "view", label: "Inbox", unread: true },
            { icon: "tasks", id: "my-issues", kind: "view", label: "My issues", meta: "7" },
            { icon: "spark", id: "agent-runs", kind: "view", label: "Agent runs", meta: "3" },
            { icon: "eye", id: "watching", kind: "view", label: "Watching" },
        ],
    },
    {
        action: { icon: "plus", label: "Add channel" },
        id: "shared",
        items: [
            { id: "launch-week", kind: "channel", label: "launch-week" },
            { depth: 1, id: "launch-week-ios", kind: "channel", label: "ios-rollout" },
            {
                archived: true,
                depth: 1,
                id: "launch-week-legacy",
                kind: "channel",
                label: "legacy-notes",
            },
            { badge: 4, id: "eng-core", kind: "channel", label: "eng-core", unread: true },
            { depth: 1, id: "eng-core-infra", kind: "channel", label: "infra", unread: true },
            { id: "design", kind: "channel", label: "design" },
            { archived: true, id: "support-fires", kind: "channel", label: "support-fires" },
        ],
        label: "Shared",
    },
    {
        action: { icon: "plus", label: "Add channel" },
        id: "private",
        items: [
            { icon: "lock", id: "founders", kind: "channel", label: "founders" },
            { depth: 1, icon: "lock", id: "founders-hiring", kind: "channel", label: "hiring" },
            {
                badge: 2,
                icon: "lock",
                id: "security",
                kind: "channel",
                label: "security",
                unread: true,
            },
        ],
        label: "Private",
    },
    {
        id: "humans",
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
                unread: true,
            },
            { id: "invite", kind: "action", label: "Invite teammates" },
        ],
        label: "Humans",
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
];
/* A tiny inline photo so the blueprint shows the image-avatar row state. */
const PHOTO =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==";
const treatmentSections: SidebarSection[] = [
    {
        id: "states",
        items: [
            { icon: "inbox", id: "active", kind: "view", label: "Active row" },
            { icon: "home", id: "resting", kind: "view", label: "Resting row" },
            { id: "unread", kind: "channel", label: "unread-channel", unread: true },
            { icon: "clock", id: "meta", kind: "view", label: "Meta trailing", meta: "4h" },
        ],
        label: "Row states",
    },
    {
        id: "kinds",
        items: [
            { icon: "files", id: "kind-view", kind: "view", label: "View — 16px icon" },
            { id: "kind-channel", kind: "channel", label: "channel — hash" },
            { icon: "lock", id: "kind-channel-lock", kind: "channel", label: "channel — lock" },
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
            {
                id: "kind-person-photo",
                imageUrl: PHOTO,
                initials: "MJ",
                kind: "person",
                label: "Person — photo avatar",
                online: true,
                tone: "rose",
            },
            {
                id: "kind-agent-photo",
                imageUrl: PHOTO,
                initials: "CX",
                kind: "agent",
                label: "Agent — photo avatar",
                tone: "mint",
            },
            { id: "kind-action", kind: "action", label: "Action — muted plus" },
        ],
        label: "Row kinds",
    },
];
/* Footer composition used by the app: profile control, then the permission-gated
   Administration cog, then the appearance toggle. Administration is icon-only and
   sits directly before the theme control. */
function FooterUser() {
    return (
        <div
            style={{
                alignItems: "center",
                display: "flex",
                gap: "4px",
                width: "100%",
            }}
        >
            <div
                style={{
                    alignItems: "center",
                    display: "flex",
                    flex: "1 1 auto",
                    gap: "10px",
                    minWidth: "0",
                }}
            >
                <Avatar initials="SK" online size="sm" tone="ocean" />
                <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                    <span
                        style={{
                            color: "var(--happy2-text)",
                            fontSize: "13px",
                            fontWeight: "600",
                            lineHeight: "16px",
                        }}
                    >
                        Sasha K.
                    </span>
                    <span
                        style={{
                            color: "var(--happy2-text-muted)",
                            fontSize: "11px",
                            lineHeight: "14px",
                        }}
                    >
                        Online
                    </span>
                </div>
            </div>
            <Button
                aria-label="Administration"
                icon="settings"
                iconOnly
                size="small"
                variant="ghost"
            />
            <Button
                aria-label="Use light appearance"
                icon="moon"
                iconOnly
                size="small"
                variant="ghost"
            />
        </div>
    );
}
function Frame(props: { children: ReactNode; height: number }) {
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
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
                detail="Drill-down level: back button + title replace the brand; body animates in. Used for the administration sub-navigation."
                label="Back / drill-down header"
                number="01b"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={460}>
                        <Sidebar
                            activeItemId="users"
                            footer={<FooterUser />}
                            onBack={() => {}}
                            onItemSelect={() => {}}
                            sections={[
                                {
                                    id: "admin",
                                    items: [
                                        {
                                            id: "users",
                                            kind: "view",
                                            icon: "users",
                                            label: "Users",
                                        },
                                        {
                                            id: "reports",
                                            kind: "view",
                                            icon: "shield",
                                            label: "Reports",
                                        },
                                        {
                                            id: "automations",
                                            kind: "view",
                                            icon: "zap",
                                            label: "Automations",
                                        },
                                        {
                                            id: "integrations",
                                            kind: "view",
                                            icon: "link",
                                            label: "Integrations",
                                        },
                                        {
                                            id: "plugins",
                                            kind: "view",
                                            icon: "braces",
                                            label: "Plugins",
                                        },
                                        {
                                            id: "roles",
                                            kind: "view",
                                            icon: "shield",
                                            label: "Roles",
                                        },
                                    ],
                                },
                            ]}
                            title="Administration"
                        />
                    </Frame>
                    <DimensionRule label="back chevron 28px · title 15/700 · sub-nav rows" />
                </div>
            </Specimen>

            <Specimen
                detail="Active = raised + 600 · unread = 700 + dot · direct mention = numeric CountBadge · meta 11px muted"
                label="Row treatments and kinds"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={460}>
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
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
                                            unread: true,
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
                detail="Empty sections keep their heading and expose one compact contextual action"
                label="Empty channels and direct messages"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={380}>
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
                                        description:
                                            "Shared channels keep your team's work in one place.",
                                        icon: "hash",
                                        title: "No shared channels yet",
                                    },
                                    id: "shared",
                                    items: [],
                                    label: "Shared",
                                },
                                {
                                    action: { icon: "plus", label: "Add channel" },
                                    empty: {
                                        actionLabel: "Create a channel",
                                        description:
                                            "Private channels are visible only to members.",
                                        icon: "lock",
                                        title: "No private channels yet",
                                    },
                                    id: "private",
                                    items: [],
                                    label: "Private",
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
                                    label: "Humans",
                                },
                            ]}
                            title="Empty workspace"
                        />
                    </Frame>
                    <DimensionRule label="empty row 28 px · copy 11/15 · ghost action" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
