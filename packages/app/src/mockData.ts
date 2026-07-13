import type {
    AgentRun,
    AgentRunAction,
    ApprovalRequest,
    AutomationCardProps,
    Availability,
    BadgeVariant,
    CallParticipant,
    ChannelMember,
    DataTableColumn,
    DeskListItem,
    DeskRun,
    DiffLine,
    EmojiItem,
    IconName,
    MediaItem,
    MemberItem,
    MemberRole,
    MentionableAgent,
    MessageReaction,
    MessageSegment,
    ModerationReportCardProps,
    NotificationItem,
    ProfileCardProps,
    ProfileStatus,
    RailItem,
    SearchResultGroup,
    SidebarSection,
    StatTileProps,
    ThreadItem,
    ToneName,
} from "rigged-ui";

/* ---- Rail ---------------------------------------------------------------- */

export const railItems: RailItem[] = [
    { id: "home", icon: "home", label: "Home" },
    { id: "chat", icon: "chat", label: "Chat" },
    { id: "activity", icon: "bell", label: "Activity", badge: 3 },
    { id: "threads", icon: "thread", label: "Threads" },
    { id: "files", icon: "files", label: "Files" },
    { id: "calls", icon: "mic", label: "Calls" },
    { id: "admin", icon: "shield", label: "Admin" },
];

export type FeatureEmptyState = {
    description: string;
    icon: IconName;
    title: string;
};

export const featureEmptyStates: Record<string, FeatureEmptyState> = {
    home: {
        icon: "home",
        title: "Home",
        description: "Your day at a glance — nothing needs you right now.",
    },
    activity: {
        icon: "bell",
        title: "Activity",
        description: "Mentions, replies, reactions, and system events collect here.",
    },
    files: {
        icon: "files",
        title: "Files",
        description: "Shared files and diffs from agent runs will land here.",
    },
    calls: {
        icon: "mic",
        title: "Calls",
        description: "Start a call or review your recent call history.",
    },
    admin: {
        icon: "shield",
        title: "Admin",
        description: "Manage members, moderation, automations, and integrations.",
    },
    you: {
        icon: "at",
        title: "You",
        description: "Your profile, status, and workspace preferences.",
    },
};

/* ---- Sidebar -------------------------------------------------------------- */

export const chatSections: SidebarSection[] = [
    {
        id: "views",
        items: [
            { id: "inbox", kind: "view", icon: "inbox", label: "Inbox", badge: 12 },
            { id: "my-issues", kind: "view", icon: "tasks", label: "My issues" },
            { id: "agent-runs", kind: "view", icon: "spark", label: "Agent runs" },
        ],
    },
    {
        id: "channels",
        label: "Channels",
        action: { icon: "plus", label: "Add channel" },
        items: [
            { id: "launch-week", kind: "channel", label: "launch-week" },
            { id: "eng-core", kind: "channel", label: "eng-core", badge: 4 },
            { id: "design", kind: "channel", label: "design" },
            { id: "support-fires", kind: "channel", label: "support-fires" },
        ],
    },
    {
        id: "dms",
        label: "Direct messages",
        items: [
            {
                id: "maya-chen",
                kind: "person",
                label: "Maya Chen",
                initials: "MC",
                tone: "ember",
                online: true,
            },
            {
                id: "theo-grant",
                kind: "person",
                label: "Theo Grant",
                initials: "TG",
                tone: "ocean",
            },
            {
                id: "nora-kim",
                kind: "person",
                label: "Nora Kim",
                initials: "NK",
                tone: "rose",
                online: true,
            },
        ],
    },
    {
        id: "agents",
        label: "Agents",
        action: { icon: "plus", label: "Add agent" },
        items: [
            {
                id: "forge",
                kind: "agent",
                label: "Forge",
                initials: "F",
                tone: "ember",
                status: "working",
            },
            {
                id: "scout",
                kind: "agent",
                label: "Scout",
                initials: "S",
                tone: "ocean",
                status: "ready",
            },
            {
                id: "patch",
                kind: "agent",
                label: "Patch",
                initials: "P",
                tone: "violet",
                status: "ready",
            },
        ],
    },
];

/* ---- Agents --------------------------------------------------------------- */

export const mentionableAgents: MentionableAgent[] = [
    {
        id: "forge",
        name: "Forge",
        initials: "F",
        tone: "ember",
        status: "working",
        description: "Implements scoped product and engineering work",
    },
    {
        id: "scout",
        name: "Scout",
        initials: "S",
        tone: "ocean",
        status: "ready",
        description: "Researches context and synthesizes findings",
    },
    {
        id: "patch",
        name: "Patch",
        initials: "P",
        tone: "violet",
        status: "ready",
        description: "Tests changes and verifies acceptance criteria",
    },
];

/* ---- Conversations --------------------------------------------------------- */

export type Conversation = {
    agentCount?: number;
    composerPlaceholder: string;
    icon?: "hash" | "spark" | "inbox";
    id: string;
    intro?: { description: string; title: string };
    memberCount?: number;
    members?: ChannelMember[];
    title: string;
    topic?: string;
};

const channelPlaceholder = (name: string) =>
    `Message #${name} — @ mention an agent to hand off work…`;

export const conversations: Record<string, Conversation> = {
    inbox: {
        id: "inbox",
        title: "Inbox",
        icon: "inbox",
        topic: "Mentions, review requests, and approvals",
        composerPlaceholder: "Jot a note to yourself…",
        intro: {
            title: "Nothing new since 11:02",
            description:
                "Review requests from Forge and Scout are waiting in #launch-week and #eng-core.",
        },
    },
    "my-issues": {
        id: "my-issues",
        title: "My issues",
        icon: "inbox",
        topic: "Issues assigned to you",
        composerPlaceholder: "Jot a note to yourself…",
        intro: {
            title: "Two issues on your plate",
            description:
                "MOB-217 is in review with Forge; ENG-482 is waiting on your sanity check.",
        },
    },
    "agent-runs": {
        id: "agent-runs",
        title: "Agent runs",
        icon: "spark",
        topic: "Every run across the workspace",
        composerPlaceholder: "Jot a note to yourself…",
        intro: {
            title: "Two runs in flight",
            description:
                "Patch is on the device farm and Forge is drafting release notes — follow along in the agent desk.",
        },
    },
    "launch-week": {
        id: "launch-week",
        title: "launch-week",
        icon: "hash",
        topic: "Ship mobile v2 by Friday",
        members: [
            { initials: "MC", tone: "ember" },
            { initials: "TG", tone: "ocean" },
            { initials: "NK", tone: "rose" },
            { initials: "ST", tone: "brand" },
        ],
        memberCount: 4,
        agentCount: 3,
        composerPlaceholder: channelPlaceholder("launch-week"),
        intro: {
            title: "Welcome to #launch-week",
            description:
                "The push to get mobile v2 out the door by Friday. Humans plan, agents ship.",
        },
    },
    "eng-core": {
        id: "eng-core",
        title: "eng-core",
        icon: "hash",
        topic: "Platform, infra, and the boring load-bearing parts",
        members: [
            { initials: "TG", tone: "ocean" },
            { initials: "MC", tone: "ember" },
            { initials: "S", tone: "ocean", type: "agent" },
        ],
        memberCount: 12,
        agentCount: 2,
        composerPlaceholder: channelPlaceholder("eng-core"),
        intro: {
            title: "Welcome to #eng-core",
            description: "Platform and infrastructure work — flaky tests come here to die.",
        },
    },
    design: {
        id: "design",
        title: "design",
        icon: "hash",
        topic: "Mocks, crits, and polish for mobile v2",
        members: [
            { initials: "NK", tone: "rose" },
            { initials: "MC", tone: "ember" },
        ],
        memberCount: 5,
        composerPlaceholder: channelPlaceholder("design"),
        intro: {
            title: "Everyone’s all here in #design",
            description: "Mocks, crits, and polish for the mobile v2 surfaces. Quiet so far today.",
        },
    },
    "support-fires": {
        id: "support-fires",
        title: "support-fires",
        icon: "hash",
        topic: "Escalations that can’t wait for triage",
        members: [
            { initials: "NK", tone: "rose" },
            { initials: "ST", tone: "brand" },
        ],
        memberCount: 6,
        agentCount: 1,
        composerPlaceholder: channelPlaceholder("support-fires"),
        intro: {
            title: "Welcome to #support-fires",
            description: "Escalations land here first. If it’s smoking, say so.",
        },
    },
    "maya-chen": {
        id: "maya-chen",
        title: "Maya Chen",
        topic: "Direct message",
        members: [
            { initials: "MC", tone: "ember" },
            { initials: "ST", tone: "brand" },
        ],
        composerPlaceholder: "Message Maya Chen",
        intro: {
            title: "Maya Chen",
            description: "This conversation is just between you and Maya Chen.",
        },
    },
    "theo-grant": {
        id: "theo-grant",
        title: "Theo Grant",
        topic: "Direct message",
        members: [
            { initials: "TG", tone: "ocean" },
            { initials: "ST", tone: "brand" },
        ],
        composerPlaceholder: "Message Theo Grant",
        intro: {
            title: "Theo Grant",
            description: "This conversation is just between you and Theo Grant.",
        },
    },
    "nora-kim": {
        id: "nora-kim",
        title: "Nora Kim",
        topic: "Direct message",
        members: [
            { initials: "NK", tone: "rose" },
            { initials: "ST", tone: "brand" },
        ],
        composerPlaceholder: "Message Nora Kim",
        intro: {
            title: "Nora Kim",
            description: "This conversation is just between you and Nora Kim.",
        },
    },
    forge: {
        id: "forge",
        title: "Forge",
        icon: "spark",
        topic: "Implements scoped product and engineering work",
        composerPlaceholder: "Message Forge — describe the work to hand off…",
        intro: {
            title: "This is your direct line to Forge",
            description:
                "Hand off scoped work with @Forge in any channel, or brief it privately here.",
        },
    },
    scout: {
        id: "scout",
        title: "Scout",
        icon: "spark",
        topic: "Researches context and synthesizes findings",
        composerPlaceholder: "Message Scout — ask for research or context…",
        intro: {
            title: "This is your direct line to Scout",
            description: "Ask for research, code archaeology, or a summary of any thread.",
        },
    },
    patch: {
        id: "patch",
        title: "Patch",
        icon: "spark",
        topic: "Tests changes and verifies acceptance criteria",
        composerPlaceholder: "Message Patch — point it at something to verify…",
        intro: {
            title: "This is your direct line to Patch",
            description: "Point it at a branch or a build and it will report back with evidence.",
        },
    },
};

/* ---- Thread entries --------------------------------------------------------- */

export type RunAttachment = {
    kind: "run";
    actions?: AgentRunAction[];
    diff?: { file: string; lines: DiffLine[]; stats?: { added: number; removed: number } };
    run: AgentRun;
};

export type ApprovalAttachment = {
    kind: "approval";
    request: ApprovalRequest;
};

export type EventAttachment = {
    kind: "event";
    event: {
        badge?: { label: string; variant: BadgeVariant };
        from?: string;
        icon?: IconName;
        meta?: string;
        time?: string;
        title: string;
        to?: string;
    };
};

export type MessageAttachment = ApprovalAttachment | EventAttachment | RunAttachment;

export type ThreadMessage = {
    kind: "message";
    agent?: boolean;
    attachment?: MessageAttachment;
    author: string;
    body: string | MessageSegment[];
    conversationId: string;
    id: string;
    initials?: string;
    reactions?: MessageReaction[];
    replyCount?: number;
    time: string;
    tone?: ToneName;
};

export type ThreadDivider = {
    kind: "divider";
    conversationId: string;
    id: string;
    label: string;
};

export type ThreadEntry = ThreadDivider | ThreadMessage;

const coldStartDiff: DiffLine[] = [
    { kind: "meta", text: "@@ -18,7 +18,9 @@ export async function registerForPush() {" },
    { kind: "context", number: 18, text: "export async function registerForPush() {" },
    { kind: "del", number: 19, text: "    const token = await requestPushToken();" },
    { kind: "add", number: 19, text: "    await handshake.settled;" },
    {
        kind: "add",
        number: 20,
        text: "    const token = await requestPushToken({ retry: isColdStart() });",
    },
    { kind: "context", number: 21, text: "    return api.registerDevice(token);" },
    { kind: "context", number: 22, text: "}" },
];

const authFlakeDiff: DiffLine[] = [
    { kind: "meta", text: "@@ -41,6 +41,7 @@ async refresh(token: Token) {" },
    { kind: "context", number: 41, text: "async refresh(token: Token) {" },
    { kind: "del", number: 42, text: "    const lock = await mutex.tryLock();" },
    {
        kind: "add",
        number: 42,
        text: "    const lock = await mutex.lock({ timeout: 5_000, jitter: true });",
    },
    { kind: "add", number: 43, text: "    if (!lock) return queue.enqueue(token);" },
    { kind: "context", number: 44, text: "    try {" },
];

export const initialEntries: ThreadEntry[] = [
    /* ---- #launch-week ---- */
    { kind: "divider", id: "lw-today", conversationId: "launch-week", label: "Today" },
    {
        kind: "message",
        id: "lw-1",
        conversationId: "launch-week",
        author: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "10:42",
        body: [
            {
                kind: "text",
                text: "Standup: the notifications bug is the last blocker for Friday. ",
            },
            { kind: "mention", text: "Forge" },
            { kind: "text", text: " can you take " },
            { kind: "code", text: "MOB-217" },
            { kind: "text", text: " and loop in " },
            { kind: "mention", text: "Patch" },
            { kind: "text", text: " for verification?" },
        ],
    },
    {
        kind: "message",
        id: "lw-2",
        conversationId: "launch-week",
        author: "Forge",
        initials: "F",
        tone: "ember",
        agent: true,
        time: "10:43",
        body: "On it. Reproduced the drop — push-token registration races the handshake on cold start, so the token is registered before the exchange settles.",
        attachment: {
            kind: "event",
            event: {
                icon: "bell",
                title: "Push notifications drop on cold start",
                meta: "MOB-217 · Urgent",
                from: "In progress",
                to: "In review",
                time: "10:43",
            },
        },
    },
    {
        kind: "message",
        id: "lw-3",
        conversationId: "launch-week",
        author: "Forge",
        initials: "F",
        tone: "ember",
        agent: true,
        time: "10:51",
        body: "Fix is up — moved registration behind the handshake promise and added a cold-start retry.",
        reactions: [
            { emoji: "🚀", count: 2 },
            { emoji: "👀", count: 1 },
        ],
        attachment: {
            kind: "run",
            run: {
                agent: "Forge",
                initials: "F",
                tone: "ember",
                title: "Fix cold-start push registration",
                branch: "agent/forge/cold-start-push",
                status: "review",
                stats: { added: 86, removed: 17, files: 3, note: "tests passing" },
                steps: [
                    { label: "Reproduce the cold-start race", status: "done" },
                    { label: "Move registration behind the handshake", status: "done" },
                    { label: "Add cold-start retry with backoff", status: "done" },
                    { label: "Run the push notification suite", status: "done" },
                ],
            },
            actions: [
                { id: "review-diff", label: "Review diff", variant: "primary" },
                { id: "open-eng-core", label: "Open in #eng-core", variant: "secondary" },
            ],
            diff: {
                file: "src/push/register.ts",
                stats: { added: 3, removed: 1 },
                lines: coldStartDiff,
            },
        },
    },
    {
        kind: "message",
        id: "lw-4",
        conversationId: "launch-week",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "10:54",
        body: "Reviewing now. If the device farm comes back green we’re clear for Friday.",
        replyCount: 2,
    },
    {
        kind: "message",
        id: "lw-5",
        conversationId: "launch-week",
        author: "Forge",
        initials: "F",
        tone: "ember",
        agent: true,
        time: "10:56",
        body: "One thing before merge — the rollout flag lives in the shared release manifest, which is outside the scope you granted. Pausing here.",
        attachment: {
            kind: "approval",
            request: {
                agent: "Forge",
                initials: "F",
                tone: "ember",
                title: "Update shared release manifest",
                typeLabel: "Scope expansion",
                reason: "Register the cold-start fix for the mobile v2 release train without touching any other rollout settings.",
                action: "edit config/releases/mobile.json",
                impact: "One shared configuration file. Applies to the next mobile build and can be reverted before release.",
                resources: ["Shared config", "1 file", "Reversible"],
            },
        },
    },
    {
        kind: "message",
        id: "lw-6",
        conversationId: "launch-week",
        author: "Patch",
        initials: "P",
        tone: "violet",
        agent: true,
        time: "11:02",
        body: "Verification run complete — cold start, warm start, and reinstall all deliver notifications.",
        reactions: [{ emoji: "✅", count: 3 }],
        attachment: {
            kind: "run",
            run: {
                agent: "Patch",
                initials: "P",
                tone: "violet",
                title: "Device farm verification",
                status: "complete",
                stats: { files: 1, steps: 4, note: "all scenarios passing" },
                steps: [
                    { label: "Cold-start delivery on iPhone 15", status: "done" },
                    { label: "Warm-start delivery on Pixel 9", status: "done" },
                    { label: "Reinstall and re-register", status: "done" },
                    { label: "Regression sweep on notifications", status: "done" },
                ],
            },
        },
    },

    /* ---- #eng-core ---- */
    { kind: "divider", id: "ec-today", conversationId: "eng-core", label: "Today" },
    {
        kind: "message",
        id: "ec-1",
        conversationId: "eng-core",
        author: "Scout",
        initials: "S",
        tone: "ocean",
        agent: true,
        time: "9:58",
        body: "Finished the auth-flake run. The flake came from two workers racing the refresh mutex — refreshes now go through a queue with jittered backoff. 200/200 runs green.",
        attachment: {
            kind: "run",
            run: {
                agent: "Scout",
                initials: "S",
                tone: "ocean",
                title: "Fix flaky auth token refresh tests",
                branch: "agent/scout/auth-flake",
                status: "review",
                stats: { added: 164, removed: 38, files: 6, steps: 12, note: "all tests passing" },
                steps: [
                    { label: "Reproduce the flake locally (14/200 fails)", status: "done" },
                    { label: "Trace the race in the token refresh mutex", status: "done" },
                    { label: "Rewrite refresh queue with jittered backoff", status: "done" },
                    { label: "200/200 local runs green · CI passing", status: "done" },
                ],
            },
            actions: [{ id: "review-diff", label: "Review diff", variant: "primary" }],
            diff: {
                file: "src/auth/refresh.ts",
                stats: { added: 2, removed: 1 },
                lines: authFlakeDiff,
            },
        },
    },
    {
        kind: "message",
        id: "ec-2",
        conversationId: "eng-core",
        author: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "10:12",
        body: [
            { kind: "mention", text: "Scout" },
            {
                kind: "text",
                text: " can you sanity-check the retry logic before this ships? The backoff cap feels low while ",
            },
            { kind: "code", text: "ENG-482" },
            { kind: "text", text: " is still open." },
        ],
    },

    /* ---- #support-fires ---- */
    { kind: "divider", id: "sf-today", conversationId: "support-fires", label: "Today" },
    {
        kind: "message",
        id: "sf-1",
        conversationId: "support-fires",
        author: "Nora Kim",
        initials: "NK",
        tone: "rose",
        time: "9:12",
        body: [
            {
                kind: "text",
                text: "Two overnight reports of login loops on Android 15 — grouped them into ",
            },
            { kind: "code", text: "SUP-91" },
            { kind: "text", text: ", severity medium." },
        ],
    },
    {
        kind: "message",
        id: "sf-2",
        conversationId: "support-fires",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "9:20",
        body: "Thanks — hold it in triage until the push fix lands. It smells like the same token race.",
    },

    /* ---- DM: Maya Chen ---- */
    { kind: "divider", id: "mc-today", conversationId: "maya-chen", label: "Today" },
    {
        kind: "message",
        id: "mc-1",
        conversationId: "maya-chen",
        author: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "9:31",
        body: "Morning! Still on for the launch review at 3?",
    },
    {
        kind: "message",
        id: "mc-2",
        conversationId: "maya-chen",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "9:33",
        body: "Yes — I’ll bring the device-farm results. Forge’s fix should be in review by then.",
    },
    {
        kind: "message",
        id: "mc-3",
        conversationId: "maya-chen",
        author: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "9:34",
        body: "Perfect. I’ll pull the release-notes draft into the doc before we meet.",
    },

    /* ---- DM: Theo Grant ---- */
    { kind: "divider", id: "tg-today", conversationId: "theo-grant", label: "Today" },
    {
        kind: "message",
        id: "tg-1",
        conversationId: "theo-grant",
        author: "Theo Grant",
        initials: "TG",
        tone: "ocean",
        time: "8:47",
        body: [
            { kind: "text", text: "The rate limiter change from " },
            { kind: "code", text: "ENG-479" },
            { kind: "text", text: " is merged — I’m watching the dashboards this morning." },
        ],
    },
    {
        kind: "message",
        id: "tg-2",
        conversationId: "theo-grant",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "8:52",
        body: "Nice. Ping me if p95 moves; otherwise roll it out to the edge pool after lunch.",
    },

    /* ---- DM: Nora Kim ---- */
    { kind: "divider", id: "nk-today", conversationId: "nora-kim", label: "Today" },
    {
        kind: "message",
        id: "nk-1",
        conversationId: "nora-kim",
        author: "Nora Kim",
        initials: "NK",
        tone: "rose",
        time: "9:05",
        body: "Support queue is quiet — 12 open tickets, nothing urgent.",
    },
    {
        kind: "message",
        id: "nk-2",
        conversationId: "nora-kim",
        author: "Steve",
        initials: "ST",
        tone: "brand",
        time: "9:08",
        body: "Great. Keep an eye on SUP-91 — it may resolve itself once the push fix ships.",
    },
    {
        kind: "message",
        id: "nk-3",
        conversationId: "nora-kim",
        author: "Nora Kim",
        initials: "NK",
        tone: "rose",
        time: "9:09",
        body: "Will do.",
    },
];

/* ---- Agent desk -------------------------------------------------------------- */

export const deskRunning: DeskRun[] = [
    {
        id: "patch-device-farm",
        agent: "Patch",
        initials: "P",
        tone: "violet",
        title: "Device farm run",
        eta: "4m left",
        progress: 62,
        detail: "iPhone 15 ✓ · Pixel 9 ✓ · iPhone SE running…",
    },
    {
        id: "forge-release-notes",
        agent: "Forge",
        initials: "F",
        tone: "ember",
        title: "Release notes draft",
        progress: 30,
        detail: "Pulling merged PRs since v2.3.1…",
    },
];

export const deskQueued: DeskListItem[] = [
    { id: "weekly-triage", title: "Weekly triage sweep", meta: "Fri 9:00" },
    { id: "backport-v22", title: "Backport fix to v2.2", meta: "after review" },
];

export const deskDone: DeskListItem[] = [
    { id: "eng-479", title: "ENG-479 rate limiter fix", meta: "merged" },
    { id: "sup-88", title: "SUP-88 triage summary", meta: "posted" },
];

export const composerHint = "Enter to send · Shift+Enter for a new line";

/* ---- Home: stat tiles + notifications ------------------------------------- */

export const homeStats: StatTileProps[] = [
    {
        label: "Unread",
        value: "18",
        icon: "inbox",
        tone: "accent",
        delta: { value: "6 today", trend: "up" },
    },
    {
        label: "Mentions",
        value: "4",
        icon: "at",
        tone: "warning",
        delta: { value: "2 new", trend: "up" },
        hint: "Across 3 channels",
    },
    {
        label: "Agent runs",
        value: "12",
        icon: "spark",
        tone: "success",
        delta: { value: "3 active", trend: "flat" },
    },
    {
        label: "Storage",
        value: "6.2 GB",
        icon: "files",
        tone: "neutral",
        delta: { value: "of 20 GB", trend: "flat" },
        hint: "31% used",
    },
];

export const notifications: NotificationItem[] = [
    {
        id: "n-1",
        kind: "mention",
        actor: { name: "Maya Chen", initials: "MC", tone: "ember" },
        text: [
            { kind: "mention", text: "you" },
            { kind: "text", text: " can you take " },
            { kind: "code", text: "MOB-217" },
            { kind: "text", text: " to review?" },
        ],
        context: "#launch-week",
        time: "2m",
        unread: true,
    },
    {
        id: "n-2",
        kind: "thread_reply",
        actor: { name: "Forge", initials: "F", tone: "ember" },
        text: "Replied in the cold-start push thread",
        context: "#launch-week · MOB-217",
        time: "10m",
        unread: true,
    },
    {
        id: "n-3",
        kind: "reaction",
        actor: { name: "Nora Kim", initials: "NK", tone: "rose" },
        text: "reacted 🚀 to your message",
        context: "#design",
        time: "24m",
        unread: true,
    },
    {
        id: "n-4",
        kind: "system",
        actor: { name: "Forge", initials: "F", tone: "ember" },
        text: "requested approval to update the release manifest",
        context: "Scope expansion",
        time: "31m",
    },
    {
        id: "n-5",
        kind: "automation",
        text: "Weekly triage sweep completed — 9 issues grouped",
        context: "Automation",
        time: "1h",
    },
    {
        id: "n-6",
        kind: "direct_message",
        actor: { name: "Theo Grant", initials: "TG", tone: "ocean" },
        text: "Rate limiter is merged — watching dashboards",
        context: "Direct message",
        time: "1h",
    },
    {
        id: "n-7",
        kind: "call",
        actor: { name: "Maya Chen", initials: "MC", tone: "ember" },
        text: "Missed call — launch review",
        context: "12:58",
        time: "2h",
    },
    {
        id: "n-8",
        kind: "system",
        text: "Your session on desktop was renewed",
        context: "Security",
        time: "3h",
    },
];

/* ---- Threads -------------------------------------------------------------- */

export const threads: ThreadItem[] = [
    {
        id: "t-mob-217",
        title: "Push notifications drop on cold start",
        snippet: "Forge: Fix is up — moved registration behind the handshake promise.",
        participants: [
            { initials: "MC", tone: "ember" },
            { initials: "F", tone: "ember" },
            { initials: "P", tone: "violet" },
            { initials: "ST", tone: "brand" },
        ],
        replyCount: 8,
        unreadCount: 2,
        lastActivity: "2m",
        subscribed: true,
    },
    {
        id: "t-auth-flake",
        title: "Flaky auth token refresh tests",
        snippet: "Scout: 200/200 local runs green · CI passing.",
        participants: [
            { initials: "S", tone: "ocean" },
            { initials: "MC", tone: "ember" },
        ],
        replyCount: 5,
        lastActivity: "1h",
        subscribed: true,
    },
    {
        id: "t-sup-91",
        title: "Login loops on Android 15",
        snippet: "Nora: grouped two overnight reports into SUP-91, severity medium.",
        participants: [
            { initials: "NK", tone: "rose" },
            { initials: "ST", tone: "brand" },
        ],
        replyCount: 3,
        lastActivity: "3h",
        subscribed: false,
    },
    {
        id: "t-release-notes",
        title: "Release notes for mobile v2.4",
        snippet: "Forge is drafting from merged PRs since v2.3.1.",
        participants: [
            { initials: "F", tone: "ember" },
            { initials: "MC", tone: "ember" },
            { initials: "ST", tone: "brand" },
            { initials: "TG", tone: "ocean" },
            { initials: "NK", tone: "rose" },
        ],
        replyCount: 12,
        lastActivity: "5h",
        subscribed: true,
    },
];

/* ---- Files: media gallery -------------------------------------------------- */

/* No network thumbnails: tiles fall back to their kind glyph, which keeps the
 * gallery deterministic in tests (DESIGN.md: no network-loaded assets). */
export const mediaItems: MediaItem[] = [
    { id: "m-1", kind: "photo", name: "device-farm-green.png", size: "412 KB" },
    { id: "m-2", kind: "video", name: "cold-start-repro.mov", size: "8.1 MB", duration: "0:47" },
    { id: "m-3", kind: "file", name: "release-checklist.pdf", size: "96 KB" },
    { id: "m-4", kind: "gif", name: "toast-animation.gif", size: "1.3 MB", duration: "0:03" },
    { id: "m-5", kind: "photo", name: "settings-mock-v3.png", size: "288 KB" },
    { id: "m-6", kind: "file", name: "auth-refresh.patch", size: "22 KB" },
    { id: "m-7", kind: "photo", name: "onboarding-hero.png", size: "1.7 MB" },
    { id: "m-8", kind: "video", name: "walkthrough.mp4", size: "31 MB", duration: "2:14" },
];

/* ---- Calls: active call + history ----------------------------------------- */

export const callParticipants: CallParticipant[] = [
    {
        id: "u-steve",
        name: "Steve Korshakov",
        initials: "ST",
        tone: "brand",
        state: "joined",
        speaking: true,
    },
    { id: "u-maya", name: "Maya Chen", initials: "MC", tone: "ember", state: "joined" },
    {
        id: "u-theo",
        name: "Theo Grant",
        initials: "TG",
        tone: "ocean",
        state: "joined",
        muted: true,
    },
    { id: "u-nora", name: "Nora Kim", initials: "NK", tone: "rose", state: "ringing" },
];

export const incomingCallParticipants: CallParticipant[] = [
    { id: "u-maya", name: "Maya Chen", initials: "MC", tone: "ember", state: "ringing" },
];

export type CallDirection = "incoming" | "outgoing" | "missed";
export type CallHistoryEntry = {
    id: string;
    direction: CallDirection;
    kind: "audio" | "video";
    with: string;
    initials: string;
    tone: ToneName;
    time: string;
    duration: string;
};

export const callHistoryColumns: DataTableColumn[] = [
    { id: "with", header: "Participant" },
    { id: "kind", header: "Type" },
    { id: "direction", header: "Direction" },
    { id: "duration", header: "Duration", align: "end" },
    { id: "time", header: "When", align: "end", width: 120 },
];

export const callHistory: CallHistoryEntry[] = [
    {
        id: "c-1",
        direction: "outgoing",
        kind: "video",
        with: "Launch review",
        initials: "LR",
        tone: "violet",
        time: "Today 13:00",
        duration: "32m",
    },
    {
        id: "c-2",
        direction: "missed",
        kind: "audio",
        with: "Maya Chen",
        initials: "MC",
        tone: "ember",
        time: "Today 12:58",
        duration: "—",
    },
    {
        id: "c-3",
        direction: "incoming",
        kind: "audio",
        with: "Theo Grant",
        initials: "TG",
        tone: "ocean",
        time: "Yesterday 16:20",
        duration: "8m",
    },
    {
        id: "c-4",
        direction: "outgoing",
        kind: "video",
        with: "eng-core sync",
        initials: "EC",
        tone: "ocean",
        time: "Yesterday 10:00",
        duration: "45m",
    },
];

/* ---- You: profile + status + settings ------------------------------------- */

export const profile: Pick<
    ProfileCardProps,
    "name" | "username" | "title" | "initials" | "tone" | "presence"
> = {
    name: "Steve Korshakov",
    username: "steve",
    title: "Founder · Rigged",
    initials: "ST",
    tone: "brand",
    presence: "online",
};

export const profileStatus: ProfileStatus = { emoji: "🚀", text: "Shipping mobile v2" };
export const profileAvailability: Availability = "online";

export type NotificationPreference = "all" | "mentions" | "none";
export type SettingsState = {
    notificationPreference: NotificationPreference;
    soundsEnabled: boolean;
    emailDigest: boolean;
    theme: "system" | "dark";
    email: string;
    language: string;
};

export const settings: SettingsState = {
    notificationPreference: "mentions",
    soundsEnabled: true,
    emailDigest: false,
    theme: "dark",
    email: "steve@korshakov.com",
    language: "en",
};

/* ---- Admin: users, moderation, automations, integrations ------------------ */

export const adminUsers: MemberItem[] = [
    {
        id: "u-steve",
        name: "Steve Korshakov",
        username: "steve",
        title: "Founder",
        initials: "ST",
        tone: "brand",
        presence: "online",
        role: "owner",
    },
    {
        id: "u-maya",
        name: "Maya Chen",
        username: "maya",
        title: "Product lead",
        initials: "MC",
        tone: "ember",
        presence: "online",
        role: "admin",
    },
    {
        id: "u-theo",
        name: "Theo Grant",
        username: "theo",
        title: "Platform engineer",
        initials: "TG",
        tone: "ocean",
        presence: "offline",
        role: "member",
    },
    {
        id: "u-nora",
        name: "Nora Kim",
        username: "nora",
        title: "Support lead",
        initials: "NK",
        tone: "rose",
        presence: "online",
        role: "member",
    },
];

export const moderationReports: ModerationReportCardProps[] = [
    {
        target: { kind: "message", label: "Spam link in #support-fires", sub: "posted 14m ago" },
        reason: "Spam / phishing",
        details: "Automated filter flagged a shortened link matching a known phishing pattern.",
        status: "open",
        reporter: { name: "Auto-mod", initials: "AM", tone: "violet" },
        time: "14m",
    },
    {
        target: { kind: "user", label: "@driveby", sub: "joined 2h ago" },
        reason: "Impersonation",
        status: "reviewing",
        reporter: { name: "Nora Kim", initials: "NK", tone: "rose" },
        assignee: { name: "Maya Chen", initials: "MC", tone: "ember" },
        time: "1h",
    },
    {
        target: { kind: "chat", label: "#random-deals", sub: "public channel" },
        reason: "Off-topic advertising",
        status: "resolved",
        reporter: { name: "Theo Grant", initials: "TG", tone: "ocean" },
        time: "Yesterday",
    },
];

export const automations: AutomationCardProps[] = [
    {
        name: "Weekly triage sweep",
        triggerType: "schedule",
        triggerLabel: "Every Friday at 09:00",
        actionType: "send_message",
        actionLabel: "Post summary to #eng-core",
        active: true,
        lastRunLabel: "Ran 1h ago",
        nextRunLabel: "Fri 09:00",
    },
    {
        name: "Escalate P1 incidents",
        triggerType: "event",
        triggerLabel: "On issue labeled P1",
        actionType: "call_webhook",
        actionLabel: "Page on-call via PagerDuty",
        active: true,
        lastRunLabel: "Ran 3d ago",
    },
    {
        name: "Auto-moderate new links",
        triggerType: "webhook",
        triggerLabel: "On message with URL",
        actionType: "moderate",
        actionLabel: "Queue for review",
        active: false,
        error: "Webhook endpoint returned 500 on last delivery",
        lastRunLabel: "Failed 6h ago",
    },
];

export type Integration = {
    id: string;
    name: string;
    provider: string;
    status: "connected" | "error" | "disabled";
    lastSync: string;
    secret: string;
};

export const integrationColumns: DataTableColumn[] = [
    { id: "name", header: "Integration" },
    { id: "status", header: "Status" },
    { id: "secret", header: "API key" },
    { id: "lastSync", header: "Last sync", align: "end", width: 140 },
];

export const integrations: Integration[] = [
    {
        id: "i-github",
        name: "GitHub",
        provider: "github.com",
        status: "connected",
        lastSync: "2m ago",
        secret: "rgd_demo_token_9f2a71c4e8b04d6f",
    },
    {
        id: "i-linear",
        name: "Linear",
        provider: "linear.app",
        status: "connected",
        lastSync: "11m ago",
        secret: "lin_api_5c8d3b2f9a147e60b2d1",
    },
    {
        id: "i-pagerduty",
        name: "PagerDuty",
        provider: "pagerduty.com",
        status: "error",
        lastSync: "6h ago",
        secret: "pd_7be1049af3c24d15ab99",
    },
    {
        id: "i-figma",
        name: "Figma",
        provider: "figma.com",
        status: "disabled",
        lastSync: "never",
        secret: "figd_0a3c5e7194bd28f6c40e",
    },
];

/* Admin · Users — the members table shares its column contract with the bans
 * and audit tables via the DataTable primitive. */
export const adminUserColumns: DataTableColumn[] = [
    { id: "member", header: "Member" },
    { id: "username", header: "Handle" },
    { id: "title", header: "Title" },
    { id: "presence", header: "Status" },
];

export type BanEntry = {
    id: string;
    name: string;
    handle: string;
    initials: string;
    tone: ToneName;
    reason: string;
    scope: "workspace" | "channel";
    bannedBy: string;
    date: string;
};

export const adminBanColumns: DataTableColumn[] = [
    { id: "user", header: "User" },
    { id: "reason", header: "Reason" },
    { id: "scope", header: "Scope" },
    { id: "bannedBy", header: "Banned by" },
    { id: "date", header: "When", align: "end", width: 140 },
];

export const adminBans: BanEntry[] = [
    {
        id: "b-driveby",
        name: "driveby",
        handle: "driveby",
        initials: "DB",
        tone: "slate",
        reason: "Impersonation of a teammate",
        scope: "workspace",
        bannedBy: "Maya Chen",
        date: "Today",
    },
    {
        id: "b-linkspam",
        name: "promo-bot",
        handle: "promo-bot",
        initials: "PB",
        tone: "amber",
        reason: "Repeated phishing links",
        scope: "workspace",
        bannedBy: "Auto-mod",
        date: "Yesterday",
    },
    {
        id: "b-deals",
        name: "deal-hunter",
        handle: "deals",
        initials: "DH",
        tone: "ocean",
        reason: "Off-topic advertising in #support-fires",
        scope: "channel",
        bannedBy: "Nora Kim",
        date: "3d ago",
    },
];

export type AuditEntry = {
    id: string;
    actor: { name: string; initials: string; tone: ToneName };
    action: string;
    target: string;
    category: "member" | "security" | "integration" | "automation" | "moderation";
    time: string;
};

export const adminAuditColumns: DataTableColumn[] = [
    { id: "actor", header: "Actor" },
    { id: "action", header: "Action" },
    { id: "target", header: "Target" },
    { id: "category", header: "Category" },
    { id: "time", header: "When", align: "end", width: 150 },
];

export const adminAudit: AuditEntry[] = [
    {
        id: "a-1",
        actor: { name: "Maya Chen", initials: "MC", tone: "ember" },
        action: "Banned member",
        target: "@driveby",
        category: "moderation",
        time: "14m ago",
    },
    {
        id: "a-2",
        actor: { name: "Steve Korshakov", initials: "ST", tone: "brand" },
        action: "Changed role to admin",
        target: "@maya",
        category: "member",
        time: "1h ago",
    },
    {
        id: "a-3",
        actor: { name: "Auto-mod", initials: "AM", tone: "violet" },
        action: "Disabled integration",
        target: "Figma",
        category: "integration",
        time: "6h ago",
    },
    {
        id: "a-4",
        actor: { name: "Theo Grant", initials: "TG", tone: "ocean" },
        action: "Rotated API key",
        target: "PagerDuty",
        category: "security",
        time: "Yesterday",
    },
    {
        id: "a-5",
        actor: { name: "Steve Korshakov", initials: "ST", tone: "brand" },
        action: "Enabled automation",
        target: "Weekly triage sweep",
        category: "automation",
        time: "2d ago",
    },
    {
        id: "a-6",
        actor: { name: "Steve Korshakov", initials: "ST", tone: "brand" },
        action: "Required two-factor sign-in",
        target: "Workspace",
        category: "security",
        time: "5d ago",
    },
];

/* ---- Admin: server settings ------------------------------------------------ */

export type JoinPolicy = "open" | "invite" | "approval";
export type ServerSettingsState = {
    workspaceName: string;
    joinPolicy: JoinPolicy;
    defaultRole: MemberRole;
    retentionDays: string;
    requireMfa: boolean;
    allowGuests: boolean;
    aiAgents: boolean;
};

export const serverSettings: ServerSettingsState = {
    workspaceName: "Rigged",
    joinPolicy: "approval",
    defaultRole: "member",
    retentionDays: "90",
    requireMfa: true,
    allowGuests: false,
    aiAgents: true,
};

/* ---- Search results -------------------------------------------------------- */

export const searchResults: SearchResultGroup[] = [
    {
        type: "channel",
        results: [
            { id: "launch-week", title: "launch-week", meta: "4 members · public", icon: "hash" },
            { id: "eng-core", title: "eng-core", meta: "12 members · public", icon: "hash" },
        ],
    },
    {
        type: "user",
        results: [
            {
                id: "maya-chen",
                title: "Maya Chen",
                meta: "@maya · Product lead",
                avatar: { initials: "MC", tone: "ember" },
            },
            {
                id: "theo-grant",
                title: "Theo Grant",
                meta: "@theo · Platform engineer",
                avatar: { initials: "TG", tone: "ocean" },
            },
        ],
    },
    {
        type: "message",
        results: [
            {
                id: "lw-3",
                title: [
                    { kind: "text", text: "Fix is up — moved " },
                    { kind: "code", text: "registration" },
                    { kind: "text", text: " behind the handshake" },
                ],
                meta: "Forge in #launch-week · 10:51",
                icon: "chat",
            },
            {
                id: "ec-1",
                title: "200/200 local runs green · CI passing",
                meta: "Scout in #eng-core · 9:58",
                icon: "chat",
            },
        ],
    },
];

/* ---- Emoji picker ---------------------------------------------------------- */

export const emojiItems: EmojiItem[] = [
    { id: "rocket", char: "🚀", name: "rocket" },
    { id: "eyes", char: "👀", name: "eyes" },
    { id: "check", char: "✅", name: "check mark" },
    { id: "fire", char: "🔥", name: "fire" },
    { id: "tada", char: "🎉", name: "party" },
    { id: "thumbsup", char: "👍", name: "thumbs up" },
    { id: "heart", char: "❤️", name: "heart" },
    { id: "thinking", char: "🤔", name: "thinking" },
    { id: "clap", char: "👏", name: "clap" },
    { id: "sparkles", char: "✨", name: "sparkles" },
    { id: "bug", char: "🐛", name: "bug" },
    { id: "ship", char: "🛳️", name: "ship" },
    { id: "warning", char: "⚠️", name: "warning" },
    { id: "bulb", char: "💡", name: "idea" },
    { id: "hourglass", char: "⏳", name: "hourglass" },
    { id: "wave", char: "👋", name: "wave" },
];

export const recentEmoji = ["rocket", "eyes", "check", "fire"];
